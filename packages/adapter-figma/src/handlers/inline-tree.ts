/**
 * Inline tree validation — inference tracking & correctedPayload feedback.
 *
 * When create_frame detects ambiguous parameter combinations,
 * it returns _correctedPayload + _diff so the AI learns the correct usage.
 */

import type { StructuredHint } from '../utils/hint-aggregator.js';
import { SPACER_RE } from '@figcraft/quality-engine';

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
  const ambiguous = inferences.filter(i => i.confidence === 'ambiguous');
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

/** Fields that may be inferred during creation. */
const INFERRED_FIELDS = new Set([
  'layoutMode', 'layoutSizingHorizontal', 'layoutSizingVertical',
]);

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
      const childInferences = inferences.filter(inf => {
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

  return corrected;
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
export function validateParams(
  params: Record<string, unknown>,
  nodePath: string,
): PreValidationResult {
  const inferences: Inference[] = [];

  // Only validate frame-type nodes (not text, rectangle, ellipse)
  const childType = (params.type as string) ?? 'frame';
  if (childType !== 'frame') {
    return { inferences, hasConflict: false };
  }

  // Shared checks used by multiple validation steps
  const hasALParams =
    params.itemSpacing != null || params.paddingTop != null || params.paddingRight != null ||
    params.paddingBottom != null || params.paddingLeft != null || params.padding != null ||
    params.primaryAxisAlignItems != null || params.counterAxisAlignItems != null ||
    (params.layoutWrap != null && params.layoutWrap !== 'NO_WRAP');
  const hasChildren = Array.isArray(params.children) && params.children.length > 0;
  const hasHUGSizing =
    params.layoutSizingHorizontal === 'HUG' || params.layoutSizingVertical === 'HUG';

  // ── 0. Auto-downgrade: empty frame with fixed size but no layout → rectangle ──
  const hasFixedSize = params.width != null || params.height != null;
  if (!hasChildren && hasFixedSize && params.layoutMode == null && !hasALParams) {
    inferences.push({
      path: nodePath,
      field: 'type',
      from: 'frame',
      to: 'rectangle',
      confidence: 'deterministic',
      reason: 'empty frame with fixed size and no layout — auto-downgraded to rectangle (avoids HUG error in auto-layout parents)',
    });
    params.type = 'rectangle';
    return { inferences, hasConflict: false };
  }

  // ── 1. layoutMode conflict detection ──

  if (params.layoutMode === 'NONE' && (hasALParams || hasHUGSizing)) {
    const conflicting = [
      hasALParams && 'padding/spacing/alignment',
      hasHUGSizing && 'HUG sizing',
    ].filter(Boolean).join(' and ');
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
      const childrenNeedAL = (params.children as Record<string, unknown>[]).some(c => {
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
    inferences.push({
      path: nodePath,
      field: 'layoutMode',
      from: undefined,
      to: 'VERTICAL',
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

  // ── 4. Cross-level sizing validation ──
  // Detect when child declares FILL on an axis where parent HUGs (child would collapse to 0)
  const effectiveLayoutMode = (params.layoutMode as string) ??
    (inferences.find(i => i.field === 'layoutMode')?.to as string | undefined);
  if (hasChildren && effectiveLayoutMode) {
    const parentDir = effectiveLayoutMode;
    const isVertical = parentDir === 'VERTICAL';
    const parentHSizing = params.layoutSizingHorizontal as string | undefined;
    const parentVSizing = params.layoutSizingVertical as string | undefined;
    // Parent HUGs on cross-axis?
    const parentHugCross = isVertical
      ? parentHSizing === 'HUG'
      : parentVSizing === 'HUG';

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

  // ── 4.5. Spacer frame prevention ──
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
    for (const [idx, childDef] of (params.children as Record<string, unknown>[]).entries()) {
      const child = childDef as Record<string, unknown>;
      const childName = (child.name as string) ?? `child[${idx}]`;
      const childPath = `${nodePath} > ${childName}`;
      const ct = (child.type as string) ?? 'frame';

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
      if (ct === 'frame') {
        const noFills = child.fill == null && child.fills == null && child.fillVariableName == null;
        const noStrokes = child.stroke == null && child.strokes == null;
        const noChildren = !Array.isArray(child.children) || (child.children as unknown[]).length === 0;
        if (noFills && noStrokes && noChildren) {
          inferences.push({
            path: childPath,
            field: '_structure',
            from: undefined,
            to: 'invisible',
            confidence: 'ambiguous',
            reason: 'empty frame with no fills/strokes/children — will be invisible',
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
    .filter(h => INFERRED_FIELDS.has(h.field))
    .map(h => ({
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
