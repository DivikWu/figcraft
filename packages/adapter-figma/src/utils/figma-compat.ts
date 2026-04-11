/**
 * Type-safe wrappers for Figma Plugin API properties that lack proper typings.
 *
 * Centralizes `as any` casts so handler code stays clean.
 */

// ─── Layout sizing ───

/** Apply layoutSizingHorizontal/Vertical if explicitly provided in params. */
export function applySizingOverrides(node: SceneNode, params: Record<string, unknown>): void {
  if (params.layoutSizingHorizontal) {
    setLayoutSizing(node, 'horizontal', params.layoutSizingHorizontal as string);
  }
  if (params.layoutSizingVertical) {
    setLayoutSizing(node, 'vertical', params.layoutSizingVertical as string);
  }
}

/** Node types that support layoutSizing properties (inside auto-layout parents). */
const SIZING_SUPPORTED_TYPES = new Set([
  'FRAME',
  'COMPONENT',
  'COMPONENT_SET',
  'INSTANCE',
  'TEXT',
  'RECTANGLE',
  'ELLIPSE',
  'STAR',
  'POLYGON',
  'LINE',
  'VECTOR',
  'BOOLEAN_OPERATION',
  'SECTION',
]);

/** Set layout sizing on a node (wraps the untyped Figma property). Silently skips unsupported types. */
export function setLayoutSizing(node: SceneNode, axis: 'horizontal' | 'vertical', value: string): void {
  if (!SIZING_SUPPORTED_TYPES.has(node.type)) return;
  const prop = axis === 'horizontal' ? 'layoutSizingHorizontal' : 'layoutSizingVertical';
  (node as any)[prop] = value;
}

/** Get layout sizing from a node. */
export function getLayoutSizing(node: SceneNode, axis: 'horizontal' | 'vertical'): string | undefined {
  const prop = axis === 'horizontal' ? 'layoutSizingHorizontal' : 'layoutSizingVertical';
  return (node as any)[prop] as string | undefined;
}

// ─── Layout properties ───

/** Set layoutWrap on a frame node. */
export function setLayoutWrap(node: FrameNode, value: string): void {
  (node as any).layoutWrap = value;
}

/** Set layoutPositioning on a scene node. */
export function setLayoutPositioning(node: SceneNode, value: string): void {
  (node as any).layoutPositioning = value;
}

/** Set layoutGrow on a scene node. */
export function setLayoutGrow(node: SceneNode, value: number): void {
  (node as any).layoutGrow = value;
}

/** Set layoutAlign on a scene node. */
export function setLayoutAlign(node: SceneNode, value: string): void {
  (node as any).layoutAlign = value;
}

// ─── Appearance ───

/** Set blendMode on a scene node. */
export function setBlendMode(node: SceneNode, value: string): void {
  (node as any).blendMode = value;
}

// ─── Stroke ───

/** Set stroke-related properties. */
export function setStrokeProps(
  node: SceneNode,
  props: {
    strokeAlign?: string;
    dashPattern?: number[];
    strokeCap?: string;
    strokeJoin?: string;
  },
): void {
  if (props.strokeAlign) (node as any).strokeAlign = props.strokeAlign;
  if (props.dashPattern) (node as any).dashPattern = props.dashPattern;
  if (props.strokeCap) (node as any).strokeCap = props.strokeCap;
  if (props.strokeJoin) (node as any).strokeJoin = props.strokeJoin;
}

// ─── Async style setters ───

/** Set text style ID (async setter not in standard typings). */
export async function setTextStyleIdAsync(node: TextNode, styleId: string): Promise<void> {
  await (node as any).setTextStyleIdAsync(styleId);
}

/** Set fill style ID (async setter not in standard typings). */
export async function setFillStyleIdAsync(node: SceneNode, styleId: string): Promise<void> {
  await (node as any).setFillStyleIdAsync(styleId);
}

/** Set effect style ID (async setter not in standard typings). */
export async function setEffectStyleIdAsync(node: SceneNode, styleId: string): Promise<void> {
  await (node as any).setEffectStyleIdAsync(styleId);
}

// ─── Component resolution ───

