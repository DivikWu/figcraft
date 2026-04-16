/**
 * Property wiring for inline component creation.
 *
 * Extracted from createSingleComponent (crud.ts) for testability.
 * Handles three property types:
 *   - TEXT: matched via `componentPropertyName` on inline children
 *   - BOOLEAN: declared in `properties[]` + auto-wired to children via
 *     `componentPropertyReferences.visible`
 *   - INSTANCE_SWAP / SLOT: declared in `properties[]`
 *
 * Note: this is NOT the same as create_component_from_node's auto-discovery
 * (which uses deriveTextPropertyName on all TextNodes). These are two different
 * binding strategies — this module handles the declarative path only.
 */

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

export interface WirePropertiesResult {
  warnings: string[];
  propertiesAdded: string[];
}

/**
 * Wire component properties after frame→component conversion.
 *
 * Binds TEXT properties (via componentPropertyName on children),
 * BOOLEAN/INSTANCE_SWAP/SLOT properties (via properties[]), and
 * auto-wires BOOLEAN visibility to children that declared
 * componentPropertyReferences.visible.
 */
export function wireProperties(component: ComponentNode, itemParams: Record<string, unknown>): WirePropertiesResult {
  const warnings: string[] = [];
  const propertiesAdded: string[] = [];

  // ── Step 3a: collect inline componentPropertyReferences.visible declarations ──
  const { refs: visibleRefs, warnings: visibleRefWarnings } = collectVisibleRefs(itemParams.children);
  for (const w of visibleRefWarnings) warnings.push(w);
  const usedVisibleRefs = new Set<string>();

  // ── Step 3: Bind text children to component TEXT properties ──
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
        warnings.push(
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
        warnings.push(
          `⛔ TEXT property "${propName}" failed to register: ${msg}. ` +
            `Common cause: duplicate componentPropertyName across multiple text children — each TEXT property name must be unique within the component.`,
        );
      }
    }
  }

  // ── Step 4: Add non-text component properties (BOOLEAN, INSTANCE_SWAP, SLOT) ──
  if (Array.isArray(itemParams.properties)) {
    const existingProps = new Set(Object.keys(component.componentPropertyDefinitions));
    for (const prop of itemParams.properties as Array<Record<string, unknown>>) {
      const propName = prop.propertyName as string;
      const propType = prop.type as string;
      const defaultValue = prop.defaultValue;
      const preferredValues = prop.preferredValues;

      if (!propName || !propType) {
        warnings.push(
          `⛔ component property missing required fields — need {propertyName, type, defaultValue}. Got: ${JSON.stringify(prop)}`,
        );
        continue;
      }
      if (propType === 'TEXT') continue;

      if (propType === 'VARIANT') {
        warnings.push(
          `⛔ component property "${propName}" type VARIANT is auto-managed by create_component_set / combineAsVariants — ` +
            `do not declare it via properties:[]. Define variant axes in the variant set's name scheme instead.`,
        );
        continue;
      }
      if (propType === 'INSTANCE_SWAP' && !preferredValues) {
        warnings.push(
          `⛔ component property "${propName}" (INSTANCE_SWAP) requires preferredValues. ` +
            `Pass preferredValues:[{type:"COMPONENT", key:"<componentKey>"}]. Use search_design_system to find component keys.`,
        );
        continue;
      }
      if (propType === 'BOOLEAN' && typeof defaultValue !== 'boolean') {
        warnings.push(
          `⛔ component property "${propName}" (BOOLEAN) defaultValue must be true/false, got ${typeof defaultValue}: ${JSON.stringify(defaultValue)}. ` +
            `Pass the literal boolean, not the string "true"/"false".`,
        );
        continue;
      }
      const bareExisting = new Set(
        [...existingProps].map((k) => {
          const h = k.indexOf('#');
          return h >= 0 ? k.slice(0, h) : k;
        }),
      );
      if (bareExisting.has(propName)) {
        warnings.push(
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
        if (propType === 'BOOLEAN') {
          const matches = visibleRefs.filter((r) => r.propName === propName);
          if (matches.length === 0) {
            warnings.push(
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
                if ('visible' in target) {
                  (target as SceneNode).visible = defaultValue === true;
                }
              }
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(
          `⛔ component property "${propName}" (${propType}) failed to register: ${msg}. ` +
            `Common causes: defaultValue type mismatch (BOOLEAN needs true/false, TEXT needs string), ` +
            `name conflict, or unsupported type on this component type.`,
        );
      }
    }
  }

  // Reverse orphan: child declared componentPropertyReferences.visible but
  // no matching BOOLEAN property landed.
  for (const ref of visibleRefs) {
    if (!usedVisibleRefs.has(ref.propName)) {
      warnings.push(
        `⚠️ Child "${ref.childName}" references BOOLEAN property "${ref.propName}" but no such property was declared. ` +
          `Add { type: "BOOLEAN", propertyName: "${ref.propName}", defaultValue: false } to properties[].`,
      );
    }
  }

  return { warnings, propertiesAdded };
}
