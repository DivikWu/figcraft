/** Parse hex to normalized [r, g, b] tuple (0-1 range). Returns null for invalid hex. */
export function hexToRgbTuple(hex: string): [number, number, number] | null {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return null;
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  ];
}
