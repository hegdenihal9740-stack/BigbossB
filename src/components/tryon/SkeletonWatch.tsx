import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

export type Finish = 'steel' | 'black' | 'gold' | 'rosegold';

export const finishes: Record<Finish, { label: string; metal: string; bridge: string; swatch: string }> = {
  steel: { label: 'Steel', metal: '#e4e7eb', bridge: '#d5d9df', swatch: '#cfd3d8' },
  black: { label: 'Titanium black', metal: '#3b3d43', bridge: '#6d727b', swatch: '#3b3d43' },
  gold: { label: 'Yellow gold', metal: '#d9b064', bridge: '#c9a25a', swatch: '#d9b064' },
  rosegold: { label: 'Rose gold', metal: '#dba390', bridge: '#c99482', swatch: '#dba390' },
};

/** Wrist cross-section (mm): half width across the arm, half depth. */
export const WRIST_A = 30;
export const WRIST_B = 21;

function brushedTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#7a7a7a';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) {
    const v = 90 + Math.floor(Math.random() * 120);
    g.fillStyle = `rgba(${v},${v},${v},0.28)`;
    g.fillRect(0, Math.random() * 256, 256, Math.random() * 1.1 + .25);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 3);
  return t;
}

function cushion(half: number, n = 4.2, segments = 96) {
  const s = new THREE.Shape();
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const c = Math.cos(a), sn = Math.sin(a);
    const x = half * Math.sign(c) * Math.abs(c) ** (2 / n);
    const y = half * Math.sign(sn) * Math.abs(sn) ** (2 / n);
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  return s;
}

function holed(shape: THREE.Shape, r: number) {
  const h = new THREE.Path();
  h.absarc(0, 0, r, 0, Math.PI * 2, true);
  shape.holes.push(h);
  return shape;
}

function circleShape(r: number) { const s = new THREE.Shape(); s.absarc(0, 0, r, 0, Math.PI * 2, false); return s; }

function openworkDial() {
  const s = circleShape(14.2);
  const cut = (pts: Array<[number, number]>) => { const h = new THREE.Path(); h.moveTo(pts[0]![0], pts[0]![1]); pts.slice(1).forEach(([x, y]) => h.lineTo(x, y)); h.closePath(); s.holes.push(h); };
  cut([[-3, 12], [3, 12], [5, 5], [-5, 5]]);
  cut([[6.5, 4], [12, 3], [11, -5], [6.5, -2]]);
  cut([[-6.5, 4], [-12, 3], [-11, -5], [-6.5, -2]]);
  cut([[-4, -4.5], [4, -4.5], [6, -11], [-6, -11]]);
  const c = new THREE.Path(); c.absarc(0, 0, 2.6, 0, Math.PI * 2, true); s.holes.push(c);
  return new THREE.ExtrudeGeometry(s, { depth: .5, bevelEnabled: true, bevelThickness: .12, bevelSize: .12, bevelSegments: 2, curveSegments: 64 });
}

function logoTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.font = '400 78px "Libre Baskerville", Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('Timepiece', 256, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function gearGeometry(r: number, teeth: number, windows = 5) {
  const s = new THREE.Shape();
  const steps = teeth * 4;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const rr = i % 4 < 2 ? r : r * .9;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  for (let k = 0; k < windows; k++) {
    const a = (k / windows) * Math.PI * 2;
    const h = new THREE.Path();
    h.absarc(Math.cos(a) * r * .52, Math.sin(a) * r * .52, r * .24, 0, Math.PI * 2, true);
    s.holes.push(h);
  }
  return new THREE.ExtrudeGeometry(s, { depth: .55, bevelEnabled: false, curveSegments: 12 });
}

function handGeometry(length: number, width: number) {
  const s = new THREE.Shape();
  s.moveTo(0, -2.2); s.lineTo(width, 1.6); s.lineTo(0, length); s.lineTo(-width, 1.6); s.closePath();
  const h = new THREE.Path();
  h.moveTo(0, 1.2); h.lineTo(-width * .45, 2.4); h.lineTo(0, length - 2.2); h.lineTo(width * .45, 2.4); h.closePath();
  s.holes.push(h);
  return new THREE.ExtrudeGeometry(s, { depth: .3, bevelEnabled: true, bevelThickness: .08, bevelSize: .08, bevelSegments: 2 });
}