export interface ResolvedComponent {
  component: ComponentNode;
  /** Warning when variantProperties didn't match and defaultVariant was used as fallback. */
  fallbackWarning?: string;
}

/**
 * Import a component by key/ID and resolve to a concrete ComponentNode.
 * Shared helper that eliminates the duplicated import chain across:
 * - write-nodes-instance.ts (standalone + batch)
 * - write-nodes-create.ts (inline tree children)
 *
 * Resolution chain: componentSetKey → componentKey → componentId
 * Each key is tried as both component and component set to handle misidentified types.
 */
export async function importAndResolveComponent(spec: {
  componentSetKey?: string;
  componentKey?: string;
  componentId?: string;
  variantProperties?: Record<string, string>;
}): Promise<ResolvedComponent> {
  const { componentSetKey, componentKey, componentId, variantProperties } = spec;
  let node: BaseNode | null = null;

  if (componentSetKey) {
    try {
      node = await figma.importComponentSetByKeyAsync(componentSetKey);
    } catch {
      /* not found */
    }
  } else if (componentKey) {
    try {
      node = await figma.importComponentByKeyAsync(componentKey);
    } catch {
      try {
        node = await figma.importComponentSetByKeyAsync(componentKey);
      } catch {
        /* not found */
      }
    }
  } else if (componentId) {
    node = figma.getNodeById(componentId);
    if (!node) {
      try {
        node = await figma.importComponentByKeyAsync(componentId);
      } catch {
        try {
          node = await figma.importComponentSetByKeyAsync(componentId);
        } catch {
          /* not found */
        }
      }
    }
  }

  if (!node) {
    const tried: string[] = [];
    if (componentSetKey) tried.push(`componentSetKey="${componentSetKey}"`);
    if (componentKey) tried.push(`componentKey="${componentKey}"`);
    if (componentId) tried.push(`componentId="${componentId}"`);
    throw new Error(
      `Component not found (tried: ${tried.join(', ')}). ` +
        `Common fixes: (1) verify the key/id is current — library components can be re-published with a new key; ` +
        `(2) call search_design_system({query:"<component name>"}) to find the current key; ` +
        `(3) for local components, use components({method:"list"}) to enumerate node IDs.`,
    );
  }

  return resolveComponent(node, variantProperties);
}

/** Resolve a ComponentNode from a node that may be a COMPONENT or COMPONENT_SET.
 *  If variantProperties are provided and the node is a COMPONENT_SET, picks the matching variant. */
export function resolveComponent(node: BaseNode, variantProperties?: Record<string, string>): ResolvedComponent {
  if (node.type === 'COMPONENT') {
    return { component: node as ComponentNode };
  }
  if (node.type === 'COMPONENT_SET') {
    const set = node as ComponentSetNode;
    if (variantProperties) {
      const variants = set.children as ComponentNode[];
      const match = variants.find((v) => {
        const vProps = v.variantProperties;
        if (!vProps) return false;
        return Object.entries(variantProperties).every(([k, val]) => vProps[k] === val);
      });
      if (match) return { component: match };
      // No matching variant — fall back to default with a structured warning
      // that lists every axis and its valid values, so the next call can fix itself.
      const fallback = (set.defaultVariant ?? set.children[0]) as ComponentNode;
      const requested = Object.entries(variantProperties)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      const axisValues = new Map<string, Set<string>>();
      for (const v of variants) {
        const vp = v.variantProperties;
        if (!vp) continue;
        for (const [k, val] of Object.entries(vp)) {
          if (!axisValues.has(k)) axisValues.set(k, new Set());
          axisValues.get(k)!.add(val);
        }
      }
      const axisDescription = Array.from(axisValues.entries())
        .map(([k, vals]) => `${k}: [${Array.from(vals).join(', ')}]`)
        .join('; ');
      return {
        component: fallback,
        fallbackWarning:
          `variantProperties {${requested}} did not match any variant in "${set.name}". ` +
          `Using default variant "${fallback.name}". ` +
          `Valid axes — ${axisDescription}. ` +
          `Retry with variantProperties matching one value from each axis.`,
      };
    }
    return { component: (set.defaultVariant ?? set.children[0]) as ComponentNode };
  }
  throw new Error(`Node ${node.id} is not a component (type: ${node.type})`);
}
