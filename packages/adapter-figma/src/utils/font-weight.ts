/**
 * Shared font weight resolution — maps numeric weight (100–900) to Figma style name.
 *
 * Used by:
 *   - style-mapper.ts (DTCG token sync)
 *   - design-system-build.ts (create_text_style)
 */

/** Resolve a numeric font weight (100–900) or string to a Figma font style name. */
export function resolveWeight(weight: number | string | undefined): string {
  if (!weight) return 'Regular';
  const w = typeof weight === 'string' ? parseInt(weight, 10) : weight;
  if (Number.isNaN(w)) return String(weight);
  if (w <= 100) return 'Thin';
  if (w <= 200) return 'ExtraLight';
  if (w <= 300) return 'Light';
  if (w <= 400) return 'Regular';
  if (w <= 500) return 'Medium';
  if (w <= 600) return 'SemiBold';
  if (w <= 700) return 'Bold';
  if (w <= 800) return 'ExtraBold';
  return 'Black';
}
