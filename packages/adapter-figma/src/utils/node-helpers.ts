/**
 * Shared node creation helpers — extracted from write-nodes.ts to eliminate duplication.
 *
 * These functions encapsulate common patterns used across standalone handlers
 * and the batch node creation pipeline.
 */

import { registerCache } from './cache-manager.js';
import { hexToFigmaRgb } from './color.js';
import {
  AmbiguousMatchError,
  autoBindDefault,
  autoBindStrokeDefault,
  findColorVariableById,
  findColorVariableByName,
  findFloatVariableByName,
  findVariableByIdAny,
  ResolvedTypeMismatchError,
  ScopeMismatchError,
  suggestColorVariable,
  suggestSimilarVariableNames,
} from './design-context.js';
import { ensureLoaded, findClosestPaintStyle, getAvailablePaintStyleNames, getPaintStyleId } from './style-registry.js';

// ─── FLOAT variable scope mapping ───
// Maps node property names to Figma variable scopes for scope-aware auto-bind.

const FIELD_TO_SCOPE: Record<string, string> = {
  cornerRadius: 'CORNER_RADIUS',
  topLeftRadius: 'CORNER_RADIUS',
  topRightRadius: 'CORNER_RADIUS',
  bottomRightRadius: 'CORNER_RADIUS',
  bottomLeftRadius: 'CORNER_RADIUS',
  itemSpacing: 'GAP',
  counterAxisSpacing: 'GAP',
  paddingTop: 'GAP',
  paddingRight: 'GAP',
  paddingBottom: 'GAP',
  paddingLeft: 'GAP',
  strokeWeight: 'STROKE_FLOAT',
  strokeTopWeight: 'STROKE_FLOAT',
  strokeBottomWeight: 'STROKE_FLOAT',
  strokeLeftWeight: 'STROKE_FLOAT',
  strokeRightWeight: 'STROKE_FLOAT',
  opacity: 'OPACITY',
  // Extended scopes for broader variable auto-bind coverage
  width: 'WIDTH_HEIGHT',
  height: 'WIDTH_HEIGHT',
  minWidth: 'WIDTH_HEIGHT',
  minHeight: 'WIDTH_HEIGHT',
  fontSize: 'FONT_SIZE',
  fontWeight: 'FONT_WEIGHT',
  lineHeight: 'LINE_HEIGHT',
  letterSpacing: 'LETTER_SPACING',
  paragraphSpacing: 'PARAGRAPH_SPACING',
  paragraphIndent: 'PARAGRAPH_INDENT',
};

// ─── FLOAT variable cache ───
// Cache local FLOAT variables + collection default modes to avoid repeated API calls.
let _floatVarCache: { vars: Variable[]; defaultModes: Map<string, string>; ts: number } | null = null;
const FLOAT_CACHE_TTL_MS = 30_000;

async function getFloatVarsWithModes(): Promise<{ vars: Variable[]; defaultModes: Map<string, string> }> {
  const now = Date.now();
  if (_floatVarCache && now - _floatVarCache.ts < FLOAT_CACHE_TTL_MS) {
    return _floatVarCache;
  }
  const [vars, collections] = await Promise.all([
    figma.variables.getLocalVariablesAsync('FLOAT'),
    figma.variables.getLocalVariableCollectionsAsync(),
  ]);
  const defaultModes = new Map(collections.map((c) => [c.id, c.defaultModeId]));
  _floatVarCache = { vars, defaultModes, ts: now };
  return _floatVarCache;
}

/**
 * Match a numeric value against existing local FLOAT variables by value + Figma scope.
 * Returns the matched variable or null.
 */
async function matchFloatVariable(numericValue: number, field: string): Promise<Variable | null> {
  if (numericValue === 0) return null; // 0 is too common to match
  const scope = FIELD_TO_SCOPE[field];
  if (!scope) return null;
  const { vars, defaultModes } = await getFloatVarsWithModes();
  if (vars.length === 0) return null;

  for (const v of vars) {
    const modeId = defaultModes.get(v.variableCollectionId);
    if (!modeId) continue;
    const val = v.valuesByMode[modeId];
    if (typeof val !== 'number' || val !== numericValue) continue;
    const scopes: string[] = (v as any).scopes || [];
    // Require explicit scope match — ALL_SCOPES alone is not enough
    if (scopes.includes(scope)) return v;
  }
  return null;
}

/**
 * Apply a numeric token field to a node property with scope-aware FLOAT variable auto-bind.
 * If the value matches an existing FLOAT variable with the correct scope, binds it.
 * Otherwise sets the hardcoded numeric value.
 *
 * When value is a string, it is treated as a variable name and looked up directly.
 *
 * @returns bound variable name if auto-bound, null if hardcoded
 */
export async function applyTokenField(
  node: SceneNode,
  field: string,
  value: number | string | undefined,
  budgetExceeded?: () => boolean,
  library?: string,
): Promise<string | null> {
  if (value == null || !(field in node)) return null;
  if (budgetExceeded?.()) {
    if (typeof value === 'number') (node as any)[field] = value;
    return null;
  }

  // String value → look up FLOAT variable by name with scope-aware resolution
  if (typeof value === 'string') {
    const scope = FIELD_TO_SCOPE[field];
    try {
      const variable = await findFloatVariableByName(value, scope ? [scope] : undefined, library);
      if (variable) {
        try {
          (node as SceneNode).setBoundVariable(field as VariableBindableNodeField, variable);
          return variable.name;
        } catch {
          /* binding not supported — ignore */
        }
      }
    } catch {
      /* ambiguous variable name — fall through to numeric parse */
    }
    // String didn't resolve to a variable — try parsing as number
    const parsed = parseFloat(value);
    if (!Number.isNaN(parsed)) {
      (node as any)[field] = parsed;
    }
    return null;
  }

  const matched = await matchFloatVariable(value, field);
  if (matched) {
    try {
      (node as SceneNode).setBoundVariable(field as VariableBindableNodeField, matched);
      return matched.name;
    } catch {
      // Binding not supported for this field — fall through to hardcoded
    }
  }
  (node as any)[field] = value;
  return null;
}

/**
 * Apply multiple token fields at once. Returns array of bound variable descriptions.
 */
export async function applyTokenFields(
  node: SceneNode,
  fields: Record<string, number | undefined>,
  budgetExceeded?: () => boolean,
  library?: string,
): Promise<string[]> {
  const bound: string[] = [];
  for (const [field, value] of Object.entries(fields)) {
    const name = await applyTokenField(node, field, value, budgetExceeded, library);
    if (name) bound.push(`${field}:${name}`);
  }
  return bound;
}

/** Clear the FLOAT variable cache (e.g. on library switch). */
export function clearFloatVarCache(): void {
  _floatVarCache = null;
}

// Register with centralized cache manager
registerCache('float-var', clearFloatVarCache);

// ─── Fill input types ───

/**
 * Fill can be specified in 5 formats:
 * 1. hex string: "#FF0000"
 * 2. { _variable: "name" } — look up COLOR variable by name (3-level resolution)
 * 3. { _variableId: "VariableID:123:456" } — bind COLOR variable by ID directly
 * 4. { _style: "name" } — look up Paint Style by name
 * 5. Paint[] array — apply raw Figma paint array directly
 */
