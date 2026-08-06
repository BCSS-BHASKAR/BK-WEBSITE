
export function sparkPointsForPlate(plate: string, total: number, len = 8): number[] {
  let h = 0;
  for (let i = 0; i < plate.length; i++) h = (h * 31 + plate.charCodeAt(i)) % 997;
  const base = Math.max(1, total / len);
  return Array.from({ length: len }, (_, i) => {
    const w = 0.55 + 0.45 * Math.sin((h + i) * 0.85);
    return Math.max(1, Math.round(base * w));
  });
}
