/**
 * Node read handlers — read node tree, selection, search.
 */

import type { SimplifyDetail } from '../adapters/node-simplifier.js';
import { createContext, simplifyNode, simplifyPage } from '../adapters/node-simplifier.js';
import { registerHandler } from '../registry.js';
import { assertHandler, HandlerError } from '../utils/handler-error.js';
import { findNodeByIdAsync } from '../utils/node-lookup.js';

// Valid SceneNode / BaseNode types accepted by search_nodes.
// Sourced from @figma/plugin-typings NodeType (= BaseNode['type']) — full 36-entry
// set of `readonly type: 'XXX'` literals starting at plugin-api.d.ts:8958.
// Keep in sync with the Figma Plugin API.
const VALID_NODE_TYPES = new Set<string>([
  'DOCUMENT',
  'PAGE',
  'FRAME',
  'GROUP',
  'TRANSFORM_GROUP',
  'SLICE',
  'RECTANGLE',
  'LINE',
  'ELLIPSE',
  'POLYGON',
  'STAR',
  'VECTOR',
  'TEXT',
  'TEXT_PATH',
  'COMPONENT_SET',
  'COMPONENT',
  'INSTANCE',
  'BOOLEAN_OPERATION',
  'STICKY',
  'STAMP',
  'TABLE',
  'TABLE_CELL',
  'HIGHLIGHT',
  'WASHI_TAPE',
  'SHAPE_WITH_TEXT',
  'CODE_BLOCK',
  'CONNECTOR',
  'WIDGET',
  'EMBED',
  'LINK_UNFURL',
  'MEDIA',
  'SECTION',
  'SLIDE',
  'SLIDE_ROW',
  'SLIDE_GRID',
  'INTERACTIVE_SLIDE_ELEMENT',
]);

// Self-correcting error routing: agents commonly pass these "wrong-bucket"
// values to search_nodes; map each to the endpoint that actually owns them.
const WRONG_BUCKET: Record<string, string> = {
  VARIABLE: 'variables_ep({method:"list"}) — requires load_toolset("variables")',
  VARIABLE_COLLECTION: 'variables_ep({method:"list_collections"}) — requires load_toolset("variables")',
  PAINT_STYLE: 'styles_ep({method:"list", type:"PAINT"}) — requires load_toolset("styles")',
  TEXT_STYLE: 'styles_ep({method:"list", type:"TEXT"}) — requires load_toolset("styles")',
  EFFECT_STYLE: 'styles_ep({method:"list", type:"EFFECT"}) — requires load_toolset("styles")',
  GRID_STYLE: 'styles_ep({method:"list", type:"GRID"}) — requires load_toolset("styles")',
  STYLE: 'styles_ep({method:"list"}) — requires load_toolset("styles")',
};

