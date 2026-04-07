/**
 * Inline tree validation — inference tracking & correctedPayload feedback.
 *
 * When create_frame detects ambiguous parameter combinations,
 * it returns _correctedPayload + _diff so the AI learns the correct usage.
 */

import { SPACER_RE } from '@figcraft/quality-engine';
import type { StructuredHint } from '../utils/hint-aggregator.js';

/** A single layout inference made during node creation. */
export interface Inference {
  /** Node path in the tree, e.g. "Card > Header" */
  path: string;
  /** Field that was inferred, e.g. "layoutMode" */
  field: string;
  /** Original value (undefined when the field was missing) */
  from: unknown;
  /** Resolved value after inference */
  to: unknown;
  /** deterministic = one obvious choice, ambiguous = agent might want something else */
  confidence: 'deterministic' | 'ambiguous';
  /** Human-readable reason for the inference */
  reason: string;
}

/** Result of validating inline tree params. */
export interface ValidationResult {
  /** Whether any ambiguous inference was made */
  hasAmbiguity: boolean;
  /** All inferences (both deterministic and ambiguous) */
  inferences: Inference[];
}

/**
 * Format ambiguous inferences as a git-style diff string.
 * Only includes ambiguous inferences (deterministic are silent).
 */
export function formatDiff(inferences: Inference[]): string {
  const ambiguous = inferences.filter((i) => i.confidence === 'ambiguous');
  if (ambiguous.length === 0) return '';

  // Group by path
  const byPath = new Map<string, Inference[]>();
  for (const inf of ambiguous) {
    const group = byPath.get(inf.path) ?? [];
    group.push(inf);
    byPath.set(inf.path, group);
  }

  const lines: string[] = [];
  for (const [path, group] of byPath) {
    lines.push(path || '(root)');
    for (const inf of group) {
      const fromStr = inf.from === undefined ? '(not set)' : JSON.stringify(inf.from);
      lines.push(`- ${inf.field}: ${fromStr}`);
      lines.push(`+ ${inf.field}: ${JSON.stringify(inf.to)}  # ${inf.reason}`);
    }
  }
  return lines.join('\n');
}

/** Detect horizontal layout signals from params and children. */
export function inferDirection(p: Record<string, unknown>): 'HORIZONTAL' | 'VERTICAL' {
  // Figma constraint: WRAP only works with HORIZONTAL
  if (p.layoutWrap === 'WRAP') return 'HORIZONTAL';
  // Name-based heuristic for horizontal containers
  const name = ((p.name as string) ?? '').toLowerCase();
  if (/row|toolbar|nav.?bar|tab.?bar|action.?bar|breadcrumb|pagination|badge.?group|button.?group|social/i.test(name)) {
    return 'HORIZONTAL';
  }
  return 'VERTICAL';
}

// ─── Known params per child type (for unknown-param detection) ───

const COMMON_PARAMS = new Set([
  'type',
  'name',
  'x',
  'y',
  'width',
  'height',
  'index',
  'layoutSizingHorizontal',
  'layoutSizingVertical',
  'layoutPositioning',
  'layoutGrow',
  'opacity',
  'visible',
  'rotation',
]);

const FRAME_PARAMS = new Set([
  ...COMMON_PARAMS,
  'fill',
  'fillVariableName',
  'fillStyleName',
  'fontColorVariableName',
  'fontColorStyleName',
  'gradient',
  'imageUrl',
  'imageScaleMode',
  'strokeColor',
  'strokeVariableName',
  'strokeWeight',
  'strokeAlign',
  'strokeDashes',
  'strokeCap',
  'strokeJoin',
  'layoutMode',
  'itemSpacing',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'counterAxisSpacing',
  'primaryAxisAlignItems',
  'counterAxisAlignItems',
  'layoutWrap',
  'cornerRadius',
  'topLeftRadius',
  'topRightRadius',
  'bottomRightRadius',
  'bottomLeftRadius',
  'blendMode',
  'effectStyleName',
  'shadow',
  'innerShadow',
  'blur',
  'clipsContent',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'role',
  'children',
  'dryRun',
  'noPreview',
  'parentId',
  'items',
]);

const TEXT_PARAMS = new Set([
  ...COMMON_PARAMS,
  'content',
  'characters',
  'fontSize',
  'fontFamily',
  'fontStyle',
  'fontWeight',
  'fill',
  'fillVariableName',
  'fillStyleName',
  'fontColorVariableName',
  'fontColorStyleName',
  'textStyleName',
  'textAlignHorizontal',
  'textAlignVertical',
  'textAutoResize',
  'textCase',
  'textDecoration',
  'letterSpacing',
  'lineHeight',
  'paragraphSpacing',
  'strokeColor',
  'strokeVariableName',
  'strokeWeight',
  'hyperlink',
]);

