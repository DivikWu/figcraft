/**
 * Instance, component, and miscellaneous creation handlers.
 *
 * Extracted from write-nodes.ts for maintainability.
 */

import { simplifyNode } from '../adapters/node-simplifier.js';
import { PAGE_GAP } from '../constants.js';
import { registerHandler } from '../registry.js';
import { applySizingOverrides, importAndResolveComponent, setLayoutSizing } from '../utils/figma-compat.js';
import { assertHandler } from '../utils/handler-error.js';
import { applyStroke, setComponentProperties } from '../utils/node-helpers.js';
import { findNodeByIdAsync } from '../utils/node-lookup.js';
import { applyPublishableMetadata } from '../utils/publishable-metadata.js';
import { getCachedModeLibrary } from './write-nodes.js';

// ─── Semantic text property naming for component conversion ───
// Assigns semantic roles (title, description, detail, caption) based on position,
// falls back to layer name or sanitized content for larger groups.
const SEMANTIC_ROLES = ['title', 'description', 'detail', 'caption'];

function deriveTextPropertyName(textNode: TextNode, index: number, total: number, usedNames: Set<string>): string {
  const layerName = textNode.name;
  const content = textNode.characters;

  let name: string;

  // Priority 1: explicit layer name (if different from content — designer intentionally named it)
  if (layerName !== content && layerName !== 'Text' && !/^Text \d+$/.test(layerName)) {
    name = layerName;
  }
  // Priority 2: semantic role by position (for small groups ≤ 4 items)
  else if (total <= 4) {
    name = SEMANTIC_ROLES[index] ?? `text_${index + 1}`;
  }
  // Priority 3: sanitize content to slug (for larger groups)
  else {
    const slug = content
      .replace(/[^a-zA-Z0-9\u4e00-\u9fff]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 24);
    name = slug || `text_${index + 1}`;
  }

  // Deduplicate
  const base = name;
  let counter = 2;
  while (usedNames.has(name)) {
    name = `${base}_${counter++}`;
  }
  usedNames.add(name);
  return name;
}

// ─── textOverrides: batch inner-text override on instance children ───
// Figma's `instance.setProperties` only targets component-defined TEXT properties.
// Library components often do NOT expose every inner text (placeholders, helper text,
// error copy) as a property, so AI has no way to update them in a single call —
// it would have to text_scan → per-node set_text_content, which is slow and
// frequently dropped mid-workflow.
//
// This helper walks the instance subtree, resolves each override key against the
// collected text nodes, batches font loading in parallel, and writes characters
// synchronously. Returns categorized warnings so the agent can distinguish "node
// not found" (call text_scan), "font load failed" (env issue), and "write failed"
// (likely a locked node) without guessing.
//
// Key matching order:
//   1. Path match — key contains "/" → post-order path suffix match
//   2. Index match — key is a non-negative integer → Nth text node in walk order
//   3. Name match — plain string → TextNode.name exact match
//
// Mixed-font nodes use a "prevail" fallback: statistically dominant font in the
// existing characters is loaded and applied as a reset before writing. Pattern
// borrowed from Vibma's plugin/setcharacters.js prevail strategy.

interface TextEntry {
  node: TextNode;
  path: string;
}

