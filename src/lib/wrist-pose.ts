import { toCoverPoint, wristOverlayFromLandmarks, WRIST_TO_PALM, type NormalizedLandmark, type VideoFit } from '@/lib/wrist-overlay';

/** Real wrist width (mm) the 3D bracelet is built around. */
export const MODEL_WRIST_WIDTH_MM = 60;

export type WristPose = {
  /** Case centre in stage pixels (y down). */
  x: number;
  y: number;
  /** Stage pixels per model millimetre. */
  scale: number;
  /** Screen-plane rotation of the arm axis (rad, y-down). */
  roll: number;
  /** Rotation about the arm axis (wrist twist). */
  twist: number;
  /** Rotation of the arm toward / away from the camera. */
  pitch: number;
  /** Palm (inside of wrist) toward the camera, from the 3D palm normal + handedness. Undefined if unknown. */
  palmFacing?: boolean | undefined;
};

/**
 * Palm-normal test on raw (un-mirrored) landmarks. n = (middleMCP - wrist) x (indexMCP - pinkyMCP).
 * MediaPipe z grows away from the camera; its handedness label assumes a mirrored image, so on raw
 * camera frames "Left" is the user's real right hand. Returns true when the palm faces the camera.
 */
export function palmFacesCamera(landmarks: readonly NormalizedLandmark[], videoWidth: number, videoHeight: number, handedness?: string): boolean | undefined {
  if (handedness !== 'Left' && handedness !== 'Right') return undefined;
  const w = landmarks[0], m = landmarks[9], i = landmarks[5], p = landmarks[17];
  if (!w || !m || !i || !p) return undefined;
  const ux = (m.x - w.x) * videoWidth, uy = (m.y - w.y) * videoHeight;
  const vx = (i.x - p.x) * videoWidth, vy = (i.y - p.y) * videoHeight;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  // Hand nearly edge-on: not decisive.
  if (!len || Math.abs(nz) / len < .12) return undefined;
  const realRight = handedness === 'Left';
  const backFacing = realRight ? nz > 0 : nz < 0;
  return !backFacing;
}

/** Wrist width estimate robust to curled fingers (shrinks knuckle span) and pitch (shrinks palm length). */
export function wristWidthPx(palmWidth: number, palmLength: number) {
  // Middle metacarpal (~68 mm) vs wrist width (~58 mm); knuckle span (~80 mm) vs wrist (~0.9x in this model).
  return Math.max(palmWidth * WRIST_TO_PALM, palmLength * .85);
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function wristPoseFromLandmarks(
  landmarks: readonly NormalizedLandmark[],
  fit: VideoFit,
  size = 1,
  armAdjustment = 0,
  crossAdjustment = 0,
  /** Index→pinky screen sign when the watch face looks at the camera (calibrated per session). */
  handSign?: number,
  handedness?: string,
): (WristPose & { side: number }) | null {
  const overlay = wristOverlayFromLandmarks(landmarks, fit, size, armAdjustment, crossAdjustment);
  if (!overlay) return null;
  const wrist = landmarks[0]!;
  const index = landmarks[5]!;
  const pinky = landmarks[17]!;
  const cover = Math.max(fit.containerWidth / fit.videoWidth, fit.containerHeight / fit.videoHeight);
  const depthPx = fit.videoWidth * cover;
  const r = overlay.rotation;
  const ip = toCoverPoint(index, fit);
  const pp = toCoverPoint(pinky, fit);
  const wp = toCoverPoint(wrist, fit);
  // Model +Y (across the arm) projected on screen.
  const s = (ip.x - pp.x) * Math.sin(r) + (ip.y - pp.y) * -Math.cos(r);
  const side = Math.sign(s) || 1;
  const hs = handSign ?? side;
  const towardCamY = -((index.z ?? 0) - (pinky.z ?? 0)) * depthPx;
  // Full +-180 deg twist: turning the hand over reveals the case side and the clasp underneath.
  const twist = Number.isFinite(towardCamY) ? Math.atan2(towardCamY * hs, s * hs) : 0;
  const mid = { x: (ip.x + pp.x) / 2, y: (ip.y + pp.y) / 2 };
  const palmLength = Math.max(4, Math.hypot(mid.x - wp.x, mid.y - wp.y));
  const mp = landmarks[9] ? toCoverPoint(landmarks[9], fit) : mid;
  const metacarpal = Math.hypot(mp.x - wp.x, mp.y - wp.y);
  const towardCamX = -((((index.z ?? 0) + (pinky.z ?? 0)) / 2) - (wrist.z ?? 0)) * depthPx;
  const pitch = Number.isFinite(towardCamX) ? clamp(-Math.atan2(towardCamX, palmLength), -.7, .7) : 0;
  return {
    x: overlay.x,
    y: overlay.y,
    scale: (wristWidthPx(overlay.palmWidth, metacarpal) * size) / MODEL_WRIST_WIDTH_MM,
    palmFacing: palmFacesCamera(landmarks, fit.videoWidth, fit.videoHeight, handedness),
    roll: r,
    twist,
    pitch,
    side,
  };
}

/** One Euro filter: low jitter when still, low lag when moving. */
export class OneEuroFilter {
  private x: number | null = null;
  private dx = 0;
  private t = 0;
  constructor(private minCutoff = 1.2, private beta = .02, private dCutoff = 1, private angular = false) {}
  reset() { this.x = null; this.dx = 0; }
  private alpha(cutoff: number, dt: number) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  filter(value: number, timeMs: number) {
    if (this.x === null) { this.x = value; this.t = timeMs; return value; }
    const dt = Math.max(1e-3, (timeMs - this.t) / 1000);
    this.t = timeMs;
    let v = value;
    if (this.angular) { let d = v - this.x; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; v = this.x + d; }
    const rawDx = (v - this.x) / dt;
    this.dx += this.alpha(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += this.alpha(cutoff, dt) * (v - this.x);
    return this.x;
  }
}

export function createPoseFilter() {
  const f = {
    x: new OneEuroFilter(1.6, .01), y: new OneEuroFilter(1.6, .01), scale: new OneEuroFilter(.7, .03),
    roll: new OneEuroFilter(1.2, .35, 1, true), twist: new OneEuroFilter(.8, .2, 1, true), pitch: new OneEuroFilter(.7, .15),
  };
  return {
    reset() { Object.values(f).forEach(item => item.reset()); },
    filter(p: WristPose, t: number): WristPose {
      return { x: f.x.filter(p.x, t), y: f.y.filter(p.y, t), scale: f.scale.filter(p.scale, t), roll: f.roll.filter(p.roll, t), twist: f.twist.filter(p.twist, t), pitch: f.pitch.filter(p.pitch, t), palmFacing: p.palmFacing };
    },
  };
}