export function registerNodeHandlers(): void {
  registerHandler('get_node_info', async (params) => {
    const nodeId = params.nodeId as string;
    const detail = (params.detail as SimplifyDetail | undefined) ?? 'full';
    const node = await findNodeByIdAsync(nodeId);
    assertHandler(
      node && 'type' in node && node.type !== 'PAGE' && node.type !== 'DOCUMENT',
      `Node not found: ${nodeId}`,
      'NOT_FOUND',
    );
    return simplifyNode(node as SceneNode, 0, undefined, createContext(undefined, undefined, detail));
  });

  // ─── Design-to-Code Context (P0-5) ───
  // Self-built `get_design_context` for code generation. Returns the node tree
  // PLUS resolved metadata about every variable, style, and component the tree
  // references. Doesn't generate code itself — that's the calling LLM's job.
  // Replaces dependency on Figma Desktop MCP's get_design_context for the
  // remote-agent / cloud-IDE / claude.ai web case where Desktop MCP is unavailable.
  registerHandler('get_design_context', async (params) => {
    const nodeId = params.nodeId as string;
    const framework = (params.framework as string | undefined) ?? 'unspecified';

    const node = await findNodeByIdAsync(nodeId);
    assertHandler(
      node && 'type' in node && node.type !== 'PAGE' && node.type !== 'DOCUMENT',
      `Node not found: ${nodeId}`,
      'NOT_FOUND',
    );

    // Gather node tree at full detail (so boundVariables / styleIds are present).
    const tree = simplifyNode(node as SceneNode, 0, undefined, createContext(undefined, undefined, 'full'));

    // Walk the live node to collect referenced asset IDs (faster than re-walking
    // the simplified tree, since live nodes already expose Plugin API surface).
    const variableIds = new Set<string>();
    const styleIds = new Set<string>();
    const componentKeys = new Set<string>();
    const componentIds = new Set<string>();
    const instanceNodes: InstanceNode[] = [];
    let imageHashCount = 0;
    let textNodeCount = 0;

    const walkLive = (n: SceneNode) => {
      // Bound variables (color, spacing, radius, font-size, etc.)
      if ('boundVariables' in n) {
        const bv = (n as SceneNode & { boundVariables?: Record<string, unknown> }).boundVariables;
        if (bv) {
          for (const value of Object.values(bv)) {
            if (Array.isArray(value)) {
              for (const v of value as Array<{ id?: string }>) if (v?.id) variableIds.add(v.id);
            } else if (value && typeof value === 'object' && (value as { id?: string }).id) {
              variableIds.add((value as { id: string }).id);
            }
          }
        }
      }
      // Paint / text / effect styles
      if ('fillStyleId' in n) {
        const fid = (n as GeometryMixin).fillStyleId;
        if (typeof fid === 'string' && fid) styleIds.add(fid);
      }
      if ('strokeStyleId' in n) {
        const sid = (n as GeometryMixin).strokeStyleId;
        if (typeof sid === 'string' && sid) styleIds.add(sid);
      }
      if (n.type === 'TEXT') {
        textNodeCount++;
        const t = n as TextNode;
        if (typeof t.textStyleId === 'string' && t.textStyleId) styleIds.add(t.textStyleId);
      }
      if ('effectStyleId' in n) {
        const eid = (n as BlendMixin & { effectStyleId?: string }).effectStyleId;
        if (typeof eid === 'string' && eid) styleIds.add(eid);
      }
      // Image fills
      if ('fills' in n) {
        const fills = (n as GeometryMixin).fills;
        if (Array.isArray(fills)) {
          for (const f of fills) {
            if (f && typeof f === 'object' && (f as Paint).type === 'IMAGE') imageHashCount++;
          }
        }
      }
      // Defer component instance resolution to async pass below — getMainComponentAsync
      // is the non-deprecated path and works for hidden / not-yet-loaded instances too.
      if (n.type === 'INSTANCE') {
        instanceNodes.push(n as InstanceNode);
      }
      if ('children' in n) {
        for (const c of (n as ChildrenMixin).children) walkLive(c as SceneNode);
      }
    };
    walkLive(node as SceneNode);

    // Resolve mainComponent for every collected instance via the async API
    // (in parallel — independent calls). When the mainComponent is a VARIANT
    // inside a COMPONENT_SET, surface ONLY the parent set — reading
    // `componentPropertyDefinitions` on a variant throws in the Figma Plugin
    // API ("Can only get component property definitions of a component set
    // or non-variant component"). The parent set's propDefs already carry
    // the full variant axis information.
    await Promise.all(
      instanceNodes.map(async (inst) => {
        try {
          const main = await inst.getMainComponentAsync();
          if (!main) return;
          if (main.parent?.type === 'COMPONENT_SET') {
            const set = main.parent as ComponentSetNode;
            if (set.key) componentKeys.add(set.key);
            componentIds.add(set.id);
          } else {
            if (main.key) componentKeys.add(main.key);
            componentIds.add(main.id);
          }
        } catch {
          /* skip unresolvable instance */
        }
      }),
    );

    // Resolve referenced variables to {name, type, valuesByMode summary}
    const variables: Array<{ id: string; name: string; type: string; collection?: string }> = [];
    for (const vid of variableIds) {
      try {
        const variable = await figma.variables.getVariableByIdAsync(vid);
        if (!variable) continue;
        const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
        variables.push({
          id: variable.id,
          name: variable.name,
          type: variable.resolvedType,
          collection: collection?.name,
        });
      } catch {
        /* skip unresolvable */
      }
    }

    // Resolve referenced styles to {name, type}
    const styles: Array<{ id: string; name: string; type: string }> = [];
    for (const sid of styleIds) {
      try {
        const style = await figma.getStyleByIdAsync(sid);
        if (!style) continue;
        styles.push({ id: style.id, name: style.name, type: style.type });
      } catch {
        /* skip unresolvable */
      }
    }

    // Resolve referenced components to {name, key, isSet, properties}
    const components: Array<{
      id: string;
      key?: string;
      name: string;
      isSet: boolean;
      remote: boolean;
      description?: string;
      propertyDefinitions?: Record<string, { type: string; defaultValue?: unknown }>;
    }> = [];
    for (const cid of componentIds) {
      const comp = await findNodeByIdAsync(cid);
      if (!comp) continue;
      if (comp.type !== 'COMPONENT' && comp.type !== 'COMPONENT_SET') continue;
      const c = comp as ComponentNode | ComponentSetNode;

      // Defensive fallback: if somehow a variant landed in componentIds,
      // read its parent set's propDefs instead of its own (the Plugin API
      // throws on variant.componentPropertyDefinitions).
      const propDefSource: ComponentNode | ComponentSetNode =
        c.type === 'COMPONENT' && c.parent?.type === 'COMPONENT_SET' ? (c.parent as ComponentSetNode) : c;

      const compactDefs: Record<string, { type: string; defaultValue?: unknown }> = {};
      try {
        const propDefs = propDefSource.componentPropertyDefinitions;
        for (const [k, def] of Object.entries(propDefs)) {
          const bareName = k.indexOf('#') >= 0 ? k.slice(0, k.indexOf('#')) : k;
          compactDefs[bareName] = { type: def.type, defaultValue: def.defaultValue };
        }
      } catch {
        /* leave compactDefs empty — non-fatal; consumers can still read `tree` */
      }

      components.push({
        id: c.id,
        key: c.key || undefined,
        name: c.name,
        isSet: c.type === 'COMPONENT_SET',
        remote:
          'remote' in c ? Boolean((c as (ComponentNode | ComponentSetNode) & { remote?: boolean }).remote) : false,
        description: c.description || undefined,
        propertyDefinitions: Object.keys(compactDefs).length > 0 ? compactDefs : undefined,
      });
    }

    // Framework hint — short string the calling LLM can lean on.
    const frameworkHint = (() => {
      switch (framework) {
        case 'react':
          return 'React + TypeScript. Map auto-layout → Flexbox. Variables → CSS custom properties (e.g. var(--color-bg-primary)). Components → React components, INSTANCE_SWAP → children/icon prop.';
        case 'vue':
          return 'Vue 3 SFC. Map auto-layout → Flexbox. Variables → CSS custom properties. Components → Vue components.';
        case 'swiftui':
          return 'SwiftUI. Map HORIZONTAL → HStack, VERTICAL → VStack. Variables → Color/CGFloat tokens (no var() wrapper). Auto-layout padding → .padding() modifiers.';
        case 'compose':
          return 'Jetpack Compose. Map HORIZONTAL → Row, VERTICAL → Column. Variables → MaterialTheme tokens. Auto-layout padding → Modifier.padding().';
        case 'tailwind':
          return 'Tailwind CSS classes. Map auto-layout → flex/grid utilities. Variables → matched design tokens (theme colors/spacing).';
        default:
          return 'Framework unspecified. Use the variables/styles/components arrays to map design tokens to your target language.';
      }
    })();

    return {
      framework,
      frameworkHint,
      tree,
      summary: {
        textNodes: textNodeCount,
        imageNodes: imageHashCount,
        variablesUsed: variables.length,
        stylesUsed: styles.length,
        componentsUsed: components.length,
      },
      variables,
      styles,
      components,
      _note:
        'tree contains the full node hierarchy with boundVariables/styleIds. ' +
        'variables/styles/components arrays resolve every reference to a name + type — ' +
        'use them to translate the tree into your target framework. ' +
        'For local components without keys, see Figma Dev Mode for cross-file imports.',
    };
  });

  registerHandler('get_node_info_batch', async (params) => {
    const nodeIds = params.nodeIds as string[];
    const detail = (params.detail as SimplifyDetail | undefined) ?? 'standard';
    const _ctx = createContext(undefined, undefined, detail);
    const results: Array<{ id: string; ok: boolean; node?: ReturnType<typeof simplifyNode>; error?: string }> = [];

    for (const nodeId of nodeIds) {
      try {
        const node = await findNodeByIdAsync(nodeId);
        if (!node || !('type' in node) || node.type === 'PAGE' || node.type === 'DOCUMENT') {
          results.push({ id: nodeId, ok: false, error: `Node not found: ${nodeId}` });
        } else {
          results.push({
            id: nodeId,
            ok: true,
            node: simplifyNode(node as SceneNode, 0, undefined, createContext(undefined, undefined, detail)),
          });
        }
      } catch (err) {
        results.push({ id: nodeId, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return { count: results.length, nodes: results };
  });

  registerHandler('get_current_page', async (params) => {
    const maxNodes = (params.maxNodes as number) ?? 200;
    const maxDepth = (params.maxDepth as number | undefined) ?? 3;
    const detail = (params.detail as SimplifyDetail | undefined) ?? 'standard';
    const degradeDepth = params.degradeDepth as number | undefined;
    const page = figma.currentPage;
    const nodes = simplifyPage(page, maxNodes, maxDepth, undefined, detail, degradeDepth);
    return {
      id: page.id,
      name: page.name,
      childCount: page.children.length,
      returnedNodes: nodes.length,
      ...(nodes.length < page.children.length ? { truncated: true } : {}),
      nodes,
    };
  });

  registerHandler('get_document_info', async () => {
    return {
      name: figma.root.name,
      currentPage: figma.currentPage.name,
      pages: figma.root.children.map((p) => ({
        id: p.id,
        name: p.name,
        childCount: p.children.length,
      })),
    };
  });

  registerHandler('get_selection', async () => {
    const selection = figma.currentPage.selection;
    return {
      count: selection.length,
      nodes: selection.map((n) => simplifyNode(n)),
    };
  });

  registerHandler('search_nodes', async (params) => {
    const query = (params.query as string).toLowerCase();
    const types = params.types as string[] | undefined;
    const limit = (params.limit as number) ?? 50;
    const detail = (params.detail as SimplifyDetail | undefined) ?? 'summary';
    const _ctx = createContext(undefined, undefined, detail);

    // Guard: reject non-SceneNode types up front so agents don't silently hit
    // a full-document walk where matchesType is always false (which looks like
    // a connection timeout after 30s). See plan: groovy-prancing-melody.md.
    if (types && types.length > 0) {
      for (const t of types) {
        if (VALID_NODE_TYPES.has(t)) continue;
        const redirect = WRONG_BUCKET[t];
        if (redirect) {
          throw new HandlerError(
            `search_nodes: "${t}" is not a scene node type — it lives on a different endpoint. Call ${redirect} instead.`,
            'WRONG_NODE_TYPE',
          );
        }
        throw new HandlerError(
          `search_nodes: "${t}" is not a valid node type. Valid types: ${[...VALID_NODE_TYPES].sort().join(', ')}.`,
          'WRONG_NODE_TYPE',
        );
      }
    }

    const results: ReturnType<typeof simplifyNode>[] = [];

    function walk(node: SceneNode): boolean {
      if (results.length >= limit) return true;

      const matchesType = !types || types.includes(node.type);
      const matchesName = node.name.toLowerCase().includes(query);

      if (matchesType && matchesName) {
        results.push(simplifyNode(node, 0, undefined, createContext(undefined, undefined, detail)));
      }

      if ('children' in node) {
        for (const child of (node as ChildrenMixin).children) {
          if (walk(child)) return true;
        }
      }
      return false;
    }

    for (const child of figma.currentPage.children) {
      if (walk(child)) break;
    }

    return { count: results.length, nodes: results };
  });

  registerHandler('list_fonts', async (params) => {
    const fonts = await figma.listAvailableFontsAsync();
    const family = params.family as string | undefined;
    if (family) {
      const styles = fonts.filter((f) => f.fontName.family === family).map((f) => f.fontName.style);
      return { family, styles, count: styles.length };
    }
    const families = [...new Set(fonts.map((f) => f.fontName.family))].sort();
    return { families, total: families.length };
  });

  registerHandler('get_reactions', async (params) => {
    const results: Array<{ nodeId: string; nodeName: string; reactions: unknown[] }> = [];

    function walk(node: SceneNode): void {
      if ('reactions' in node && (node as unknown as { reactions: unknown[] }).reactions.length > 0) {
        results.push({
          nodeId: node.id,
          nodeName: node.name,
          reactions: (node as unknown as { reactions: unknown[] }).reactions,
        });
      }
      if ('children' in node) {
        for (const child of (node as ChildrenMixin).children) {
          walk(child);
        }
      }
    }

    if (params.nodeId) {
      const node = await findNodeByIdAsync(params.nodeId as string);
      if (!node) return { nodes: [], count: 0 };
      walk(node as SceneNode);
    } else {
      figma.currentPage.children.forEach(walk);
    }

    return { nodes: results, count: results.length };
  });
} // registerNodeHandlers