async function applyTextOverrides(
  instance: InstanceNode,
  overrides: Record<string, string>,
  warnings: string[],
): Promise<void> {
  // Phase 1: collect all text nodes under the instance, carry path for "a/b/c" lookups
  const textNodes: TextEntry[] = [];
  function walk(n: BaseNode, path: string): void {
    if (n.type === 'TEXT') textNodes.push({ node: n as TextNode, path });
    if ('children' in n) {
      for (const c of (n as FrameNode).children) {
        walk(c, path ? `${path}/${c.name}` : c.name);
      }
    }
  }
  walk(instance, '');

  if (textNodes.length === 0) {
    warnings.push(`textOverrides: instance "${instance.name}" has no text descendants — nothing to override.`);
    return;
  }

  // Phase 2: resolve each key to a target text node
  const pending: Array<{ target: TextNode; value: string; key: string }> = [];
  const notFound: string[] = [];
  for (const [key, value] of Object.entries(overrides)) {
    let match: TextEntry | undefined;
    if (key.includes('/')) {
      // Path match: exact path or suffix match so callers don't need to know the root name
      match = textNodes.find((e) => e.path === key || e.path.endsWith(`/${key}`));
    } else if (/^\d+$/.test(key)) {
      // Index match: numeric string → Nth text node in walk order
      const idx = parseInt(key, 10);
      match = textNodes[idx];
    } else {
      // Name match: exact TextNode.name
      match = textNodes.find((e) => e.node.name === key);
    }
    if (!match) notFound.push(key);
    else pending.push({ target: match.node, value, key });
  }

  if (pending.length === 0) {
    if (notFound.length > 0) {
      warnings.push(
        `textOverrides: no matching text nodes for keys [${notFound.join(', ')}]. ` +
          `Call text_scan(nodeId:"${instance.id}") to see available text node names.`,
      );
    }
    return;
  }

  // Phase 3: batch parallel font load (dedup + prevail fallback for figma.mixed)
  const fontKeys = new Set<string>();
  const prevailFonts = new Map<TextNode, FontName>();
  for (const { target } of pending) {
    if (target.fontName === figma.mixed) {
      // Mixed-font node: compute the dominant font so we can reset + write
      const fontCount: Record<string, number> = {};
      const len = target.characters.length;
      for (let i = 1; i <= len; i++) {
        try {
          const f = target.getRangeFontName(i - 1, i) as FontName;
          const k = `${f.family}::${f.style}`;
          fontCount[k] = (fontCount[k] ?? 0) + 1;
        } catch {
          /* range probe failed — skip */
        }
      }
      const entries = Object.entries(fontCount).sort((a, b) => b[1] - a[1]);
      if (entries.length > 0) {
        const [family, style] = entries[0][0].split('::');
        const fn: FontName = { family, style };
        prevailFonts.set(target, fn);
        fontKeys.add(JSON.stringify(fn));
      }
    } else {
      fontKeys.add(JSON.stringify(target.fontName));
    }
  }
  const loadResults = await Promise.allSettled(
    [...fontKeys].map((k) => figma.loadFontAsync(JSON.parse(k) as FontName)),
  );
  const fontLoadFailed = loadResults.filter((r) => r.status === 'rejected').length;

  // Reset mixed-font nodes to their prevail font (only works if the font loaded)
  for (const [target, fn] of prevailFonts.entries()) {
    try {
      target.fontName = fn;
    } catch {
      /* font load failed earlier — write below will throw and be collected */
    }
  }

  // Phase 4: synchronous character writes (fonts are loaded)
  const mutationErrors: string[] = [];
  for (const { target, value, key } of pending) {
    try {
      target.characters = value;
    } catch (err) {
      mutationErrors.push(`${key}: ${err instanceof Error ? err.message : 'write failed'}`);
    }
  }

  // Phase 5: categorized warnings (never merged — agent needs to distinguish causes)
  if (notFound.length > 0) {
    warnings.push(
      `textOverrides: text node(s) not found: [${notFound.join(', ')}]. ` +
        `Call text_scan(nodeId:"${instance.id}") to see available text node names.`,
    );
  }
  if (fontLoadFailed > 0) {
    warnings.push(`textOverrides: ${fontLoadFailed} font load failure(s); affected text may not have updated.`);
  }
  if (mutationErrors.length > 0) {
    warnings.push(`textOverrides write errors: ${mutationErrors.join('; ')}`);
  }
}