const SHAPE_PARAMS = new Set([
  ...COMMON_PARAMS,
  'fill',
  'fillVariableName',
  'fillStyleName',
  'strokeColor',
  'strokeVariableName',
  'strokeWeight',
  'cornerRadius',
]);

const INSTANCE_PARAMS = new Set([...COMMON_PARAMS, 'componentId', 'variantProperties', 'properties']);

const SVG_PARAMS = new Set([...COMMON_PARAMS, 'svg']);

const ICON_PARAMS = new Set([...COMMON_PARAMS, 'icon', 'size', 'fill', 'colorVariableName']);

const STAR_PARAMS = new Set([...SHAPE_PARAMS, 'pointCount', 'innerRadius']);
const POLYGON_PARAMS = new Set([...SHAPE_PARAMS, 'pointCount']);

const PARAM_SETS: Record<string, Set<string>> = {
  frame: FRAME_PARAMS,
  text: TEXT_PARAMS,
  rectangle: SHAPE_PARAMS,
  ellipse: SHAPE_PARAMS,
  star: STAR_PARAMS,
  polygon: POLYGON_PARAMS,
  instance: INSTANCE_PARAMS,
  svg: SVG_PARAMS,
  icon: ICON_PARAMS,
};

/** Common wrong param names → corrective suggestion. */
const PARAM_CORRECTIONS: Record<string, string> = {
  color: 'fill (or fillVariableName for token binding)',
  backgroundColor: 'fill',
  background: 'fill',
  fillColor: 'fill',
  border: 'strokeColor + strokeWeight',
  borderColor: 'strokeColor',
  borderWidth: 'strokeWeight',
  borderRadius: 'cornerRadius',
  gap: 'itemSpacing',
  justifyContent: 'primaryAxisAlignItems',
  alignItems: 'counterAxisAlignItems',
  direction: 'layoutMode',
  flexDirection: 'layoutMode',
  font: 'fontFamily + fontStyle',
  fontColor: 'fill (or fontColorVariableName for token binding)',
  text: 'content',
  label: 'content',
  value: 'content',
  size: 'width + height',
  src: 'imageUrl',
  url: 'imageUrl',
  dropShadow: 'shadow',
  align: 'primaryAxisAlignItems or counterAxisAlignItems',
  overflow: 'clipsContent',
  wrap: 'layoutWrap',
  spacing: 'itemSpacing',
  radius: 'cornerRadius',
};

/**
 * Detect unknown params in children and return warnings with corrective suggestions.
 * Non-blocking: returns warning inferences, never conflicts.
 */
export function warnUnknownChildParams(
  child: Record<string, unknown>,
  childType: string,
  childPath: string,
): Inference[] {
  const known = PARAM_SETS[childType] ?? FRAME_PARAMS;
  const warnings: Inference[] = [];

  for (const key of Object.keys(child)) {
    if (key.startsWith('_')) continue; // internal fields
    if (known.has(key)) continue;

    const correction = PARAM_CORRECTIONS[key];
    const reason = correction
      ? `unknown param "${key}" — did you mean: ${correction}?`
      : `unknown param "${key}" — will be ignored`;

    warnings.push({
      path: childPath,
      field: '_unknownParam',
      from: key,
      to: undefined,
      confidence: 'deterministic',
      reason,
    });
  }

  return warnings;
}

/** Fields that may be inferred during creation. */
const INFERRED_FIELDS = new Set(['layoutMode', 'layoutSizingHorizontal', 'layoutSizingVertical']);

/**
 * Build a corrected payload from the mutated params.
 * Preserves the original param format (aliases like fillVariableName stay as-is),
 * overlays only the inferred fields.
 */
export function buildCorrectedPayload(
  originalParams: Record<string, unknown>,
  inferences: Inference[],
): Record<string, unknown> {
  const corrected = { ...originalParams };

  for (const inf of inferences) {
    // Only overlay inferences on the root node (path-less or root path)
    if (inf.path === '' || inf.path === corrected.name) {
      corrected[inf.field] = inf.to;
    }
  }

  // Also overlay inferences on children recursively
  if (Array.isArray(corrected.children)) {
    corrected.children = (corrected.children as Record<string, unknown>[]).map((child, idx) => {
      const childName = (child.name as string) ?? `child[${idx}]`;
      const childInferences = inferences.filter((inf) => {
        // Match inferences whose path starts with this child's name
        const parts = inf.path.split(' > ');
        return parts.length >= 2 && parts[0] === ((corrected.name as string) ?? '') && parts[1] === childName;
      });
      if (childInferences.length === 0) return child;

      const correctedChild = { ...child };
      for (const inf of childInferences) {
        correctedChild[inf.field] = inf.to;
      }
      return correctedChild;
    });
  }

  // Normalize aliases so correctedPayload reflects what creation actually uses
  normalizeCorrectedAliases(corrected);
  if (Array.isArray(corrected.children)) {
    for (const child of corrected.children as Record<string, unknown>[]) {
      normalizeCorrectedAliases(child);
    }
  }

  return corrected;
}

