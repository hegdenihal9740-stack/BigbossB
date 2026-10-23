import { describe, expect, it } from 'vitest';
import { palmFacesCamera, wristWidthPx } from '@/lib/wrist-pose';

// Raw frame, fingers up. Real right hand back-to-camera: index MCP on the right of the raw (un-mirrored) image.
const backRight = [{ x: .5, y: .8 }, ...Array(4).fill({ x: .5, y: .5 }), { x: .6, y: .5 }, ...Array(3).fill({ x: .5, y: .5 }), { x: .5, y: .5 }, ...Array(7).fill({ x: .5, y: .5 }), { x: .4, y: .5 }];
const palmRight = backRight.map((p, i) => i === 5 ? { x: .4, y: .5 } : i === 17 ? { x: .6, y: .5 } : p);

describe('palm facing from hand landmarks', () => {
  it('real right hand (labelled Left) showing its back is not palm-facing', () => {
    expect(palmFacesCamera(backRight, 640, 480, 'Left')).toBe(false);
  });
  it('real right hand turned over is palm-facing', () => {
    expect(palmFacesCamera(palmRight, 640, 480, 'Left')).toBe(true);
  });
  it('unknown handedness gives no decision', () => {
    expect(palmFacesCamera(backRight, 640, 480)).toBeUndefined();
  });
  it('curled fingers do not shrink the wrist size', () => {
    expect(wristWidthPx(50, 100)).toBe(85);
  });
});
