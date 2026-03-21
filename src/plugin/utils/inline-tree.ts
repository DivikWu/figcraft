/**
 * Inline-tree structure inference engine.
 *
 * Inspired by Vibma's inline-tree.ts — auto-fixes common structural mistakes
 * that LLMs make when generating Figma node specs:
 *
 * 1. Frame with children but no auto-layout → promote to VERTICAL
 * 2. FILL sizing without auto-layout parent → downgrade to HUG
 * 3. FIXED without explicit dimension → infer FILL (cross-axis) or HUG (primary-axis)
 * 4. CSS param names → corrective warnings with Figma equivalents
 * 5. CSS alias normalization → auto-convert fillColor/backgroundColor/etc. to Figma params
 */

// ─── Hint type system ───
// Typed hints collected during creation, classified by severity.
// confirm: deterministic fix applied silently (suppressed in output)
// suggest: hardcoded value that could use a token (returned as warning)
// warn: ambiguous situation the agent should review (returned as warning)
// error: something went wrong (always returned)

export type HintType = 'confirm' | 'error' | 'suggest' | 'warn';
export interface Hint {
  type: HintType;
  message: string;
}

/**
 * Summarize hints into a deduplicated warnings array for the response.
 * - confirm hints are suppressed (deterministic fixes, no noise)
 * - error hints are always included
 * - suggest/warn hints are deduplicated by normalized pattern
 * - Hardcoded fill hints are aggregated into a single message listing all colors
 */