export type FillInput = string | { _variable: string } | { _variableId: string } | { _style: string } | Paint[];

/** Type guard: is the fill input a variable name reference? */
function isFillVariable(fill: FillInput): fill is { _variable: string } {
  return typeof fill === 'object' && !Array.isArray(fill) && '_variable' in fill;
}

/** Type guard: is the fill input a variable ID reference? */
function isFillVariableId(fill: FillInput): fill is { _variableId: string } {
  return typeof fill === 'object' && !Array.isArray(fill) && '_variableId' in fill;
}

/** Type guard: is the fill input a style reference? */
function isFillStyle(fill: FillInput): fill is { _style: string } {
  return typeof fill === 'object' && !Array.isArray(fill) && '_style' in fill;
}

/** Type guard: is the fill input a raw Paint array? */
function isFillPaintArray(fill: FillInput): fill is Paint[] {
  return Array.isArray(fill);
}

/** Check if a string looks like a hex color (e.g. "#FF0000", "#fff", "#FF000080"). */
function isHexColor(s: string): boolean {
  return /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s);
}

/**
 * Clear any existing fill style before variable binding to prevent Figma override conflicts.
 * When a node has a fillStyleId set, binding a variable to the paint won't take effect
 * because Figma prioritizes the style. Clearing it first ensures the variable binding sticks.
 */
async function clearFillStyle(node: SceneNode): Promise<void> {
  try {
    if ('fillStyleId' in node && (node as any).fillStyleId) {
      await (node as any).setFillStyleIdAsync('');
    }
  } catch {
    /* best effort */
  }
}

/**
 * Clear any existing stroke style before variable binding (same rationale as clearFillStyle).
 */
async function clearStrokeStyle(node: SceneNode): Promise<void> {
  try {
    if ('strokeStyleId' in node && (node as any).strokeStyleId) {
      await (node as any).setStrokeStyleIdAsync('');
    }
  } catch {
    /* best effort */
  }
}

// ─── Fill application ───

export interface TokenBindingFailure {
  requested: string;
  type: 'variable' | 'style';
  action: 'skipped' | 'used_fallback' | 'scope-mismatch' | 'ambiguous';
}

export interface ApplyFillResult {
  autoBound: string | null;
  /** Resolved variable ID — set only when binding succeeded via NAME (not ID). */
  autoBoundId?: string;
  /** Hint for agent self-correction when no exact match found */
  colorHint?: string;
  /** Structured failure info when token binding fails */
  bindingFailure?: TokenBindingFailure;
}

/** Stroke application result — mirrors ApplyFillResult for consistency. */
export interface ApplyStrokeResult {
  autoBound: string | null;
  autoBoundId?: string;
  colorHint?: string;
  bindingFailure?: TokenBindingFailure;
}

/**
 * Build a descriptive colorHint from an AmbiguousMatchError for agent self-correction.
 * Lists the candidate variable names so the agent can re-request with a fully
 * qualified path (e.g. `"text/primary"` instead of `"primary"`). Shared between
 * applyFill and applyStroke.
 */
function formatAmbiguousMatchHint(err: AmbiguousMatchError, requestedName: string): string {
  const shown = err.candidates
    .slice(0, 6)
    .map((n) => `"${n}"`)
    .join(', ');
  const more = err.candidates.length > 6 ? ` (+${err.candidates.length - 6} more)` : '';
  return (
    `⛔ Variable name "${requestedName}" is ambiguous: ${err.candidates.length} candidates match ` +
    `[${shown}]${more}. Re-request with a fully qualified path (e.g. "text/primary" instead of "primary").`
  );
}

/**
 * Build a descriptive colorHint from a ScopeMismatchError for agent self-correction.
 * Role-aware suggestions tell the agent which variable prefix to try instead.
 * Shared between applyFill and applyStroke to keep the message style identical.
 */
function formatScopeMismatchHint(
  err: ScopeMismatchError,
  requestedName: string,
  role: 'background' | 'textColor' | 'border' | 'stroke',
  requiredScopes: string[],
): string {
  const rejected = err.rejected.map((r) => `"${r.name}" (scopes: [${r.scopes.join(', ')}])`).join(', ');
  const roleHint =
    role === 'textColor'
      ? ' For text nodes use a text/* variable (e.g. "text/primary").'
      : role === 'background'
        ? ' For frame/shape fills use a surface/*, background/*, or fill/* variable.'
        : role === 'border' || role === 'stroke'
          ? ' For strokes use a border/* variable with STROKE_COLOR scope.'
          : '';
  const searchQuery =
    role === 'textColor' ? 'text color' : role === 'border' || role === 'stroke' ? 'border' : 'surface color';
  return (
    `⛔ Variable "${requestedName}" exists in library but its scope(s) exclude ${role} ` +
    `(required: [${requiredScopes.join(', ')}]). Rejected: ${rejected}.${roleHint} ` +
    `Call search_design_system(query:"${searchQuery}") to discover alternatives.`
  );
}

/**
 * Build a descriptive colorHint from a ResolvedTypeMismatchError for agent self-correction.
 *
 * Fired when a name lookup found variables under the requested name but all with
 * the wrong resolvedType (e.g. agent passes `fillVariableName: "button/emphasis"`
 * expecting COLOR, but only FLOAT CORNER_RADIUS token exists). This message names
 * the actual type, the collection it lives in, and — critically — which parameter
 * to use instead (cornerRadius for FLOAT+CORNER_RADIUS scope, etc.).
 *
 * Shared between applyFill, applyStroke, and numeric token binding paths. See
 * memory file `feedback_p02_resolvedtype_mismatch.md`.
 */
function formatResolvedTypeMismatchHint(
  err: ResolvedTypeMismatchError,
  requestedName: string,
  role: 'background' | 'textColor' | 'border' | 'stroke' | 'radius' | 'spacing',
): string {
  const found = err.found
    .slice(0, 5)
    .map((f) => {
      const scope = f.scopes.length > 0 ? `, scopes: [${f.scopes.join(', ')}]` : '';
      const coll = f.collection ? `, in "${f.collection}"` : '';
      return `"${f.name}" (type: ${f.resolvedType}${scope}${coll})`;
    })
    .join('; ');

  // Build a concrete "use X instead" pointer based on the actual resolvedType found.
  const floatMatches = err.found.filter((f) => f.resolvedType === 'FLOAT');
  const colorMatches = err.found.filter((f) => f.resolvedType === 'COLOR');

  let suggestion = '';
  if (err.requestedType === 'COLOR' && floatMatches.length > 0) {
    // The most common case: agent wanted a color but the name is a FLOAT token.
    const hasRadiusScope = floatMatches.some((f) => f.scopes.includes('CORNER_RADIUS'));
    const hasGapScope = floatMatches.some((f) => f.scopes.includes('GAP') || f.scopes.includes('WIDTH_HEIGHT'));
    if (hasRadiusScope) {
      suggestion = ` If this is a radius token, use cornerRadius:"${requestedName}" instead of ${role === 'stroke' ? 'strokeVariableName' : 'fillVariableName'}.`;
    } else if (hasGapScope) {
      suggestion = ` If this is a spacing token, use itemSpacing/padding* with the value directly, or cornerRadius etc. — not ${role === 'stroke' ? 'strokeVariableName' : 'fillVariableName'}.`;
    } else {
      suggestion = ` This name maps to a FLOAT variable — use it with a numeric field (cornerRadius, itemSpacing, padding*), not a paint field.`;
    }
  } else if (err.requestedType === 'FLOAT' && colorMatches.length > 0) {
    suggestion = ` This name is a COLOR variable — use it with fillVariableName / strokeVariableName / fontColorVariableName, not a numeric field.`;
  }

  const searchTypeHint = `variables_ep(method:"list", type:"${err.requestedType}")`;
  return (
    `⛔ Variable "${requestedName}" exists but its resolvedType is wrong for this binding. ` +
    `Requested ${err.requestedType}, found: ${found}.${suggestion} ` +
    `Run ${searchTypeHint} to list only correctly-typed candidates.`
  );
}