/** Normalize alias fields in correctedPayload so agent sees the canonical form. */
function normalizeCorrectedAliases(p: Record<string, unknown>): void {
  // Fill aliases → fill: { _variable / _style }
  if (!p.fill && p.fillVariableName) {
    p.fill = { _variable: p.fillVariableName };
    delete p.fillVariableName;
  } else if (!p.fill && p.fillStyleName) {
    p.fill = { _style: p.fillStyleName };
    delete p.fillStyleName;
  }
  if (!p.fill && p.fontColorVariableName) {
    p.fill = { _variable: p.fontColorVariableName };
    delete p.fontColorVariableName;
  } else if (!p.fill && p.fontColorStyleName) {
    p.fill = { _style: p.fontColorStyleName };
    delete p.fontColorStyleName;
  }
  // Stroke alias
  if (!p.strokeColor && p.strokeVariableName) {
    p.strokeColor = { _variable: p.strokeVariableName };
    delete p.strokeVariableName;
  }
  // Padding shorthand — CSS cascade: padding sets base, per-side overrides
  if (p.padding != null) {
    if (p.paddingTop == null) p.paddingTop = p.padding;
    if (p.paddingRight == null) p.paddingRight = p.padding;
    if (p.paddingBottom == null) p.paddingBottom = p.padding;
    if (p.paddingLeft == null) p.paddingLeft = p.padding;
    delete p.padding;
  }
}

/** Result of pre-creation parameter validation. */
export interface PreValidationResult {
  /** All inferences detected before creation */
  inferences: Inference[];
  /** Whether a conflict was found (should abort creation) */
  hasConflict: boolean;
  /** Error message when conflict detected */
  conflictMessage?: string;
}

/**
 * Pre-creation parameter validation.
 * Detects conflicts and infers layout properties BEFORE creating any nodes.
 * Returns inferences and conflicts without side effects.
 */
