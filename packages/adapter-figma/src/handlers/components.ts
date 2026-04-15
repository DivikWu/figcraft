/**
 * Component & Instance handlers — CRUD for components and instances.
 */

import { simplifyNode } from '../adapters/node-simplifier.js';
import { PAGE_GAP, SECTION_GAP, SECTION_PADDING } from '../constants.js';
import { handlers, registerHandler } from '../registry.js';
import { assertHandler, assertNodeType, HandlerError } from '../utils/handler-error.js';
import { assertOnCurrentPage, findNodeByIdAsync } from '../utils/node-lookup.js';
import { quickLintSummary } from './lint-inline.js';

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

export function registerComponentHandlers(): void {
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

  // ── Single-component creation logic (shared by single + batch modes) ──
  async function createSingleComponent(
    itemParams: Record<string, unknown>,
    createFrameHandler: (p: Record<string, unknown>) => Promise<unknown>,
  ): Promise<unknown> {
    const description = itemParams.description as string | undefined;

    // Build frame params (exclude component-specific fields)
    const frameParams: Record<string, unknown> = { ...itemParams };
    delete frameParams.description;
    delete frameParams.properties;
    delete frameParams.items; // never pass batch param to create_frame

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
    if (description) component.description = description;

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

        // Validation parity with standalone add_component_property handler (components.ts:687-746)
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
      meta._typedHints = [
        ...existingTyped,
        ...propertyWarnings.map((message) => ({ type: 'error' as const, message })),
      ];
    }
    if (propertiesAdded.length > 0) {
      meta._propertiesAdded = propertiesAdded;
    }

    return Object.keys(meta).length > 0 ? { ...simplified, ...meta } : simplified;
  }

  registerHandler('create_component', async (params) => {
    const createFrameHandler = handlers.get('create_frame');
    assertHandler(createFrameHandler, 'create_frame handler not registered');

    // ── Batch mode: items[] ──
    if (Array.isArray(params.items)) {
      const items = params.items as Array<Record<string, unknown>>;
      const MAX_BATCH = 20;
      assertHandler(
        items.length <= MAX_BATCH,
        `Batch limited to ${MAX_BATCH} components per call. Got ${items.length}.`,
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
      for (const item of items) {
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

  // create_instance is registered in write-nodes-instance.ts (with shared importAndResolveComponent,
  // _actualVariant feedback, and unmatched properties reporting). No duplicate here.

  registerHandler('swap_instance', async (params) => {
    const instanceId = params.instanceId as string;
    const newComponentKey = params.componentKey as string;

    const node = await findNodeByIdAsync(instanceId);
    assertNodeType(
      node,
      'INSTANCE',
      `instanceId="${instanceId}"`,
      'Only INSTANCE nodes can be swapped. To create one, use create_instance with a componentId or componentKey.',
    );

    const newComponent = await figma.importComponentByKeyAsync(newComponentKey);
    (node as InstanceNode).swapComponent(newComponent);

    return simplifyNode(node as InstanceNode);
  });

  registerHandler('detach_instance', async (params) => {
    const instanceId = params.instanceId as string;
    const node = await findNodeByIdAsync(instanceId);
    assertNodeType(
      node,
      'INSTANCE',
      `instanceId="${instanceId}"`,
      'Only INSTANCE nodes can be detached. A FRAME or COMPONENT is already standalone — no detach needed.',
    );
    const frame = (node as InstanceNode).detachInstance();
    return simplifyNode(frame);
  });

  registerHandler('reset_instance_overrides', async (params) => {
    const instanceId = params.instanceId as string;
    const node = await findNodeByIdAsync(instanceId);
    assertNodeType(node, 'INSTANCE', `instanceId="${instanceId}"`, 'Only INSTANCE nodes have overrides to reset.');
    // Plugin API ≥ v120 renamed resetOverrides → removeOverrides. Current typings
    // only expose the new name. The older name is kept as a runtime fallback
    // (via untyped lookup) for hosts that still ship the legacy API.
    const instance = node as InstanceNode;
    const withOverrideMethods = instance as unknown as {
      removeOverrides?: () => void;
      resetOverrides?: () => void;
    };
    if (typeof withOverrideMethods.removeOverrides === 'function') {
      withOverrideMethods.removeOverrides();
    } else if (typeof withOverrideMethods.resetOverrides === 'function') {
      withOverrideMethods.resetOverrides();
    } else {
      throw new HandlerError(
        'Instance override reset is unavailable: neither removeOverrides nor resetOverrides exists on this instance. ' +
          'Upgrade Figma to a Plugin API version ≥ 120.',
        'API_UNAVAILABLE',
      );
    }
    return { ok: true };
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
    if (params.description != null) comp.description = params.description as string;
    // PublishableMixin exposes both description (plain) and descriptionMarkdown
    // (rich) — expose both to callers, design-system docs often want markdown.
    if (params.descriptionMarkdown != null) {
      comp.descriptionMarkdown = params.descriptionMarkdown as string;
    }
    // documentationLinks: matches the "Link to documentation" field in Figma's
    // Component configuration modal. Figma Plugin API types this as an array
    // (ReadonlyArray<DocumentationLink>) but currently caps runtime length at 1
    // — we mirror the API shape (future-proof) and enforce the limit via guard.
    // Accept string[] rather than {uri}[] to avoid a useless single-field object
    // wrapper; figcraft wraps internally. Pass [] to clear.
    if (params.documentationLinks != null) {
      const links = params.documentationLinks as string[];
      if (links.length > 1) {
        throw new HandlerError(
          `documentationLinks accepts at most 1 entry (Figma Plugin API current limit), got ${links.length}. ` +
            `Pick the single most important link; the rest belong in the descriptionMarkdown body as inline links. ` +
            `Pass [] to clear. This is a Figma platform restriction, not a figcraft schema restriction.`,
          'DOCUMENTATION_LINKS_LIMIT',
        );
      }
      comp.documentationLinks = links.map((uri) => ({ uri }));
    }

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

  registerHandler('list_component_properties', async (params) => {
    const node = await findNodeByIdAsync(params.nodeId as string);
    assertHandler(
      node && (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'),
      `Component not found: ${params.nodeId}`,
      'NOT_FOUND',
    );
    const comp = node as ComponentNode | ComponentSetNode;
    return {
      properties: Object.entries(comp.componentPropertyDefinitions).map(([key, def]) => ({
        key,
        type: def.type,
        defaultValue: def.defaultValue,
        variantOptions:
          'variantOptions' in def
            ? (def as ComponentPropertyDefinitions[string] & { variantOptions?: string[] }).variantOptions
            : undefined,
      })),
    };
  });

  registerHandler('create_component_set', async (params) => {
    const ids = params.componentIds as string[];
    const nodes = await Promise.all(ids.map((id) => findNodeByIdAsync(id)));
    const components = nodes.filter((n): n is ComponentNode => n?.type === 'COMPONENT');
    assertHandler(components.length > 0, 'No valid components found');

    // ── Variant matrix guardrail (P0-4) ──
    // Enforce a soft variant cap from figcraft-generate-library SKILL at the code level.
    // SKILL rules as warnings are weaker than runtime enforcement — see memory
    // feedback_ai_guidance_layers (Layer 1 > Layer 5). Default is 30, but real
    // production libraries sometimes legitimately exceed this (e.g. 4 size × 3
    // style × 4 state = 48 for a core button), so the limit is overridable via
    // `variantLimit` param. Pass 0 to disable entirely.
    const VARIANT_LIMIT = typeof params.variantLimit === 'number' ? (params.variantLimit as number) : 30;
    if (VARIANT_LIMIT > 0 && components.length > VARIANT_LIMIT) {
      // Parse variant names like "Size=Small, Style=Primary, State=Default"
      // to show which axes are blowing up the matrix.
      const axisValues = new Map<string, Set<string>>();
      for (const c of components) {
        for (const pair of c.name.split(',')) {
          const eq = pair.indexOf('=');
          if (eq < 0) continue;
          const key = pair.slice(0, eq).trim();
          const val = pair.slice(eq + 1).trim();
          if (!key || !val) continue;
          if (!axisValues.has(key)) axisValues.set(key, new Set());
          axisValues.get(key)!.add(val);
        }
      }
      const axes = Array.from(axisValues.entries())
        .map(([name, values]) => ({ name, count: values.size }))
        .sort((a, b) => b.count - a.count);
      const axesSummary =
        axes.length > 0 ? axes.map((a) => `${a.name}(${a.count})`).join(' × ') : 'unparseable variant names';
      const biggestAxis = axes[0]?.name;

      throw new HandlerError(
        `Variant matrix too large: ${components.length} variants exceeds cap of ${VARIANT_LIMIT}. ` +
          `Axes: ${axesSummary}. ` +
          `Fix: extract a high-cardinality axis into a component property instead of a variant. ` +
          (biggestAxis
            ? `Suggestion — the "${biggestAxis}" axis has the most values; if it's an icon or nested content, ` +
              `replace it with add_component_property(type:"INSTANCE_SWAP") or type:"SLOT" and remove those variants.`
            : 'Consider splitting into multiple component sets or using INSTANCE_SWAP for icon variants.'),
        'VARIANT_MATRIX_TOO_LARGE',
      );
    }

    // Detect if components share a common SECTION parent — preserve it as the ComponentSet parent
    const sectionParent =
      components[0]?.parent?.type === 'SECTION' ? (components[0].parent as FrameNode | SectionNode) : null;
    const targetParent = sectionParent ?? figma.currentPage;
    const set = figma.combineAsVariants(components, targetParent);
    if (params.name != null) set.name = params.name as string;

    // ── Auto-layout variants in grid (Layer 1: code enforcement) ──
    const layoutHandler = handlers.get('layout_component_set');
    let layoutApplied = false;
    if (layoutHandler) {
      try {
        await layoutHandler({ nodeId: set.id });
        layoutApplied = true;
      } catch {
        /* layout failure should not block creation */
      }
    }

    // ── Auto-position within parent ──
    if (sectionParent) {
      // combineAsVariants may set absolute page coordinates instead of section-relative.
      // Reset to section origin with shared SECTION_PADDING, then stack below existing
      // siblings with SECTION_GAP. Start maxBottom at SECTION_PADDING so an empty
      // section places the set at (SECTION_PADDING, SECTION_PADDING).
      let maxBottom = SECTION_PADDING;
      for (const child of sectionParent.children) {
        if (child.id === set.id) continue;
        if (!child.visible) continue;
        maxBottom = Math.max(maxBottom, child.y + child.height + SECTION_GAP);
      }
      set.x = SECTION_PADDING;
      set.y = maxBottom;
    } else {
      // Page-level: avoid overlapping existing content
      const siblings = figma.currentPage.children;
      if (siblings.length > 1) {
        let maxBottom = 0;
        for (const child of siblings) {
          if (child.id === set.id) continue;
          if (!child.visible) continue;
          maxBottom = Math.max(maxBottom, child.y + child.height);
        }
        if (maxBottom > 0 && set.y < maxBottom) {
          set.y = maxBottom + PAGE_GAP;
        }
      }
    }

    // ── Auto-resize section to fit content ──
    if (sectionParent) {
      // SECTION_PADDING here is the section's inner margin on the right/bottom
      // edges — semantically "padding", not "gap between siblings".
      let maxRight = 0;
      let maxBottom = 0;
      for (const child of sectionParent.children) {
        maxRight = Math.max(maxRight, child.x + child.width);
        maxBottom = Math.max(maxBottom, child.y + child.height);
      }
      sectionParent.resizeWithoutConstraints(
        Math.max(sectionParent.width, maxRight + SECTION_PADDING),
        Math.max(sectionParent.height, maxBottom + SECTION_PADDING),
      );
    }

    return {
      ...simplifyNode(set),
      _layoutApplied: layoutApplied,
    };
  });

  registerHandler('get_instance_overrides', async (params) => {
    const node = await findNodeByIdAsync(params.nodeId as string);
    assertNodeType(
      node,
      'INSTANCE',
      `nodeId="${params.nodeId}"`,
      'Only INSTANCE nodes have overrides. For a COMPONENT, use components(method:"get") + list_component_properties.',
    );
    const instance = node as InstanceNode;
    const props = instance.componentProperties;
    return {
      nodeId: instance.id,
      nodeName: instance.name,
      properties: Object.entries(props).map(([key, val]) => ({
        key,
        type: val.type,
        value: val.value,
      })),
    };
  });

  registerHandler('set_instance_overrides', async (params) => {
    const source = await findNodeByIdAsync(params.sourceId as string);
    assertNodeType(
      source,
      'INSTANCE',
      `sourceId="${params.sourceId}"`,
      'set_instance_overrides copies properties from a source INSTANCE to other instances. The source must be an INSTANCE node.',
    );
    const sourceProps = (source as InstanceNode).componentProperties;
    const propValues = Object.fromEntries(Object.entries(sourceProps).map(([k, v]) => [k, v.value]));

    const targetIds = params.targetIds as string[];
    const results = await Promise.allSettled(
      targetIds.map(async (id) => {
        const target = await findNodeByIdAsync(id);
        assertNodeType(
          target,
          'INSTANCE',
          `targetIds entry "${id}"`,
          'Each target must be an INSTANCE node — overrides cannot be applied to FRAMEs or COMPONENTs.',
        );
        (target as InstanceNode).setProperties(propValues as Record<string, string | boolean>);
        return { nodeId: id, ok: true };
      }),
    );
    return {
      succeeded: results.filter((r) => r.status === 'fulfilled').length,
      failed: results.filter((r) => r.status === 'rejected').length,
    };
  });

  // ─── Component Property Management ───

  // ─── Component Audit ───

  registerHandler('audit_components', async (params) => {
    const nodeIds = params.nodeIds as string[] | undefined;

    let targets: SceneNode[];
    if (nodeIds && nodeIds.length > 0) {
      const resolved = await Promise.all(nodeIds.map((id) => findNodeByIdAsync(id)));
      targets = resolved.filter((n): n is SceneNode => n !== null && 'type' in n);
    } else {
      targets = [...figma.currentPage.children];
    }

    const components: Array<Record<string, unknown>> = [];
    const issues: Array<{ nodeId: string; name: string; issue: string }> = [];

    function walk(node: SceneNode) {
      if (node.type === 'COMPONENT') {
        const comp = node as ComponentNode;
        const propDefs = comp.componentPropertyDefinitions;
        const propCount = Object.keys(propDefs).length;
        const childCount = countDescendants(comp);
        const textChildren = countTextNodes(comp);
        const textProps = Object.values(propDefs).filter((d) => d.type === 'TEXT').length;
        const boolProps = Object.values(propDefs).filter((d) => d.type === 'BOOLEAN').length;
        const instanceSwapProps = Object.values(propDefs).filter((d) => d.type === 'INSTANCE_SWAP').length;

        const entry: Record<string, unknown> = {
          id: comp.id,
          name: comp.name,
          key: comp.key,
          description: comp.description || null,
          propertyCount: propCount,
          textProperties: textProps,
          booleanProperties: boolProps,
          instanceSwapProperties: instanceSwapProps,
          childCount,
          textChildCount: textChildren,
          hasAutoLayout: 'layoutMode' in comp && comp.layoutMode !== 'NONE',
          width: comp.width,
          height: comp.height,
        };
        components.push(entry);

        // Issue detection
        if (!comp.description) {
          issues.push({ nodeId: comp.id, name: comp.name, issue: 'Missing description' });
        }
        if (textChildren > 0 && textProps === 0) {
          issues.push({
            nodeId: comp.id,
            name: comp.name,
            issue: `${textChildren} text node(s) but no TEXT properties exposed`,
          });
        }
        if (propCount === 0 && childCount > 1) {
          issues.push({ nodeId: comp.id, name: comp.name, issue: 'No properties defined despite having children' });
        }
        if (childCount === 0) {
          issues.push({ nodeId: comp.id, name: comp.name, issue: 'Empty component (no children)' });
        }
      }
      if (node.type === 'COMPONENT_SET') {
        const set = node as ComponentSetNode;
        const variants = set.children.filter((c) => c.type === 'COMPONENT');
        components.push({
          id: set.id,
          name: set.name,
          isComponentSet: true,
          variantCount: variants.length,
          propertyCount: Object.keys(set.componentPropertyDefinitions).length,
          description: set.description || null,
        });
        if (!set.description) {
          issues.push({ nodeId: set.id, name: set.name, issue: 'Missing description on component set' });
        }
        if (variants.length === 1) {
          issues.push({ nodeId: set.id, name: set.name, issue: 'Component set with only 1 variant' });
        }
        // Walk variants
        for (const v of variants) walk(v);
        return; // don't walk children again
      }
      if ('children' in node) {
        for (const child of (node as ChildrenMixin).children) walk(child);
      }
    }

    for (const t of targets) walk(t);

    return {
      summary: {
        totalComponents: components.length,
        totalIssues: issues.length,
      },
      components,
      issues,
    };
  });

  // ─── Component Property Management ───

  registerHandler('add_component_property', async (params) => {
    const nodeId = params.nodeId as string;
    const propertyName = params.propertyName as string;
    const propertyType = params.type as 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP' | 'VARIANT' | 'SLOT';
    const defaultValue = params.defaultValue as string | boolean | VariableAlias;

    const validTypes = ['BOOLEAN', 'TEXT', 'INSTANCE_SWAP', 'VARIANT', 'SLOT'];
    if (!propertyType || !validTypes.includes(propertyType)) {
      throw new HandlerError(
        `Invalid property type "${propertyType}". Must be one of: [${validTypes.join(', ')}]. ` +
          `Note: VARIANT is auto-managed by combineAsVariants — pass BOOLEAN/TEXT/INSTANCE_SWAP/SLOT instead.`,
        'INVALID_PROPERTY_TYPE',
      );
    }

    const node = await findNodeByIdAsync(nodeId);
    assertHandler(
      node && (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'),
      `Component not found: ${nodeId}`,
      'NOT_FOUND',
    );
    const comp = node as ComponentNode | ComponentSetNode;

    // INSTANCE_SWAP requires preferredValues to be useful (otherwise the picker is empty)
    if (propertyType === 'INSTANCE_SWAP' && !params.preferredValues) {
      throw new HandlerError(
        `INSTANCE_SWAP property "${propertyName}" requires preferredValues. ` +
          `Pass an array like: preferredValues:[{type:"COMPONENT",key:"<componentKey>"}]. ` +
          `Use search_design_system to find component keys for icons or other swap targets.`,
        'MISSING_PREFERRED_VALUES',
      );
    }

    const options: ComponentPropertyOptions = {};
    if (params.preferredValues) {
      options.preferredValues = params.preferredValues as InstanceSwapPreferredValue[];
    }
    // Reject `description` on any property type — consistent with update_component_property.
    // Figma Plugin API (typings 1.123.0) ComponentPropertyOptions = { preferredValues? }
    // with no description field. The previous SLOT-only cast relied on undocumented
    // runtime behavior that was never verified via read-back test. SLOT descriptions
    // visible in library components are set via Figma UI by library authors, not via
    // this API. If future typings expose description, re-add with a runtime verify step.
    if (params.description != null) {
      throw new HandlerError(
        `Component property descriptions are NOT settable via the Figma Plugin API. ` +
          `addComponentProperty options type is { preferredValues? } — no description field, ` +
          `for any property type including SLOT. ` +
          `Workaround: ask the user to set the description manually in Figma's UI ` +
          `(right-click the property → Edit). Do NOT retry via execute_js — it uses the same API.`,
        'UNSUPPORTED_BY_FIGMA_API',
      );
    }

    try {
      const key = comp.addComponentProperty(
        propertyName,
        propertyType as ComponentPropertyType,
        defaultValue,
        Object.keys(options).length > 0 ? options : undefined,
      );
      return { ok: true, key, properties: Object.keys(comp.componentPropertyDefinitions) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Surface Figma's plugin-API errors with our suggestion attached
      throw new HandlerError(
        `addComponentProperty failed for "${propertyName}" (${propertyType}): ${msg}. ` +
          `Common causes: defaultValue type mismatch (BOOLEAN needs true/false, TEXT needs string), ` +
          `or property name conflict with existing: [${Object.keys(comp.componentPropertyDefinitions).join(', ')}].`,
        'ADD_PROPERTY_FAILED',
      );
    }
  });

  registerHandler('update_component_property', async (params) => {
    const nodeId = params.nodeId as string;
    const propertyName = params.propertyName as string;

    const node = await findNodeByIdAsync(nodeId);
    assertHandler(
      node && (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'),
      `Component not found: ${nodeId}`,
      'NOT_FOUND',
    );
    const comp = node as ComponentNode | ComponentSetNode;

    if (!(propertyName in comp.componentPropertyDefinitions)) {
      const available = Object.keys(comp.componentPropertyDefinitions);
      // Strip Figma's #id:id suffix when suggesting (since users typically write
      // the bare name and bind_component_property already accepts that form).
      const bareNames = available.map((k) => {
        const hash = k.indexOf('#');
        return hash >= 0 ? k.slice(0, hash) : k;
      });
      throw new HandlerError(
        `Property "${propertyName}" not found on component "${comp.name}". ` +
          `Available properties: [${bareNames.join(', ')}]. ` +
          `Tip: pass the bare name without the "#id" suffix.`,
        'PROPERTY_NOT_FOUND',
      );
    }

    // ── Figma Plugin API capability guards (typings 1.123.0) ──
    // editComponentProperty's newValue signature is strictly { name?, defaultValue?,
    // preferredValues? } — passing `description` was a ghost write that returned
    // ok:true but changed nothing. Throw loudly instead of looping the agent.
    if (params.description != null) {
      throw new HandlerError(
        `Component property descriptions are NOT settable via the Figma Plugin API. ` +
          `editComponentProperty accepts only { name, defaultValue, preferredValues } — ` +
          `there is no description field on any property type. ` +
          `Workaround: ask the user to edit the property description manually in Figma's UI ` +
          `(right-click the property → Edit). Do NOT retry via execute_js — it uses the same API.`,
        'UNSUPPORTED_BY_FIGMA_API',
      );
    }
    // VARIANT defaults are derived from the top-left variant's spatial position,
    // not from editComponentProperty. Silently accepting defaultValue here was a
    // second phantom write — surface it with actionable guidance.
    if (params.defaultValue != null) {
      const propDef = comp.componentPropertyDefinitions[propertyName];
      if (propDef?.type === 'VARIANT') {
        throw new HandlerError(
          `defaultValue is not supported for VARIANT properties. ` +
            `VARIANT defaults are determined by the top-left variant's spatial position in the component set — ` +
            `reorder variants via nodes(method:"update") or layout_component_set to change which variant is the default. ` +
            `Property "${propertyName}" is a VARIANT.`,
          'UNSUPPORTED_FOR_VARIANT',
        );
      }
    }

    // Build a single edit payload — Figma's editComponentProperty accepts partial fields
    const edits: Record<string, unknown> = {};
    if (params.newName != null) edits.name = params.newName as string;
    if (params.defaultValue != null) edits.defaultValue = params.defaultValue as string | boolean;
    if (params.preferredValues != null) edits.preferredValues = params.preferredValues as InstanceSwapPreferredValue[];

    // Apply name first (changes the key), then remaining fields on the new key
    let currentName = propertyName;
    if (edits.name) {
      currentName = comp.editComponentProperty(propertyName, { name: edits.name as string });
      delete edits.name;
    }
    if (Object.keys(edits).length > 0) {
      comp.editComponentProperty(
        currentName,
        edits as {
          defaultValue?: string | boolean;
          preferredValues?: InstanceSwapPreferredValue[];
        },
      );
    }

    return { ok: true, properties: Object.keys(comp.componentPropertyDefinitions) };
  });

  registerHandler('delete_component_property', async (params) => {
    const nodeId = params.nodeId as string;
    const propertyName = params.propertyName as string;

    const node = await findNodeByIdAsync(nodeId);
    assertHandler(
      node && (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'),
      `Component not found: ${nodeId}`,
      'NOT_FOUND',
    );
    const comp = node as ComponentNode | ComponentSetNode;

    if (!(propertyName in comp.componentPropertyDefinitions)) {
      const available = Object.keys(comp.componentPropertyDefinitions);
      const bareNames = available.map((k) => {
        const hash = k.indexOf('#');
        return hash >= 0 ? k.slice(0, hash) : k;
      });
      throw new HandlerError(
        `Property "${propertyName}" not found on component "${comp.name}". ` + `Available: [${bareNames.join(', ')}].`,
        'PROPERTY_NOT_FOUND',
      );
    }

    comp.deleteComponentProperty(propertyName);
    return { ok: true, properties: Object.keys(comp.componentPropertyDefinitions) };
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

  // ─── Publish Preflight (P0-1) ───
  // Aggregate health check before publishing a library: scan components, variables,
  // and styles in a single pass, surface blockers/warnings with structured fixes.
  registerHandler('preflight_library_publish', async (params) => {
    const opts = (params || {}) as {
      checkComponents?: boolean;
      checkVariables?: boolean;
      checkStyles?: boolean;
    };
    const checkComponents = opts.checkComponents !== false;
    const checkVariables = opts.checkVariables !== false;
    const checkStyles = opts.checkStyles !== false;

    type Issue = {
      severity: 'blocker' | 'warning';
      category: 'component' | 'variable' | 'style';
      target: string;
      nodeId?: string;
      message: string;
      suggestion?: string;
    };
    const issues: Issue[] = [];

    let componentCount = 0;
    let componentSetCount = 0;

    const inspectComponent = (comp: ComponentNode, inSet: boolean) => {
      if (!inSet && !comp.description.trim()) {
        issues.push({
          severity: 'blocker',
          category: 'component',
          target: comp.name,
          nodeId: comp.id,
          message: 'Component missing description',
          suggestion: `update_component(nodeId:"${comp.id}", description:"...")`,
        });
      }
      const textCount = countTextNodes(comp);
      const propDefs = comp.componentPropertyDefinitions;
      const textProps = Object.values(propDefs).filter((d) => d.type === 'TEXT').length;
      if (textCount > 0 && textProps === 0) {
        issues.push({
          severity: 'warning',
          category: 'component',
          target: comp.name,
          nodeId: comp.id,
          message: `${textCount} text node(s) but no TEXT properties exposed`,
          suggestion: `add_component_property(nodeId:"${comp.id}", propertyName:"label", type:"TEXT")`,
        });
      }
      if (countDescendants(comp) === 0) {
        issues.push({
          severity: 'warning',
          category: 'component',
          target: comp.name,
          nodeId: comp.id,
          message: 'Empty component (no children)',
        });
      }
    };

    if (checkComponents) {
      const walk = (node: SceneNode) => {
        if (node.type === 'COMPONENT_SET') {
          componentSetCount++;
          const set = node as ComponentSetNode;
          const variants = set.children.filter((c) => c.type === 'COMPONENT') as ComponentNode[];
          if (!set.description.trim()) {
            issues.push({
              severity: 'blocker',
              category: 'component',
              target: set.name,
              nodeId: set.id,
              message: 'Component set missing description',
              suggestion: `update_component(nodeId:"${set.id}", description:"...")`,
            });
          }
          if (variants.length === 1) {
            issues.push({
              severity: 'warning',
              category: 'component',
              target: set.name,
              nodeId: set.id,
              message: 'Component set has only 1 variant — consider converting to standalone component',
            });
          }
          for (const v of variants) {
            componentCount++;
            inspectComponent(v, true);
          }
          return;
        }
        if (node.type === 'COMPONENT') {
          componentCount++;
          inspectComponent(node as ComponentNode, false);
        }
        if ('children' in node) {
          for (const child of (node as ChildrenMixin).children) walk(child);
        }
      };
      for (const page of figma.root.children) {
        for (const child of page.children) walk(child);
      }
    }

    let variableCount = 0;
    if (checkVariables) {
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      for (const collection of collections) {
        // Primitives (Raw) collections often intentionally have no scopes — exempt them.
        const isPrimitive = /primitive|raw|base/i.test(collection.name);
        for (const varId of collection.variableIds) {
          const variable = await figma.variables.getVariableByIdAsync(varId);
          if (!variable) continue;
          variableCount++;

          if (!isPrimitive) {
            const scopes = variable.scopes || [];
            if (scopes.length === 0 || scopes.includes('ALL_SCOPES')) {
              issues.push({
                severity: 'blocker',
                category: 'variable',
                target: `${collection.name}/${variable.name}`,
                message: 'Semantic variable has no explicit scopes (or uses ALL_SCOPES)',
                suggestion: `variables_ep(method:"update", variableId:"${variable.id}", scopes:["ALL_FILLS"])`,
              });
            }
          }

          const codeSyntaxKeys = Object.keys(variable.codeSyntax || {});
          if (codeSyntaxKeys.length === 0) {
            issues.push({
              severity: 'warning',
              category: 'variable',
              target: `${collection.name}/${variable.name}`,
              message: 'Variable missing code syntax (blocks Dev Mode expression)',
              suggestion: `variables_ep(method:"set_code_syntax", variableId:"${variable.id}", syntax:{WEB:"var(--...)"})`,
            });
          }
        }
      }
    }

    let styleCount = 0;
    if (checkStyles) {
      const [paintStyles, textStyles, effectStyles] = await Promise.all([
        figma.getLocalPaintStylesAsync(),
        figma.getLocalTextStylesAsync(),
        figma.getLocalEffectStylesAsync(),
      ]);
      for (const style of [...paintStyles, ...textStyles, ...effectStyles]) {
        styleCount++;
        if (!style.description?.trim()) {
          issues.push({
            severity: 'warning',
            category: 'style',
            target: `${style.type}:${style.name}`,
            message: 'Style missing description',
          });
        }
      }
    }

    const blockers = issues.filter((i) => i.severity === 'blocker');
    const warnings = issues.filter((i) => i.severity === 'warning');

    return {
      ready: blockers.length === 0,
      summary: {
        components: componentCount,
        componentSets: componentSetCount,
        variables: variableCount,
        styles: styleCount,
        blockerCount: blockers.length,
        warningCount: warnings.length,
      },
      blockers,
      warnings,
      _note:
        blockers.length > 0
          ? 'Fix blockers before publishing. Also run lint_fix_all for token/contrast issues.'
          : warnings.length > 0
            ? 'Ready to publish with warnings. Recommended: run lint_fix_all first, then publish via Figma Assets panel → Publish.'
            : 'All structural checks passed. Run lint_fix_all for final token/contrast polish, then publish via Figma Assets panel → Publish.',
    };
  });
} // registerComponentHandlers

// ─── Helpers ───

function countDescendants(node: SceneNode): number {
  let count = 0;
  if ('children' in node) {
    for (const child of (node as ChildrenMixin).children) {
      count++;
      count += countDescendants(child);
    }
  }
  return count;
}

function countTextNodes(node: SceneNode): number {
  let count = 0;
  if (node.type === 'TEXT') return 1;
  if ('children' in node) {
    for (const child of (node as ChildrenMixin).children) {
      count += countTextNodes(child);
    }
  }
  return count;
}
