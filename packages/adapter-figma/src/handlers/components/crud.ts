/**
 * Component CRUD handlers — list, get, create, update, delete, list_local.
 *
 * Also hosts:
 *   - `createSingleComponent`: the single-component creation pipeline shared
 *     by the single-mode and batch-mode paths of `create_component`. Delegates
 *     to `create_frame` for the frame body, then converts and wires properties.
 *
 * Property wiring (TEXT, BOOLEAN, INSTANCE_SWAP, SLOT) is in wire-properties.ts.
 * `collectVisibleRefs` (pure helper for BOOLEAN visibility) is also there.
 */

import { simplifyNode } from '../../adapters/node-simplifier.js';
import { handlers, registerHandler } from '../../registry.js';
import { assertHandler, assertNodeType, HandlerError } from '../../utils/handler-error.js';
import { assertOnCurrentPage, findNodeByIdAsync } from '../../utils/node-lookup.js';
import { applyPublishableMetadata, stripPublishableMetadata } from '../../utils/publishable-metadata.js';
import { quickLintSummary } from '../lint-inline.js';
import { wireProperties } from './wire-properties.js';

export type { VisibleRefCollectorResult } from './wire-properties.js';
// Re-export for barrel (components.ts) and tests.
export { collectVisibleRefs } from './wire-properties.js';

// ─── Single-component creation pipeline (shared by create_component single + batch) ───

