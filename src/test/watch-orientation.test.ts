import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { wristPoseFromLandmarks } from '@/lib/wrist-pose';

describe('whole-watch crown direction', () => {
  it('rotates the complete showcase image toward the fingers, not the elbow', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    const rule = css.match(/\.tryon-demo-watch\s*\{([^}]+)\}/)?.[1] ?? '';
    const degrees = Number(rule.match(/rotate\((-?[\d.]+)deg\)/)?.[1]);
    expect(Number.isFinite(degrees)).toBe(true);
    expect(Math.sin(degrees * Math.PI / 180)).toBeCloseTo(-1);
    expect(rule).toContain('translate(-50%, -50%)');
  });

  for (const mirrored of [false, true]) {
    for (const handedness of ['Left', 'Right']) {
      for (const angle of [-Math.PI / 2, 0, Math.PI / 2, Math.PI]) {
        it(`keeps the live crown finger-facing: ${handedness}, mirror ${mirrored}, arm ${angle}`, () => {
          const fit = { containerWidth: 1000, containerHeight: 1000, videoWidth: 1000, videoHeight: 1000, mirrored };
          const dx = Math.cos(angle), dy = Math.sin(angle);
          const side = handedness === 'Left' ? 1 : -1;
          const landmarks = Array.from({ length: 21 }, () => ({ x: .5 + .2 * dx, y: .5 + .2 * dy, z: 0 }));
          landmarks[0] = { x: .5, y: .5, z: 0 };
          landmarks[5] = { x: .5 + .2 * dx - .1 * dy * side, y: .5 + .2 * dy + .1 * dx * side, z: 0 };
          landmarks[17] = { x: .5 + .2 * dx + .1 * dy * side, y: .5 + .2 * dy - .1 * dx * side, z: 0 };
          const pose = wristPoseFromLandmarks(landmarks, fit, 1, 0, 0, undefined, handedness);
          expect(pose).not.toBeNull();
          if (!pose) return;
          const expected = new THREE.Vector3(mirrored ? -dx : dx, -dy, 0);
          for (const twist of [0, .75, -.75, Math.PI]) {
            // Scene hierarchy: screen-plane Z rotation, then twist about local arm X.
            const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -pose.roll)
              .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), twist));
            const crown = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation);
            expect(crown.dot(expected)).toBeCloseTo(1);
            const bracelet = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
            expect(bracelet.dot(crown)).toBeCloseTo(0);
          }
          // Rotation correction must not change the existing wrist-centred anchor.
          expect(pose.x).toBeCloseTo(500 - expected.x * 60);
          expect(pose.y).toBeCloseTo(500 + expected.y * 60);
        });
      }
    }
  }
});