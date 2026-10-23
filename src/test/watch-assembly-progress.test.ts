import { describe, expect, it } from 'vitest';
import { partAssemblyProgress, scrollAssemblyProgress } from '@/lib/watch-assembly-progress';

describe('Scroll-controlled watch assembly', () => {
  it('starts scattered and finishes assembled across the scroll distance', () => {
    expect(scrollAssemblyProgress(0, 1600, 800)).toBe(0);
    expect(scrollAssemblyProgress(-400, 1600, 800)).toBe(.5);
    expect(scrollAssemblyProgress(-800, 1600, 800)).toBe(1);
    for (let i = 0; i < 7; i++) {
      expect(partAssemblyProgress(0, i, 7)).toBe(0);
      expect(partAssemblyProgress(1, i, 7)).toBe(1);
    }
  });
  it('reverses with scrolling upward and clamps outside the section', () => {
    expect(scrollAssemblyProgress(-200, 1600, 800)).toBe(.25);
    expect(scrollAssemblyProgress(200, 1600, 800)).toBe(0);
    expect(scrollAssemblyProgress(-1800, 1600, 800)).toBe(1);
    expect(partAssemblyProgress(.5, 0, 7)).toBeGreaterThan(partAssemblyProgress(.5, 6, 7));
  });
});