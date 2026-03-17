/**
 * Color conversion utilities — hex ↔ Figma RGBA, contrast calculation.
 */

/** Parse hex color string to Figma RGBA (0–1 range). */
export function hexToFigmaRgba(hex: string): RGBA {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const a = clean.length === 8 ? parseInt(clean.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

/** Parse hex color string to Figma RGB (0–1 range, no alpha). For use in fills[].color. */
export function hexToFigmaRgb(hex: string): RGB {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return { r, g, b };
}

/** Convert Figma RGB or RGBA to hex string. Alpha channel omitted when opaque. */
export function figmaRgbaToHex(color: RGB | RGBA): string {
  const r = Math.round(color.r * 255).toString(16).padStart(2, '0');
  const g = Math.round(color.g * 255).toString(16).padStart(2, '0');
  const b = Math.round(color.b * 255).toString(16).padStart(2, '0');
  const hex = `#${r}${g}${b}`;
  if ('a' in color && color.a !== 1) {
    const a = Math.round(color.a * 255).toString(16).padStart(2, '0');
    return hex + a;
  }
  return hex;
}

/** Calculate relative luminance (WCAG 2.1). */
export function relativeLuminance(color: RGB): number {
  const [rs, gs, bs] = [color.r, color.g, color.b].map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** Calculate contrast ratio between two colors (WCAG 2.1). */
export function contrastRatio(fg: RGB, bg: RGB): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Check if two hex colors are equal (case-insensitive). */
export function colorsEqual(a: string, b: string): boolean {
  return a.toLowerCase().replace('#', '') === b.toLowerCase().replace('#', '');
}