async function createSingleComponent(
  itemParams: Record<string, unknown>,
  createFrameHandler: (p: Record<string, unknown>) => Promise<unknown>,
): Promise<unknown> {
  // Capture PublishableMixin metadata before stripping — applied after component
  // creation. Symmetric with update_component: all 3 fields are settable at birth.
  const metadata = {
    description: itemParams.description,
    descriptionMarkdown: itemParams.descriptionMarkdown,
    documentationLinks: itemParams.documentationLinks,
  };

  // Build frame params (exclude component-specific fields)
  const frameParams: Record<string, unknown> = { ...itemParams };
  stripPublishableMetadata(frameParams);
  delete frameParams.properties;
  delete frameParams.items; // never pass batch param to create_frame
  delete frameParams.contentWrapper; // component-only param, not for create_frame

  // Step 1: Create frame via create_frame handler (gets Opinion Engine for free)
  let frameResult: Record<string, unknown>;
  try {
    frameResult = (await createFrameHandler(frameParams)) as Record<string, unknown>;
  } catch (e: unknown) {
    throw new HandlerError(
      `create_component: frame creation failed — ${e instanceof Error ? e.message : String(e)}`,
      'FRAME_CREATION_FAILED',
    );
  }

  // dryRun: create_frame returns preview without creating nodes — pass through directly
  if (frameResult.dryRun) return frameResult;

  if (!frameResult.id) {
    throw new HandlerError(
      'create_component: create_frame returned no id. Check create_frame params.',
      'FRAME_CREATION_FAILED',
    );
  }

  // Step 2: Convert frame to component
  const frameNode = await findNodeByIdAsync(frameResult.id as string);
  assertHandler(
    frameNode && frameNode.type === 'FRAME',
    `Frame creation failed: node ${frameResult.id} not found or not a FRAME`,
  );

  // 缺陷 P0b: local property-warning collector — declared early so contentWrapper
  // and later property-creation steps can all push into the same array.
  const propertyWarnings: string[] = [];
  const propertiesAdded: string[] = [];

  // ── Content wrapper: wrap children in a transparent "Content" frame ──
  if (itemParams.contentWrapper !== false && (frameNode as FrameNode).children.length >= 2) {
    try {
      const frame = frameNode as FrameNode;
      const wrapper = figma.createFrame();
      wrapper.name = 'Content';
      wrapper.fills = [];
      if (frame.layoutMode !== 'NONE') {
        wrapper.layoutMode = frame.layoutMode;
        wrapper.primaryAxisAlignItems = frame.primaryAxisAlignItems;
        wrapper.counterAxisAlignItems = frame.counterAxisAlignItems;
        wrapper.itemSpacing = frame.itemSpacing;
        if (frame.layoutWrap === 'WRAP') {
          wrapper.layoutWrap = 'WRAP';
          wrapper.counterAxisSpacing = frame.counterAxisSpacing;
        }
      }
      const children = [...frame.children];
      frame.appendChild(wrapper);
      for (const child of children) {
        wrapper.appendChild(child);
      }
      if (frame.layoutMode !== 'NONE') {
        wrapper.layoutSizingHorizontal = 'FILL';
        wrapper.layoutSizingVertical = 'HUG';
        frame.itemSpacing = 0;
      }
    } catch (err) {
      propertyWarnings.push(
        `contentWrapper restructure failed: ${err instanceof Error ? err.message : String(err)}. ` +
          `Children were NOT wrapped — component structure may differ from intent.`,
      );
    }
  }

  const component = figma.createComponentFromNode(frameNode as SceneNode);
  // Apply all 3 PublishableMixin metadata fields uniformly. The length guard
  // for documentationLinks lives in the helper; a guard violation throws here
  // AFTER component creation — caller sees the component exist but metadata
  // rejected, which is the same failure mode as update_component.
  applyPublishableMetadata(component, metadata);

  // ── P0-1 / 缺陷 B: Re-assert FIXED sizing after createComponentFromNode ──
  // When dimensions were explicitly provided, lock the component back to those
  // dimensions regardless of parent type. Two drift paths exist:
  //
  // 1. Auto-layout parent (FRAME with layoutMode) — Figma re-propagates
  //    layoutSizing from the parent and resets explicit FIXED back to HUG.
  //
  // 2. Section parent (SectionNode has no `layoutMode`) — the child frame
  //    may have HUG children that collapse the auto-layout container to 0
  //    after createComponentFromNode triggers a re-layout. Previously this
  //    case was skipped because the old guard required `parentLayout !== 'NONE'`,
  //    which is falsy for sections (no layoutMode property at all). That
  //    caused the "create_component inside a section returns wrong size"
  //    loop documented in the diagnosis plan.
  //
  // Always re-assert when width/height explicit AND user did not ask HUG/FILL.
  // Mirrors the guard at setupFrame line 978. Safe for all parent types:
  // sections, auto-layout frames, root page, component sets.
  if (itemParams.width != null || itemParams.height != null) {
    const needsH = itemParams.width != null && !itemParams.layoutSizingHorizontal;
    const needsV = itemParams.height != null && !itemParams.layoutSizingVertical;
    if (needsH) {
      try {
        component.layoutSizingHorizontal = 'FIXED';
      } catch {
        /* some contexts don't support direct sizing writes */
      }
    }
    if (needsV) {
      try {
        component.layoutSizingVertical = 'FIXED';
      } catch {
        /* ibid */
      }
    }
    if (needsH || needsV) {
      try {
        component.resize(
          (itemParams.width as number) ?? component.width,
          (itemParams.height as number) ?? component.height,
        );
      } catch {
        /* resize can fail on component sets — best effort */
      }
    }
  }

  // Steps 3-4: Wire component properties (TEXT, BOOLEAN, INSTANCE_SWAP, SLOT)
  const wireResult = wireProperties(component, itemParams);
  for (const w of wireResult.warnings) propertyWarnings.push(w);
  for (const p of wireResult.propertiesAdded) propertiesAdded.push(p);

  // Step 5: Post-creation lint — catch hardcoded tokens and other violations immediately
  const simplified = simplifyNode(component);
  let lintSummary: unknown;
  try {
    lintSummary = await quickLintSummary(component.id, true);
  } catch {
    /* lint failure should not block creation */
  }

  // Merge frameResult metadata (warnings, bindings, failures) into response.
  // Without this, token binding failures from create_frame are silently lost.
  const metaKeys = ['_warnings', '_libraryBindings', '_tokenBindingFailures', '_hints', '_typedHints'] as const;
  const meta: Record<string, unknown> = {};
  for (const key of metaKeys) {
    if (frameResult[key] != null) meta[key] = frameResult[key];
  }
  if (lintSummary) meta._lintSummary = lintSummary;

  // 缺陷 P0b: merge inline property failures into response.
  // Appends to existing _warnings from frame creation so the agent sees a single
  // aggregated warning stream instead of two disjoint sources.
  if (propertyWarnings.length > 0) {
    const existing = Array.isArray(meta._warnings) ? (meta._warnings as string[]) : [];
    meta._warnings = [...existing, ...propertyWarnings];
    // Also surface as typed errors so the harness post-enrich layer sees them.
    const existingTyped = Array.isArray(meta._typedHints) ? (meta._typedHints as Array<Record<string, unknown>>) : [];
    meta._typedHints = [...existingTyped, ...propertyWarnings.map((message) => ({ type: 'error' as const, message }))];
  }
  if (propertiesAdded.length > 0) {
    meta._propertiesAdded = propertiesAdded;
  }

  return Object.keys(meta).length > 0 ? { ...simplified, ...meta } : simplified;
}

