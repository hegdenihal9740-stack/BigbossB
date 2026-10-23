// Back should always move one step back in the tab's history — never jump
// straight to a fixed page while a previous entry exists. A full page load
// (refresh, /auth redirect chain) resets TanStack's in-app history index to 0,
// so the index alone can't tell whether there is a previous step.
export function goBackOrTo(fallback: string): boolean {
  const idx = (window.history.state as { __TSR_index?: number } | null)?.__TSR_index ?? 0;
  if (idx > 0 || window.history.length > 1) { window.history.back(); return true; }
  window.location.assign(fallback);
  return false;
}
