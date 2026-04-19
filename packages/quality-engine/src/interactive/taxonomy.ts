/**
 * Interactive element taxonomy — source of truth for variant-aware lint.
 *
 * The classifier + per-kind structure rules consume these types. Kept separate
 * from `types.ts` so the interactive sub-system can evolve without touching the
 * general lint interfaces.
 */

export const INTERACTIVE_KINDS = [
  'button-solid',
  'button-outline',
  'button-ghost',
  'button-text',
  'button-icon',
  'button-fab',
  'link-inline',
  'link-standalone',
  'toggle',
  'switch',
  'checkbox',
  'radio',
  'segmented',
  'chip-interactive',
  'tab',
] as const;

export type InteractiveKind = (typeof INTERACTIVE_KINDS)[number];

export const INTERACTIVE_STATES = [
  'default',
  'hover',
  'pressed',
  'focused',
  'disabled',
  'loading',
  'selected',
] as const;

export type InteractiveState = (typeof INTERACTIVE_STATES)[number];

/**
 * Attached to `AbstractNode.interactive` after classification. When `declared`
 * is true the values come from plugin data and should be trusted absolutely;
 * otherwise they are the classifier's best inference and rules should respect
 * `confidence`.
 */
export interface InteractiveMeta {
  kind: InteractiveKind;
  state?: InteractiveState;
  variant?: string;
  /** 0–1, 1 = declared. Rules should skip when below 0.7 unless declared. */
  confidence: number;
  /** Evidence list — for debugging + telemetry. */
  signals?: string[];
  /** True iff kind came from plugin data, not heuristics. */
  declared?: boolean;
}

export function isButtonKind(kind: InteractiveKind | null | undefined): boolean {
  return !!kind && kind.startsWith('button-');
}

export function isLinkKind(kind: InteractiveKind | null | undefined): boolean {
  return !!kind && kind.startsWith('link-');
}
