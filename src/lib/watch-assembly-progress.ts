export function scrollAssemblyProgress(top: number, height: number, viewportHeight: number) {
  return Math.min(1, Math.max(0, -top / Math.max(1, height - viewportHeight)));
}

export function partAssemblyProgress(progress: number, index: number, count: number) {
  const delay = count > 1 ? index / (count - 1) * .18 : 0;
  const t = Math.min(1, Math.max(0, (progress - delay) / .82));
  return t * t * (3 - 2 * t);
}