/**
 * P2 helper — append a "Did you mean: X, Y, Z?" suffix to a not-found hint
 * using fuzzy matching over local COLOR/FLOAT variables. Silent on failure.
 */
async function withDidYouMean(hint: string, requestedName: string, type: 'COLOR' | 'FLOAT' = 'COLOR'): Promise<string> {
  const suggestions = await suggestSimilarVariableNames(requestedName, type, 3);
  if (suggestions.length === 0) return hint;
  return `${hint} Did you mean: ${suggestions.map((n) => `"${n}"`).join(', ')}?`;
}

// Hot magenta sentinel: on text-role binding failure, replace Figma's default
// SOLID BLACK with this so the failure is visible in screenshots instead of
// blending into a dark background. Scoped to text roles — frame/border keep
// their defaults to avoid false positives on intentional no-fill surfaces.
export const SENTINEL_TEXT_FAIL_FILL: SolidPaint = { type: 'SOLID', color: { r: 1, g: 0, b: 0.831 } };
const SENTINEL_TEXT_ROLES = new Set(['textColor', 'headingColor', 'textSecondary']);
const SENTINEL_HINT_PREFIX = '⚠️ Sentinel magenta applied (token binding failed) — ';

/**
 * Wrap an ApplyFillResult failure return with the text sentinel. No-op when
 * autoBound !== null, when role is not a text role, or when bindingFailure is
 * absent (non-token input error — leave untouched).
 */
export function withSentinel(
  result: ApplyFillResult,
  node: SceneNode & MinimalFillsMixin,
  role: string,
): ApplyFillResult {
  if (result.autoBound !== null || !result.bindingFailure) return result;
  if (!SENTINEL_TEXT_ROLES.has(role)) return result;
  try {
    node.fills = [SENTINEL_TEXT_FAIL_FILL];
  } catch {
    return result;
  }
  const base = result.colorHint ?? `Binding failed for "${result.bindingFailure.requested}".`;
  return { ...result, colorHint: SENTINEL_HINT_PREFIX + base };
}

/**
 * Apply a fill to a node: hex color → solid paint, then try to match a Paint Style.
 * If no fill is specified and library mode is active, auto-bind the default color variable.
 * If no fill and no library, clear the default white fill.
 *
 * Supports 5 input formats:
 * - hex string: "#FF0000" → solid paint + style/variable auto-match
 * - { _variable: "colors/primary" } → look up COLOR variable by name (3-level resolution) and bind
 * - { _variableId: "VariableID:123:456" } → bind COLOR variable by ID directly
 * - { _style: "Primary/500" } → look up Paint Style by name and apply
 * - Paint[] array → apply raw Figma paint array directly
 *
 * Enhanced with error self-correction: when a hardcoded color has no exact style match,
 * returns a hint with the closest match or available style names so the agent can adjust.
 */
