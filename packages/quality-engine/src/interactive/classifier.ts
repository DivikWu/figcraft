/**
 * Interactive element classifier — single shared source of truth.
 *
 * Replaces the per-rule `looksLikeButton()` duplicates. Takes an AbstractNode
 * and returns a weighted classification. Rules should consume the cached
 * `node.interactive` set by the engine, not call this directly.
 *
 * Rules for Phase 0 (telemetry-only): this does not change any rule behavior.
 * The engine caches results on `node.interactive` and feeds telemetry; no
 * existing rule consumes `node.interactive` yet.
 */

import type { AbstractNode } from '../types.js';
import type { InteractiveKind, InteractiveMeta, InteractiveState } from './taxonomy.js';

export interface ClassifyResult {
  kind: InteractiveKind | null;
  confidence: number;
  signals: string[];
  state?: InteractiveState;
  variant?: string;
  declared?: boolean;
}

const BUTTON_NAME_RE =
  /^(button|btn|cta|action)(\s|[-_:/.]|$)|^(登录|注册|submit|sign.?in|sign.?up|log.?in|log.?out)$/i;
/**
 * Whole-word "link" / "links" anywhere in the name. Uses \b so "Linkedin" /
 * "Linkages" / "blink" don't match but "Sign Up Link" / "Forgot Link" /
 * "icon-link" do.
 */
const LINK_NAME_RE = /\blinks?\b/i;
const ICON_NAME_RE = /icon|glyph/i;
const FAB_NAME_RE = /\bfab\b|floating/i;

/** Extract the first visible solid fill hex, if any. */
export function hasSolidFill(node: AbstractNode): boolean {
  return !!node.fills?.some((f) => f.type === 'SOLID' && f.visible !== false && (f.opacity ?? 1) > 0);
}

/** True when there is at least one visible stroke with nonzero weight. */
export function hasVisibleStroke(node: AbstractNode): boolean {
  if (!node.strokes || node.strokes.length === 0) return false;
  const weight = typeof node.strokeWeight === 'number' ? node.strokeWeight : 1;
  if (weight <= 0) return false;
  return node.strokes.some((s) => s.visible !== false);
}

/** Categorize node size into coarse buckets for interactive classification. */
export type SizeBucket = 'icon' | 'standard' | 'fab' | 'oversize' | null;

export function sizeBucket(node: AbstractNode): SizeBucket {
  const w = node.width;
  const h = node.height;
  if (w == null || h == null) return null;
  if (w > 560) return 'oversize';
  if (w <= 48 && h <= 48 && Math.abs(w - h) <= Math.max(4, Math.min(w, h) * 0.15)) return 'icon';
  if (w >= 48 && w <= 72 && Math.abs(w - h) <= 4) return 'fab';
  return 'standard';
}

/** True when the node has exactly one TEXT child (common button/link shell). */
function hasSingleTextChild(node: AbstractNode): boolean {
  return !!node.children && node.children.length === 1 && node.children[0].type === 'TEXT';
}

/** True when node has a VECTOR/BOOLEAN/single svg-ish child — candidate icon button shell. */
function hasIconLikeChild(node: AbstractNode): boolean {
  if (!node.children || node.children.length === 0) return false;
  const icons = node.children.filter(
    (c) => c.type === 'VECTOR' || c.type === 'BOOLEAN_OPERATION' || c.type === 'ELLIPSE' || c.type === 'STAR',
  );
  const texts = node.children.filter((c) => c.type === 'TEXT');
  return icons.length >= 1 && texts.length === 0;
}

function isCircular(node: AbstractNode): boolean {
  const w = node.width ?? 0;
  const h = node.height ?? 0;
  if (w === 0 || h === 0) return false;
  const cr = typeof node.cornerRadius === 'number' ? node.cornerRadius : 0;
  return cr >= Math.min(w, h) / 2 - 1;
}

