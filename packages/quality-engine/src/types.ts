/**
 * Lint engine types — abstract node, rules, violations.
 */

/** Simplified node for lint analysis (decoupled from Figma API). */
export interface AbstractNode {
  id: string;
  name: string;
  type: string;
  role?: string;
  // Style values
  fills?: Array<{ type: string; color?: string; opacity?: number; visible?: boolean }>;
  strokes?: Array<{ type: string; color?: string; visible?: boolean }>;
  cornerRadius?: number | number[];
  fontSize?: number;
  fontName?: { family: string; style: string };
  lineHeight?: unknown;
  letterSpacing?: unknown;
  opacity?: number;
  width?: number;
  height?: number;
  // Layout
  layoutMode?: string;
  layoutPositioning?: string;
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  // Position
  x?: number;
  y?: number;
  // Text content
  characters?: string;
  // Bindings
  boundVariables?: Record<string, unknown>;
  fillStyleId?: string;
  textStyleId?: string;
  effectStyleId?: string;
  // Component
  componentPropertyDefinitions?: Record<string, { type: string; defaultValue?: unknown; variantOptions?: string[] }>;
  componentPropertyReferences?: Record<string, string>;
  // Layout alignment
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  clipsContent?: boolean;
  strokeWeight?: number;
  layoutAlign?: string;
  // Text layout
  textAutoResize?: string;
  // Children
  children?: AbstractNode[];
  // Parent background color (hex, propagated during lint traversal for contrast checks)
  parentBgColor?: string;
  // Parent width (propagated during lint traversal for overflow checks)
  parentWidth?: number;
  // Parent layout mode (propagated during lint traversal for overflow fix strategy)
  parentLayoutMode?: string;
}

export interface LintContext {
  /** Available color tokens (hex values). */
  colorTokens: Map<string, string>;
  /** Available spacing tokens (numeric values). */
  spacingTokens: Map<string, number>;
  /** Available radius tokens (numeric values). */
  radiusTokens: Map<string, number>;
  /** Available typography tokens. */
  typographyTokens: Map<string, { fontSize?: number; fontFamily?: string; fontWeight?: string }>;
  /** Variable ID map for auto-fix (token name → variable ID). */
  variableIds: Map<string, string>;
  /** Current operation mode. */
  mode?: 'library' | 'spec';
  /** Selected library name (only relevant in library mode). */
  selectedLibrary?: string | null;
}

export type LintSeverity = 'error' | 'warning' | 'info' | 'hint';
export type LintCategory = 'token' | 'layout' | 'naming' | 'wcag' | 'component';

/** Severity ordering from most to least severe (used for downgrade logic). */
export const SEVERITY_ORDER: readonly LintSeverity[] = ['error', 'warning', 'info', 'hint'] as const;

/**
 * Downgrade a severity by one level.
 * error → warning, warning → info, info → hint, hint → hint (floor).
 */
export function downgradeSeverity(severity: LintSeverity): LintSeverity {
  const idx = SEVERITY_ORDER.indexOf(severity);
  return SEVERITY_ORDER[Math.min(idx + 1, SEVERITY_ORDER.length - 1)];
}

export interface LintViolation {
  nodeId: string;
  nodeName: string;
  rule: string;
  severity: LintSeverity;
  /** Original severity before context downgrade (omitted when no downgrade occurred). */
  baseSeverity?: LintSeverity;
  currentValue: unknown;
  expectedValue?: unknown;
  suggestion: string;
  autoFixable: boolean;
  /** Fix data for auto-fix handler. */
  fixData?: Record<string, unknown>;
}

export interface LintRule {
  name: string;
  description: string;
  category: LintCategory;
  severity: LintSeverity;
  check(node: AbstractNode, ctx: LintContext): LintViolation[];
}