export function summarizeHints(hints: Hint[]): string[] {
  const warnings: string[] = [];
  const grouped = new Map<string, { count: number; example: string }>();
  const hardcodedFills: string[] = [];

  for (const hint of hints) {
    if (hint.type === 'confirm') continue; // suppress deterministic fixes
    if (hint.type === 'error') {
      warnings.push(hint.message);
      continue;
    }

    // Aggregate hardcoded fill hints into a single message
    const fillMatch = hint.message.match(/^Hardcoded fill (#[0-9a-fA-F]{3,8}) on "([^"]+)"/);
    if (fillMatch) {
      hardcodedFills.push(`${fillMatch[1]} ("${fillMatch[2]}")`);
      continue;
    }

    // suggest / warn — deduplicate by normalized key
    const key = hint.message
      .replace(/"[^"]*"/g, '"…"')
      .replace(/'[^']*'/g, "'…'")
      .replace(/#[0-9a-fA-F]{6,8}/g, '#…');
    const entry = grouped.get(key);
    if (entry) entry.count++;
    else grouped.set(key, { count: 1, example: hint.message });
  }

  // Emit aggregated hardcoded fill warning
  if (hardcodedFills.length > 0) {
    warnings.push(
      `${hardcodedFills.length} hardcoded fill(s) with no matching style: ${hardcodedFills.join(', ')}. Consider using design tokens.`,
    );
  }

  for (const [, { count, example }] of grouped) {
    warnings.push(count > 1 ? `(×${count}) ${example}` : example);
  }
  return warnings;
}

// ─── CSS → Figma param corrections ───

export const WRONG_SHAPE_CORRECTIONS: Record<string, { figmaParam: string; example: string }> = {
  gap: { figmaParam: 'itemSpacing', example: 'itemSpacing: 16' },
  borderRadius: { figmaParam: 'cornerRadius', example: 'cornerRadius: 8' },
  'border-radius': { figmaParam: 'cornerRadius', example: 'cornerRadius: 8' },
  display: { figmaParam: 'autoLayout + layoutDirection', example: 'autoLayout: true, layoutDirection: "HORIZONTAL"' },
  flexDirection: { figmaParam: 'layoutDirection', example: 'layoutDirection: "HORIZONTAL"' },
  'flex-direction': { figmaParam: 'layoutDirection', example: 'layoutDirection: "HORIZONTAL"' },
  alignItems: { figmaParam: 'counterAxisAlignItems', example: 'counterAxisAlignItems: "CENTER"' },
  'align-items': { figmaParam: 'counterAxisAlignItems', example: 'counterAxisAlignItems: "CENTER"' },
  justifyContent: { figmaParam: 'primaryAxisAlignItems', example: 'primaryAxisAlignItems: "CENTER"' },
  'justify-content': { figmaParam: 'primaryAxisAlignItems', example: 'primaryAxisAlignItems: "CENTER"' },
  direction: { figmaParam: 'layoutDirection', example: 'layoutDirection: "VERTICAL"' },
  border: { figmaParam: 'stroke + strokeWeight', example: 'stroke: "#E0E0E0", strokeWeight: 1' },
  borderColor: { figmaParam: 'stroke', example: 'stroke: "#E0E0E0"' },
  'border-color': { figmaParam: 'stroke', example: 'stroke: "#E0E0E0"' },
  borderWidth: { figmaParam: 'strokeWeight', example: 'strokeWeight: 1' },
  'border-width': { figmaParam: 'strokeWeight', example: 'strokeWeight: 1' },
  font: { figmaParam: 'fontFamily + fontStyle', example: 'fontFamily: "Inter", fontStyle: "Bold"' },
  text: { figmaParam: 'use text node type with props.content', example: 'type: "text", props: { content: "Hello" }' },
  label: { figmaParam: 'use text node type with props.content', example: 'type: "text", props: { content: "Label" }' },
  backgroundColor: { figmaParam: 'fill', example: 'fill: "#FFFFFF"' },
  'background-color': { figmaParam: 'fill', example: 'fill: "#FFFFFF"' },
  background: { figmaParam: 'fill', example: 'fill: "#FFFFFF"' },
  color: { figmaParam: 'fill (for text nodes)', example: 'fill: "#000000"' },
  margin: { figmaParam: 'use parent padding or wrapper frame', example: 'wrap in frame with padding' },
  padding: { figmaParam: 'padding (only on auto-layout frames)', example: 'autoLayout: true, padding: 16' },
  width: { figmaParam: 'width (already correct)', example: 'width: 200' },
  height: { figmaParam: 'height (already correct)', example: 'height: 100' },
};

// Known Figma props that should NOT trigger corrections
const KNOWN_FIGMA_PROPS = new Set([
  'width', 'height', 'x', 'y', 'fill', 'stroke', 'strokeWeight', 'cornerRadius',
  'autoLayout', 'layoutDirection', 'itemSpacing', 'padding',
  'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom',
  'primaryAxisAlignItems', 'counterAxisAlignItems',
  'layoutSizingHorizontal', 'layoutSizingVertical',
  'layoutAlign', 'layoutGrow', 'content', 'fontSize', 'fontFamily', 'fontStyle',
  'svg', 'resize', 'length', 'rotation', 'minWidth', 'minHeight',
  'visible', 'opacity', 'name',
  'componentKey', 'componentId', 'properties',
  // Per-side stroke weights
  'strokeTopWeight', 'strokeBottomWeight', 'strokeLeftWeight', 'strokeRightWeight',
  // Internal keys passed through by bridge
  '_commandId',
  // Extended fill/stroke input format keys (normalized by normalizeAliases)
  'fillVariableName', 'fillStyleName', 'fillVariableId',
  'fontColorVariableName', 'fontColorStyleName',
  'strokeVariableName', 'strokeStyleName', 'strokeVariableId',
]);

/**
 * Check props for CSS-style param names and return corrective warnings.
 * Does NOT modify the props — just reports what's wrong.
 */
export function detectWrongShapeParams(
  props: Record<string, unknown>,
  nodeName: string,
): string[] {
  const warnings: string[] = [];
  for (const key of Object.keys(props)) {
    if (KNOWN_FIGMA_PROPS.has(key)) continue;
    const correction = WRONG_SHAPE_CORRECTIONS[key];
    if (correction) {
      warnings.push(
        `"${nodeName}": CSS param "${key}" → use Figma param "${correction.figmaParam}" (e.g. ${correction.example})`,
      );
    }
  }
  return warnings;
}

/**
 * Strict unknown param rejection — throws on unrecognized params with corrective messages.
 * Unlike detectWrongShapeParams (which only warns), this function collects ALL unknown params
 * and returns error-level hints. Used in strict validation mode.
 *
 * @returns Array of error hints for unknown params (empty if all params are valid)
 */
export function rejectUnknownParams(
  props: Record<string, unknown>,
  nodeName: string,
  nodeType: string,
): Hint[] {
  const hints: Hint[] = [];
  for (const key of Object.keys(props)) {
    if (KNOWN_FIGMA_PROPS.has(key)) continue;
    if (key.startsWith('_')) continue; // internal keys
    // Skip keys already handled by detectWrongShapeParams (those get warn-level hints)
    if (WRONG_SHAPE_CORRECTIONS[key]) continue;
    hints.push({
      type: 'error',
      message: `"${nodeName}" (${nodeType}): unknown param "${key}" is not a valid Figma property. Remove it or check the spelling.`,
    });
  }
  return hints;
}

// ─── Structure inference ───

interface NodeSpec {
  type: string;
  name?: string;
  props?: Record<string, unknown>;
  children?: NodeSpec[];
}

export interface InferenceResult {
  /** Deterministic fixes applied silently (high confidence) */
  fixes: string[];
  /** Ambiguous situations the agent should review (low confidence) */
  ambiguous: string[];
  /** Confidence-annotated fix list for selective diff output */
  annotatedFixes: Array<{ message: string; confidence: 'deterministic' | 'ambiguous' }>;
  /** Per-node original/corrected props for nodes with ambiguous fixes (staging mechanism) */
  correctedNodes: Array<{ nodeName: string; original: Record<string, unknown>; corrected: Record<string, unknown>; ambiguousFixes: string[] }>;
}

/** Parent context passed through recursive inference for axis-aware sizing. */
interface ParentCtx {
  layoutMode: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
  sizingH: 'FIXED' | 'HUG' | 'FILL';
  sizingV: 'FIXED' | 'HUG' | 'FILL';
}

function resolveEffectiveSizing(p: Record<string, unknown>, axis: 'H' | 'V'): 'FIXED' | 'HUG' | 'FILL' {
  const field = axis === 'H' ? 'layoutSizingHorizontal' : 'layoutSizingVertical';
  const dim = axis === 'H' ? 'width' : 'height';
  if (p[field]) return p[field] as 'FIXED' | 'HUG' | 'FILL';
  return p[dim] != null ? 'FIXED' : 'HUG';
}

/**
 * Validate and fix structural issues in a node spec tree before creation.
 * Mutates spec.props in place for deterministic fixes.
 * Now recursive: validates children in context of their parent's layout direction.
 */
export function inferStructure(spec: NodeSpec, parentCtx?: ParentCtx): InferenceResult {
  const result: InferenceResult = { fixes: [], ambiguous: [], annotatedFixes: [], correctedNodes: [] };
  if (spec.type !== 'frame') return result;

  const p = spec.props ?? {};
  const name = spec.name ?? 'Frame';
  const hasChildren = spec.children && spec.children.length > 0;

  /** Push a fix with confidence annotation */
  const pushFix = (msg: string, confidence: 'deterministic' | 'ambiguous' = 'deterministic') => {
    result.fixes.push(msg);
    result.annotatedFixes.push({ message: msg, confidence });
  };

  // Fix 1: Frame with children but no auto-layout → promote to VERTICAL
  if (hasChildren && !p.autoLayout && !p.layoutDirection) {
    const hasFillChild = spec.children!.some((c) => {
      const cp = c.props ?? {};
      return cp.layoutAlign === 'STRETCH' || cp.layoutGrow === 1;
    });

    if (hasFillChild) {
      if (!spec.props) spec.props = {};
      spec.props.autoLayout = true;
      spec.props.layoutDirection = spec.props.layoutDirection ?? 'VERTICAL';
      pushFix(
        `"${name}": auto-promoted to VERTICAL auto-layout (children use STRETCH/layoutGrow)`,
      );
    }
  }

  // Fix 2: Validate children sizing against parent layout (axis-aware)
  if (hasChildren && p.autoLayout) {
    const dir = (p.layoutDirection as string) ?? 'VERTICAL';
    for (const child of spec.children!) {
      const cp = child.props ?? {};
      const childName = child.name ?? child.type;

      // Snapshot child props before any ambiguous mutations
      const childOriginal = child.props ? JSON.parse(JSON.stringify(child.props)) : {};
      let childHasAmbiguous = false;

      // Child has explicit dimension on cross-axis AND layoutAlign: STRETCH → conflict
      // Reject: remove the explicit dimension since STRETCH will override it
      if (cp.layoutAlign === 'STRETCH') {
        const crossDim = dir === 'HORIZONTAL' ? 'height' : 'width';
        if (cp[crossDim] != null) {
          if (!child.props) child.props = {};
          const removedValue = cp[crossDim];
          delete child.props[crossDim];
          pushFix(
            `"${childName}" in "${name}": removed ${crossDim}=${removedValue} (conflicts with layoutAlign=STRETCH, which overrides fixed ${crossDim})`,
          );
        }
      }

      // Axis-aware sizing inference: FIXED without dimension → infer from axis role
      if (child.type === 'frame') {
        const isVertical = dir === 'VERTICAL';
        const axes = [
          { field: 'layoutSizingHorizontal', dim: 'width', role: isVertical ? 'cross' : 'primary' },
          { field: 'layoutSizingVertical', dim: 'height', role: isVertical ? 'primary' : 'cross' },
        ] as const;

        for (const axis of axes) {
          const sizing = cp[axis.field] as string | undefined;
          const dimension = cp[axis.dim] as number | undefined;

          // FIXED without dimension → infer FILL (cross) or HUG (primary)
          if (sizing === 'FIXED' && dimension == null) {
            if (!child.props) child.props = {};
            if (axis.role === 'cross') {
              child.props[axis.field] = 'FILL';
              pushFix(
                `"${childName}": ${axis.field} FIXED→FILL (cross-axis without ${axis.dim}, stretch to parent)`,
                'ambiguous',
              );
              childHasAmbiguous = true;
            } else {
              child.props[axis.field] = 'HUG';
              pushFix(
                `"${childName}": ${axis.field} FIXED→HUG (primary axis without ${axis.dim}, content-size)`,
                'ambiguous',
              );
              childHasAmbiguous = true;
            }
          }

          // FILL + explicit dimension → conflict: reject the dimension since FILL ignores it
          if (sizing === 'FILL' && dimension != null) {
            if (!child.props) child.props = {};
            delete child.props[axis.dim];
            pushFix(
              `"${childName}": removed ${axis.dim}=${dimension} (conflicts with ${axis.field}=FILL, which ignores fixed dimension)`,
            );
          }
        }
      }

      // Record corrected node if ambiguous fixes were applied to this child
      if (childHasAmbiguous) {
        const childAmbiguous = result.annotatedFixes
          .filter(f => f.confidence === 'ambiguous' && f.message.includes(`"${childName}"`))
          .map(f => f.message);
        result.correctedNodes.push({
          nodeName: childName,
          original: childOriginal,
          corrected: JSON.parse(JSON.stringify(child.props ?? {})),
          ambiguousFixes: childAmbiguous,
        });
      }
    }
  }

  // Fix 2b: FILL sizing without auto-layout parent → downgrade to HUG
  // This catches cases where the agent specifies FILL on children of non-AL frames
  if (hasChildren && !p.autoLayout) {
    for (const child of spec.children!) {
      const cp = child.props ?? {};
      const childName = child.name ?? child.type;
      const childOriginal2b = child.props ? JSON.parse(JSON.stringify(child.props)) : {};
      let childHasAmbiguous2b = false;

      if (cp.layoutSizingHorizontal === 'FILL') {
        if (!child.props) child.props = {};
        child.props.layoutSizingHorizontal = 'HUG';
        pushFix(
          `"${childName}": layoutSizingHorizontal FILL→HUG (parent "${name}" has no auto-layout, FILL requires auto-layout parent)`,
          'ambiguous',
        );
        childHasAmbiguous2b = true;
      }
      if (cp.layoutSizingVertical === 'FILL') {
        if (!child.props) child.props = {};
        child.props.layoutSizingVertical = 'HUG';
        pushFix(
          `"${childName}": layoutSizingVertical FILL→HUG (parent "${name}" has no auto-layout, FILL requires auto-layout parent)`,
          'ambiguous',
        );
        childHasAmbiguous2b = true;
      }

      if (childHasAmbiguous2b) {
        const childAmbiguous2b = result.annotatedFixes
          .filter(f => f.confidence === 'ambiguous' && f.message.includes(`"${childName}"`))
          .map(f => f.message);
        result.correctedNodes.push({
          nodeName: childName,
          original: childOriginal2b,
          corrected: JSON.parse(JSON.stringify(child.props ?? {})),
          ambiguousFixes: childAmbiguous2b,
        });
      }
    }
  }

  // Fix 3: Button-like frames must have auto-layout with centered alignment
  if (looksLikeButton(name) && hasChildren) {
    if (!spec.props) spec.props = {};
    if (!spec.props.autoLayout) {
      spec.props.autoLayout = true;
      spec.props.layoutDirection = spec.props.layoutDirection ?? 'HORIZONTAL';
      spec.props.primaryAxisAlignItems = spec.props.primaryAxisAlignItems ?? 'CENTER';
      spec.props.counterAxisAlignItems = spec.props.counterAxisAlignItems ?? 'CENTER';
      pushFix(
        `"${name}": auto-promoted to HORIZONTAL auto-layout with CENTER alignment (button pattern detected)`,
      );
    } else {
      if (!spec.props.primaryAxisAlignItems) {
        spec.props.primaryAxisAlignItems = 'CENTER';
        pushFix(`"${name}": set primaryAxisAlignItems=CENTER (button should center content)`);
      }
      if (!spec.props.counterAxisAlignItems) {
        spec.props.counterAxisAlignItems = 'CENTER';
        pushFix(`"${name}": set counterAxisAlignItems=CENTER (button should center content)`);
      }
    }

    if (spec.props.height == null && spec.props.minHeight == null) {
      spec.props.height = 48;
      pushFix(`"${name}": set height=48 (button minimum touch target)`);
    }

    const hasPadding = spec.props.padding != null || spec.props.paddingLeft != null ||
      spec.props.paddingRight != null || spec.props.paddingTop != null || spec.props.paddingBottom != null;
    if (!hasPadding) {
      spec.props.paddingLeft = 24;
      spec.props.paddingRight = 24;
      pushFix(`"${name}": set paddingLeft/Right=24 (button needs internal padding)`);
    }

    const textKids = spec.children!.filter(c => c.type === 'text');
    const shapeKids = spec.children!.filter(c => c.type === 'ellipse' || c.type === 'rectangle');
    if (textKids.length > 0 && shapeKids.length > 0) {
      // Reject: remove decorative shapes that would obscure button text
      const shapeNames = shapeKids.map(s => s.name ?? s.type);
      spec.children = spec.children!.filter(c => c.type !== 'ellipse' && c.type !== 'rectangle');
      pushFix(
        `"${name}": removed ${shapeKids.length} shape(s) [${shapeNames.join(', ')}] — shapes inside buttons obscure text. Use auto-layout with icon + text as siblings instead.`,
      );
    }
  }

  // Fix 4: Input-like frames should have auto-layout and STRETCH
  if (looksLikeInput(name) && hasChildren) {
    if (!spec.props) spec.props = {};
    if (!spec.props.autoLayout) {
      spec.props.autoLayout = true;
      spec.props.layoutDirection = spec.props.layoutDirection ?? 'HORIZONTAL';
      spec.props.counterAxisAlignItems = spec.props.counterAxisAlignItems ?? 'CENTER';
      pushFix(
        `"${name}": auto-promoted to HORIZONTAL auto-layout (input field pattern detected)`,
      );
    }
    if (!spec.props.layoutAlign) {
      spec.props.layoutAlign = 'STRETCH';
      pushFix(`"${name}": set layoutAlign=STRETCH (input fields should fill parent width)`);
    }

    if (spec.props.height == null && spec.props.minHeight == null) {
      spec.props.height = 48;
      pushFix(`"${name}": set height=48 (input field standard height)`);
    }

    if (spec.props.stroke == null) {
      spec.props.stroke = '#E0E0E0';
      if (spec.props.strokeWeight == null) spec.props.strokeWeight = 1;
      pushFix(`"${name}": set stroke=#E0E0E0 (input field needs visible border)`);
    }

    if (spec.props.cornerRadius == null) {
      spec.props.cornerRadius = 8;
      pushFix(`"${name}": set cornerRadius=8 (input field standard radius)`);
    }

    const hasPadding = spec.props.padding != null || spec.props.paddingLeft != null ||
      spec.props.paddingRight != null || spec.props.paddingTop != null || spec.props.paddingBottom != null;
    if (!hasPadding) {
      spec.props.paddingLeft = 16;
      spec.props.paddingRight = 16;
      pushFix(`"${name}": set paddingLeft/Right=16 (input field needs internal padding)`);
    }
  }

  // Fix 5: Text overflow prevention — text children in fixed-width auto-layout containers
  // should use textAutoResize to prevent clipping
  if (hasChildren && p.autoLayout) {
    const dir = (p.layoutDirection as string) ?? 'VERTICAL';
    const isFixedCrossAxis = dir === 'VERTICAL'
      ? (p.width != null && p.layoutSizingHorizontal !== 'HUG')
      : (p.height != null && p.layoutSizingVertical !== 'HUG');

    if (isFixedCrossAxis) {
      for (const child of spec.children!) {
        if (child.type !== 'text') continue;
        const cp = child.props ?? {};
        // If text has no explicit sizing and parent has fixed cross-axis width,
        // the text might overflow. Ensure layoutAlign=STRETCH so text wraps.
        if (cp.layoutAlign == null && dir === 'VERTICAL') {
          // Only for VERTICAL parents where text should fill width
          // Skip if text already has explicit width
          if (cp.width == null) {
            if (!child.props) child.props = {};
            // Don't auto-set STRETCH for text — it changes behavior.
            // Instead, warn if text content is long and might overflow.
            const content = (cp.content as string) ?? '';
            if (content.length > 30) {
              result.ambiguous.push(
                `"${child.name ?? 'text'}" in "${name}": long text (${content.length} chars) in fixed-width container — consider layoutAlign=STRETCH to prevent overflow`,
              );
              result.annotatedFixes.push({
                message: `"${child.name ?? 'text'}" in "${name}": long text in fixed-width container`,
                confidence: 'ambiguous',
              });
            }
          }
        }
      }
    }
  }

  // Recursive: validate children frames with parent context
  if (hasChildren) {
    const thisCtx: ParentCtx = {
      layoutMode: p.autoLayout ? ((p.layoutDirection as 'HORIZONTAL' | 'VERTICAL') ?? 'VERTICAL') : 'NONE',
      sizingH: resolveEffectiveSizing(p, 'H'),
      sizingV: resolveEffectiveSizing(p, 'V'),
    };

    // Fix 6: HUG/HUG detection — frame with children that HUGs on both axes
    // This creates unbounded sizing where FILL children collapse to 0
    if (p.autoLayout && hasChildren) {
      const dir = (p.layoutDirection as string) ?? 'VERTICAL';
      const isVertical = dir === 'VERTICAL';
      const crossDim = isVertical ? 'width' : 'height';
      const crossSizing = isVertical ? 'layoutSizingHorizontal' : 'layoutSizingVertical';

      // Check if cross-axis is effectively HUG (no explicit dimension, no FILL sizing)
      const crossIsHug = p[crossDim] == null && p[crossSizing] !== 'FILL' && p[crossSizing] !== 'FIXED';

      if (crossIsHug) {
        // Check if any child uses STRETCH/FILL on cross-axis
        const hasStretchChild = spec.children!.some((c) => {
          const cp = c.props ?? {};
          return cp.layoutAlign === 'STRETCH' ||
            (isVertical && cp.layoutSizingHorizontal === 'FILL') ||
            (!isVertical && cp.layoutSizingVertical === 'FILL');
        });

        if (hasStretchChild) {
          result.ambiguous.push(
            `"${name}": HUG on ${isVertical ? 'horizontal' : 'vertical'} axis with STRETCH/FILL children — children will collapse to 0. Set explicit ${crossDim} or use layoutAlign: STRETCH on this frame.`,
          );
          result.annotatedFixes.push({
            message: `"${name}": HUG + STRETCH paradox on ${isVertical ? 'horizontal' : 'vertical'} axis`,
            confidence: 'ambiguous',
          });
        }
      }
    }

    for (const child of spec.children!) {
      if (child.type === 'frame') {
        const childResult = inferStructure(child, thisCtx);
        result.fixes.push(...childResult.fixes);
        result.ambiguous.push(...childResult.ambiguous);
        result.annotatedFixes.push(...childResult.annotatedFixes);
        result.correctedNodes.push(...childResult.correctedNodes);
      }
    }
  }

  return result;
}

/** Check if a frame name looks like a button. */
function looksLikeButton(name: string): boolean {
  return /button|btn|按钮|登录|注册|submit|sign.?in|sign.?up|log.?in|cta/i.test(name);
}

/** Check if a frame name looks like an input field. */
function looksLikeInput(name: string): boolean {
  return /input|field|text.?field|search.?bar|输入|邮箱|密码|用户名|email|password|username/i.test(name);
}

/**
 * Infer sizing defaults for a child after it's been appended to an auto-layout parent.
 * Returns warnings about what was inferred.
 *
 * Rules (axis-aware, inspired by Vibma's applySizing):
 * - Non-text children in auto-layout: default cross-axis to STRETCH if no explicit layoutAlign
 * - Text nodes: leave as-is (text should hug by default)
 * - Cross-axis: when parent is constrained (has explicit dimension), child frame defaults cross-axis to FILL
 * - Primary-axis: child frame defaults to HUG (content-sized) unless explicitly set
 * - FIXED/FIXED inside auto-layout: warn (both axes fixed = not responsive)
 * - FILL without auto-layout parent: downgrade to HUG with warning
 */
export function inferChildSizing(
  childType: string,
  childProps: Record<string, unknown>,
  parentHasAutoLayout: boolean,
  childName: string,
  parentContext?: { layoutDirection?: string; parentName?: string; parentWidth?: number; parentHeight?: number },
): string[] {
  const warnings: string[] = [];
  if (!parentHasAutoLayout) {
    // FILL sizing without auto-layout parent → downgrade to HUG
    if (childProps.layoutSizingHorizontal === 'FILL') {
      childProps.layoutSizingHorizontal = 'HUG';
      warnings.push(
        `"${childName}": layoutSizingHorizontal FILL→HUG (parent has no auto-layout, FILL requires auto-layout parent)`,
      );
    }
    if (childProps.layoutSizingVertical === 'FILL') {
      childProps.layoutSizingVertical = 'HUG';
      warnings.push(
        `"${childName}": layoutSizingVertical FILL→HUG (parent has no auto-layout, FILL requires auto-layout parent)`,
      );
    }
    return warnings;
  }

  // Auto-default STRETCH for frame/rectangle/instance/line children (not text, not vector/ellipse)
  // line is included because lines commonly serve as dividers and should stretch to fill width
  const stretchableTypes = new Set(['frame', 'rectangle', 'instance', 'line']);
  if (!stretchableTypes.has(childType)) return warnings;

  // If no explicit layoutAlign, default to STRETCH for cross-axis fill
  if (childProps.layoutAlign == null) {
    childProps.layoutAlign = 'STRETCH';
    warnings.push(
      `"${childName}": auto-set layoutAlign=STRETCH (cross-axis fill in auto-layout parent)`,
    );
  }

  // Deep axis-aware sizing inference for frame children (Vibma's applySizing equivalent)
  if (childType === 'frame' && parentContext?.layoutDirection) {
    const isVertical = parentContext.layoutDirection === 'VERTICAL';
    const crossField = isVertical ? 'layoutSizingHorizontal' : 'layoutSizingVertical';
    const primaryField = isVertical ? 'layoutSizingVertical' : 'layoutSizingHorizontal';
    const crossDim = isVertical ? 'width' : 'height';
    const primaryDim = isVertical ? 'height' : 'width';
    const parentCrossDim = isVertical ? parentContext.parentWidth : parentContext.parentHeight;

    // Cross-axis: if parent is constrained (has explicit dimension) and child has no explicit
    // cross-axis sizing, default to FILL so child stretches to fill parent
    if (childProps[crossField] == null && childProps[crossDim] == null && parentCrossDim != null && parentCrossDim > 0) {
      childProps[crossField] = 'FILL';
      warnings.push(
        `"${childName}": auto-set ${crossField}=FILL (parent "${parentContext.parentName ?? 'parent'}" has constrained ${crossDim}=${parentCrossDim})`,
      );
    }

    // Primary-axis: if child has no explicit primary-axis sizing and no explicit dimension,
    // default to HUG (content-sized)
    if (childProps[primaryField] == null && childProps[primaryDim] == null) {
      childProps[primaryField] = 'HUG';
      warnings.push(
        `"${childName}": auto-set ${primaryField}=HUG (primary axis defaults to content-size)`,
      );
    }

    // FIXED/FIXED warning: both axes have explicit dimensions but no sizing mode set
    // This means the child won't respond to parent size changes
    if (childProps[crossDim] != null && childProps[primaryDim] != null
      && childProps[crossField] == null && childProps[primaryField] == null
      && childProps.layoutAlign !== 'STRETCH') {
      warnings.push(
        `"${childName}": FIXED/FIXED inside auto-layout "${parentContext.parentName ?? 'parent'}" — child won't respond to parent size changes. Consider FILL on cross-axis.`,
      );
    }
  }

  return warnings;
}

// ─── CSS alias normalization ───

/**
 * Node-type-aware alias key sets (surpasses Vibma's TEXT_ALIAS_KEYS / FRAME_ALIAS_KEYS).
 * Different node types accept different CSS-style aliases.
 */
const TEXT_ONLY_ALIASES = new Set(['fontColor', 'color', 'fontColorVariableName', 'fontColorStyleName']);
const FRAME_ONLY_ALIASES = new Set(['fillVariableName', 'fillStyleName', 'fillVariableId', 'strokeVariableName', 'strokeStyleName', 'strokeVariableId']);

/** CSS-style alias → Figma canonical param mapping. Mutates props in place. */
const ALIAS_MAP: Record<string, { target: string; transform?: (v: unknown) => unknown }> = {
  fillColor: { target: 'fill' },
  backgroundColor: { target: 'fill' },
  'background-color': { target: 'fill' },
  background: { target: 'fill' },
  color: { target: 'fill' },
  fontColor: { target: 'fill' },
  // Variable/Style name aliases → structured object format (surpasses Vibma)
  fillVariableName: { target: 'fill', transform: (v) => ({ _variable: String(v) }) },
  fillStyleName: { target: 'fill', transform: (v) => ({ _style: String(v) }) },
  fillVariableId: { target: 'fill', transform: (v) => ({ _variableId: String(v) }) },
  fontColorVariableName: { target: 'fill', transform: (v) => ({ _variable: String(v) }) },
  fontColorStyleName: { target: 'fill', transform: (v) => ({ _style: String(v) }) },
  strokeColor: { target: 'stroke' },
  borderColor: { target: 'stroke' },
  'border-color': { target: 'stroke' },
  strokeVariableName: { target: 'stroke', transform: (v) => ({ _variable: String(v) }) },
  strokeStyleName: { target: 'stroke', transform: (v) => ({ _style: String(v) }) },
  strokeVariableId: { target: 'stroke', transform: (v) => ({ _variableId: String(v) }) },
  borderWidth: { target: 'strokeWeight' },
  'border-width': { target: 'strokeWeight' },
  borderRadius: { target: 'cornerRadius' },
  'border-radius': { target: 'cornerRadius' },
  gap: { target: 'itemSpacing' },
  flexDirection: { target: 'layoutDirection', transform: (v) => {
    const s = String(v).toLowerCase();
    return (s === 'row' || s === 'row-reverse') ? 'HORIZONTAL' : 'VERTICAL';
  }},
  'flex-direction': { target: 'layoutDirection', transform: (v) => {
    const s = String(v).toLowerCase();
    return (s === 'row' || s === 'row-reverse') ? 'HORIZONTAL' : 'VERTICAL';
  }},
  alignItems: { target: 'counterAxisAlignItems', transform: (v) => {
    const s = String(v).toLowerCase();
    if (s === 'center') return 'CENTER';
    if (s === 'flex-end' || s === 'end') return 'MAX';
    return 'MIN';
  }},
  'align-items': { target: 'counterAxisAlignItems', transform: (v) => {
    const s = String(v).toLowerCase();
    if (s === 'center') return 'CENTER';
    if (s === 'flex-end' || s === 'end') return 'MAX';
    return 'MIN';
  }},
  justifyContent: { target: 'primaryAxisAlignItems', transform: (v) => {
    const s = String(v).toLowerCase();
    if (s === 'center') return 'CENTER';
    if (s === 'flex-end' || s === 'end') return 'MAX';
    if (s === 'space-between') return 'SPACE_BETWEEN';
    return 'MIN';
  }},
  'justify-content': { target: 'primaryAxisAlignItems', transform: (v) => {
    const s = String(v).toLowerCase();
    if (s === 'center') return 'CENTER';
    if (s === 'flex-end' || s === 'end') return 'MAX';
    if (s === 'space-between') return 'SPACE_BETWEEN';
    return 'MIN';
  }},
};

/**
 * Normalize CSS-style aliases to Figma canonical params.
 * Mutates props in place. Returns hints about what was converted.
 * Only converts if the target param is not already set (no override).
 *
 * Node-type-aware: text-only aliases (fontColor, color) are only applied for text nodes,
 * frame-only aliases (fillVariableName, etc.) are only applied for non-text nodes.
 */
export function normalizeAliases(
  props: Record<string, unknown>,
  nodeName: string,
  nodeType?: string,
): Hint[] {
  const hints: Hint[] = [];
  for (const [alias, { target, transform }] of Object.entries(ALIAS_MAP)) {
    if (!(alias in props)) continue;
    // Node-type filtering: skip text-only aliases for non-text, frame-only for text
    if (nodeType) {
      if (TEXT_ONLY_ALIASES.has(alias) && nodeType !== 'text') continue;
      if (FRAME_ONLY_ALIASES.has(alias) && nodeType === 'text') continue;
    }
    if (!(target in props)) {
      const raw = props[alias];
      const value = transform ? transform(raw) : raw;
      props[target] = value;
      delete props[alias];
      hints.push({
        type: 'confirm',
        message: `"${nodeName}": converted ${alias}=${JSON.stringify(raw)} → ${target}=${JSON.stringify(value)}`,
      });
    }
  }
  // Special: display: flex → autoLayout: true
  if ('display' in props && !('autoLayout' in props)) {
    const d = String(props.display).toLowerCase();
    if (d === 'flex' || d === 'inline-flex') {
      props.autoLayout = true;
      delete props.display;
      hints.push({ type: 'confirm', message: `"${nodeName}": converted display:flex → autoLayout:true` });
    }
  }
  return hints;
}


// ─── Inference diff output ───

/**
 * Format inference fixes as a git-style diff for the create_document response.
 * Shows what was changed and why, making it easy for the agent to understand
 * what the inference engine corrected.
 *
 * Supports two modes (surpasses Vibma's formatDiff):
 * - full: show all fixes (default, backward compatible)
 * - selective: only show ambiguous fixes (reduces noise for deterministic corrections)
 *
 * @param fixes - Array of fix descriptions from inferStructure
 * @param annotatedFixes - Optional confidence-annotated fixes for selective mode
 * @returns Formatted diff string, or null if no fixes to show
 */
export function formatInferenceDiff(
  fixes: string[],
  annotatedFixes?: Array<{ message: string; confidence: 'deterministic' | 'ambiguous' }>,
): string | null {
  // If annotated fixes provided, use selective mode: only show ambiguous
  const displayFixes = annotatedFixes
    ? annotatedFixes.filter((f) => f.confidence === 'ambiguous').map((f) => f.message)
    : fixes;

  if (displayFixes.length === 0) return null;

  const totalFixes = fixes.length;
  const shownFixes = displayFixes.length;
  const lines = ['--- original (agent input)', '+++ corrected (inference engine)'];
  if (annotatedFixes && shownFixes < totalFixes) {
    lines.push(`# ${totalFixes} fixes total, ${totalFixes - shownFixes} deterministic (hidden), ${shownFixes} ambiguous (shown)`);
  }
  for (const fix of displayFixes) {
    const match = fix.match(/^"([^"]+)":\s*(.+)$/);
    if (match) {
      const [, nodeName, change] = match;
      lines.push(`@@ ${nodeName} @@`);
      const arrowMatch = change.match(/(\S+)\s*→\s*(\S+)/);
      if (arrowMatch) {
        lines.push(`- ${arrowMatch[1]}`);
        lines.push(`+ ${arrowMatch[2]}`);
        lines.push(`  (${change})`);
      } else {
        lines.push(`+ ${change}`);
      }
    } else {
      lines.push(`+ ${fix}`);
    }
  }
  return lines.join('\n');
}

// ─── Overlapping sibling detection ───

/**
 * Check for overlapping siblings at the same position in non-auto-layout parents.
 * When multiple children share the same (x, y) coordinates without auto-layout,
 * they will visually overlap — usually a mistake.
 *
 * @param children - Array of child specs to check
 * @param parentName - Parent frame name for hint messages
 * @returns Array of warn hints about overlapping siblings
 */
export function checkOverlappingSiblings(
  children: Array<{ type: string; name?: string; props?: Record<string, unknown> }>,
  parentName: string,
): Hint[] {
  if (children.length < 2) return [];

  const posMap = new Map<string, string[]>();
  for (const child of children) {
    const p = child.props ?? {};
    const x = (p.x as number) ?? 0;
    const y = (p.y as number) ?? 0;
    const key = `${x},${y}`;
    const name = child.name ?? child.type;
    const existing = posMap.get(key);
    if (existing) existing.push(name);
    else posMap.set(key, [name]);
  }

  const hints: Hint[] = [];
  for (const [pos, names] of posMap) {
    if (names.length > 1) {
      hints.push({
        type: 'warn',
        message: `"${parentName}": ${names.length} children overlap at position (${pos}): ${names.join(', ')}. Use auto-layout or set distinct x/y positions.`,
      });
    }
  }
  return hints;
}

// ─── Post-creation overlap detection ───

/**
 * Check for overlapping siblings using actual Figma node positions (post-creation).
 * More accurate than spec-based detection because it uses rounded absolute positions
 * after Figma's layout engine has resolved auto-layout, constraints, etc.
 *
 * @param parentNode - The parent frame node to check children of
 * @returns Array of warn hints about overlapping siblings
 */
export function checkOverlappingSiblingsPostCreation(
  parentNode: { name: string; children: ReadonlyArray<{ name: string; x: number; y: number; width: number; height: number }> },
): Hint[] {
  const children = parentNode.children;
  if (!children || children.length < 2) return [];

  const hints: Hint[] = [];
  const posMap = new Map<string, string[]>();

  for (const child of children) {
    // Use Math.round for sub-pixel tolerance (matches Vibma's approach)
    const key = `${Math.round(child.x)},${Math.round(child.y)}`;
    const existing = posMap.get(key);
    if (existing) existing.push(child.name);
    else posMap.set(key, [child.name]);
  }

  for (const [pos, names] of posMap) {
    if (names.length > 1) {
      hints.push({
        type: 'warn',
        message: `"${parentNode.name}": ${names.length} children overlap at (${pos}) after layout: ${names.join(', ')}`,
      });
    }
  }
  return hints;
}

// ─── Corrected payload builder ───

/**
 * Build a corrected payload that preserves original authoring aliases.
 * When inference modifies props (e.g. adding autoLayout, changing sizing),
 * this function produces a clean payload that keeps the user's original
 * alias names (e.g. "backgroundColor" instead of "fill") alongside the corrections.
 *
 * This is useful for debugging: the agent can see exactly what was changed
 * while the original authoring intent is preserved.
 *
 * @param originalSpec - The original spec before inference
 * @param correctedSpec - The spec after inference mutations
 * @returns A new spec with corrections applied but original aliases preserved in metadata
 */
export function buildCorrectedPayload(
  originalSpec: NodeSpec,
  correctedSpec: NodeSpec,
): { spec: NodeSpec; aliasesPreserved: Record<string, unknown> } {
  const aliasesPreserved: Record<string, unknown> = {};
  const origProps = originalSpec.props ?? {};
  const corrProps = correctedSpec.props ?? {};

  // Detect which alias keys were present in the original but normalized away
  for (const [alias, { target }] of Object.entries(ALIAS_MAP)) {
    if (alias in origProps && !(alias in corrProps) && target in corrProps) {
      aliasesPreserved[alias] = origProps[alias];
    }
  }

  return { spec: correctedSpec, aliasesPreserved };
}
