/**
 * Shared type definitions used by both MCP Server and Plugin.
 */

// ─── Design Token (DTCG-resolved, sent from MCP Server to Plugin) ───

export interface DesignToken {
  /** Dot-path in DTCG tree, e.g. "color.brand.primary" */
  path: string;
  /** DTCG $type */
  type: DtcgType;
  /** Resolved value (aliases already dereferenced) */
  value: unknown;
  /** DTCG $description */
  description?: string;
  /** Extensions from $extensions */
  extensions?: Record<string, unknown>;
}

export type DtcgType =
  | 'color'
  | 'dimension'
  | 'fontFamily'
  | 'fontWeight'
  | 'duration'
  | 'cubicBezier'
  | 'number'
  | 'strokeStyle'
  | 'border'
  | 'transition'
  | 'shadow'
  | 'gradient'
  | 'typography'
  | 'boolean'
  | 'string';

// ─── Sync ───

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  failures: SyncFailure[];
}

export interface SyncFailure {
  path: string;
  error: string;
}

// ─── Figma Token Status (for diff) ───

export type TokenSyncStatus =
  | 'in-sync'
  | 'dtcg-ahead'
  | 'figma-ahead'
  | 'conflict'
  | 'missing-in-figma'
  | 'missing-in-dtcg';

export interface TokenDiffEntry {
  path: string;
  status: TokenSyncStatus;
  dtcgValue?: unknown;
  figmaValue?: unknown;
  figmaVariableId?: string;
}

// ─── Lint ───

export interface LintReport {
  summary: { total: number; pass: number; violations: number };
  categories: LintCategory[];
  pagination?: { total: number; offset: number; limit: number; hasMore: boolean };
}

export interface LintCategory {
  rule: string;
  count: number;
  fix: string;
  nodes: LintViolation[];
}

export interface LintViolation {
  nodeId: string;
  nodeName: string;
  currentValue: unknown;
  expectedValue?: unknown;
  suggestion: string;
  autoFixable: boolean;
}

// ─── Compressed Node (Framelink-style) ───

export interface CompressedNode {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  children?: CompressedNode[];
  // Style properties (only included when present)
  fills?: unknown[];
  strokes?: unknown[];
  effects?: unknown[];
  cornerRadius?: number | number[];
  opacity?: number;
  // Layout
  layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
  layoutPositioning?: 'ABSOLUTE';
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  clipsContent?: boolean;
  strokeWeight?: number;
  layoutAlign?: string;
  // Text
  characters?: string;
  fontSize?: number;
  fontName?: unknown;
  lineHeight?: unknown;
  letterSpacing?: unknown;
  textAutoResize?: string;
  // Variable/Style bindings
  boundVariables?: Record<string, unknown>;
  fillStyleId?: string;
  textStyleId?: string;
  effectStyleId?: string;
  // Component properties
  componentPropertyDefinitions?: Record<string, { type: string; defaultValue?: unknown; variantOptions?: string[] }>;
  componentPropertyReferences?: Record<string, string>;
  // Truncation indicator — set when node tree was cut short by depth/count/time limits
  truncated?: boolean;
  /** Number of direct children omitted due to limits. */
  truncatedChildCount?: number;
}

// ─── Operation Mode ───

export type OperationMode = 'library' | 'spec';

// ─── Batch Operation ───

export interface BatchResult<T = unknown> {
  success: number;
  failed: number;
  results: Array<{ item: T; ok: boolean; error?: string }>;
}
