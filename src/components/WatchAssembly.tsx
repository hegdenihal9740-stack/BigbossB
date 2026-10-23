import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { buildWatchAssembly } from '@/lib/watch-assembly';
import type { WatchTone } from '@/lib/watches';
import { partAssemblyProgress, scrollAssemblyProgress } from '@/lib/watch-assembly-progress';

function AssemblyModel({ reducedMotion, tone, progress }: { reducedMotion: boolean; tone: WatchTone; progress: RefObject<number> }) {
  const model = useMemo(() => buildWatchAssembly(tone), [tone]);
  const root = useRef<THREE.Group>(null);
  useEffect(() => () => model.dispose(), [model]);
  useFrame(() => {
    const group = root.current;
    if (!group) return;
    if (reducedMotion) {
      group.rotation.y = .35;
      model.parts.forEach(part => { part.group.position.set(0, 0, 0); part.group.rotation.set(0, 0, 0); });
      return;
    }
    group.rotation.y = -.32 + progress.current * .67;
    model.parts.forEach((part, i) => {
      const p = partAssemblyProgress(progress.current, i, model.parts.length);
      const { position, rotation } = part.exploded;
      part.group.position.set(position[0] * (1 - p), position[1] * (1 - p), position[2] * (1 - p));
      part.group.rotation.set(rotation[0] * (1 - p), rotation[1] * (1 - p), rotation[2] * (1 - p));
    });
  });
  return <group ref={root} rotation={[.1, -.32, -.12]}>
    {model.parts.map((part, i) => <primitive key={i} object={part.group} />)}
  </group>;
}

export function WatchAssembly({ tone = 'steel' }: { tone?: WatchTone }) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const track = ref.current;
      if (!track) return;
      const bounds = track.getBoundingClientRect();
      const stage = track.firstElementChild;
      const viewportHeight = stage?.getBoundingClientRect().height ?? window.innerHeight;
      progress.current = scrollAssemblyProgress(bounds.top, bounds.height, viewportHeight);
      track.dataset['progress'] = progress.current.toFixed(3);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);
  useEffect(() => {
    setMounted(true);
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches); update(); query.addEventListener('change', update);
    // Latch visibility: once the scene has appeared, keep the canvas mounted.
    // On mobile, the address bar showing/hiding while scrolling resizes the
    // viewport and makes the observer flicker, which remounted the canvas and
    // reset the animation to its first frame — looking "stuck".
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '200px' });
    if (ref.current) observer.observe(ref.current);
    return () => { observer.disconnect(); query.removeEventListener('change', update); };
  }, []);
  return <div ref={ref} className={`watch-assembly-track${reducedMotion ? ' watch-assembly-static' : ''}`} aria-hidden="true">
    <div className="watch-assembly-stage"><div className="watch-assembly-scene">
    {mounted && visible && <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 8.6], fov: 42 }} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={.8} />
      <directionalLight position={[3, 5, 6]} intensity={3} />
      <directionalLight position={[-4, -1, 3]} intensity={1.6} />
      <Environment resolution={128}>
        <Lightformer intensity={4} position={[0, 4, 5]} scale={[6, 3, 1]} />
        <Lightformer intensity={3} position={[-4, 0, 2]} rotation-y={Math.PI / 2} scale={[3, 8, 1]} />
        <Lightformer intensity={2} position={[4, -2, 2]} rotation-y={-Math.PI / 2} scale={[3, 6, 1]} />
      </Environment>
      <group scale={1.05}><AssemblyModel reducedMotion={reducedMotion} tone={tone} progress={progress} /></group>
    </Canvas>}
    </div><p className="collection-assembly-caption">Assembled by hand.</p></div>
  </div>;
}