export function validateParams(params: Record<string, unknown>, nodePath: string): PreValidationResult {
  const inferences: Inference[] = [];

  // Only validate frame-type nodes (not text, rectangle, ellipse)
  const childType = (params.type as string) ?? 'frame';
  if (childType !== 'frame') {
    return { inferences, hasConflict: false };
  }

  // Shared checks used by multiple validation steps
  const hasALParams =
    params.itemSpacing != null ||
    params.paddingTop != null ||
    params.paddingRight != null ||
    params.paddingBottom != null ||
    params.paddingLeft != null ||
    params.padding != null ||
    params.primaryAxisAlignItems != null ||
    params.counterAxisAlignItems != null ||
    (params.layoutWrap != null && params.layoutWrap !== 'NO_WRAP');
  const hasChildren = Array.isArray(params.children) && params.children.length > 0;
  const hasHUGSizing = params.layoutSizingHorizontal === 'HUG' || params.layoutSizingVertical === 'HUG';

  // ── 0. Auto-downgrade: empty frame with fixed size but no layout → rectangle ──
  const hasFixedSize = params.width != null || params.height != null;
  if (!hasChildren && hasFixedSize && params.layoutMode == null && !hasALParams) {
    inferences.push({
      path: nodePath,
      field: 'type',
      from: 'frame',
      to: 'rectangle',
      confidence: 'deterministic',
      reason:
        'empty frame with fixed size and no layout — auto-downgraded to rectangle (avoids HUG error in auto-layout parents)',
    });
    params.type = 'rectangle';
    return { inferences, hasConflict: false };
  }

  // ── 1. layoutMode conflict detection ──

  if (params.layoutMode === 'NONE' && (hasALParams || hasHUGSizing)) {
    const conflicting = [hasALParams && 'padding/spacing/alignment', hasHUGSizing && 'HUG sizing']
      .filter(Boolean)
      .join(' and ');
    return {
      inferences,
      hasConflict: true,
      conflictMessage: `[${nodePath}] layoutMode:"NONE" conflicts with ${conflicting}. Remove layoutMode:"NONE" to enable auto-layout.`,
    };
  }

  // ── 2. layoutMode inference (with parent promotion for child FILL/HUG needs) ──
  if (!params.layoutMode && (hasALParams || hasHUGSizing || hasChildren)) {
    // When children declare FILL/HUG sizing and parent has no AL params,
    // confidence depends on whether parent has explicit dimensions
    let confidence: 'deterministic' | 'ambiguous' = 'deterministic';
    let reason: string;
    if (hasALParams) {
      reason = 'inferred from padding/spacing/alignment params';
    } else if (hasChildren) {
      const childrenNeedAL = (params.children as Record<string, unknown>[]).some((c) => {
        const sh = c.layoutSizingHorizontal as string | undefined;
        const sv = c.layoutSizingVertical as string | undefined;
        return sh === 'FILL' || sh === 'HUG' || sv === 'FILL' || sv === 'HUG';
      });
      if (childrenNeedAL && !hasHUGSizing) {
        // Children need AL but parent has no AL params — confidence depends on dimensions
        const hasDims = params.width != null || params.height != null;
        confidence = hasDims ? 'deterministic' : 'ambiguous';
        reason = hasDims
          ? 'children need FILL/HUG sizing — promoted to auto-layout (parent has fixed dimensions)'
          : 'children need FILL/HUG sizing — promoted to auto-layout (no dimensions, may need review)';
      } else {
        reason = 'inferred from children param';
      }
    } else {
      reason = 'inferred from HUG sizing';
    }
    const inferredDirection = inferDirection(params);
    inferences.push({
      path: nodePath,
      field: 'layoutMode',
      from: undefined,
      to: inferredDirection,
      confidence,
      reason,
    });
  }

  // ── 3. sizing conflict detection ──
  if (params.layoutSizingHorizontal === 'FILL' && params.width != null) {
    return {
      inferences,
      hasConflict: true,
      conflictMessage: `[${nodePath}] layoutSizingHorizontal:"FILL" conflicts with explicit width:${params.width}. FILL stretches to parent — remove width or use FIXED sizing.`,
    };
  }
  if (params.layoutSizingVertical === 'FILL' && params.height != null) {
    return {
      inferences,
      hasConflict: true,
      conflictMessage: `[${nodePath}] layoutSizingVertical:"FILL" conflicts with explicit height:${params.height}. FILL stretches to parent — remove height or use FIXED sizing.`,
    };
  }

  // ── 3.5. Min/max constraint validation ──
  if (params.minWidth != null && params.maxWidth != null && (params.minWidth as number) > (params.maxWidth as number)) {
    return {
      inferences,
      hasConflict: true,
      conflictMessage: `[${nodePath}] minWidth (${params.minWidth}) > maxWidth (${params.maxWidth}). Swap values or remove one.`,
    };
  }
  if (
    params.minHeight != null &&
    params.maxHeight != null &&
    (params.minHeight as number) > (params.maxHeight as number)
  ) {
    return {
      inferences,
      hasConflict: true,
      conflictMessage: `[${nodePath}] minHeight (${params.minHeight}) > maxHeight (${params.maxHeight}). Swap values or remove one.`,
    };
  }

  // ── 3.6. FILL sizing in non-auto-layout parent → downgrade to FIXED ──
  const effectiveLayoutMode =
    (params.layoutMode as string) ?? (inferences.find((i) => i.field === 'layoutMode')?.to as string | undefined);
  if (hasChildren && !effectiveLayoutMode) {
    for (const [idx, childDef] of (params.children as Record<string, unknown>[]).entries()) {
      const child = childDef as Record<string, unknown>;
      const childName = (child.name as string) ?? `child[${idx}]`;
      for (const axis of ['layoutSizingHorizontal', 'layoutSizingVertical'] as const) {
        if (child[axis] === 'FILL' || child[axis] === 'HUG') {
          inferences.push({
            path: `${nodePath} > ${childName}`,
            field: axis,
            from: child[axis] as string,
            to: 'FIXED',
            confidence: 'deterministic',
            reason: `parent has no auto-layout — ${child[axis]} sizing requires auto-layout parent, downgraded to FIXED`,
          });
          (child as Record<string, unknown>)[axis] = 'FIXED';
        }
      }
    }
  }

  // ── 4. Cross-level sizing validation ──
  // Detect when child declares FILL on an axis where parent HUGs (child would collapse to 0)
  if (hasChildren && effectiveLayoutMode) {
    const parentDir = effectiveLayoutMode;
    const isVertical = parentDir === 'VERTICAL';
    const parentHSizing = params.layoutSizingHorizontal as string | undefined;
    const parentVSizing = params.layoutSizingVertical as string | undefined;
    // Parent HUGs on cross-axis?
    const parentHugCross = isVertical ? parentHSizing === 'HUG' : parentVSizing === 'HUG';

    if (parentDir && parentHugCross) {
      for (const [idx, childDef] of (params.children as Record<string, unknown>[]).entries()) {
        const child = childDef as Record<string, unknown>;
        const childName = (child.name as string) ?? `child[${idx}]`;
        const crossField = isVertical ? 'layoutSizingHorizontal' : 'layoutSizingVertical';
        if (child[crossField] === 'FILL') {
          inferences.push({
            path: `${nodePath} > ${childName}`,
            field: crossField,
            from: 'FILL',
            to: 'HUG',
            confidence: 'deterministic',
            reason: `parent HUGs on cross-axis — FILL child would collapse to 0, downgraded to HUG`,
          });
          // Mutate child param so creation uses the corrected value
          (child as Record<string, unknown>)[crossField] = 'HUG';
        }
      }
    }
  }

  // ── 4.5. Nested layout direction warnings ──
  if (hasChildren && effectiveLayoutMode) {
    const parentDir = effectiveLayoutMode;
    for (const [idx, childDef] of (params.children as Record<string, unknown>[]).entries()) {
      const child = childDef as Record<string, unknown>;
      if ((child.type as string | undefined) !== 'frame' && (child.type as string | undefined) != null) continue;
      const childName = (child.name as string) ?? `child[${idx}]`;
      const childDir = child.layoutMode as string | undefined;

      // WRAP requires HORIZONTAL — catch mismatch before creation
      if (child.layoutWrap === 'WRAP' && childDir === 'VERTICAL') {
        return {
          inferences,
          hasConflict: true,
          conflictMessage: `[${nodePath} > ${childName}] layoutWrap:"WRAP" requires layoutMode:"HORIZONTAL" — Figma does not support wrapping in VERTICAL layout.`,
        };
      }

      // Same-direction nesting with conflicting alignment intent
      if (childDir === parentDir && child.primaryAxisAlignItems === 'SPACE_BETWEEN') {
        const childHasFixedDim = parentDir === 'VERTICAL' ? child.height != null : child.width != null;
        if (!childHasFixedDim) {
          inferences.push({
            path: `${nodePath} > ${childName}`,
            field: '_nestedLayout',
            from: `${parentDir} > ${childDir}`,
            to: 'SPACE_BETWEEN needs fixed dimension',
            confidence: 'ambiguous',
            reason: `same-direction nesting (${parentDir}→${childDir}) with SPACE_BETWEEN — child needs explicit ${parentDir === 'VERTICAL' ? 'height' : 'width'} to distribute content`,
          });
        }
      }
    }
  }

  // ── 4.55. SPACE_BETWEEN + FILL text + small siblings → downgrade to MIN ──
  // When a HORIZONTAL container uses SPACE_BETWEEN and has a [small, FILL, small] pattern
  // (e.g. icon + text + chevron), SPACE_BETWEEN causes itemSpacing to be ignored between
  // the small elements and the FILL element. Downgrade to MIN so itemSpacing works correctly.
  if (hasChildren && effectiveLayoutMode === 'HORIZONTAL' && params.primaryAxisAlignItems === 'SPACE_BETWEEN') {
    const childrenArr = params.children as Record<string, unknown>[];
    if (childrenArr.length >= 3) {
      const hasFillChild = childrenArr.some((c) => c.layoutSizingHorizontal === 'FILL');
      const smallFixedCount = childrenArr.filter((c) => {
        const w = c.width as number | undefined;
        const h = c.height as number | undefined;
        // Both dimensions must be small (or only one specified and it's small)
        const wSmall = w == null || w <= 32;
        const hSmall = h == null || h <= 32;
        const hasDim = w != null || h != null;
        const isSmall = hasDim && wSmall && hSmall;
        const isIcon = (c.type as string) === 'icon' || (c.type as string) === 'svg';
        return isSmall || isIcon;
      }).length;

      if (hasFillChild && smallFixedCount >= 2) {
        inferences.push({
          path: nodePath,
          field: 'primaryAxisAlignItems',
          from: 'SPACE_BETWEEN',
          to: 'MIN',
          confidence: 'deterministic',
          reason:
            'SPACE_BETWEEN with [small, FILL, small] children pattern (e.g. icon + text + chevron) — itemSpacing is ignored between FILL and siblings. Downgraded to MIN so itemSpacing controls gaps correctly.',
        });
        params.primaryAxisAlignItems = 'MIN';
      }
    }
  }

  // ── 4.56. SPACE_BETWEEN + single child → FILL on primary axis ──
  // A single HUG child under SPACE_BETWEEN defeats the distribution intent.
  if (hasChildren && params.primaryAxisAlignItems === 'SPACE_BETWEEN') {
    const childrenArr = params.children as Record<string, unknown>[];
    if (childrenArr.length === 1) {
      const child = childrenArr[0];
      const isVertical = effectiveLayoutMode === 'VERTICAL';
      const sizingField = isVertical ? 'layoutSizingVertical' : 'layoutSizingHorizontal';
      if (child[sizingField] == null) {
        const childName = (child.name as string) ?? 'child';
        inferences.push({
          path: `${nodePath} > ${childName}`,
          field: sizingField,
          from: undefined,
          to: 'FILL',
          confidence: 'deterministic',
          reason: 'single child under SPACE_BETWEEN parent — FILL to stretch (HUG defeats SPACE_BETWEEN)',
        });
        child[sizingField] = 'FILL';
      }
    }
  }

  // ── 4.57. Input field pattern: [icon, text, icon] → middle text FILL ──
  // In HORIZONTAL layouts with exactly 3 children where the first and last are small
  // (icons/svgs/small frames) and the middle is text, the text should FILL to push
  // the trailing icon to the right edge. Common in input fields (e.g. lock + password + eye).
  if (hasChildren && effectiveLayoutMode === 'HORIZONTAL') {
    const childrenArr = params.children as Record<string, unknown>[];
    if (childrenArr.length === 3) {
      const isSmallOrIcon = (c: Record<string, unknown>) => {
        const t = c.type as string | undefined;
        if (t === 'icon' || t === 'svg') return true;
        const w = c.width as number | undefined;
        const h = c.height as number | undefined;
        const size = (c as Record<string, unknown>).size as number | undefined;
        return (w != null && w <= 32) || (h != null && h <= 32) || (size != null && size <= 32);
      };
      const first = childrenArr[0];
      const middle = childrenArr[1];
      const last = childrenArr[2];
      const middleType = (middle.type as string) ?? 'frame';
      const middleSizing = middle.layoutSizingHorizontal as string | undefined;

      if (isSmallOrIcon(first) && isSmallOrIcon(last) && middleType === 'text' && middleSizing == null) {
        const middleName = (middle.name as string) ?? 'child[1]';
        inferences.push({
          path: `${nodePath} > ${middleName}`,
          field: 'layoutSizingHorizontal',
          from: undefined,
          to: 'FILL',
          confidence: 'deterministic',
          reason: 'input field pattern [icon, text, icon] — middle text FILL to push trailing icon to right edge',
        });
        middle.layoutSizingHorizontal = 'FILL';

        // SPACE_BETWEEN + FILL text → itemSpacing is ignored (Figma distributes remaining space,
        // but FILL text consumes all of it → 0 gap). Downgrade to MIN so itemSpacing works.
        if (params.primaryAxisAlignItems === 'SPACE_BETWEEN') {
          inferences.push({
            path: nodePath,
            field: 'primaryAxisAlignItems',
            from: 'SPACE_BETWEEN',
            to: 'MIN',
            confidence: 'deterministic',
            reason:
              'SPACE_BETWEEN + FILL text child — itemSpacing is ignored because FILL consumes all remaining space. Downgraded to MIN so itemSpacing controls gaps.',
          });
          params.primaryAxisAlignItems = 'MIN';
        }
      }
    }
  }

  // ── 4.6. Spacer frame prevention ──
  // Detect children with spacer-like names and convert to parent itemSpacing.
  if (hasChildren) {
    const childrenArr = params.children as Record<string, unknown>[];
    const spacerIndices: number[] = [];
    for (const [idx, child] of childrenArr.entries()) {
      const name = child.name as string | undefined;
      const childHasChildren = Array.isArray(child.children) && (child.children as unknown[]).length > 0;
      if (name && SPACER_RE.test(name) && !childHasChildren) {
        spacerIndices.push(idx);
        const spacerDim = (child.height as number) ?? (child.width as number) ?? 0;
        if (spacerDim > 0 && params.itemSpacing == null) {
          params.itemSpacing = spacerDim;
          inferences.push({
            path: `${nodePath} > ${name}`,
            field: 'itemSpacing',
            from: undefined,
            to: spacerDim,
            confidence: 'deterministic',
            reason: `spacer "${name}" (${spacerDim}px) converted to parent itemSpacing`,
          });
        }
      }
    }
    for (const idx of spacerIndices.reverse()) {
      childrenArr.splice(idx, 1);
    }
  }

  // ── 5. Recursive children validation ──
  // Re-check children length since spacer prevention (step 4.5) may have removed entries.
  const remainingChildren = Array.isArray(params.children) && params.children.length > 0;
  if (remainingChildren) {
    for (const [idx, childDef] of (params.children as Record<string, unknown>[]).entries()) {
      const child = childDef as Record<string, unknown>;
      const childName = (child.name as string) ?? `child[${idx}]`;
      const childResult = validateParams(child, `${nodePath} > ${childName}`);
      inferences.push(...childResult.inferences);
      if (childResult.hasConflict) return childResult;
    }
  }

  // ── 6. Children structural pre-checks (detectable without creation) ──
  if (remainingChildren) {
    const parentWidth = params.width as number | undefined;
    const parentHeight = params.height as number | undefined;

    // ── 6.0. Primary-axis overflow auto-shrink ──
    // When a fixed-size parent has HORIZONTAL/VERTICAL layout and ALL children have fixed
    // dimensions on the primary axis, check if they overflow. If so, shrink proportionally.
    // Skip when clipsContent is true (designer intends scrolling/clipping).
    if (effectiveLayoutMode && params.clipsContent !== true) {
      const isHorizontal = effectiveLayoutMode === 'HORIZONTAL';
      const parentDim = isHorizontal ? parentWidth : parentHeight;
      const dimField = isHorizontal ? 'width' : 'height';
      const sizingField = isHorizontal ? 'layoutSizingHorizontal' : 'layoutSizingVertical';
      const padStart = isHorizontal
        ? ((params.paddingLeft ?? params.padding ?? 0) as number)
        : ((params.paddingTop ?? params.padding ?? 0) as number);
      const padEnd = isHorizontal
        ? ((params.paddingRight ?? params.padding ?? 0) as number)
        : ((params.paddingBottom ?? params.padding ?? 0) as number);

      if (parentDim != null) {
        const childrenArr = params.children as Record<string, unknown>[];
        const spacing = (params.itemSpacing ?? 0) as number;

        // Only trigger when ALL children have fixed dimensions (no FILL/HUG)
        const allFixed = childrenArr.every((c) => {
          const sizing = c[sizingField] as string | undefined;
          return c[dimField] != null && sizing !== 'FILL' && sizing !== 'HUG';
        });

        if (allFixed && childrenArr.length > 0) {
          const totalChildDim = childrenArr.reduce((sum, c) => sum + (c[dimField] as number), 0);
          const totalSpacing = spacing * Math.max(0, childrenArr.length - 1);
          const required = totalChildDim + totalSpacing + padStart + padEnd;

          if (required > parentDim + 1) {
            const available = parentDim - padStart - padEnd - totalSpacing;
            const ratio = available / totalChildDim;

            if (ratio >= 0.5) {
              // Proportionally shrink each child
              for (const child of childrenArr) {
                const original = child[dimField] as number;
                const shrunk = Math.floor(original * ratio);
                child[dimField] = shrunk;
                const childName = (child.name as string) ?? dimField;
                inferences.push({
                  path: `${nodePath} > ${childName}`,
                  field: dimField,
                  from: original,
                  to: shrunk,
                  confidence: 'deterministic',
                  reason: `children total ${dimField} (${Math.round(required)}px) exceeds parent (${parentDim}px) — shrunk proportionally to fit`,
                });
              }
            } else {
              // Shrink too aggressive (>50%) — warn instead
              inferences.push({
                path: nodePath,
                field: `_${dimField}Overflow`,
                from: required,
                to: parentDim,
                confidence: 'ambiguous',
                reason: `children total ${dimField} (${Math.round(required)}px) exceeds parent (${parentDim}px) by more than 2× — reduce child count or ${dimField}s manually`,
              });
            }
          }
        }
      }
    }

    for (const [idx, childDef] of (params.children as Record<string, unknown>[]).entries()) {
      const child = childDef as Record<string, unknown>;
      const childName = (child.name as string) ?? `child[${idx}]`;
      const childPath = `${nodePath} > ${childName}`;
      const ct = (child.type as string) ?? 'frame';

      // Unknown param detection with corrective suggestions
      inferences.push(...warnUnknownChildParams(child, ct, childPath));

      // Text: WIDTH_AND_HEIGHT in fixed-width parent → will auto-heal to HEIGHT
      if (ct === 'text' && child.textAutoResize === 'WIDTH_AND_HEIGHT' && parentWidth != null) {
        inferences.push({
          path: childPath,
          field: 'textAutoResize',
          from: 'WIDTH_AND_HEIGHT',
          to: 'HEIGHT',
          confidence: 'deterministic',
          reason: 'text in fixed-width parent — WIDTH_AND_HEIGHT may overflow, will auto-heal to HEIGHT',
        });
      }

      // Frame: no visual content and no children → will be invisible
      // Intentional placeholder frames (icon slots, logo containers, avatar placeholders)
      // are downgraded to deterministic so they don't trigger staging — the workflow
      // recommends creating empty frames first and filling them with icon_create later.
      if (ct === 'frame') {
        const noFills = child.fill == null && child.fills == null && child.fillVariableName == null;
        const noStrokes = child.stroke == null && child.strokes == null;
        const noChildren = !Array.isArray(child.children) || (child.children as unknown[]).length === 0;
        if (noFills && noStrokes && noChildren) {
          const nameLC = ((child.name as string) ?? '').toLowerCase();
          const isIntentionalSlot = /slot|icon|logo|avatar|placeholder|image|thumb/.test(nameLC);
          inferences.push({
            path: childPath,
            field: '_structure',
            from: undefined,
            to: 'invisible',
            confidence: isIntentionalSlot ? 'deterministic' : 'ambiguous',
            reason: isIntentionalSlot
              ? `empty placeholder frame "${child.name}" — will be filled post-creation (e.g. icon_create)`
              : 'empty frame with no fills/strokes/children — will be invisible',
          });
        }
      }

      // Frame: clipsContent + large padding on fixed-size frame → children may be clipped
      if (ct === 'frame' && child.clipsContent === true) {
        const cw = child.width as number | undefined;
        const ch = child.height as number | undefined;
        const pt = (child.paddingTop ?? child.padding ?? 0) as number;
        const pb = (child.paddingBottom ?? child.padding ?? 0) as number;
        const pl = (child.paddingLeft ?? child.padding ?? 0) as number;
        const pr = (child.paddingRight ?? child.padding ?? 0) as number;
        if (cw != null && pl + pr >= cw * 0.8) {
          inferences.push({
            path: childPath,
            field: '_structure',
            from: `padding H: ${pl}+${pr}=${pl + pr}`,
            to: `available width: ${cw - pl - pr}px`,
            confidence: 'ambiguous',
            reason: `clipsContent:true with horizontal padding consuming ≥80% of width (${pl + pr}/${cw}px) — children may be invisible`,
          });
        }
        if (ch != null && pt + pb >= ch * 0.8) {
          inferences.push({
            path: childPath,
            field: '_structure',
            from: `padding V: ${pt}+${pb}=${pt + pb}`,
            to: `available height: ${ch - pt - pb}px`,
            confidence: 'ambiguous',
            reason: `clipsContent:true with vertical padding consuming ≥80% of height (${pt + pb}/${ch}px) — children may be invisible`,
          });
        }
      }

      // Text: fontSize < 12 → below mobile readability
      if (ct === 'text' && child.fontSize != null && (child.fontSize as number) < 12) {
        inferences.push({
          path: childPath,
          field: 'fontSize',
          from: child.fontSize,
          to: child.fontSize,
          confidence: 'deterministic',
          reason: `fontSize ${child.fontSize} below mobile minimum (12px) — may be intentional`,
        });
      }
    }
  }

  return { inferences, hasConflict: false };
}

