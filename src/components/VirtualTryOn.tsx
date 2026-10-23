import { useCallback, useEffect, useRef, useState } from 'react';
import { Aperture, Camera, Download, Share2, SwitchCamera, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { watches } from '@/lib/watches';
import { whatsappLink } from '@/lib/whatsapp';
import { createPoseFilter, wristPoseFromLandmarks } from '@/lib/wrist-pose';
import { TryOnScene, type AmbientSample, type TrackingTarget } from '@/components/tryon/TryOnScene';
import { finishes, type Finish } from '@/components/tryon/SkeletonWatch';

type Watch = typeof watches[number];
type TryOnStatus = 'idle' | 'loading' | 'tracking' | 'measuring' | 'searching' | 'denied' | 'unsupported' | 'error';
type Facing = 'environment' | 'user';
type Detector = { detectForVideo: (video: HTMLVideoElement, timestamp: number) => { landmarks?: Array<Array<{ x: number; y: number; z?: number }>>; handedness?: Array<Array<{ categoryName?: string; score?: number }>> }; close?: () => void };

/** Frames spent measuring the wrist before the watch is placed (~0.5 s). */
const CALIBRATION_FRAMES = 15;

const statusText: Record<TryOnStatus, string> = {
  idle: 'Your camera stays on this device and is never recorded.',
  loading: 'Starting camera and wrist detection…',
  tracking: 'Fitted to your wrist',
  measuring: 'Measuring your wrist… hold still',
  searching: 'Show your wrist to position the watch',
  denied: 'Camera access was denied. Allow it in your browser settings and try again.',
  unsupported: 'Camera try-on is not supported by this browser.',
  error: 'Try-on could not start. Check your camera and try again.',
};

async function openCamera(mode: Facing): Promise<MediaStream> {
  const size = { width: { ideal: 1280 }, height: { ideal: 720 } };
  if (mode === 'environment') {
    try { return await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { exact: 'environment' } } }); }
    catch (error) { if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) throw error; }
  }
  try { return await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: mode }, ...size } }); }
  catch (error) { if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) throw error; }
  // Some phones reject "exact": pick the camera by its label instead.
  try {
    const tmp = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    tmp.getTracks().forEach(t => t.stop());
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
    const re = mode === 'environment' ? /back|rear|environment|world/i : /front|user|face/i;
    const cam = cams.find(d => re.test(d.label)) ?? (mode === 'environment' ? cams[cams.length - 1] : cams[0]);
    if (cam?.deviceId) return await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: cam.deviceId }, ...size } });
  } catch (error) { if (error instanceof DOMException && error.name === 'NotAllowedError') throw error; }
  return navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: mode }, ...size } });
}