// ─── Handler registration ───

export function registerComponentCrudHandlers(): void {
  registerHandler('list_components', async () => {
    const components: unknown[] = [];

    function walk(node: SceneNode) {
      if (node.type === 'COMPONENT') {
        components.push({
          id: node.id,
          name: node.name,
          description: (node as ComponentNode).description,
          key: (node as ComponentNode).key,
        });
      }
      if ('children' in node) {
        for (const child of (node as ChildrenMixin).children) {
          walk(child);
        }
      }
    }

    for (const child of figma.currentPage.children) {
      walk(child);
    }

    return { count: components.length, components };
  });

  registerHandler('get_component', async (params) => {
    const nodeId = params.nodeId as string;
    const node = await findNodeByIdAsync(nodeId);
    assertHandler(node && node.type === 'COMPONENT', `Component not found: ${nodeId}`, 'NOT_FOUND');
    const comp = node as ComponentNode;
    return {
      ...simplifyNode(comp),
      description: comp.description,
      key: comp.key,
      componentPropertyDefinitions: comp.componentPropertyDefinitions,
    };
  });

  registerHandler('create_component', async (params) => {
    const createFrameHandler = handlers.get('create_frame');
    assertHandler(createFrameHandler, 'create_frame handler not registered');

    // ── Batch mode: items[] ──
    if (Array.isArray(params.items)) {
      const items = params.items as Array<Record<string, unknown>>;
      // Cap lowered from 20 → 10 after the 2026-04 Button regression: even
      // 20-item batches were timing out the MCP call (each item carries layout
      // + variable bind + property wire + role inference, ~1.2s each on a
      // typical Button-sized component). 10 is the new safe budget. See plan
      // elegant-wandering-raven.md B1.
      const MAX_BATCH = 10;
      assertHandler(
        items.length <= MAX_BATCH,
        `Batch limited to ${MAX_BATCH} components per call (lowered from 20 after timeout incidents). ` +
          `Got ${items.length}. Split into ${Math.ceil(items.length / MAX_BATCH)} sequential calls.`,
        'BATCH_LIMIT_EXCEEDED',
      );

      // Bug fix: inherit top-level params onto each item when the item hasn't
      // set them explicitly. This is critical for the harness-injected parentId
      // (from componentDefaultsInjection rule, which puts the tracked section ID
      // onto `params.parentId`). Without this propagation, batch-created components
      // land at root instead of inside the section. Item-level values always win
      // over top-level so agents can still override per item.
      const INHERITED_KEYS = ['parentId'] as const;
      const inheritedDefaults: Record<string, unknown> = {};
      for (const key of INHERITED_KEYS) {
        if (params[key] != null) inheritedDefaults[key] = params[key];
      }

      const results: Array<{ id?: string; name?: string; ok: boolean; error?: string }> = [];
      let created = 0;
      let totalViolations = 0;
      let totalAutoFixed = 0;
      const allBindingFailures: unknown[] = [];
      // Periodic yield to the Plugin sandbox event loop every YIELD_EVERY items.
      // This is a defensive measure, not a proven fix for relay timeouts:
      // - The WebSocket relay heartbeat lives on the UI iframe layer, so this
      //   sandbox-side yield does NOT directly fire heartbeats.
      // - What it DOES do: let pending microtasks (pending postMessage responses
      //   from the UI, resolved promises from prior items, etc.) drain between
      //   batch items instead of starving at the end of the batch.
      // The REAL fix for the timeout incident was lowering MAX_BATCH from 20 to
      // 10 (see above). This yield is kept as a low-cost (~microseconds/yield)
      // margin in case the sandbox queue was a contributor. If empirical data
      // later shows it doesn't help, it can be safely removed. See plan B1.
      const YIELD_EVERY = 4;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        // Merge inherited defaults with item-level overrides. Item-level values win
        // because the spread comes after.
        const effectiveItem = { ...inheritedDefaults, ...item };
        try {
          const result = (await createSingleComponent(effectiveItem, createFrameHandler)) as Record<string, unknown>;
          results.push({ id: result.id as string, name: result.name as string, ok: true });
          created++;
          // Aggregate lint stats
          if (result._lintSummary) {
            const ls = result._lintSummary as Record<string, unknown>;
            totalViolations += (ls.violations as number) ?? 0;
            totalAutoFixed += (ls.autoFixed as number) ?? 0;
          }
          // Collect token binding failures across batch
          if (Array.isArray(result._tokenBindingFailures)) {
            allBindingFailures.push(...(result._tokenBindingFailures as unknown[]));
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          results.push({ name: (item.name as string) ?? 'Component', ok: false, error: msg });
        }
        // Heartbeat yield — non-zero modulo and not the last iteration.
        if ((i + 1) % YIELD_EVERY === 0 && i + 1 < items.length) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 0);
          });
        }
      }
      const out: Record<string, unknown> = { created, total: items.length, items: results };
      if (totalViolations > 0) {
        out._batchLintSummary = {
          totalViolations,
          totalAutoFixed,
          remaining: totalViolations - totalAutoFixed,
          hint: 'Run lint_fix_all to fix remaining violations across all created components.',
        };
      }
      if (allBindingFailures.length > 0) {
        out._tokenBindingFailures = allBindingFailures;
      }
      // Surface the inherited top-level params so agents can confirm the
      // section-parent injection reached each batch item (mirrors the
      // _autoInjected field set by componentDefaultsPostEnrich for single mode).
      if (Object.keys(inheritedDefaults).length > 0) {
        out._inheritedToItems = inheritedDefaults;
      }
      return out;
    }

    // ── Single mode ──
    return createSingleComponent(params, createFrameHandler);
  });

  registerHandler('update_component', async (params) => {
    const node = await findNodeByIdAsync(params.nodeId as string);
    // Accept both COMPONENT and COMPONENT_SET — both extend PublishableMixin,
    // so name/description/descriptionMarkdown work uniformly. The set's own
    // description is what shows in Figma's assets panel for multi-variant
    // components, and rejecting it was the head of a 6-defect trap chain.
    assertHandler(
      !!node && (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'),
      `nodeId="${params.nodeId}" — update_component accepts COMPONENT or COMPONENT_SET. ` +
        `For a FRAME, convert it first via create_component_from_node.`,
      'INVALID_NODE_TYPE',
    );
    const comp = node as ComponentNode | ComponentSetNode;
    const warnings: string[] = [];

    if (params.name != null) comp.name = params.name as string;
    // PublishableMixin metadata (description / descriptionMarkdown / documentationLinks)
    // — shared helper enforces the documentationLinks length guard consistently
    // with create_component and create_component_from_node.
    applyPublishableMetadata(comp, params);

    if (params.width != null || params.height != null) {
      if (comp.type === 'COMPONENT_SET') {
        // ComponentSet size is auto-computed from its variant layout. If
        // create_component_set ran layout_component_set (it always does),
        // a manual resize() here would be clobbered the next time variants
        // shuffle — phantom success. Warn instead of silently failing.
        warnings.push(
          'width/height ignored on COMPONENT_SET — set size is auto-computed from variant layout. ' +
            "To change the set's footprint, resize individual variants or re-run layout_component_set " +
            'with different padding/gap.',
        );
      } else {
        comp.resize((params.width as number) ?? comp.width, (params.height as number) ?? comp.height);
      }
    }

    const result = simplifyNode(comp);
    return warnings.length > 0 ? { ...result, _warnings: warnings } : result;
  });

  registerHandler('delete_component', async (params) => {
    const node = await findNodeByIdAsync(params.nodeId as string);
    assertNodeType(
      node,
      'COMPONENT',
      `nodeId="${params.nodeId}"`,
      'For a COMPONENT_SET, delete the whole set via nodes(method:"delete"). For a FRAME, also use nodes(method:"delete").',
    );
    assertOnCurrentPage(node, params.nodeId as string);
    node.remove();
    return { ok: true };
  });

  // ─── Local Component Enumeration (for Local mode alignment with Library mode) ───

  registerHandler('list_local_components', async (params) => {
    const allPages = (params.allPages as boolean) === true;

    // Use Figma's optimised API instead of manual recursive walk.
    // Default: current page only (fast).  allPages=true: entire file (slow on large files).
    const root = allPages ? figma.root : figma.currentPage;
    const componentNodes = root.findAllWithCriteria({ types: ['COMPONENT'] });
    const setNodes = root.findAllWithCriteria({ types: ['COMPONENT_SET'] });

    function getContainingFrame(node: SceneNode): string {
      let current = node.parent;
      while (current) {
        if (current.type === 'PAGE') return '';
        if (current.type === 'FRAME' || current.type === 'SECTION') return current.name;
        if (current.type === 'COMPONENT_SET') {
          current = current.parent;
          continue;
        }
        current = current.parent;
      }
      return '';
    }

    // Collect component sets
    const componentSets: Array<{
      id: string;
      name: string;
      description: string;
      containingFrame: string;
      variantCount: number;
      propertyOptions: Record<string, string[]>;
    }> = [];

    for (const set of setNodes as ComponentSetNode[]) {
      const variants = set.children.filter((c) => c.type === 'COMPONENT') as ComponentNode[];
      const propertyOptions: Record<string, string[]> = {};
      for (const variant of variants) {
        const parts = variant.name.split(',').map((s) => s.trim());
        for (const part of parts) {
          const [propName, propValue] = part.split('=').map((s) => s.trim());
          if (propName && propValue) {
            if (!propertyOptions[propName]) propertyOptions[propName] = [];
            if (!propertyOptions[propName].includes(propValue)) {
              propertyOptions[propName].push(propValue);
            }
          }
        }
      }
      componentSets.push({
        id: set.id,
        name: set.name,
        description: set.description || '',
        containingFrame: getContainingFrame(set),
        variantCount: variants.length,
        propertyOptions,
      });
    }

    // Collect standalone components (not inside a component set)
    const standalone: Array<{
      id: string;
      name: string;
      description: string;
      containingFrame: string;
    }> = [];

    for (const comp of componentNodes as ComponentNode[]) {
      if (comp.parent?.type === 'COMPONENT_SET') continue;
      standalone.push({
        id: comp.id,
        name: comp.name,
        description: comp.description || '',
        containingFrame: getContainingFrame(comp),
      });
    }

    return {
      componentSets,
      standalone,
      ...(allPages ? {} : { _scope: 'currentPage' }),
      _note:
        'Use componentId (node ID) to create instances of local components. ' +
        'For component sets, use componentId + variantProperties to select a variant.' +
        (allPages ? '' : ' Results are from the current page only. Pass allPages=true to scan all pages.'),
    };
  });
}