/** Sample the bracelet path (y,z) for the +Y side: lug, then around the wrist ellipse. */
function braceletPath() {
  const pts: Array<[number, number]> = [[23.4, 2.2], [24.6, -2.5]];
  const start = 1.02;
  for (let i = 0; i <= 60; i++) {
    const t = start + (Math.PI - start) * (i / 60);
    pts.push([WRIST_A * Math.sin(t), -WRIST_B + WRIST_B * Math.cos(t)]);
  }
  return pts;
}

function linkTransforms(spacing = 6.4) {
  const pts = braceletPath();
  const lens: number[] = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const total = lens[lens.length - 1]!;
  const out: Array<{ y: number; z: number; angle: number; ny: number; nz: number }> = [];
  for (let s = spacing / 2; s < total - spacing * .3; s += spacing) {
    let i = 1;
    while (lens[i]! < s) i++;
    const f = (s - lens[i - 1]!) / (lens[i]! - lens[i - 1]!);
    const y = pts[i - 1]![0] + (pts[i]![0] - pts[i - 1]![0]) * f;
    const z = pts[i - 1]![1] + (pts[i]![1] - pts[i - 1]![1]) * f;
    const ty = pts[i]![0] - pts[i - 1]![0], tz = pts[i]![1] - pts[i - 1]![1];
    const tl = Math.hypot(ty, tz);
    out.push({ y, z, angle: Math.atan2(tz, ty), ny: -tz / tl, nz: ty / tl });
  }
  // Mirror to the -Y side.
  return [...out, ...out.map(l => ({ y: -l.y, z: l.z, angle: Math.atan2(Math.sin(l.angle), -Math.cos(l.angle)), ny: -l.ny, nz: l.nz }))];
}

