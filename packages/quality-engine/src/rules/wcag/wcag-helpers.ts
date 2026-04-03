/**
 * Shared WCAG helpers for contrast rules.
 */

type RgbTuple = [number, number, number];

/** Relative luminance per WCAG 2.1 (input: 0–1 normalized RGB). */
export function relativeLuminanceTuple(rgb: RgbTuple): number {
  const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two RGB tuples. */
export function contrastRatioTuple(fg: RgbTuple, bg: RgbTuple): number {
  const l1 = relativeLuminanceTuple(fg);
  const l2 = relativeLuminanceTuple(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Determine if text qualifies as "large" per WCAG (>= 18px or >= 14px bold). */
export function isLargeText(fontSize?: number, fontStyle?: string): boolean {
  const size = fontSize ?? 16;
  return size >= 18 || (size >= 14 && (fontStyle?.includes('Bold') ?? false));
}
