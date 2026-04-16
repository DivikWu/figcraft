/**
 * Component CRUD handlers — list, get, create, update, delete, list_local.
 *
 * Also hosts:
 *   - `createSingleComponent`: the single-component creation pipeline shared
 *     by the single-mode and batch-mode paths of `create_component`. Delegates
 *     to `create_frame` for the frame body, then converts and wires properties.
 *   - `collectVisibleRefs`: walks inline children to gather BOOLEAN visibility
 *     references. Exported (via the barrel) for unit testing.
 */

import { simplifyNode } from '../../adapters/node-simplifier.js';
import { handlers, registerHandler } from '../../registry.js';
import { assertHandler, assertNodeType, HandlerError } from '../../utils/handler-error.js';
import { assertOnCurrentPage, findNodeByIdAsync } from '../../utils/node-lookup.js';
import { applyPublishableMetadata, stripPublishableMetadata } from '../../utils/publishable-metadata.js';
import { quickLintSummary } from '../lint-inline.js';

// ─── BOOLEAN component property visibility binding ───

interface VisibleRefDecl {
  propName: string;
  childName: string;
}

export interface VisibleRefCollectorResult {
  refs: VisibleRefDecl[];
  warnings: string[];
}

/**
 * Walk inline children and collect every `componentPropertyReferences.visible`
 * declaration. Children declaring a ref must have a `name` field (used by
 * `component.findAll` post-creation to locate the target); unnamed refs are
 * dropped with a warning. Pure function — exported for unit testing.
 */
