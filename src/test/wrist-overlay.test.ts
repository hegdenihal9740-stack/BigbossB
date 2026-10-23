import { describe, expect, it } from 'vitest';
import { armAdjustmentFromDrag, crossAdjustmentFromDrag, wristOverlayFromLandmarks } from '@/lib/wrist-overlay';

const fit = { containerWidth: 1000, containerHeight: 500, videoWidth: 1000, videoHeight: 500, mirrored: false };

function landmarks(wrist = { x: .5, y: .8 }, index = { x: .4, y: .5 }, pinky = { x: .6, y: .5 }) {
  const points = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
  points[0] = wrist;
  points[5] = index;
  points[17] = pinky;
  return points;
}

describe('wrist overlay geometry', () => {
  it('positions and rotates the watch at the wrist', () => {
    const overlay = wristOverlayFromLandmarks(landmarks(), fit);
    expect(overlay?.x).toBe(500);
    expect(overlay?.y).toBe(445);
    expect(overlay?.rotation).toBeCloseTo(-Math.PI / 2);
  });

  it('applies the customer size adjustment', () => {
    const normal = wristOverlayFromLandmarks(landmarks(), fit, 1);
    const larger = wristOverlayFromLandmarks(landmarks(), fit, 1.2);
    expect(larger?.size).toBeCloseTo((normal?.size ?? 0) * 1.2);
  });

  it('returns null when required wrist landmarks are unavailable', () => {
    expect(wristOverlayFromLandmarks([], fit)).toBeNull();
  });

  it('moves the anchor back along a horizontal forearm', () => {
    const overlay = wristOverlayFromLandmarks(landmarks({ x: .5, y: .5 }, { x: .7, y: .3 }, { x: .7, y: .7 }), fit);
    expect(overlay?.x).toBe(440);
    expect(overlay?.y).toBe(250);
  });

  it('preserves manual offset as the detected wrist moves', () => {
    expect(wristOverlayFromLandmarks(landmarks(), fit, 1, .2)?.y).toBe(485);
    expect(wristOverlayFromLandmarks(landmarks({ x: .5, y: .7 }), fit, 1, .2)?.y).toBe(420);
  });

  it('projects touch and mouse movement onto the arm axis only', () => {
    expect(armAdjustmentFromDrag(0, 80, 40, -Math.PI / 2, 200)).toBeCloseTo(.2);
    expect(armAdjustmentFromDrag(0, -40, 80, 0, 200)).toBeCloseTo(.2);
  });

  it('rejects nonfinite landmarks and a collapsed palm axis', () => {
    expect(wristOverlayFromLandmarks(landmarks({ x: NaN, y: .8 }), fit)).toBeNull();
    expect(wristOverlayFromLandmarks(landmarks({ x: .5, y: .5 }), fit)).toBeNull();
  });

  it('keeps the crown toward the fingers and bracelet across a horizontal arm', () => {
    const overlay = wristOverlayFromLandmarks(landmarks({ x: .5, y: .5 }, { x: .7, y: .3 }, { x: .7, y: .7 }), fit);
    expect(overlay?.rotation).toBeCloseTo(0);
    expect(overlay?.size).toBeCloseTo(270);
  });

  it('allows cross-wrist fine placement independently of arm placement', () => {
    expect(crossAdjustmentFromDrag(0, 40, 80, -Math.PI / 2, 200)).toBeCloseTo(.2);
    const overlay = wristOverlayFromLandmarks(landmarks(), fit, 1, 0, .2);
    expect(overlay?.x).toBe(540);
    expect(overlay?.y).toBe(445);
  });

  it('foreshortens across the wrist when depth changes', () => {
    const points = landmarks().map(point => ({ ...point, z: 0 }));
    const index = points[5];
    if (index) index.z = .15;
    expect(wristOverlayFromLandmarks(points, fit)?.tilt).toBeCloseTo(.8);
    expect(wristOverlayFromLandmarks(landmarks(), fit)?.tilt).toBe(1);
  });

  it('preserves calibrated placement when distance changes', () => {
    const near = wristOverlayFromLandmarks(landmarks(), fit, 1, .2, .1);
    const far = wristOverlayFromLandmarks(landmarks({ x: .5, y: .65 }, { x: .45, y: .5 }, { x: .55, y: .5 }), fit, 1, .2, .1);
    expect(far?.size).toBeCloseTo((near?.size ?? 0) / 2);
    expect((far?.x ?? 0) - 500).toBeCloseTo(((near?.x ?? 0) - 500) / 2);
    expect((far?.y ?? 0) - 325).toBeCloseTo(((near?.y ?? 0) - 400) / 2);
  });

  it('maps the fit to mirrored and portrait cropped camera views', () => {
    expect(wristOverlayFromLandmarks(landmarks(), { ...fit, mirrored: true }, 1, 0, .2)?.x).toBe(540);
    const portrait = wristOverlayFromLandmarks(landmarks(), { ...fit, containerWidth: 400, containerHeight: 800 });
    expect(portrait?.x).toBe(200);
    expect(portrait?.y).toBe(712);
  });
});