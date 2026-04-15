/**
 * Icon SVG handler — creates a vector node from SVG markup.
 * Used by the icon_create MCP tool (Iconify integration).
 * Supports color variable binding and hex fill for fill or stroke icons.
 */

import { simplifyNode } from '../adapters/node-simplifier.js';
import { registerHandler } from '../registry.js';
import { hexToFigmaRgb } from '../utils/color.js';
import {
  AmbiguousMatchError,
  findColorVariableByName,
  findVariableByIdAny,
  ResolvedTypeMismatchError,
  ScopeMismatchError,
} from '../utils/design-context.js';
import { findNodeByIdAsync } from '../utils/node-lookup.js';

/** Result of applyIconColor — mirrors ApplyStrokeResult shape for harness consumption. */
export interface ApplyIconColorResult {
  autoBound: string | null;
  autoBoundId?: string;
  colorHint?: string;
  bindingFailure?: {
    requested: string;
    type: 'variable';
    action: 'skipped' | 'used_fallback' | 'scope-mismatch' | 'ambiguous';
  };
}

/** Scopes accepted for icon color variables — covers both fill-icons and stroke-icons. */
const ICON_COLOR_SCOPES = ['ALL_FILLS', 'SHAPE_FILL', 'STROKE_COLOR', 'ALL_SCOPES'];

/**
 * Apply a hex color to vector descendants' fills/strokes (no variable binding).
 * Internal helper — extracted so both hex path and variable path share the loop.
 */
function applyHexToVectors(vectors: SceneNode[], hex: string): void {
  const rgb = hexToFigmaRgb(hex);
  for (const vec of vectors) {
    const hasFill =
      'fills' in vec &&
      Array.isArray(vec.fills) &&
      vec.fills.length > 0 &&
      vec.fills.some((f: Paint) => f.type === 'SOLID' && f.visible !== false);
    const hasStroke =
      'strokes' in vec &&
      Array.isArray(vec.strokes) &&
      vec.strokes.length > 0 &&
      vec.strokes.some((s: Paint) => s.type === 'SOLID' && s.visible !== false);

    if (hasFill && 'fills' in vec) {
      (vec as any).fills = [{ type: 'SOLID', color: rgb }];
    }
    if (hasStroke && 'strokes' in vec) {
      (vec as any).strokes = [{ type: 'SOLID', color: rgb }];
    }
  }
}

/**
 * Bind a resolved Variable to vector descendants' fills/strokes.
 * Internal helper — variable resolution is the caller's responsibility.
 */
function bindVariableToVectors(vectors: SceneNode[], variable: Variable): void {
  for (const vec of vectors) {
    const hasFill =
      'fills' in vec &&
      Array.isArray(vec.fills) &&
      vec.fills.length > 0 &&
      vec.fills.some((f: Paint) => f.type === 'SOLID' && f.visible !== false);
    const hasStroke =
      'strokes' in vec &&
      Array.isArray(vec.strokes) &&
      vec.strokes.length > 0 &&
      vec.strokes.some((s: Paint) => s.type === 'SOLID' && s.visible !== false);

    if (hasFill && 'fills' in vec) {
      const fills = [...((vec as any).fills as Paint[])];
      const solidIdx = fills.findIndex((f: Paint) => f.type === 'SOLID');
      if (solidIdx >= 0) {
        fills[solidIdx] = figma.variables.setBoundVariableForPaint(fills[solidIdx] as SolidPaint, 'color', variable);
        (vec as any).fills = fills;
      }
    }
    if (hasStroke && 'strokes' in vec) {
      const strokes = [...((vec as any).strokes as Paint[])];
      const solidIdx = strokes.findIndex((s: Paint) => s.type === 'SOLID');
      if (solidIdx >= 0) {
        strokes[solidIdx] = figma.variables.setBoundVariableForPaint(
          strokes[solidIdx] as SolidPaint,
          'color',
          variable,
        );
        (vec as any).strokes = strokes;
      }
    }
  }
}

/**
 * Apply color to an icon node's vector children.
 * Supports hex fill, variable binding by name, and variable binding by ID.
 * Detects whether the icon uses fill or stroke and applies accordingly.
 *
 * Variable resolution delegates to `findColorVariableByName` (name path) and
 * `findVariableByIdAny` (ID path) so icon name lookup inherits the same
 * library-aware, scope-aware, discriminated-error treatment as `applyFill`
 * and `applyStroke`. Previously this function had a hand-rolled lookup that
 * bypassed library mode — see plan elegant-wandering-raven.md A2.
 *
 * Priority: colorVariableId > colorVariableName > fill (hex). Matches the
 * fillVariableId/Name precedence in applyFill.
 *
 * @param node - The icon frame containing Vector descendants
 * @param fill - Direct hex color (used when both Variable inputs are absent)
 * @param colorVariableName - Variable name to bind (looked up via findColorVariableByName)
 * @param libraryName - Library context for name lookup (only used when colorVariableName is set)
 * @param colorVariableId - Variable ID for direct binding (zero name resolution — preferred when known)
 */