export function collectVisibleRefs(children: unknown): VisibleRefCollectorResult {
  const refs: VisibleRefDecl[] = [];
  const warnings: string[] = [];
  if (!Array.isArray(children)) return { refs, warnings };

  function walk(defs: unknown[]): void {
    for (const def of defs) {
      if (!def || typeof def !== 'object') continue;
      const d = def as Record<string, unknown>;
      const raw = d.componentPropertyReferences as Record<string, unknown> | undefined;
      const visibleProp = raw && typeof raw === 'object' ? raw.visible : undefined;
      if (typeof visibleProp === 'string') {
        const childName = typeof d.name === 'string' ? d.name : '';
        if (!childName) {
          warnings.push(
            `⛔ componentPropertyReferences.visible = "${visibleProp}" requires a 'name' field on the child.`,
          );
        } else {
          refs.push({ propName: visibleProp, childName });
        }
      }
      if (Array.isArray(d.children)) walk(d.children as unknown[]);
    }
  }

  walk(children as unknown[]);
  return { refs, warnings };
}

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
    } catch {
      /* contentWrapper restructure failure should not block component creation */
    }
  }

  // ── Diagnostic: capture frame state BEFORE createComponentFromNode (P0-1 / P1-1) ──
  // Temporary probe to nail the real root cause during verification. Remove once
  // both sizing drift and cornerRadius drift are confirmed stable.
  const preFrame = frameNode as FrameNode;
  const preState = {
    w: preFrame.width,
    h: preFrame.height,
    hSize: (preFrame as any).layoutSizingHorizontal as string | undefined,
    vSize: (preFrame as any).layoutSizingVertical as string | undefined,
    cr: (preFrame as any).cornerRadius as number | symbol | undefined,
  };

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

  // Diagnostic log — compare pre/post width, height, layoutSizing, cornerRadius.
  // Emits only when a drift is detected so the console stays quiet in the
  // happy path. Temporary; remove once P0-1 and P1-1 are confirmed stable.
  {
    const post = {
      w: component.width,
      h: component.height,
      hSize: (component as any).layoutSizingHorizontal as string | undefined,
      vSize: (component as any).layoutSizingVertical as string | undefined,
      cr: (component as any).cornerRadius as number | symbol | undefined,
    };
    const drift =
      preState.w !== post.w ||
      preState.h !== post.h ||
      preState.hSize !== post.hSize ||
      preState.vSize !== post.vSize ||
      preState.cr !== post.cr;
    if (drift) {
      console.warn(
        `[FigCraft] create_component drift: pre=${JSON.stringify(preState)} post=${JSON.stringify(post)} requested=${JSON.stringify({ w: itemParams.width, h: itemParams.height, cr: itemParams.cornerRadius })}`,
      );
    }
  }

  // 缺陷 P0b: local property-warning collector.
  // Previously the inline property-creation path at steps 3-4 silently swallowed
  // all errors (`catch { /* skip */ }`), so agents had no idea when a property
  // failed to register. Each failed property now pushes a descriptive hint that
  // gets merged into _warnings / _typedHints at the end so the agent can self-correct.
  const propertyWarnings: string[] = [];
  const propertiesAdded: string[] = [];

  // Step 3a: collect inline componentPropertyReferences.visible declarations
  // so Step 4 can auto-wire them when the matching BOOLEAN property lands.
  const { refs: visibleRefs, warnings: visibleRefWarnings } = collectVisibleRefs(itemParams.children);
  for (const w of visibleRefWarnings) propertyWarnings.push(w);
  const usedVisibleRefs = new Set<string>();

  // Step 3: Bind text children to component TEXT properties via componentPropertyName
  if (Array.isArray(itemParams.children)) {
    const textBindings: Array<{ propName: string; textContent: string }> = [];
    (function collect(defs: Array<Record<string, unknown>>) {
      for (const def of defs) {
        if (def.componentPropertyName && (def.type === 'text' || !def.type)) {
          textBindings.push({
            propName: def.componentPropertyName as string,
            textContent: (def.content as string) ?? (def.text as string) ?? '',
          });
        }
        if (Array.isArray(def.children)) collect(def.children as Array<Record<string, unknown>>);
      }
    })(itemParams.children as Array<Record<string, unknown>>);

    for (const { propName, textContent } of textBindings) {
      const textNode = component.findOne(
        (n) => n.type === 'TEXT' && (n.name === propName || (n as TextNode).characters === textContent),
      ) as TextNode | null;
      if (!textNode) {
        propertyWarnings.push(
          `⛔ TEXT property "${propName}" — no matching text child found (name === "${propName}" or characters === "${textContent}"). ` +
            `Check the child's componentPropertyName matches the text node's name or content.`,
        );
        continue;
      }
      try {
        const propKey = component.addComponentProperty(propName, 'TEXT', textNode.characters);
        textNode.componentPropertyReferences = { characters: propKey };
        propertiesAdded.push(propName);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Common case: property already exists (e.g. duplicated componentPropertyName
        // across multiple text children). Surface it so agents can deduplicate.
        propertyWarnings.push(
          `⛔ TEXT property "${propName}" failed to register: ${msg}. ` +
            `Common cause: duplicate componentPropertyName across multiple text children — each TEXT property name must be unique within the component.`,
        );
      }
    }
  }

  // Step 4: Add non-text component properties (BOOLEAN, INSTANCE_SWAP, SLOT)
  // Mirrors the validation from the standalone add_component_property handler.
  if (Array.isArray(itemParams.properties)) {
    const existingProps = new Set(Object.keys(component.componentPropertyDefinitions));
    for (const prop of itemParams.properties as Array<Record<string, unknown>>) {
      const propName = prop.propertyName as string;
      const propType = prop.type as string;
      const defaultValue = prop.defaultValue;
      const preferredValues = prop.preferredValues;

      if (!propName || !propType) {
        propertyWarnings.push(
          `⛔ component property missing required fields — need {propertyName, type, defaultValue}. Got: ${JSON.stringify(prop)}`,
        );
        continue;
      }
      if (propType === 'TEXT') continue; // TEXT properties are created via componentPropertyName on children

      // Validation parity with standalone add_component_property handler (components/properties.ts)
      if (propType === 'VARIANT') {
        propertyWarnings.push(
          `⛔ component property "${propName}" type VARIANT is auto-managed by create_component_set / combineAsVariants — ` +
            `do not declare it via properties:[]. Define variant axes in the variant set's name scheme instead.`,
        );
        continue;
      }
      if (propType === 'INSTANCE_SWAP' && !preferredValues) {
        propertyWarnings.push(
          `⛔ component property "${propName}" (INSTANCE_SWAP) requires preferredValues. ` +
            `Pass preferredValues:[{type:"COMPONENT", key:"<componentKey>"}]. Use search_design_system to find component keys.`,
        );
        continue;
      }
      if (propType === 'BOOLEAN' && typeof defaultValue !== 'boolean') {
        propertyWarnings.push(
          `⛔ component property "${propName}" (BOOLEAN) defaultValue must be true/false, got ${typeof defaultValue}: ${JSON.stringify(defaultValue)}. ` +
            `Pass the literal boolean, not the string "true"/"false".`,
        );
        continue;
      }
      // Strip Figma's #id:id suffix for the duplicate check so agents can use bare names.
      const bareExisting = new Set(
        [...existingProps].map((k) => {
          const h = k.indexOf('#');
          return h >= 0 ? k.slice(0, h) : k;
        }),
      );
      if (bareExisting.has(propName)) {
        propertyWarnings.push(
          `⛔ component property "${propName}" already exists — skipped. Use update_component_property to change it, or delete_component_property first.`,
        );
        continue;
      }

      try {
        const options: ComponentPropertyOptions | undefined = preferredValues
          ? { preferredValues: preferredValues as InstanceSwapPreferredValue[] }
          : undefined;
        const propKey = component.addComponentProperty(
          propName,
          propType as ComponentPropertyType,
          defaultValue as any,
          options,
        );
        propertiesAdded.push(propName);
        existingProps.add(propName);

        // BOOLEAN auto-wire: locate children that declared
        // componentPropertyReferences.visible = "<propName>" and bind them.
        // Otherwise the property would be orphaned (toggle does nothing).
        if (propType === 'BOOLEAN') {
          const matches = visibleRefs.filter((r) => r.propName === propName);
          if (matches.length === 0) {
            propertyWarnings.push(
              `⚠️ BOOLEAN property "${propName}" has no bound child — flipping this toggle in instances will have no effect. ` +
                `Declare componentPropertyReferences: { visible: "${propName}" } on a child.`,
            );
          } else {
            for (const match of matches) {
              usedVisibleRefs.add(match.propName);
              const targets = component.findAll((n) => n.name === match.childName);
              for (const target of targets) {
                const existingRefs =
                  ((target as SceneNode & { componentPropertyReferences?: Record<string, string> })
                    .componentPropertyReferences as Record<string, string> | undefined) ?? {};
                (
                  target as SceneNode & { componentPropertyReferences?: Record<string, string> }
                ).componentPropertyReferences = { ...existingRefs, visible: propKey };
                // Sync node visible with defaultValue so the main component
                // preview matches the declared default. Variants override.
                if ('visible' in target) {
                  (target as SceneNode).visible = defaultValue === true;
                }
              }
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        propertyWarnings.push(
          `⛔ component property "${propName}" (${propType}) failed to register: ${msg}. ` +
            `Common causes: defaultValue type mismatch (BOOLEAN needs true/false, TEXT needs string), ` +
            `name conflict, or unsupported type on this component type.`,
        );
      }
    }
  }

  // Reverse orphan: a child declared componentPropertyReferences.visible but
  // no matching BOOLEAN property landed (either absent from properties[] or
  // no properties[] at all). Figma silently ignores unknown prop keys so
  // this is a real mistake the agent can't detect otherwise.
  for (const ref of visibleRefs) {
    if (!usedVisibleRefs.has(ref.propName)) {
      propertyWarnings.push(
        `⚠️ Child "${ref.childName}" references BOOLEAN property "${ref.propName}" but no such property was declared. ` +
          `Add { type: "BOOLEAN", propertyName: "${ref.propName}", defaultValue: false } to properties[].`,
      );
    }
  }

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