export function SkeletonWatch({ finish, occlude }: { finish: Finish; occlude: React.RefObject<boolean> }) {
  const f = finishes[finish];
  const brushed = useMemo(brushedTexture, []);
  const logo = useMemo(logoTexture, []);
  const mats = useMemo(() => {
    const polished = new THREE.MeshPhysicalMaterial({ color: f.metal, metalness: 1, roughness: .1, clearcoat: 1, clearcoatRoughness: .03, envMapIntensity: 2.2 });
    const satin = new THREE.MeshPhysicalMaterial({ color: f.metal, metalness: 1, roughness: .38, roughnessMap: brushed, bumpMap: brushed, bumpScale: .35, clearcoat: .55, clearcoatRoughness: .25, envMapIntensity: 1.3 });
    const bridge = new THREE.MeshPhysicalMaterial({ color: f.bridge, metalness: 1, roughness: .3, roughnessMap: brushed, clearcoat: .8, clearcoatRoughness: .1, envMapIntensity: 1.4 });
    const dialBlue = new THREE.MeshPhysicalMaterial({ color: '#23357a', metalness: .7, roughness: .32, clearcoat: 1, clearcoatRoughness: .08, envMapIntensity: 1.4 });
    const logoMat = new THREE.MeshBasicMaterial({ map: logo, transparent: true, depthWrite: false, color: '#e9edf5' });
    const blue = new THREE.MeshPhysicalMaterial({ color: '#c6ccd6', metalness: .85, roughness: .22, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: 1.6 });
    const titanium = new THREE.MeshPhysicalMaterial({ color: '#8d96a3', metalness: 1, roughness: .26, clearcoat: 1, envMapIntensity: 1.5 });
    const balance = new THREE.MeshPhysicalMaterial({ color: '#d8b56c', metalness: 1, roughness: .15, clearcoat: 1, envMapIntensity: 1.6 });
    const flange = new THREE.MeshPhysicalMaterial({ color: '#15171c', metalness: .5, roughness: .45, clearcoat: .6 });
    const ruby = new THREE.MeshPhysicalMaterial({ color: '#b0142e', metalness: 0, roughness: .05, clearcoat: 1, envMapIntensity: 2 });
    const sapphire = new THREE.MeshPhysicalMaterial({ color: '#f4f7ff', metalness: 0, roughness: .05, transmission: .92, thickness: 1.2, ior: 1.77, iridescence: .25, iridescenceIOR: 1.3, clearcoat: 1, clearcoatRoughness: 0, transparent: true, opacity: .25, depthWrite: false, envMapIntensity: 2.6 });
    const mask = new THREE.MeshBasicMaterial({ colorWrite: false });
    return { dialBlue, logoMat, polished, satin, bridge, blue, titanium, balance, flange, ruby, sapphire, mask };
  }, [f.metal, f.bridge, brushed, logo]);

  const geo = useMemo(() => ({
    bezel: new THREE.ExtrudeGeometry(holed(circleShape(19.6), 16.2), { depth: 2, bevelEnabled: true, bevelThickness: 1.1, bevelSize: 1.1, bevelSegments: 5, curveSegments: 96 }),
    dial: openworkDial(),
    body: new THREE.ExtrudeGeometry(holed(cushion(20.8, 3), 15.2), { depth: 7.4, bevelEnabled: true, bevelThickness: .4, bevelSize: .4, bevelSegments: 2, curveSegments: 64 }),
    barrel: gearGeometry(6, 64, 6), center: gearGeometry(4.6, 44, 5), third: gearGeometry(3.3, 32, 4), fourth: gearGeometry(3, 30, 4), escape: gearGeometry(2.2, 15, 3),
    hour: handGeometry(8.5, .85), minute: handGeometry(13, .7),
    link: new THREE.BoxGeometry(1, 1, 1),
  }), []);

  const links = useMemo(() => linkTransforms(), []);
  const outerRef = useRef<THREE.InstancedMesh>(null);
  const centerRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
    links.forEach((l, i) => {
      e.set(l.angle, 0, 0); q.setFromEuler(e);
      for (const side of [-1, 1]) {
        p.set(side * 8, l.y, l.z); s.set(7.4, 6.2, 3.6);
        m.compose(p, q, s); outerRef.current?.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), m);
      }
      p.set(0, l.y + l.ny * .45, l.z + l.nz * .45); s.set(8.8, 6.4, 4);
      m.compose(p, q, s); centerRef.current?.setMatrixAt(i, m);
    });
    if (outerRef.current) outerRef.current.instanceMatrix.needsUpdate = true;
    if (centerRef.current) centerRef.current.instanceMatrix.needsUpdate = true;
  }, [links]);

  const gears = useRef<THREE.Group>(null);
  const balanceRef = useRef<THREE.Group>(null);
  const hourRef = useRef<THREE.Mesh>(null);
  const minuteRef = useRef<THREE.Mesh>(null);
  const maskRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const g = gears.current?.children;
    if (g) { const speeds = [.05, -.4, 1.2, -2.6, 9]; g.forEach((c, i) => { c.rotation.z = t * (speeds[i] ?? 0); }); }
    if (balanceRef.current) balanceRef.current.rotation.z = Math.sin(t * Math.PI * 2 * 2.5) * 1.4;
    const now = new Date();
    const mins = now.getMinutes() + now.getSeconds() / 60;
    if (minuteRef.current) minuteRef.current.rotation.z = -(mins / 60) * Math.PI * 2;
    if (hourRef.current) hourRef.current.rotation.z = -(((now.getHours() % 12) + mins / 60) / 12) * Math.PI * 2;
    if (maskRef.current) maskRef.current.visible = !!occlude.current;
  });

  const bridges: Array<[number, number, number, number, number]> = [
    [1, 7.5, 24, .28, 3], [-2.4, -1.5, 22, -.95, 2.5], [4.5, -5.5, 17, .55, 2.2], [-8.5, -8.6, 9, .15, 2.4],
  ];

  return <group>
    {/* Anatomical wrist mask: writes depth only so the bracelet disappears behind the arm. */}
    <mesh ref={maskRef} material={mats.mask} renderOrder={-1} position={[0, 0, -WRIST_B]} rotation={[0, 0, Math.PI / 2]} scale={[WRIST_A - 1.4, 220, WRIST_B - 1.4]}>
      <cylinderGeometry args={[1, 1, 1, 48, 1, true]} />
    </mesh>

    {/* Case */}
    <mesh geometry={geo.body} material={mats.satin} position={[0, 0, .6]} />
    <mesh geometry={geo.bezel} material={mats.polished} position={[0, 0, 8.4]} />
    <mesh material={mats.polished} position={[23, 0, 4.6]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[2.6, 2.6, 4, 28]} /></mesh>
    <mesh material={mats.satin} position={[23.6, 0, 4.6]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[2.75, 2.75, 2.2, 18]} /></mesh>
    {[1, -1].map(side => <mesh key={side} material={mats.satin} position={[0, side * 21.2, 2.6]}><boxGeometry args={[22.4, 4, 4.6]} /></mesh>)}

    {/* Flange + indices */}
    <mesh material={mats.flange} position={[0, 0, 9.6]}><ringGeometry args={[13.8, 16.3, 72]} /></mesh>
    {Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return <mesh key={i} material={mats.polished} position={[Math.sin(a) * 15, Math.cos(a) * 15, 9.9]} rotation={[0, 0, -a]}><boxGeometry args={[.7, i % 3 === 0 ? 2.4 : 1.6, .5]} /></mesh>; })}

    {/* Openworked movement */}
    <mesh material={mats.bridge} position={[0, 0, 6.2]}><torusGeometry args={[14.6, .7, 10, 72]} /></mesh>
    {bridges.map(([x, y, len, a, w], i) => <mesh key={i} material={mats.bridge} position={[x, y, 7.6]} rotation={[0, 0, a]}><boxGeometry args={[len, w, 1]} /></mesh>)}
    <group ref={gears} position={[0, 0, 5.8]}>
      <mesh geometry={geo.barrel} material={mats.blue} position={[1, 7, 0]} />
      <mesh geometry={geo.center} material={mats.titanium} position={[0, 0, .6]} />
      <mesh geometry={geo.third} material={mats.blue} position={[-6.2, -.8, .3]} />
      <mesh geometry={geo.fourth} material={mats.titanium} position={[6.3, -3, .3]} />
      <mesh geometry={geo.escape} material={mats.blue} position={[3, -9.4, .3]} />
    </group>
    {([[1, 7], [0, 0], [-6.2, -.8], [6.3, -3], [3, -9.4], [-5, -8]] as const).map(([x, y], i) => <mesh key={i} material={mats.ruby} position={[x, y, 8.2]}><cylinderGeometry args={[.45, .45, .3, 12]} /></mesh>)}
    <group ref={balanceRef} position={[-5, -8, 7]}>
      <mesh material={mats.balance}><torusGeometry args={[4, .42, 10, 48]} /></mesh>
      {[0, 1, 2].map(i => <mesh key={i} material={mats.balance} rotation={[0, 0, (i / 3) * Math.PI * 2]} position={[0, 0, 0]}><boxGeometry args={[.4, 7.8, .3]} /></mesh>)}
      <mesh material={mats.blue} position={[0, 0, .3]}><torusGeometry args={[1.6, .08, 6, 32]} /></mesh>
    </group>

    {/* Blue openworked dial + logo */}
    <mesh geometry={geo.dial} material={mats.dialBlue} position={[0, 0, 8.7]} />
    <mesh material={mats.logoMat} position={[0, 7.6, 9.45]} renderOrder={1}><planeGeometry args={[7, 1.75]} /></mesh>

    {/* Hands */}
    <mesh ref={hourRef} geometry={geo.hour} material={mats.polished} position={[0, 0, 10.2]} />
    <mesh ref={minuteRef} geometry={geo.minute} material={mats.polished} position={[0, 0, 10.6]} />
    <mesh material={mats.polished} position={[0, 0, 10.8]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.9, .9, .6, 20]} /></mesh>

    {/* Sapphire crystal */}
    <mesh material={mats.sapphire} position={[0, 0, 11.6]} renderOrder={2}><circleGeometry args={[16.6, 72]} /></mesh>

    {/* Integrated bracelet */}
    <instancedMesh ref={outerRef} args={[geo.link, mats.satin, links.length * 2]} />
    <instancedMesh ref={centerRef} args={[geo.link, mats.polished, links.length]} />
    <mesh material={mats.polished} position={[0, 0, -2 * WRIST_B - .6]}><boxGeometry args={[23, 9, 2.4]} /></mesh>
  </group>;
}