export async function applyIconColor(
  node: FrameNode,
  fill?: string,
  colorVariableName?: string,
  libraryName?: string,
  colorVariableId?: string,
): Promise<ApplyIconColorResult> {
  const vectors = node.findAll((n) => n.type === 'VECTOR' || n.type === 'BOOLEAN_OPERATION') as SceneNode[];

  // No color requested at all → nothing to do.
  if (!fill && !colorVariableName && !colorVariableId) {
    return { autoBound: null };
  }

  // ID path takes top priority — direct binding, zero name resolution.
  if (colorVariableId) {
    const variable = await findVariableByIdAny(colorVariableId);
    if (!variable) {
      return {
        autoBound: null,
        colorHint:
          `⛔ Icon color variable ID "${colorVariableId}" not found. ` +
          `Verify with variables_ep(method:"list", type:"COLOR"), or pass colorVariableName for name-based lookup.`,
        bindingFailure: { requested: colorVariableId, type: 'variable', action: 'skipped' },
      };
    }
    if (variable.resolvedType !== 'COLOR') {
      return {
        autoBound: null,
        colorHint:
          `⛔ Variable "${variable.name}" (ID ${colorVariableId}) is type ${variable.resolvedType}, not COLOR. ` +
          `Use a COLOR variable for icons.`,
        bindingFailure: { requested: colorVariableId, type: 'variable', action: 'skipped' },
      };
    }
    bindVariableToVectors(vectors, variable);
    return { autoBound: `var:${variable.name}`, autoBoundId: variable.id };
  }

  // Variable binding by name (prefer over hex fill, matches applyFill).
  if (colorVariableName) {
    const varName = colorVariableName;
    let variable: Variable | null = null;
    try {
      variable = await findColorVariableByName(varName, ICON_COLOR_SCOPES, libraryName);
    } catch (err) {
      // Discriminated errors → emit role-aware self-correcting hints.
      if (err instanceof ScopeMismatchError) {
        return {
          autoBound: null,
          colorHint:
            `⛔ Icon color variable "${varName}" exists but its scopes don't accept icon fills/strokes. ` +
            `Required: [${err.requiredScopes.join(', ')}]. ` +
            `Rejected candidates: ${err.rejected.map((r) => `"${r.name}" [${r.scopes.join(', ')}]`).join('; ')}. ` +
            `Use a variable scoped to ALL_FILLS / SHAPE_FILL / STROKE_COLOR.`,
          bindingFailure: { requested: varName, type: 'variable', action: 'scope-mismatch' },
        };
      }
      if (err instanceof AmbiguousMatchError) {
        return {
          autoBound: null,
          colorHint:
            `⛔ Icon color variable name "${varName}" matches ${err.candidates.length} variables: ` +
            `${err.candidates.slice(0, 5).join(', ')}${err.candidates.length > 5 ? ', …' : ''}. ` +
            `Pass the full slash-path (e.g. "icon/primary") or use the variable ID via colorVariableId.`,
          bindingFailure: { requested: varName, type: 'variable', action: 'ambiguous' },
        };
      }
      if (err instanceof ResolvedTypeMismatchError) {
        const found = err.found[0];
        return {
          autoBound: null,
          colorHint:
            `⛔ Icon color variable "${varName}" exists but is type ${found?.resolvedType ?? '?'}, not COLOR` +
            `${found?.collection ? ` (in collection "${found.collection}")` : ''}. ` +
            `Use a COLOR variable for icons.`,
          bindingFailure: { requested: varName, type: 'variable', action: 'skipped' },
        };
      }
      /* other lookup error — fall through to not-found hint below */
    }

    if (!variable) {
      const libCtx = libraryName && libraryName !== '__local__' ? `library "${libraryName}"` : 'local file';
      return {
        autoBound: null,
        colorHint:
          `⛔ Icon color variable "${varName}" not found in ${libCtx}. ` +
          `Verify with variables_ep(method:"list", type:"COLOR"). ` +
          `For icons, prefer text/* or icon/* color variables. ` +
          `Workaround: pass colorVariableId:"VariableID:<id>" to bind by ID directly.`,
        bindingFailure: { requested: varName, type: 'variable', action: 'skipped' },
      };
    }

    bindVariableToVectors(vectors, variable);
    return { autoBound: `var:${variable.name}`, autoBoundId: variable.id };
  }

  // Hex fill path (no variable binding).
  if (fill) {
    applyHexToVectors(vectors, fill);
    return { autoBound: null };
  }

  return { autoBound: null };
}

export function registerIconSvgHandler(): void {
  registerHandler('create_icon_svg', async (params) => {
    const svg = params.svg as string;
    const name = (params.name as string) ?? 'Icon';

    // Create SVG node via Figma API
    const node = figma.createNodeFromSvg(svg);
    node.name = name;

    if (params.x != null) node.x = params.x as number;
    if (params.y != null) node.y = params.y as number;

    // Append to parent (with optional index for insertion position)
    if (params.parentId) {
      const parent = await findNodeByIdAsync(params.parentId as string);
      if (parent && 'appendChild' in parent) {
        const container = parent as FrameNode;
        if (params.index != null) {
          const idx = Math.min(Math.max(0, params.index as number), container.children.length);
          container.insertChild(idx, node);
        } else {
          container.appendChild(node);
        }
      }
    }

    // Apply color (hex fill or variable binding).
    // libraryName is optional in this standalone surface — agents needing library
    // variables in icon_create should pass colorVariableId for direct binding.
    const iconResult = await applyIconColor(
      node,
      params.fill as string | undefined,
      params.colorVariableName as string | undefined,
      params.libraryName as string | undefined,
    );

    const simplified = simplifyNode(node);
    if (iconResult.colorHint || iconResult.bindingFailure) {
      const meta: Record<string, unknown> = { ...simplified };
      if (iconResult.colorHint) meta._warnings = [iconResult.colorHint];
      if (iconResult.bindingFailure) meta._tokenBindingFailures = [iconResult.bindingFailure];
      return meta;
    }
    return simplified;
  });
}