export function registerInstanceHandlers(): void {
  // ─── Create instance ───
  registerHandler('create_instance', async (params) => {
    const componentId = params.componentId as string | undefined;
    const componentKey = params.componentKey as string | undefined;
    const componentSetKey = params.componentSetKey as string | undefined;
    assertHandler(
      componentId || componentKey || componentSetKey,
      'componentId, componentKey, or componentSetKey is required',
    );

    const resolved = await importAndResolveComponent({
      componentSetKey,
      componentKey,
      componentId,
      variantProperties: params.variantProperties as Record<string, string> | undefined,
    });
    const warnings: string[] = [];
    if (resolved.fallbackWarning) warnings.push(resolved.fallbackWarning);

    const instance = resolved.component.createInstance();
    if (params.name) instance.name = params.name as string;
    if (params.x != null) instance.x = params.x as number;
    if (params.y != null) instance.y = params.y as number;
    if (params.width != null || params.height != null) {
      instance.resize((params.width as number) ?? instance.width, (params.height as number) ?? instance.height);
    }

    // Set component properties
    if (params.properties) {
      const { unmatchedProperties } = setComponentProperties(
        instance,
        params.properties as Record<string, string | boolean>,
      );
      if (unmatchedProperties.length > 0) {
        warnings.push(`Unmatched properties (ignored): ${unmatchedProperties.join(', ')}`);
      }
    }

    // Override inner text (placeholder, helper text, etc.) not exposed as component props
    if (params.textOverrides && typeof params.textOverrides === 'object') {
      await applyTextOverrides(instance, params.textOverrides as Record<string, string>, warnings);
    }

    // Parent append
    if (params.parentId) {
      const parent = await findNodeByIdAsync(params.parentId as string);
      if (parent && 'appendChild' in parent) {
        (parent as FrameNode).appendChild(instance);
      }
    }

    // Sizing AFTER appendChild — explicit overrides only (no smart defaults for instances,
    // they inherit sizing from the component definition)
    applySizingOverrides(instance, params);

    const result = simplifyNode(instance);
    // Add _actualVariant to help AI verify which variant was instantiated
    (result as unknown as Record<string, unknown>)._actualVariant = resolved.component.name;
    if (warnings.length > 0) (result as unknown as Record<string, unknown>)._warnings = warnings;
    return result;
  });

  // ─── Create component from existing node ───
  registerHandler('create_component_from_node', async (params) => {
    const nodeId = params.nodeId as string;
    const node = await findNodeByIdAsync(nodeId);
    assertHandler(node, `Node not found: ${nodeId}`, 'NOT_FOUND');
    assertHandler(
      node.type === 'FRAME' || node.type === 'GROUP' || node.type === 'RECTANGLE',
      `Node must be a frame, group, or rectangle (got ${node.type})`,
    );

    const component = figma.createComponentFromNode(node as SceneNode);
    if (params.name) component.name = params.name as string;
    // PublishableMixin metadata — symmetric with create_component and update_component.
    // The shared helper enforces the documentationLinks length guard consistently.
    applyPublishableMetadata(component, params);

    // exposeText: auto-discover text children and create TEXT properties
    const exposeText = params.exposeText !== false; // default true
    const propertyWarnings: string[] = [];
    if (exposeText) {
      const textNodes: TextNode[] = [];
      function findTexts(n: BaseNode): void {
        if (n.type === 'TEXT') textNodes.push(n as TextNode);
        if ('children' in n) {
          for (const child of (n as FrameNode).children) findTexts(child);
        }
      }
      findTexts(component);

      // Sort text nodes by vertical then horizontal position for stable semantic naming
      textNodes.sort((a, b) => {
        const dy = (a.y ?? 0) - (b.y ?? 0);
        return Math.abs(dy) > 4 ? dy : (a.x ?? 0) - (b.x ?? 0);
      });

      const usedNames = new Set<string>();
      for (let i = 0; i < textNodes.length; i++) {
        const t = textNodes[i];
        const propName = deriveTextPropertyName(t, i, textNodes.length, usedNames);
        // Update the text node name to match the semantic property name
        t.name = propName;
        try {
          component.addComponentProperty(propName, 'TEXT', t.characters);
          const defs = component.componentPropertyDefinitions;
          const key = Object.keys(defs).find((k) => k.startsWith(`${propName}#`));
          if (key) {
            t.componentPropertyReferences = { characters: key };
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          propertyWarnings.push(
            `⚠️ TEXT property "${propName}" failed to register: ${msg}. ` +
              `Common cause: duplicate property name. The text node "${t.characters}" was not wired.`,
          );
        }
      }
    }

    const result = simplifyNode(component);
    if (propertyWarnings.length > 0) {
      (result as unknown as Record<string, unknown>)._warnings = propertyWarnings;
    }
    return result;
  });

  // ─── Batch create instances ───
  registerHandler('create_instances', async (params) => {
    const items = params.items as Array<Record<string, unknown>>;
    assertHandler(Array.isArray(items) && items.length > 0, 'items array is required');

    const results: Array<{
      id: string;
      ok: boolean;
      error?: string;
      _warning?: string;
      _warnings?: string[];
      _actualVariant?: string;
    }> = [];
    for (const item of items) {
      try {
        const componentId = item.componentId as string | undefined;
        const componentKey = item.componentKey as string | undefined;
        const componentSetKey = item.componentSetKey as string | undefined;
        assertHandler(
          componentId || componentKey || componentSetKey,
          'componentId, componentKey, or componentSetKey is required',
        );

        const resolved = await importAndResolveComponent({
          componentSetKey,
          componentKey,
          componentId,
          variantProperties: item.variantProperties as Record<string, string> | undefined,
        });

        const instance = resolved.component.createInstance();
        if (item.name) instance.name = item.name as string;
        if (item.x != null) instance.x = item.x as number;
        if (item.y != null) instance.y = item.y as number;
        if (item.width != null || item.height != null) {
          instance.resize((item.width as number) ?? instance.width, (item.height as number) ?? instance.height);
        }
        const itemWarnings: string[] = [];
        if (resolved?.fallbackWarning) itemWarnings.push(resolved.fallbackWarning);
        if (item.properties) {
          const { unmatchedProperties } = setComponentProperties(
            instance,
            item.properties as Record<string, string | boolean>,
          );
          if (unmatchedProperties.length > 0) {
            itemWarnings.push(`Unmatched properties: ${unmatchedProperties.join(', ')}`);
          }
        }
        if (item.textOverrides && typeof item.textOverrides === 'object') {
          await applyTextOverrides(instance, item.textOverrides as Record<string, string>, itemWarnings);
        }
        if (item.parentId) {
          const parent = await findNodeByIdAsync(item.parentId as string);
          if (parent && 'appendChild' in parent) (parent as FrameNode).appendChild(instance);
        }
        // Contextual sizing: cross-axis FILL + primary-axis FIXED (preserve component height)
        if (item.sizing === 'contextual' && instance.parent && 'layoutMode' in instance.parent) {
          const dir = (instance.parent as FrameNode).layoutMode;
          if (dir === 'VERTICAL') {
            setLayoutSizing(instance, 'horizontal', 'FILL');
            setLayoutSizing(instance, 'vertical', 'FIXED');
          } else if (dir === 'HORIZONTAL') {
            setLayoutSizing(instance, 'vertical', 'FILL');
            setLayoutSizing(instance, 'horizontal', 'FIXED');
          }
        }
        applySizingOverrides(instance, item);

        results.push({
          id: instance.id,
          ok: true,
          _actualVariant: resolved?.component.name,
          ...(itemWarnings.length > 0 ? { _warnings: itemWarnings } : {}),
        });
      } catch (err) {
        results.push({
          id: String(item.componentId ?? '?'),
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { results };
  });

  registerHandler('save_version_history', async (params) => {
    const title = (params.title as string) ?? 'FigCraft checkpoint';
    const description = (params.description as string) ?? '';
    await figma.saveVersionHistoryAsync(title, description);
    return { ok: true, title, description };
  });

  registerHandler('create_line', async (params) => {
    const line = figma.createLine();
    line.name = (params.name as string) ?? 'Line';
    const length = (params.length as number) ?? 100;
    line.resize(length, 0);
    if (params.x != null) line.x = params.x as number;
    if (params.y != null) line.y = params.y as number;
    if (params.rotation != null) line.rotation = params.rotation as number;

    const [lineMode, lineLibrary] = await getCachedModeLibrary();
    const useLib = lineMode === 'library' && !!lineLibrary;
    const strokeInput = params.stroke ?? '#000000';
    const strokeResult = await applyStroke(
      line,
      strokeInput as any,
      (params.strokeWeight as number) ?? 1,
      useLib,
      lineLibrary,
    );

    if (params.parentId) {
      const parent = await findNodeByIdAsync(params.parentId as string);
      if (parent && 'appendChild' in parent) {
        (parent as FrameNode).appendChild(line);
      }
    }

    const result = simplifyNode(line) as unknown as Record<string, unknown>;
    if (strokeResult.autoBound) result._libraryBindings = [strokeResult.autoBound];
    if (strokeResult.colorHint) result._warnings = [strokeResult.colorHint];
    if (strokeResult.bindingFailure) result._tokenBindingFailures = [strokeResult.bindingFailure];
    return result;
  });

  registerHandler('create_section', async (params) => {
    const section = figma.createSection();
    section.name = (params.name as string) ?? 'Section';
    section.resizeWithoutConstraints((params.width as number) ?? 1920, (params.height as number) ?? 1080);

    if (params.x != null) section.x = params.x as number;
    if (params.y != null) section.y = params.y as number;

    // ── Auto-position: avoid overlapping existing page content ──
    if (params.x == null && params.y == null) {
      const siblings = figma.currentPage.children;
      if (siblings.length > 1) {
        let maxBottom = 0;
        for (const child of siblings) {
          if (child.id === section.id) continue;
          if (!child.visible) continue;
          maxBottom = Math.max(maxBottom, child.y + child.height);
        }
        if (maxBottom > 0) {
          section.y = maxBottom + PAGE_GAP;
        }
      }
    }

    if (params.childIds) {
      const ids = params.childIds as string[];
      for (const id of ids) {
        const child = await findNodeByIdAsync(id);
        if (child && 'parent' in child) {
          section.appendChild(child as SceneNode);
        }
      }
    }

    return {
      id: section.id,
      name: section.name,
      x: section.x,
      y: section.y,
      width: section.width,
      height: section.height,
    };
  });

  registerHandler('boolean_operation', async (params) => {
    const nodeIds = params.nodeIds as string[];
    const operation = params.operation as 'UNION' | 'SUBTRACT' | 'INTERSECT' | 'EXCLUDE';

    const resolved = await Promise.all(nodeIds.map((id) => findNodeByIdAsync(id)));
    const nodes = resolved.filter(
      (n): n is SceneNode => n !== null && 'type' in n && n.type !== 'PAGE' && n.type !== 'DOCUMENT',
    );

    assertHandler(nodes.length >= 2, 'boolean_operation requires at least 2 valid nodes');

    const parent = nodes[0].parent as (BaseNode & ChildrenMixin) | null;
    assertHandler(parent, 'Nodes have no parent');

    let result: BooleanOperationNode;
    switch (operation) {
      case 'UNION':
        result = figma.union(nodes, parent);
        break;
      case 'SUBTRACT':
        result = figma.subtract(nodes, parent);
        break;
      case 'INTERSECT':
        result = figma.intersect(nodes, parent);
        break;
      case 'EXCLUDE':
        result = figma.exclude(nodes, parent);
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    if (params.name) result.name = params.name as string;

    return simplifyNode(result);
  });

  // ─── Create SVG node from markup ───
  registerHandler('create_svg', async (params) => {
    const svg = params.svg as string;
    assertHandler(svg, 'svg parameter is required');
    const node = figma.createNodeFromSvg(svg);
    node.name = (params.name as string) ?? 'SVG';
    if (params.x != null) node.x = params.x as number;
    if (params.y != null) node.y = params.y as number;
    if (params.parentId) {
      const parent = await findNodeByIdAsync(params.parentId as string);
      if (parent && 'appendChild' in parent) {
        (parent as FrameNode).appendChild(node);
      }
    }
    return simplifyNode(node);
  });

  // ─── Text scan: find all text nodes in a subtree ───
  registerHandler('text_scan', async (params) => {
    const nodeId = params.nodeId as string;
    const limit = (params.limit as number) ?? 100;
    const includePath = (params.includePath as boolean) ?? false;
    const root = await findNodeByIdAsync(nodeId);
    assertHandler(root, `Node not found: ${nodeId}`, 'NOT_FOUND');

    const textNodes: Array<{
      id: string;
      name: string;
      characters: string;
      fontSize: number | typeof figma.mixed;
      fontFamily: string;
      path?: string;
    }> = [];

    function walk(node: BaseNode, path: string): void {
      if (textNodes.length >= limit) return;
      if (node.type === 'TEXT') {
        const t = node as TextNode;
        const entry: (typeof textNodes)[0] = {
          id: t.id,
          name: t.name,
          characters: t.characters,
          fontSize: t.fontSize,
          fontFamily: t.fontName !== figma.mixed ? t.fontName.family : 'mixed',
        };
        if (includePath) entry.path = path;
        textNodes.push(entry);
      }
      if ('children' in node) {
        for (const child of (node as FrameNode).children) {
          walk(child, path ? `${path} > ${child.name}` : child.name);
        }
      }
    }

    walk(root, '');
    return { nodeId, count: textNodes.length, textNodes };
  });
} // registerInstanceHandlers