export async function applyFill(
  node: SceneNode & MinimalFillsMixin,
  fill: FillInput | undefined,
  role: string,
  useLibrary: boolean,
  library: string | undefined,
  options?: { stylesPreloaded?: boolean; budgetExceeded?: () => boolean },
): Promise<ApplyFillResult> {
  let autoBound: string | null = null;
  let colorHint: string | undefined;
  const skip = options?.budgetExceeded ?? (() => false);

  // Handle Paint[] array — direct assignment, no binding
  if (fill && isFillPaintArray(fill)) {
    node.fills = fill;
    return { autoBound: null };
  }

  // Handle { _variableId: "id" } — direct variable binding by ID
  if (fill && isFillVariableId(fill)) {
    const variable = await findColorVariableById(fill._variableId);
    if (variable) {
      await clearFillStyle(node);
      node.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
      const fills = [...(node.fills as Paint[])];
      if (fills[0]) {
        fills[0] = figma.variables.setBoundVariableForPaint(fills[0] as SolidPaint, 'color', variable);
        node.fills = fills;
        autoBound = `var:${variable.name}`;
      }
      return { autoBound, colorHint };
    }
    // 缺陷 D / P0-2: distinguish "variable does not exist" from
    // "variable exists but has the wrong resolvedType" (e.g. a FLOAT radius
    // variable passed where a COLOR was expected). The self-correcting hint
    // names the actual type and suggests the right parameter.
    const raw = await findVariableByIdAny(fill._variableId);
    if (raw && raw.resolvedType !== 'COLOR') {
      colorHint =
        `⛔ Variable "${raw.name}" (ID ${fill._variableId}) is a ${raw.resolvedType} variable, not a COLOR. ` +
        `${raw.resolvedType === 'FLOAT' ? 'Pass it to numeric fields (cornerRadius, itemSpacing, padding*) via their *VariableId params, not fill.' : ''}` +
        `Use a COLOR variable ID for fill. Run variables_ep(method:"list", type:"COLOR") to see available color variables.`;
      return withSentinel(
        {
          autoBound: null,
          colorHint,
          bindingFailure: { requested: fill._variableId, type: 'variable', action: 'skipped' },
        },
        node,
        role,
      );
    }
    // Not found at all — list a few local COLOR candidates so the agent has
    // concrete next-step options instead of a dead-end "not found" message.
    let candidates = '';
    try {
      const locals = await figma.variables.getLocalVariablesAsync('COLOR');
      if (locals.length > 0) {
        const sample = locals
          .slice(0, 5)
          .map((v) => `"${v.name}" (${v.id})`)
          .join(', ');
        candidates = ` Sample local COLOR variables: ${sample}.`;
      }
    } catch {
      /* best effort */
    }
    colorHint =
      `⛔ Variable ID "${fill._variableId}" not found. ` +
      `Possible causes: (a) ID typo, (b) variable from an unsubscribed library, (c) ID refers to a deleted variable.${candidates} ` +
      `Run variables_ep(method:"list", type:"COLOR") to enumerate all COLOR variables, or pass fillVariableName:"<name>" to look up by name.`;
    return withSentinel(
      {
        autoBound: null,
        colorHint,
        bindingFailure: { requested: fill._variableId, type: 'variable', action: 'skipped' },
      },
      node,
      role,
    );
  }

  // Handle { _variable: "name" } — variable binding with 3-level resolution
  if (fill && isFillVariable(fill)) {
    // Determine preferred scopes based on role for disambiguation
    const ROLE_SCOPE_HINTS: Record<string, string[]> = {
      background: ['ALL_FILLS', 'FRAME_FILL', 'SHAPE_FILL'],
      textColor: ['ALL_FILLS', 'TEXT_FILL'],
      border: ['STROKE_COLOR', 'ALL_SCOPES'],
    };
    // Track resolved variable ID for the "next time use fillVariableId" hint.
    let autoBoundId: string | undefined;
    try {
      const variable = await findColorVariableByName(fill._variable, ROLE_SCOPE_HINTS[role], library);
      if (variable) {
        await clearFillStyle(node);
        node.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
        const fills = [...(node.fills as Paint[])];
        if (fills[0]) {
          fills[0] = figma.variables.setBoundVariableForPaint(fills[0] as SolidPaint, 'color', variable);
          node.fills = fills;
          autoBound = `var:${variable.name}`;
          autoBoundId = variable.id;
        }
      } else {
        // P0-2 parallel: same diagnostic style as the bare-string fill fall-through
        // path below (the `"${fill}" is not a hex color` branch). This path hits when
        // the user passes fill:{_variable:"..."} explicitly — lookup returned null
        // (not ScopeMismatchError / AmbiguousMatchError, handled in the catch block
        // above). Surface the 4 possible root causes + diagnostic tools.
        const libCtx = useLibrary ? `library "${library ?? 'unknown'}"` : 'local file';
        const baseHint =
          `⛔ Variable name "${fill._variable}" not found in ${libCtx}. ` +
          `Possible causes: (a) not yet published to the library, (b) in a collection not yet subscribed by this file, ` +
          `(c) name misspelled, or (d) it's a paint style name with no matching style. ` +
          `Verify with variables_ep(method:"list_collections") and variables_ep(method:"list"), or styles_ep(method:"list", type:"PAINT"). ` +
          `Workaround: pass fill:{_variableId:"VariableID:<id>"} to bind by ID directly, or call search_design_system(query:"${fill._variable}") to discover available variables.`;
        // P2: append did-you-mean suggestions from local COLOR variables.
        colorHint = await withDidYouMean(baseHint, fill._variable, 'COLOR');
        return withSentinel(
          {
            autoBound,
            colorHint,
            bindingFailure: { requested: fill._variable, type: 'variable', action: 'skipped' },
          },
          node,
          role,
        );
      }
    } catch (err) {
      // 缺陷 P1a: surface semantic errors with precise hints before falling back.
      if (err instanceof ScopeMismatchError) {
        return withSentinel(
          {
            autoBound: null,
            colorHint: formatScopeMismatchHint(
              err,
              fill._variable,
              role as 'background' | 'textColor' | 'border',
              ((): string[] => {
                const hints: Record<string, string[]> = {
                  background: ['ALL_FILLS', 'FRAME_FILL', 'SHAPE_FILL'],
                  textColor: ['ALL_FILLS', 'TEXT_FILL'],
                  border: ['STROKE_COLOR', 'ALL_SCOPES'],
                };
                return hints[role] ?? [];
              })(),
            ),
            bindingFailure: { requested: fill._variable, type: 'variable', action: 'scope-mismatch' },
          },
          node,
          role,
        );
      }
      if (err instanceof AmbiguousMatchError) {
        return withSentinel(
          {
            autoBound: null,
            colorHint: formatAmbiguousMatchHint(err, fill._variable),
            bindingFailure: { requested: fill._variable, type: 'variable', action: 'ambiguous' },
          },
          node,
          role,
        );
      }
      if (err instanceof ResolvedTypeMismatchError) {
        return withSentinel(
          {
            autoBound: null,
            colorHint: formatResolvedTypeMismatchHint(
              err,
              fill._variable,
              role as 'background' | 'textColor' | 'border',
            ),
            bindingFailure: { requested: fill._variable, type: 'variable', action: 'skipped' },
          },
          node,
          role,
        );
      }
      colorHint = err instanceof Error ? err.message : `Variable "${fill._variable}" lookup failed.`;
      return withSentinel(
        {
          autoBound,
          colorHint,
          bindingFailure: { requested: fill._variable, type: 'variable', action: 'skipped' },
        },
        node,
        role,
      );
    }
    return { autoBound, autoBoundId, colorHint };
  }

  // Handle { _style: "name" } — direct style binding
  if (fill && isFillStyle(fill)) {
    if (!options?.stylesPreloaded && useLibrary && library) await ensureLoaded(library);
    const paintMatch = getPaintStyleId(undefined, fill._style);
    if (paintMatch) {
      try {
        // Apply the style's paint as fill, then bind the style
        await (node as any).setFillStyleIdAsync(paintMatch.id);
        autoBound = `fill:${paintMatch.name}`;
      } catch (err) {
        colorHint = `Style "${fill._style}" found but failed to apply: ${err instanceof Error ? err.message : String(err)}`;
      }
    } else {
      const available = getAvailablePaintStyleNames(10);
      colorHint = `Style "${fill._style}" not found.${available.length > 0 ? ` Available: ${available.join(', ')}` : ''}`;
      return withSentinel(
        { autoBound, colorHint, bindingFailure: { requested: fill._style, type: 'style', action: 'skipped' } },
        node,
        role,
      );
    }
    return { autoBound, colorHint };
  }

  if (fill && typeof fill === 'string') {
    // Non-hex string → auto-detect as variable name or style name
    if (!isHexColor(fill)) {
      // Try as variable name first (3-level resolution)
      const ROLE_SCOPE_HINTS: Record<string, string[]> = {
        background: ['ALL_FILLS', 'FRAME_FILL', 'SHAPE_FILL'],
        textColor: ['ALL_FILLS', 'TEXT_FILL'],
        border: ['STROKE_COLOR', 'ALL_SCOPES'],
      };
      try {
        const variable = await findColorVariableByName(fill, ROLE_SCOPE_HINTS[role], library);
        if (variable) {
          await clearFillStyle(node);
          node.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
          const fills = [...(node.fills as Paint[])];
          if (fills[0]) {
            fills[0] = figma.variables.setBoundVariableForPaint(fills[0] as SolidPaint, 'color', variable);
            node.fills = fills;
            return { autoBound: `var:${variable.name}`, autoBoundId: variable.id };
          }
        }
      } catch (err) {
        // Semantic errors from the lookup chain — surface them instead of silently
        // falling through so the agent can self-correct in one round-trip.
        if (err instanceof ScopeMismatchError) {
          return withSentinel(
            {
              autoBound: null,
              colorHint: formatScopeMismatchHint(
                err,
                fill,
                role as 'background' | 'textColor' | 'border',
                ROLE_SCOPE_HINTS[role],
              ),
              bindingFailure: { requested: fill, type: 'variable', action: 'scope-mismatch' },
            },
            node,
            role,
          );
        }
        if (err instanceof AmbiguousMatchError) {
          return withSentinel(
            {
              autoBound: null,
              colorHint: formatAmbiguousMatchHint(err, fill),
              bindingFailure: { requested: fill, type: 'variable', action: 'ambiguous' },
            },
            node,
            role,
          );
        }
        if (err instanceof ResolvedTypeMismatchError) {
          return withSentinel(
            {
              autoBound: null,
              colorHint: formatResolvedTypeMismatchHint(err, fill, role as 'background' | 'textColor' | 'border'),
              bindingFailure: { requested: fill, type: 'variable', action: 'skipped' },
            },
            node,
            role,
          );
        }
        /* other variable lookup failure — try style */
      }
      // Try as style name
      if (useLibrary && library) {
        if (!options?.stylesPreloaded) await ensureLoaded(library);
        const paintMatch = getPaintStyleId(undefined, fill);
        if (paintMatch) {
          try {
            await (node as any).setFillStyleIdAsync(paintMatch.id);
            return { autoBound: `fill:${paintMatch.name}` };
          } catch {
            /* style apply failed */
          }
        }
      }
      // P0-2: diagnostic hint — the lookup returned null (not ScopeMismatchError /
      // AmbiguousMatchError, which are handled above with role-aware messages).
      // Root cause is one of: unpublished variable, unsubscribed collection,
      // misspelled name, or library cache miss. Surface all three possibilities
      // plus concrete next-step tools so the agent can self-diagnose.
      const libCtx = useLibrary ? `library "${library ?? 'unknown'}"` : 'local file';
      const baseHint =
        `⛔ Variable name "${fill}" not found in ${libCtx}. ` +
        `Possible causes: (a) not yet published to the library, (b) in a collection not yet subscribed by this file, ` +
        `(c) name misspelled, or (d) it's a paint style name with no matching style. ` +
        `Verify with variables_ep(method:"list_collections") and variables_ep(method:"list"), or styles_ep(method:"list", type:"PAINT"). ` +
        `Workaround: pass fillVariableId:"VariableID:<id>" to bind by ID directly.`;
      // P2: append did-you-mean suggestions from local COLOR variables.
      colorHint = await withDidYouMean(baseHint, fill, 'COLOR');
      // P0-A: this was the only failure path missing a structured bindingFailure,
      // so the harness token-binding-failures rule couldn't see it. Add it now so
      // the rule fires + the sentinel can wrap the return consistently.
      return withSentinel(
        {
          autoBound: null,
          colorHint,
          bindingFailure: { requested: fill, type: 'variable', action: 'skipped' },
        },
        node,
        role,
      );
    }

    node.fills = [{ type: 'SOLID', color: hexToFigmaRgb(fill) }];
    if (useLibrary && library && !skip()) {
      if (!options?.stylesPreloaded) await ensureLoaded(library);
      const paintMatch = getPaintStyleId(fill);
      if (paintMatch) {
        try {
          await (node as any).setFillStyleIdAsync(paintMatch.id);
          autoBound = `fill:${paintMatch.name}`;
        } catch (err) {
          console.warn('[figcraft] Paint style apply failed:', err);
        }
      } else {
        // No exact paint style match — try scope-aware COLOR variable binding
        try {
          const colorVar = await suggestColorVariable(fill, role, library);
          if (colorVar) {
            await clearFillStyle(node);
            const fills = [...(node.fills as Paint[])];
            if (fills[0]) {
              fills[0] = figma.variables.setBoundVariableForPaint(fills[0] as SolidPaint, 'color', colorVar);
              node.fills = fills;
              autoBound = `var:${colorVar.name}`;
            }
          }
        } catch {
          /* best effort */
        }

        if (!autoBound) {
          // No variable match either — provide self-correction hints
          const closest = findClosestPaintStyle(fill);
          if (closest) {
            colorHint = `⛔ No library token match for ${fill} — hardcoded colors violate library mode. Closest: "${closest.name}" (${closest.hex}). Use fillVariableName:"${closest.name}" instead of fill.`;
          } else {
            const available = getAvailablePaintStyleNames(10);
            if (available.length > 0) {
              colorHint = `⛔ No library token match for ${fill} — hardcoded colors violate library mode. Available: ${available.join(', ')}. Use fillVariableName instead of fill.`;
            }
          }
        }
      }
    }
  } else if (useLibrary && library && !skip()) {
    if (!options?.stylesPreloaded) await ensureLoaded(library);
    try {
      autoBound = await autoBindDefault(node, role, library);
    } catch {
      /* skip */
    }
  } else {
    // No fill specified and no library — clear Figma's default white fill
    node.fills = [];
  }

  return { autoBound, colorHint };
}