/**
 * Convert structured hints directly to Inference objects — no regex parsing needed.
 */
export function structuredHintsToInferences(hints: StructuredHint[], nodePath: string): Inference[] {
  return hints
    .filter((h) => INFERRED_FIELDS.has(h.field))
    .map((h) => ({
      path: h.path ?? nodePath,
      field: h.field,
      from: undefined,
      to: h.value,
      confidence: h.confidence,
      reason: h.reason,
    }));
}

/**
 * Collect inferences from the hints array produced by inferLayoutMode/inferChildSizing.
 * Parses the `[confidence] field → "value" (reason)` format used in write-nodes.ts.
 * @deprecated Use structuredHintsToInferences with StructuredHint[] instead.
 */
export function parseHintsToInferences(hints: string[], nodePath: string): Inference[] {
  const inferences: Inference[] = [];
  const hintPattern = /^\[(deterministic|ambiguous)\]\s+(\S+?)(?:\s*→\s*"([^"]*)")?\s*(?:\((.+)\))?$/;

  for (const hint of hints) {
    const match = hint.match(hintPattern);
    if (!match) continue;

    const [, confidence, rawField, value, reason] = match;
    // Normalize field: "inferred layoutMode:\"VERTICAL\"" → field=layoutMode, to=VERTICAL
    let field = rawField;
    let to: unknown = value;

    if (rawField.startsWith('inferred ')) {
      const colonIdx = rawField.indexOf(':');
      if (colonIdx > 0) {
        field = rawField.substring(9, colonIdx); // skip "inferred "
        to = rawField.substring(colonIdx + 1).replace(/"/g, '');
      } else {
        field = rawField.substring(9);
      }
    }

    // Handle "inferred layoutMode:"VERTICAL"" format
    if (hint.includes('inferred layoutMode')) {
      field = 'layoutMode';
      const modeMatch = hint.match(/"(VERTICAL|HORIZONTAL)"/);
      if (modeMatch) to = modeMatch[1];
    }

    // Handle layoutSizingHorizontal/Vertical → "FILL"/"HUG"
    if (field === 'layoutSizingHorizontal' || field === 'layoutSizingVertical') {
      // value already captured
    }

    if (INFERRED_FIELDS.has(field)) {
      inferences.push({
        path: nodePath,
        field,
        from: undefined,
        to: to ?? value,
        confidence: confidence as 'deterministic' | 'ambiguous',
        reason: reason ?? hint,
      });
    }
  }

  return inferences;
}