/** Short-circuit when plugin data already declared kind. */
function fromDeclaration(meta: InteractiveMeta | undefined): ClassifyResult | null {
  if (!meta?.declared || !meta.kind) return null;
  return {
    kind: meta.kind,
    confidence: 1,
    signals: ['declared'],
    state: meta.state,
    variant: meta.variant,
    declared: true,
  };
}

interface ScoreMap {
  [k: string]: number;
}

function addScore(scores: ScoreMap, kind: InteractiveKind, delta: number): void {
  scores[kind] = (scores[kind] ?? 0) + delta;
}

/**
 * Classify a node into an InteractiveKind with confidence 0–1.
 *
 * Returns `{ kind: null }` when evidence is insufficient or ambiguous.
 * Consumers MUST no-op when kind is null (do not fire rules).
 */
export function classifyInteractive(node: AbstractNode, parentKind?: InteractiveKind): ClassifyResult {
  // Short-circuit: declared via plugin data
  const declared = fromDeclaration(node.interactive);
  if (declared) return declared;

  const signals: string[] = [];
  const scores: ScoreMap = {};

  // Early skip for obviously non-interactive roles
  if (node.role && !['button', 'link', 'input', 'field', 'form', 'actions'].includes(node.role)) {
    return { kind: null, confidence: 0, signals: [`role:${node.role}`] };
  }

  // Role priors
  if (node.role === 'button') {
    signals.push('role=button');
    // Spread to all button-* candidates — structural signals narrow later
    for (const k of [
      'button-solid',
      'button-outline',
      'button-ghost',
      'button-text',
      'button-icon',
      'button-fab',
    ] as InteractiveKind[]) {
      addScore(scores, k, 0.5);
    }
  } else if (node.role === 'link') {
    signals.push('role=link');
    addScore(scores, 'link-standalone', 0.7);
    addScore(scores, 'link-inline', 0.5);
  }

  // Reactions — strong affordance signal
  if (node.reactions) {
    signals.push('reactions');
    for (const k of Object.keys(scores) as InteractiveKind[]) scores[k] += 0.25;
  }

  // Structural patterns
  const sizeB = sizeBucket(node);
  const single = hasSingleTextChild(node);
  const fill = hasSolidFill(node);
  const stroke = hasVisibleStroke(node);
  const iconShell = hasIconLikeChild(node);
  const circular = isCircular(node);

  if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') {
    if (single && fill) {
      signals.push('frame+fill+singleText');
      addScore(scores, 'button-solid', 0.5);
    }
    if (single && stroke && !fill) {
      signals.push('frame+stroke+singleText');
      addScore(scores, 'button-outline', 0.5);
    }
    if (single && !fill && !stroke) {
      signals.push('frame+noFillNoStroke+singleText');
      // Ghost requires reactions or state-variants to beat text-button
      if (node.reactions) {
        addScore(scores, 'button-ghost', 0.45);
      } else {
        addScore(scores, 'button-text', 0.3);
      }
    }
    // Icon shell: FRAME with icon/vector child(ren) but no TEXT. Use a loose
    // size gate — any dimension ≤ 72 counts as button-sized (beyond that we're
    // looking at a card, not a button). A visible fill/stroke carrier gives a
    // small boost because it confirms "this is a distinct tappable element".
    const minDim = Math.min(node.width ?? Number.POSITIVE_INFINITY, node.height ?? Number.POSITIVE_INFINITY);
    if (iconShell && minDim <= 72) {
      signals.push(`iconShell(minDim:${minDim})`);
      const carrierBoost = fill || stroke ? 0.15 : 0;
      if (circular && sizeB === 'fab') {
        addScore(scores, 'button-fab', 0.55 + carrierBoost);
      } else {
        addScore(scores, 'button-icon', 0.55 + carrierBoost);
      }
    }
    // Link-container pattern: a FRAME whose name contains "link" and holds
    // one or more TEXT children is a clickable row (e.g. "Don't have an
    // account? Sign up" named "Sign Up Link"). The frame itself is the tap
    // target, so we commit to link-standalone and let structure rules use
    // the reduced 24×24 threshold instead of the button 44×44.
    const hasTextChild = node.children?.some((c) => c.type === 'TEXT') ?? false;
    if (LINK_NAME_RE.test(node.name) && hasTextChild) {
      signals.push('frame-link-container');
      addScore(scores, 'link-standalone', 0.55);
    }
  }

  // Role=button + structure boost. Icon-only buttons (vector child, no text)
  // route to button-icon regardless of fill/stroke; otherwise fill → solid,
  // stroke → outline. Non-FRAME types used as buttons still classify so
  // structure rules can surface "wrong type" violations.
  if (node.role === 'button') {
    const hasTextChild = node.children?.some((c) => c.type === 'TEXT') ?? false;
    if (iconShell && !hasTextChild) {
      signals.push('role=button+iconChild');
      addScore(scores, 'button-icon', 0.4);
    } else if (fill) {
      signals.push('role=button+fill');
      addScore(scores, 'button-solid', 0.4);
    } else if (stroke) {
      signals.push('role=button+stroke');
      addScore(scores, 'button-outline', 0.4);
    }
  }

  // Bare TEXT node — candidate link or text-button
  if (node.type === 'TEXT') {
    const hasUnderline = false; // line-level decoration not in AbstractNode today — reserved for link-inline rule
    if (node.reactions) {
      signals.push('text+reactions');
      addScore(scores, 'link-standalone', 0.55);
      addScore(scores, 'button-text', 0.35);
    }
    // Inside a paragraph-style TEXT parent — reserved for run-level classification
    if (hasUnderline) addScore(scores, 'link-inline', 0.3);
  }

  // Size penalties
  if (sizeB === 'oversize') {
    signals.push('size:oversize');
    for (const k of Object.keys(scores) as InteractiveKind[]) {
      if (k.startsWith('button-')) scores[k] -= 0.3;
    }
  }

  // Parent context bias
  if (parentKind) {
    signals.push(`parentKind=${parentKind}`);
    if (parentKind.startsWith('button-')) {
      // Nested interactive shells: children are less likely to also be buttons
      for (const k of Object.keys(scores) as InteractiveKind[]) {
        if (k.startsWith('button-')) scores[k] -= 0.2;
      }
    }
  }

  // Name hint — weak fallback, anchored (not substring). Includes button-icon
  // so library components like "Button / Basis - Default" with an icon child
  // get a nudge toward button-icon when structural signals already committed.
  if (BUTTON_NAME_RE.test(node.name)) {
    signals.push('name~button');
    for (const k of ['button-solid', 'button-outline', 'button-ghost', 'button-icon'] as InteractiveKind[]) {
      addScore(scores, k, 0.1);
    }
  }
  if (LINK_NAME_RE.test(node.name)) {
    signals.push('name~link');
    addScore(scores, 'link-standalone', 0.15);
  }
  if (
    ICON_NAME_RE.test(node.name) &&
    (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE')
  ) {
    signals.push('name~icon');
    addScore(scores, 'button-icon', 0.1);
  }
  if (FAB_NAME_RE.test(node.name)) {
    signals.push('name~fab');
    addScore(scores, 'button-fab', 0.2);
  }

  // Pick winner
  const entries = Object.entries(scores) as Array<[InteractiveKind, number]>;
  if (entries.length === 0) {
    return { kind: null, confidence: 0, signals };
  }
  entries.sort(([, a], [, b]) => b - a);
  const [topKind, topScore] = entries[0];
  const runnerScore = entries[1]?.[1] ?? 0;

  // Need absolute score ≥ 0.5 and lead ≥ 0.15 to commit
  if (topScore < 0.5 || topScore - runnerScore < 0.15) {
    return { kind: null, confidence: Math.max(0, topScore), signals };
  }

  const confidence = Math.min(1, topScore);
  return { kind: topKind, confidence, signals };
}
