export type NormalizedLandmark = { x: number; y: number; z?: number };

export type VideoFit = {
  containerWidth: number;
  containerHeight: number;
  videoWidth: number;
  videoHeight: number;
  mirrored: boolean;
};

export type WristOverlay = {
  x: number;
  y: number;
  size: number;
  rotation: number;
  palmWidth: number;
  tilt: number;
};

/** Fraction of palm length behind the wrist landmark where the case centre sits. */
export const WRIST_ANCHOR = .3;
/** Wrist width relative to the index–pinky knuckle span. */
export const WRIST_TO_PALM = .9;
/** Try-on image width relative to wrist width (case is ~65% of the image width). */
export const WATCH_TO_WRIST = 1.5;

export function toCoverPoint(point: NormalizedLandmark, fit: VideoFit) {
  const scale = Math.max(fit.containerWidth / fit.videoWidth, fit.containerHeight / fit.videoHeight);
  const renderedWidth = fit.videoWidth * scale;
  const renderedHeight = fit.videoHeight * scale;
  const cropX = (renderedWidth - fit.containerWidth) / 2;
  const cropY = (renderedHeight - fit.containerHeight) / 2;
  const rawX = point.x * renderedWidth - cropX;
  return {
    x: fit.mirrored ? fit.containerWidth - rawX : rawX,
    y: point.y * renderedHeight - cropY,
  };
}

export function wristOverlayFromLandmarks(
  landmarks: readonly NormalizedLandmark[],
  fit: VideoFit,
  sizeAdjustment = 1,
  armAdjustment = 0,
  crossAdjustment = 0,
): WristOverlay | null {
  const wrist = landmarks[0];
  const indexMcp = landmarks[5];
  const pinkyMcp = landmarks[17];
  if (!wrist || !indexMcp || !pinkyMcp || fit.videoWidth <= 0 || fit.videoHeight <= 0 || fit.containerWidth <= 0 || fit.containerHeight <= 0) return null;
  if (![wrist, indexMcp, pinkyMcp].every(point => Number.isFinite(point.x) && Number.isFinite(point.y)) || ![sizeAdjustment, armAdjustment, crossAdjustment].every(Number.isFinite)) return null;

  const wristPoint = toCoverPoint(wrist, fit);
  const indexPoint = toCoverPoint(indexMcp, fit);
  const pinkyPoint = toCoverPoint(pinkyMcp, fit);
  const palmCenter = {
    x: (indexPoint.x + pinkyPoint.x) / 2,
    y: (indexPoint.y + pinkyPoint.y) / 2,
  };
  const palmWidth = Math.hypot(indexPoint.x - pinkyPoint.x, indexPoint.y - pinkyPoint.y);
  if (!Number.isFinite(palmWidth) || palmWidth < 4) return null;
  const palmLength = Math.hypot(palmCenter.x - wristPoint.x, palmCenter.y - wristPoint.y);
  if (palmLength < 4) return null;
  // Sit just behind the wrist crease so the case edge meets the hand, as on a real wrist.
  const offset = palmLength * WRIST_ANCHOR + palmWidth * armAdjustment;
  // Forearm axis: blend wrist→knuckle centre with wrist→middle knuckle so finger spread can't skew it.
  const middle = landmarks[9];
  const mp = middle && Number.isFinite(middle.x) && Number.isFinite(middle.y) ? toCoverPoint(middle, fit) : palmCenter;
  let ax = (palmCenter.x - wristPoint.x) / palmLength, ay = (palmCenter.y - wristPoint.y) / palmLength;
  const ml = Math.hypot(mp.x - wristPoint.x, mp.y - wristPoint.y);
  const dot = ml > 4 ? (ax * (mp.x - wristPoint.x) + ay * (mp.y - wristPoint.y)) / ml : 0;
  if (dot > .7) { ax = ax * .5 + (mp.x - wristPoint.x) / ml * .5; ay = ay * .5 + (mp.y - wristPoint.y) / ml * .5; }
  const al = Math.hypot(ax, ay) || 1;
  const axisX = ax / al;
  const axisY = ay / al;
  // Depth foreshortens the bracelet across the wrist, not the arm direction.
  const coverScale = Math.max(fit.containerWidth / fit.videoWidth, fit.containerHeight / fit.videoHeight);
  const depth = ((indexMcp.z ?? 0) - (pinkyMcp.z ?? 0)) * fit.videoWidth * coverScale;
  const tilt = Number.isFinite(depth) ? Math.max(.6, palmWidth / Math.hypot(palmWidth, depth)) : 1;
  const wristWidth = palmWidth * WRIST_TO_PALM;

  return {
    x: wristPoint.x - axisX * offset - axisY * palmWidth * crossAdjustment,
    y: wristPoint.y - axisY * offset + axisX * palmWidth * crossAdjustment,
    // Image width: the case fills most of the wrist; the bracelet runs past both arm edges.
    size: Math.max(24, Math.min(Math.min(fit.containerWidth, fit.containerHeight) * .8, wristWidth * WATCH_TO_WRIST * sizeAdjustment)),
    // Source is top-down with the crown pointing right: crown toward the hand, bracelet across the arm.
    rotation: Math.atan2(axisY, axisX),
    palmWidth,
    tilt,
  };
}

/** Keep manual placement in palm-width units so it follows camera distance and rotation. */
export function armAdjustmentFromDrag(start: number, dx: number, dy: number, rotation: number, palmWidth: number) {
  if (![start, dx, dy, rotation, palmWidth].every(Number.isFinite) || palmWidth <= 0) return start;
  return Math.max(-.6, Math.min(1.2, start - (Math.cos(rotation) * dx + Math.sin(rotation) * dy) / palmWidth));
}

export function crossAdjustmentFromDrag(start: number, dx: number, dy: number, rotation: number, palmWidth: number) {
  if (![start, dx, dy, rotation, palmWidth].every(Number.isFinite) || palmWidth <= 0) return start;
  return Math.max(-.5, Math.min(.5, start + (-Math.sin(rotation) * dx + Math.cos(rotation) * dy) / palmWidth));
}

export function smoothWristOverlay(previous: WristOverlay | null, next: WristOverlay, amount = 0.24): WristOverlay {
  if (!previous) return next;
  const blend = (from: number, to: number) => from + (to - from) * amount;
  let rotationDelta = next.rotation - previous.rotation;
  while (rotationDelta > Math.PI) rotationDelta -= Math.PI * 2;
  while (rotationDelta < -Math.PI) rotationDelta += Math.PI * 2;
  return {
    x: blend(previous.x, next.x),
    y: blend(previous.y, next.y),
    size: blend(previous.size, next.size),
    rotation: previous.rotation + rotationDelta * amount,
    palmWidth: blend(previous.palmWidth, next.palmWidth),
    tilt: blend(previous.tilt, next.tilt),
  };
}