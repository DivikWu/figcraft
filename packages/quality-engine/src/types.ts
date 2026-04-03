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
  // Lint exclusion: comma-separated rule names or '*' to skip all rules
  lintIgnore?: string;
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

/**
 * 5-level severity system:
 * - error:     breakage that must be fixed (component binding errors)
 * - unsafe:    layout issues that cause visual bugs (overflow, unbounded HUG)
 * - heuristic: best-practice violations detected by tooling (hardcoded tokens, no auto-layout)
 * - style:     cosmetic / naming preferences (empty container, default name)
 * - verbose:   WCAG AAA & enhancement checks (excluded by default)
 */
export type LintSeverity = 'error' | 'unsafe' | 'heuristic' | 'style' | 'verbose';
export type LintCategory = 'token' | 'layout' | 'naming' | 'wcag' | 'component';

/** Severity ordering from most to least severe (used for downgrade logic). */
export const SEVERITY_ORDER: readonly LintSeverity[] = ['error', 'unsafe', 'heuristic', 'style', 'verbose'] as const;

/**
 * Downgrade a severity by one level.
 * error → unsafe, unsafe → heuristic, heuristic → style, style → verbose, verbose → verbose (floor).
 */
export function downgradeSeverity(severity: LintSeverity): LintSeverity {
  const idx = SEVERITY_ORDER.indexOf(severity);
  return SEVERITY_ORDER[Math.min(idx + 1, SEVERITY_ORDER.length - 1)];
}

/** Node types that are always considered leaf (no meaningful children). */
const LEAF_TYPES = new Set(['TEXT', 'VECTOR', 'LINE', 'ELLIPSE', 'RECTANGLE', 'STAR', 'POLYGON', 'BOOLEAN_OPERATION']);

/** Check if a node is a leaf (no children or inherently childless type). */
export function isLeafNode(node: AbstractNode): boolean {
  if (LEAF_TYPES.has(node.type)) return true;
  return !node.children || node.children.length === 0;
}

/** Check if a node is small (width or height < 48px). */
export function isSmallNode(node: AbstractNode): boolean {
  return (node.width != null && node.width < 48) || (node.height != null && node.height < 48);
}

/**
 * Compute context-aware severity for a violation.
 * Leaf nodes and small nodes get downgraded by one level to reduce noise.
 */
export function getContextSeverity(baseSeverity: LintSeverity, node: AbstractNode): LintSeverity {
  if (isLeafNode(node) || isSmallNode(node)) {
    return downgradeSeverity(baseSeverity);
  }
  return baseSeverity;
}

/**
 * Declarative fix descriptor — tells the adapter WHAT to fix,
 * not HOW (no Figma API references). Lives in quality-engine to keep it pure.
 */
export type FixDescriptor =
  | { kind: 'set-properties'; props: Record<string, unknown>; requireType?: string[]; requireFontLoad?: boolean }
  | { kind: 'resize'; width?: number; height?: number; minHeight?: number; requireType?: string[] }
  | { kind: 'remove-and-redistribute'; dimension: { width?: number; height?: number } }
  | { kind: 'deferred'; strategy: string; data: Record<string, unknown> };

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
  /** Declarative fix descriptor (new system — co-located with rule). */
  fixDescriptor?: FixDescriptor;
  /** Structured fix call that can be directly executed by the AI agent. */
  fixCall?: { tool: string; params: Record<string, unknown> };
}

/** AI knowledge metadata — tells AI how to prevent violations, not just detect them. */
export interface RuleAI {
  /** One-line instruction for AI: how to avoid triggering this rule during creation. */
  preventionHint: string;
  /** Design phases this rule applies to (for prompt filtering). */
  phase?: Array<'layout' | 'structure' | 'content' | 'styling' | 'accessibility'>;
  /** Semantic tags for element-type queries (e.g. 'button', 'input', 'screen'). */
  tags?: string[];
}

export interface LintRule {
  name: string;
  description: string;
  category: LintCategory;
  severity: LintSeverity;
  check(node: AbstractNode, ctx: LintContext): LintViolation[];
  /** Produce a declarative fix descriptor for a violation. Co-located with the rule. */
  describeFix?(violation: LintViolation): FixDescriptor | null;
  /** AI knowledge layer — tells AI how to prevent this violation. */
  ai?: RuleAI;
}

/** LintRule that MUST implement describeFix — use for compile-time guarantee on fixable rules. */
export interface FixableLintRule extends LintRule {
  describeFix(violation: LintViolation): FixDescriptor | null;
}

/** Define a fixable rule with compile-time enforcement of describeFix. */
export function defineFixableRule(rule: FixableLintRule): FixableLintRule {
  return rule;
}