export function VirtualTryOn({ watch, open, onClose }: { watch: Watch; open: boolean; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<Detector | null>(null);
  const frameRef = useRef(0);
  const lastDetectionRef = useRef(0);
  const sessionRef = useRef(0);
  const mountedRef = useRef(true);
  const mirroredRef = useRef(false);
  const filterRef = useRef(createPoseFilter());
  const handSignRef = useRef<number | null>(null);
  const handLabelRef = useRef<string | null>(null);
  const targetRef = useRef<TrackingTarget>({ pose: null, lastSeen: 0 });
  const ambientRef = useRef<AmbientSample>({ r: 1, g: 1, b: 1 });
  const sampleCanvas = useRef<HTMLCanvasElement | null>(null);
  const frameCount = useRef(0);
  const tuneRef = useRef({ size: 1, arm: 0, cross: 0 });
  const calibRef = useRef(0);

  const [status, setStatus] = useState<TryOnStatus>('idle');
  const [mirrored, setMirrored] = useState(false);
  const [facing, setFacing] = useState<Facing>('environment');
  const [finish, setFinish] = useState<Finish>(watch.id as Finish);
  const [flash, setFlash] = useState(false);
  const [controlsShown, setControlsShown] = useState(true);
  const hideTimer = useRef(0);
  const [sizeMm, setSizeMm] = useState(42);
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);
  const shotName = () => `private-flight-${finish}-try-on.png`;
  const download = () => { if (!shot) return; const a = document.createElement('a'); a.href = shot.url; a.download = shotName(); a.click(); };
  const share = async () => {
    if (!shot) return;
    const name = watches.find(x => x.id === finish)?.name ?? 'watch';
    const text = `Does this BIG-B ${name} look good on me? ${window.location.origin}/shop/${finish}`;
    const file = new File([shot.blob], shotName(), { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], text }); return; } catch { return; } }
    download();
    window.open(whatsappLink(text), '_blank', 'noopener,noreferrer');
  };

  useEffect(() => { setFinish(watch.id as Finish); }, [watch.id]);

  const stop = useCallback(() => {
    sessionRef.current += 1;
    window.cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    detectorRef.current?.close?.();
    detectorRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    targetRef.current = { pose: null, lastSeen: 0 };
    filterRef.current.reset();
  }, []);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; stop(); }; }, [stop]);
  useEffect(() => { if (!open) { stop(); setStatus('idle'); } }, [open, stop]);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // No browser-history tricks here: pushing/popping entries raced the router and sent users back to the collection.
  const close = useCallback(() => closeRef.current(), []);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKeyDown);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKeyDown); document.body.style.overflow = overflow; };
  }, [open, close]);

  const sampleAmbient = (video: HTMLVideoElement) => {
    const c = sampleCanvas.current ?? (sampleCanvas.current = Object.assign(document.createElement('canvas'), { width: 8, height: 8 }));
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) return;
    g.drawImage(video, 0, 0, 8, 8);
    const d = g.getImageData(0, 0, 8, 8).data;
    let r = 0, gg = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]!; gg += d[i + 1]!; b += d[i + 2]!; }
    const n = d.length / 4 * 255;
    const lum = Math.max(.05, (r + gg + b) / (3 * n));
    // Keep hue, normalise brightness so reflections tint without darkening the metal.
    ambientRef.current = { r: Math.min(1.4, r / n / lum), g: Math.min(1.4, gg / n / lum), b: Math.min(1.4, b / n / lum) };
  };

  const runDetection = useCallback(() => {
    const video = videoRef.current, stage = stageRef.current, detector = detectorRef.current;
    if (!video || !stage || !detector || !streamRef.current) return;
    const now = performance.now();
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && now - lastDetectionRef.current > 30) {
      lastDetectionRef.current = now;
      let result: ReturnType<Detector['detectForVideo']>;
      try { result = detector.detectForVideo(video, now); } catch { stop(); setStatus('error'); return; }
      if (++frameCount.current % 20 === 0) sampleAmbient(video);
      const landmarks = result.landmarks?.[0];
      const t = tuneRef.current;
      const hand = (result.handedness?.[0]?.[0]?.score ?? 0) > .6 ? result.handedness?.[0]?.[0]?.categoryName : undefined;
      // A different hand came into view: recalculate its own orientation instead of reusing the old one.
      if (hand && handLabelRef.current && hand !== handLabelRef.current) { handSignRef.current = null; filterRef.current.reset(); }
      if (hand) handLabelRef.current = hand;
      const pose = landmarks ? wristPoseFromLandmarks(landmarks, { containerWidth: stage.clientWidth, containerHeight: stage.clientHeight, videoWidth: video.videoWidth, videoHeight: video.videoHeight, mirrored: mirroredRef.current }, t.size, t.arm, t.cross, handSignRef.current ?? undefined, hand) : null;
      if (pose) {
        // First frame for this hand: assume the back of the hand faces the camera.
        if (handSignRef.current === null) handSignRef.current = pose.side;
        const filtered = filterRef.current.filter(pose, now);
        // Measure the wrist over several frames before placing the watch, so size and position are settled.
        if (calibRef.current < CALIBRATION_FRAMES) {
          calibRef.current += 1;
          setStatus(s => s === 'measuring' ? s : 'measuring');
        } else {
          targetRef.current = { pose: filtered, lastSeen: now };
          setStatus(s => s === 'tracking' ? s : 'tracking');
        }
      } else {
        if (now - targetRef.current.lastSeen > 450) { filterRef.current.reset(); handSignRef.current = null; handLabelRef.current = null; calibRef.current = 0; }
        setStatus(s => s === 'searching' ? s : 'searching');
      }
    }
    frameRef.current = window.requestAnimationFrame(runDetection);
  }, [stop]);

  const start = useCallback(async (mode: Facing = facing) => {
    if (!navigator.mediaDevices?.getUserMedia) { setStatus('unsupported'); return; }
    stop();
    const session = sessionRef.current;
    setStatus('loading');
    try {
      const [{ FilesetResolver, HandLandmarker }, stream] = await Promise.all([
        import('@mediapipe/tasks-vision'),
        openCamera(mode),
      ]);
      if (!mountedRef.current || session !== sessionRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      const settings = stream.getVideoTracks()[0]?.getSettings();
      const front = settings?.facingMode ? settings.facingMode === 'user' : mode === 'user';
      mirroredRef.current = front;
      setMirrored(front);
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm');
      if (session !== sessionRef.current) return;
      const opts = (delegate: 'GPU' | 'CPU') => ({
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate },
        runningMode: 'VIDEO' as const, numHands: 1, minHandDetectionConfidence: .55, minHandPresenceConfidence: .5, minTrackingConfidence: .55,
      });
      // Some phone GPUs fail to load the model: fall back to CPU.
      // Some GPUs hang instead of failing, so give up on GPU after a few seconds.
      const gpu = Promise.race([
        HandLandmarker.createFromOptions(vision, opts('GPU')),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('gpu timeout')), 6000)),
      ]);
      const detector = await gpu.catch(() => HandLandmarker.createFromOptions(vision, opts('CPU')));
      if (session !== sessionRef.current) { detector.close(); return; }
      detectorRef.current = detector;
      const video = videoRef.current;
      if (!video) { stop(); return; }
      video.srcObject = stream;
      await video.play();
      if (session !== sessionRef.current) return;
      setStatus('searching');
      frameRef.current = window.requestAnimationFrame(runDetection);
    } catch (error) {
      if (session !== sessionRef.current) return;
      stop();
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      setStatus(denied ? 'denied' : 'error');
    }
  }, [facing, runDetection, stop]);

  // Start whenever the dialog opens (and again if React remounts the effect), stop on close.
  const startRef = useRef(start);
  startRef.current = start;
  useEffect(() => {
    if (!open) return;
    mountedRef.current = true;
    void startRef.current();
    return () => stop();
  }, [open, stop]);

  useEffect(() => {
    window.clearTimeout(hideTimer.current);
    if (status === 'tracking') hideTimer.current = window.setTimeout(() => setControlsShown(false), 2500);
    else setControlsShown(true);
    return () => window.clearTimeout(hideTimer.current);
  }, [status]);
  const reveal = () => {
    setControlsShown(true);
    window.clearTimeout(hideTimer.current);
    if (status === 'tracking') hideTimer.current = window.setTimeout(() => setControlsShown(false), 3500);
  };

  const flip = () => { const next: Facing = mirroredRef.current ? 'environment' : 'user'; setFacing(next); void start(next); };

  const capture = () => {
    const stage = stageRef.current, video = videoRef.current;
    const glCanvas = stage?.querySelector('canvas');
    if (!stage || !glCanvas) return;
    const w = stage.clientWidth, h = stage.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    const out = document.createElement('canvas');
    out.width = w * dpr; out.height = h * dpr;
    const g = out.getContext('2d');
    if (!g) return;
    g.scale(dpr, dpr);
    const styles = getComputedStyle(stage);
    g.fillStyle = styles.backgroundColor; g.fillRect(0, 0, w, h);
    if (video && video.videoWidth && streamRef.current) {
      const s = Math.max(w / video.videoWidth, h / video.videoHeight);
      const vw = video.videoWidth * s, vh = video.videoHeight * s;
      g.save();
      if (mirroredRef.current) { g.translate(w, 0); g.scale(-1, 1); }
      g.drawImage(video, (w - vw) / 2, (h - vh) / 2, vw, vh);
      g.restore();
    }
    g.drawImage(glCanvas, 0, 0, w, h);
    g.fillStyle = styles.color;
    g.textAlign = 'right';
    g.font = `400 ${Math.round(Math.max(20, w * .028))}px 'Libre Baskerville', Georgia, serif`;
    g.fillText('Timepiece', w - 24, 48);
    g.font = `600 ${Math.round(Math.max(14, w * .018))}px Karla, Arial, sans-serif`;
    g.textAlign = 'left';
    g.fillText(`BIG-B · ${watches.find(x => x.id === finish)?.name ?? ''}`, 24, h - 28);
    out.toBlob(blob => {
      if (!blob) return;
      setShot(prev => { if (prev) URL.revokeObjectURL(prev.url); return { blob, url: URL.createObjectURL(blob) }; });
    }, 'image/png');
    setFlash(true); setTimeout(() => setFlash(false), 220);
  };

  if (!open) return null;
  const cameraActive = ['loading', 'tracking', 'searching'].includes(status);
  return <div className="try-on-dialog" role="dialog" aria-modal="true" aria-labelledby="try-on-title">
    <div className="try-on-stage" ref={stageRef} data-active={cameraActive} onPointerDown={reveal}>
      <video ref={videoRef} className="try-on-video" data-mirrored={mirrored} playsInline muted aria-label="Live camera view" />
      <TryOnScene finish={finish} target={targetRef} ambient={ambientRef} caseMm={(finish === 'black' || finish === 'gold' ? 32 : 36) * sizeMm / 42} />
      {status === 'searching' && <div className="try-on-guide" aria-hidden="true"><svg className="try-on-guide-wrist" viewBox="0 0 220 440" fill="none" aria-hidden="true">
            <path d="M78 438 L80 300 C70 280 52 262 40 236 C30 214 22 190 18 168 C15 154 28 148 36 160 L58 206 L56 92 C56 78 76 78 77 92 L80 180 L84 52 C84 36 106 36 107 52 L108 176 L114 64 C115 48 136 49 136 65 L134 182 L142 90 C144 76 163 78 162 93 L156 212 C154 250 146 280 140 300 L142 438" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 7" />
            <rect x="72" y="318" width="76" height="34" rx="10" stroke="currentColor" strokeWidth="2" opacity=".7" />
          </svg><p>Show your wrist to position the watch</p></div>}
      <div className="try-on-flash" data-on={flash} aria-hidden="true" />

      <Button className="try-on-close" size="icon" variant="ghost" aria-label="Close virtual try-on" title="Close" onClick={onClose}><X /></Button>
      <div className="try-on-brand">
        <span className="try-on-logo">Timepiece</span>
        <h2 id="try-on-title" className="sr-only">Try on {watch.name}</h2>
      </div>

      {['denied', 'unsupported', 'error'].includes(status) && <div className="try-on-empty">
        <p>{statusText[status]}</p>
        {status !== 'unsupported' && <Button onClick={() => start()}><Camera /> Try again</Button>}
      </div>}

      <p className="try-on-status" role="status" data-hidden={status === 'tracking' || !cameraActive}>{statusText[status]}</p>



      <div className="try-on-shop" data-hidden={!controlsShown}>
        <div className="try-on-catalog" role="radiogroup" aria-label="Watches">
          {watches.map(w => <button key={w.id} type="button" role="radio" aria-checked={finish === w.id} data-active={finish === w.id} onClick={() => setFinish(w.id as Finish)}>
            <img src={w.image} alt="" /><span>{w.name}</span>
          </button>)}
        </div>
      </div>

      <div className="try-on-bar" data-hidden={!controlsShown}>
        <Button size="icon" variant="ghost" title="Switch camera" aria-label="Switch camera" onClick={flip}><SwitchCamera /></Button>
        <div className="try-on-finishes" role="radiogroup" aria-label="Finish">
          {(Object.keys(finishes) as Finish[]).map(key => <button key={key} type="button" role="radio" aria-checked={finish === key} aria-label={finishes[key].label} title={finishes[key].label} className="try-on-swatch" data-active={finish === key} style={{ background: finishes[key].swatch }} onClick={() => setFinish(key)} />)}
        </div>
        <button type="button" className="try-on-shutter" aria-label="Take photo" title="Take photo" onClick={capture}><Aperture /></button>
      </div>
      <label className="try-on-size" data-hidden={!controlsShown}>
        <span>Case {sizeMm} mm</span>
        <input type="range" min={38} max={46} step={1} value={sizeMm} onChange={e => setSizeMm(Number(e.target.value))} aria-label="Watch case size" />
      </label>
      {shot && <div className="try-on-shot" role="dialog" aria-label="Your try-on photo">
        <img src={shot.url} alt="Your wrist wearing the watch" />
        <div className="try-on-shot-actions">
          <Button onClick={() => void share()}><Share2 /> Share</Button>
          <Button variant="secondary" onClick={download}><Download /> Save</Button>
          <Button variant="ghost" onClick={() => { URL.revokeObjectURL(shot.url); setShot(null); }}>Retake</Button>
        </div>
      </div>}
    </div>
  </div>;
}