// ─── Stroke application ───

interface MinimalStrokesMixin {
  strokes: readonly Paint[] | Paint[];
}

/**
 * Apply stroke color and weight to a node.
 * In library mode, tries to match a Paint Style first, then falls back to
 * variable auto-bind for the 'border' role (consistent with applyFill behavior).
 *
 * Supports 5 input formats for stroke (matches applyFill):
 * - hex string: "#E0E0E0" → solid stroke + style auto-match
 * - { _variable: "border/default" } → look up COLOR variable by name (3-level) and bind
 * - { _variableId: "VariableID:123:456" } → bind COLOR variable by ID directly
 * - { _style: "Border/Default" } → look up Paint Style by name and apply
 * - Paint[] array → apply raw Figma paint array directly
 */
export async function applyStroke(
  node: SceneNode & MinimalStrokesMixin,
  stroke: string | FillInput | undefined,
  strokeWeight?: number,
  useLibrary?: boolean,
  library?: string,
): Promise<ApplyStrokeResult> {
  const STROKE_SCOPES = ['STROKE_COLOR', 'ALL_SCOPES'];

  // Handle Paint[] array — direct assignment
  if (stroke && Array.isArray(stroke)) {
    node.strokes = stroke as Paint[];
    (node as any).strokeWeight = strokeWeight ?? 1;
    return { autoBound: null };
  }

  // Handle { _variableId: "id" } — direct variable binding by ID
  if (stroke && typeof stroke === 'object' && '_variableId' in stroke) {
    const strokeId = (stroke as { _variableId: string })._variableId;
    const variable = await findColorVariableById(strokeId);
    if (variable) {
      await clearStrokeStyle(node);
      node.strokes = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
      const strokes = [...(node.strokes as Paint[])];
      if (strokes[0]) {
        strokes[0] = figma.variables.setBoundVariableForPaint(strokes[0] as SolidPaint, 'color', variable);
        node.strokes = strokes;
      }
      (node as any).strokeWeight = strokeWeight ?? 1;
      return { autoBound: `var:${variable.name}` };
    }
    // 缺陷 D: same resolvedType-mismatch / not-found disambiguation as fill path.
    (node as any).strokeWeight = strokeWeight ?? 1;
    const raw = await findVariableByIdAny(strokeId);
    if (raw && raw.resolvedType !== 'COLOR') {
      return {
        autoBound: null,
        colorHint:
          `⛔ Stroke variable "${raw.name}" (ID ${strokeId}) is a ${raw.resolvedType}, not a COLOR. ` +
          `Use a COLOR variable for strokes. Run variables_ep(method:"list", type:"COLOR") to see candidates.`,
        bindingFailure: { requested: strokeId, type: 'variable', action: 'skipped' },
      };
    }
    return {
      autoBound: null,
      colorHint:
        `⛔ Stroke variable ID "${strokeId}" not found. ` +
        `Run variables_ep(method:"list", type:"COLOR") to enumerate, or pass strokeVariableName:"<name>".`,
      bindingFailure: { requested: strokeId, type: 'variable', action: 'skipped' },
    };
  }

  // Handle { _variable: "name" } — variable binding with 3-level resolution
  if (stroke && typeof stroke === 'object' && '_variable' in stroke) {
    const varName = (stroke as { _variable: string })._variable;
    try {
      const variable = await findColorVariableByName(varName, STROKE_SCOPES, library);
      if (variable) {
        await clearStrokeStyle(node);
        node.strokes = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
        const strokes = [...(node.strokes as Paint[])];
        if (strokes[0]) {
          strokes[0] = figma.variables.setBoundVariableForPaint(strokes[0] as SolidPaint, 'color', variable);
          node.strokes = strokes;
        }
        (node as any).strokeWeight = strokeWeight ?? 1;
        // P0-B: return ID for "next time use strokeVariableId" hint.
        return { autoBound: `var:${variable.name}`, autoBoundId: variable.id };
      }
    } catch (err) {
      // Surface semantic lookup errors so AI can self-correct (mirrors applyFill).
      if (err instanceof ScopeMismatchError) {
        (node as any).strokeWeight = strokeWeight ?? 1;
        return {
          autoBound: null,
          colorHint: formatScopeMismatchHint(err, varName, 'stroke', STROKE_SCOPES),
          bindingFailure: { requested: varName, type: 'variable', action: 'scope-mismatch' },
        };
      }
      if (err instanceof AmbiguousMatchError) {
        (node as any).strokeWeight = strokeWeight ?? 1;
        return {
          autoBound: null,
          colorHint: formatAmbiguousMatchHint(err, varName),
          bindingFailure: { requested: varName, type: 'variable', action: 'ambiguous' },
        };
      }
      if (err instanceof ResolvedTypeMismatchError) {
        (node as any).strokeWeight = strokeWeight ?? 1;
        return {
          autoBound: null,
          colorHint: formatResolvedTypeMismatchHint(err, varName, 'stroke'),
          bindingFailure: { requested: varName, type: 'variable', action: 'skipped' },
        };
      }
      /* other lookup failure — fall through */
    }
    // P2: lookup returned null (not a structured error). Mirror the applyFill
    // not-found path — emit a descriptive hint + bindingFailure so the agent
    // sees the failure in _tokenBindingFailures (fed into harness _nextSteps
    // by tokenBindingFailuresRule) instead of silently keeping Figma's default.
    (node as any).strokeWeight = strokeWeight ?? 1;
    const libCtx = useLibrary ? `library "${library ?? 'unknown'}"` : 'local file';
    const baseHint =
      `⛔ Stroke variable name "${varName}" not found in ${libCtx}. ` +
      `Possible causes: (a) not yet published to the library, (b) in a collection not yet subscribed, ` +
      `(c) name misspelled, or (d) the token is a paint style without a matching variable. ` +
      `Verify with variables_ep(method:"list", type:"COLOR"). ` +
      `Workaround: pass stroke:{_variableId:"VariableID:<id>"} to bind by ID directly.`;
    return {
      autoBound: null,
      colorHint: await withDidYouMean(baseHint, varName, 'COLOR'),
      bindingFailure: { requested: varName, type: 'variable', action: 'skipped' },
    };
  }

  // Handle { _style: "name" } — direct style binding for stroke
  if (stroke && typeof stroke === 'object' && '_style' in stroke) {
    const styleName = (stroke as { _style: string })._style;
    const paintMatch = getPaintStyleId(undefined, styleName);
    (node as any).strokeWeight = strokeWeight ?? 1;
    if (paintMatch) {
      try {
        await (node as any).setStrokeStyleIdAsync(paintMatch.id);
        return { autoBound: `stroke:${paintMatch.name}` };
      } catch (err) {
        return {
          autoBound: null,
          colorHint: `Stroke style "${styleName}" found but failed to apply: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }
    const available = getAvailablePaintStyleNames(10);
    return {
      autoBound: null,
      colorHint: `Stroke style "${styleName}" not found.${available.length > 0 ? ` Available: ${available.join(', ')}` : ''}`,
      bindingFailure: { requested: styleName, type: 'style', action: 'skipped' },
    };
  }

  if (stroke && typeof stroke === 'string') {
    // Non-hex string → auto-detect as variable name or style name
    if (!isHexColor(stroke)) {
      // Try as variable name first
      try {
        const variable = await findColorVariableByName(stroke, STROKE_SCOPES, library);
        if (variable) {
          await clearStrokeStyle(node);
          node.strokes = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
          const strokes = [...(node.strokes as Paint[])];
          if (strokes[0]) {
            strokes[0] = figma.variables.setBoundVariableForPaint(strokes[0] as SolidPaint, 'color', variable);
            node.strokes = strokes;
          }
          (node as any).strokeWeight = strokeWeight ?? 1;
          return { autoBound: `var:${variable.name}`, autoBoundId: variable.id };
        }
      } catch (err) {
        // Surface semantic lookup errors — consistent with applyFill + { _variable } path above.
        if (err instanceof ScopeMismatchError) {
          (node as any).strokeWeight = strokeWeight ?? 1;
          return {
            autoBound: null,
            colorHint: formatScopeMismatchHint(err, stroke, 'stroke', STROKE_SCOPES),
            bindingFailure: { requested: stroke, type: 'variable', action: 'scope-mismatch' },
          };
        }
        if (err instanceof AmbiguousMatchError) {
          (node as any).strokeWeight = strokeWeight ?? 1;
          return {
            autoBound: null,
            colorHint: formatAmbiguousMatchHint(err, stroke),
            bindingFailure: { requested: stroke, type: 'variable', action: 'ambiguous' },
          };
        }
        if (err instanceof ResolvedTypeMismatchError) {
          (node as any).strokeWeight = strokeWeight ?? 1;
          return {
            autoBound: null,
            colorHint: formatResolvedTypeMismatchHint(err, stroke, 'stroke'),
            bindingFailure: { requested: stroke, type: 'variable', action: 'skipped' },
          };
        }
        /* other lookup failure — try style */
      }
      // Try as style name
      if (useLibrary && library) {
        const paintMatch = getPaintStyleId(undefined, stroke);
        if (paintMatch) {
          (node as any).strokeWeight = strokeWeight ?? 1;
          try {
            await (node as any).setStrokeStyleIdAsync(paintMatch.id);
            return { autoBound: `stroke:${paintMatch.name}` };
          } catch (err) {
            return {
              autoBound: null,
              colorHint: `Stroke style "${stroke}" found but failed to apply: ${err instanceof Error ? err.message : String(err)}`,
            };
          }
        }
      }
      // Not a hex, not a variable, not a style — surface a hint so the agent
      // gets the same feedback applyFill emits in the equivalent situation.
      // P0-2 parallel: diagnostic hint mirrors the applyFill bare-string fall-through
      // but role-aware for stroke/border (STROKE_COLOR scope, border/* naming).
      // Uses the strokeVariableId top-level alias (normalized in write-nodes-create.ts:231)
      // for symmetry with the user's likely input (strokeVariableName) — one-key swap,
      // no call-structure rewrite required.
      (node as any).strokeWeight = strokeWeight ?? 1;
      const libCtx = useLibrary ? `library "${library ?? 'unknown'}"` : 'local file';
      const baseHint =
        `⛔ Stroke variable name "${stroke}" not found in ${libCtx}. ` +
        `Possible causes: (a) not yet published to the library, (b) in a collection not yet subscribed by this file, ` +
        `(c) name misspelled, or (d) it's a paint style name with no matching style. ` +
        `Verify with variables_ep(method:"list_collections") and variables_ep(method:"list"), or styles_ep(method:"list", type:"PAINT"). ` +
        `For strokes, prefer border/* variables with STROKE_COLOR scope. ` +
        `Workaround: pass strokeVariableId:"VariableID:<id>" to bind by ID directly.`;
      return {
        autoBound: null,
        // P2: append did-you-mean suggestions from local COLOR variables.
        colorHint: await withDidYouMean(baseHint, stroke, 'COLOR'),
        // P0 companion fix: previously this path returned no bindingFailure,
        // so the harness token-binding-failures rule never saw it. Emit one
        // so agent recovery fires consistently with applyFill's equivalent path.
        bindingFailure: { requested: stroke, type: 'variable', action: 'skipped' },
      };
    }

    node.strokes = [{ type: 'SOLID', color: hexToFigmaRgb(stroke) }];
    (node as any).strokeWeight = strokeWeight ?? 1;
    if (useLibrary && library) {
      const paintMatch = getPaintStyleId(stroke);
      if (paintMatch) {
        try {
          await (node as any).setStrokeStyleIdAsync(paintMatch.id);
        } catch {
          /* skip */
        }
      }
    }
    return { autoBound: null };
  } else if (!stroke && strokeWeight != null && useLibrary && library) {
    // strokeWeight specified but no color — auto-bind border variable
    try {
      const bound = await autoBindStrokeDefault(node, 'border', library);
      if (bound) {
        (node as any).strokeWeight = strokeWeight;
      }
      return { autoBound: bound };
    } catch {
      /* skip — best effort */
    }
  }
  return { autoBound: null };
}

// ─── Per-side stroke weights ───

/**
 * Apply per-side stroke weights to a node.
 * Supports strokeTopWeight, strokeBottomWeight, strokeLeftWeight, strokeRightWeight.
 * When useTokenBinding is true, each side is auto-bound to a matching FLOAT variable.
 */
export async function applyPerSideStrokeWeights(
  node: SceneNode,
  props: Record<string, unknown>,
  useTokenBinding: boolean,
  budgetExceeded?: () => boolean,
  library?: string,
): Promise<string[]> {
  const bound: string[] = [];
  const sides = ['strokeTopWeight', 'strokeBottomWeight', 'strokeLeftWeight', 'strokeRightWeight'] as const;
  let hasSide = false;
  for (const side of sides) {
    if (props[side] != null) {
      hasSide = true;
      break;
    }
  }
  if (!hasSide) return bound;

  for (const side of sides) {
    const val = props[side];
    if (val == null) continue;
    if (useTokenBinding && typeof val === 'number') {
      const name = await applyTokenField(node, side, val, budgetExceeded, library);
      if (name) bound.push(`${side}:${name}`);
    } else if (typeof val === 'number' && side in node) {
      (node as any)[side] = val;
    }
  }
  return bound;
}

// ─── Auto-layout setup ───

export interface AutoLayoutProps {
  autoLayout?: boolean;
  layoutDirection?: 'HORIZONTAL' | 'VERTICAL';
  itemSpacing?: number;
  padding?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  primaryAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
  counterAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX';
  layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL';
  layoutSizingVertical?: 'FIXED' | 'HUG' | 'FILL';
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
}

/**
 * Translate explicit layoutSizing values to Figma's native sizing properties.
 *
 * layoutSizingHorizontal / layoutSizingVertical are high-level, LLM-friendly params:
 *   FIXED → use explicit dimension (primaryAxisSizingMode=FIXED or counterAxisSizingMode=FIXED)
 *   HUG   → shrink to content (primaryAxisSizingMode=AUTO or counterAxisSizingMode=AUTO)
 *   FILL  → expand in parent (layoutGrow=1 for primary axis, layoutAlign=STRETCH for cross axis)
 *
 * These are translated into Figma's native model which splits sizing by axis role:
 *   - primaryAxisSizingMode: FIXED | AUTO (controls the main axis of the frame's own layout)
 *   - counterAxisSizingMode: FIXED | AUTO (controls the cross axis)
 *   - layoutGrow / layoutAlign: controls how the frame sizes within its PARENT's auto-layout
 *
 * When both explicit sizing params and legacy params (layoutAlign/layoutGrow) are provided,
 * the explicit sizing params take precedence.
 */
export interface SizingResult {
  primaryMode: 'FIXED' | 'AUTO';
  counterMode: 'FIXED' | 'AUTO';
  /** 1 when primary axis is FILL, 0 to clear previous FILL state */
  layoutGrow: number;
  /** 'STRETCH' when counter axis is FILL, 'INHERIT' to clear previous FILL state */
  layoutAlign: string;
}

/**
 * Translate a single layoutSizing value to Figma native properties.
 * Always returns explicit layoutGrow/layoutAlign so callers can clear stale state
 * (e.g. when patching from FILL → HUG, layoutGrow must be reset to 0).
 */
export function translateSingleSizing(
  sizing: 'FIXED' | 'HUG' | 'FILL',
  axis: 'primary' | 'counter',
): { mode: 'FIXED' | 'AUTO'; layoutGrow?: number; layoutAlign?: string } {
  switch (sizing) {
    case 'FIXED':
      return { mode: 'FIXED' };
    case 'HUG':
      return { mode: 'AUTO' };
    case 'FILL':
      return axis === 'primary' ? { mode: 'AUTO', layoutGrow: 1 } : { mode: 'AUTO', layoutAlign: 'STRETCH' };
  }
}

export function translateLayoutSizing(p: AutoLayoutProps, dir: 'HORIZONTAL' | 'VERTICAL'): SizingResult {
  const isHorizontal = dir === 'HORIZONTAL';
  // Map horizontal/vertical to primary/counter based on layout direction
  const primarySizing = isHorizontal ? p.layoutSizingHorizontal : p.layoutSizingVertical;
  const counterSizing = isHorizontal ? p.layoutSizingVertical : p.layoutSizingHorizontal;

  // Defaults: FIXED if dimension provided, HUG otherwise
  const primaryDim = isHorizontal ? p.width : p.height;
  const counterDim = isHorizontal ? p.height : p.width;

  const primary = primarySizing
    ? translateSingleSizing(primarySizing, 'primary')
    : { mode: (primaryDim != null ? 'FIXED' : 'AUTO') as 'FIXED' | 'AUTO' };
  const counter = counterSizing
    ? translateSingleSizing(counterSizing, 'counter')
    : { mode: (counterDim != null ? 'FIXED' : 'AUTO') as 'FIXED' | 'AUTO' };

  return {
    primaryMode: primary.mode,
    counterMode: counter.mode,
    layoutGrow: primary.layoutGrow ?? 0,
    layoutAlign: counter.layoutAlign ?? 'INHERIT',
  };
}

/**
 * Configure auto-layout on a frame, including sizing modes and min dimensions.
 * No-op if props.autoLayout is falsy.
 *
 * Supports both legacy sizing (inferred from width/height presence) and explicit
 * layoutSizingHorizontal/layoutSizingVertical params. Explicit params take precedence.
 *
 * When useTokenBinding is true, numeric properties (itemSpacing, padding*) are
 * auto-bound to matching FLOAT variables by Figma scope (GAP).
 */
export async function applyAutoLayout(
  frame: FrameNode,
  p: AutoLayoutProps,
  options?: { useTokenBinding?: boolean; budgetExceeded?: () => boolean },
): Promise<string[]> {
  const tokensBound: string[] = [];
  if (!p.autoLayout) return tokensBound;

  frame.layoutMode = p.layoutDirection ?? 'VERTICAL';

  const uniformPad = p.padding ?? 0;
  const useTokens = options?.useTokenBinding ?? false;
  const skip = options?.budgetExceeded;

  if (useTokens) {
    // Bind spacing/padding to FLOAT variables by scope
    const bound = await applyTokenFields(
      frame,
      {
        itemSpacing: p.itemSpacing ?? 0,
        paddingLeft: p.paddingLeft ?? uniformPad,
        paddingRight: p.paddingRight ?? uniformPad,
        paddingTop: p.paddingTop ?? uniformPad,
        paddingBottom: p.paddingBottom ?? uniformPad,
      },
      skip,
    );
    tokensBound.push(...bound);
  } else {
    frame.itemSpacing = p.itemSpacing ?? 0;
    frame.paddingLeft = p.paddingLeft ?? uniformPad;
    frame.paddingRight = p.paddingRight ?? uniformPad;
    frame.paddingTop = p.paddingTop ?? uniformPad;
    frame.paddingBottom = p.paddingBottom ?? uniformPad;
  }

  if (p.primaryAxisAlignItems) {
    frame.primaryAxisAlignItems = p.primaryAxisAlignItems;
  }
  if (p.counterAxisAlignItems) {
    frame.counterAxisAlignItems = p.counterAxisAlignItems;
  }

  // Translate sizing: explicit layoutSizing params take precedence over legacy inference
  const dir = frame.layoutMode;
  const hasExplicitSizing = p.layoutSizingHorizontal != null || p.layoutSizingVertical != null;

  if (hasExplicitSizing) {
    const sizing = translateLayoutSizing(p, dir);
    frame.primaryAxisSizingMode = sizing.primaryMode;
    frame.counterAxisSizingMode = sizing.counterMode;
    // Always set layoutGrow/layoutAlign so stale FILL state is cleared
    (frame as any).layoutGrow = sizing.layoutGrow;
    (frame as any).layoutAlign = sizing.layoutAlign;

    // Only resize axes that are FIXED — skip HUG/FILL axes to avoid a wasted layout pass
    const hSizing = p.layoutSizingHorizontal;
    const vSizing = p.layoutSizingVertical;
    const useWidth = hSizing === 'FIXED' || (!hSizing && p.width != null);
    const useHeight = vSizing === 'FIXED' || (!vSizing && p.height != null);
    if (useWidth || useHeight) {
      frame.resize(
        useWidth ? ((p.width as number) ?? 100) : frame.width,
        useHeight ? ((p.height as number) ?? 100) : frame.height,
      );
    }

    // Set min dimensions only for FIXED axes or when explicitly provided
    if (p.minWidth != null) frame.minWidth = p.minWidth;
    else if (useWidth && p.width != null) frame.minWidth = p.width;
    if (p.minHeight != null) frame.minHeight = p.minHeight;
    else if (useHeight && p.height != null) frame.minHeight = p.height;
  } else {
    // Legacy behavior: FIXED when dimension explicitly provided, AUTO (hug) otherwise
    if (dir === 'HORIZONTAL') {
      frame.primaryAxisSizingMode = p.width != null ? 'FIXED' : 'AUTO';
      frame.counterAxisSizingMode = p.height != null ? 'FIXED' : 'AUTO';
    } else {
      frame.primaryAxisSizingMode = p.height != null ? 'FIXED' : 'AUTO';
      frame.counterAxisSizingMode = p.width != null ? 'FIXED' : 'AUTO';
    }

    if (p.width != null || p.height != null) {
      frame.resize((p.width as number) ?? 100, (p.height as number) ?? 100);
    }

    // Set minWidth/minHeight so HUG containers don't shrink below the intended size.
    if (p.minWidth != null) frame.minWidth = p.minWidth;
    else if (p.width != null) frame.minWidth = p.width;
    if (p.minHeight != null) frame.minHeight = p.minHeight;
    else if (p.height != null) frame.minHeight = p.height;
  }

  return tokensBound;
}

// ─── Per-corner radius expansion ───

/**
 * Apply corner radius to a node, supporting both uniform and per-corner shorthand.
 *
 * Formats:
 * - number: uniform radius (e.g. 8)
 * - [number, number, number, number]: per-corner [topLeft, topRight, bottomRight, bottomLeft]
 * - string: variable name to look up and bind
 *
 * When useTokenBinding is true, each corner is auto-bound to a matching FLOAT variable.
 * Supports variable binding on all 4 corners.
 */
export async function applyCornerRadius(
  node: SceneNode,
  value: number | number[] | string | undefined,
  useTokenBinding: boolean,
  budgetExceeded?: () => boolean,
  library?: string,
): Promise<string[]> {
  if (value == null || !('cornerRadius' in node)) return [];
  const bound: string[] = [];

  if (typeof value === 'string') {
    // Variable name → look up and bind to uniform cornerRadius
    if (useTokenBinding) {
      const name = await applyTokenField(node, 'cornerRadius', value, budgetExceeded, library);
      if (name) bound.push(`cornerRadius:${name}`);
    }
    return bound;
  }

  if (Array.isArray(value)) {
    // Per-corner: [topLeft, topRight, bottomRight, bottomLeft]
    const [tl, tr, br, bl] = value;
    const fields: Record<string, number> = {
      topLeftRadius: tl ?? 0,
      topRightRadius: tr ?? 0,
      bottomRightRadius: br ?? 0,
      bottomLeftRadius: bl ?? 0,
    };
    // P1-1: always write the direct value first so the visual state is correct even
    // if token matching binds a variable whose resolved value doesn't match the
    // requested number (e.g. a radius/* token with value 0). Token binding, when it
    // succeeds, overlays the direct value with the bound variable reference.
    for (const [field, val] of Object.entries(fields)) {
      if (field in node) (node as any)[field] = val;
    }
    if (useTokenBinding) {
      for (const [field, val] of Object.entries(fields)) {
        if (field in node) {
          const name = await applyTokenField(node, field, val, budgetExceeded, library);
          if (name) bound.push(`${field}:${name}`);
        }
      }
    }
    return bound;
  }

  // Uniform number
  // P1-1: direct value first, token binding second (see per-corner comment above).
  (node as any).cornerRadius = value;
  if (useTokenBinding) {
    const name = await applyTokenField(node, 'cornerRadius', value, budgetExceeded, library);
    if (name) bound.push(`cornerRadius:${name}`);
  }
  return bound;
}

// ─── Component property helpers ───

/**
 * Set component properties on an instance, matching keys with Figma's `name#id` suffix format.
 * Returns list of unmatched property names for diagnostic feedback.
 */
export function setComponentProperties(
  instance: InstanceNode,
  props: Record<string, string | boolean>,
): { unmatchedProperties: string[] } {
  const defs = instance.componentProperties;
  const unmatched: string[] = [];
  for (const [key, value] of Object.entries(props)) {
    const matchKey = Object.keys(defs).find((k) => k.startsWith(`${key}#`) || k === key);
    if (matchKey) {
      try {
        instance.setProperties({ [matchKey]: value });
      } catch {
        unmatched.push(key);
      }
    } else {
      unmatched.push(key);
    }
  }
  return { unmatchedProperties: unmatched };
}
