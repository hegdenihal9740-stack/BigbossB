import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { tryOnImages } from '@/lib/try-on-images';
import { finishes, type Finish } from './SkeletonWatch';

/** Product photo size (px) and case diameter in the photo (px). */
const IMG_W = 768, IMG_H = 1376, CASE_PX = 415, CASE_MM = 42;
const PX_PER_MM = CASE_PX / CASE_MM;
const W_MM = IMG_W / PX_PER_MM, H_MM = IMG_H / PX_PER_MM;
/** Case centre in the photo, measured from the top (fraction). */
const CENTER_V = 680 / IMG_H;
/** Wrist radius (mm) the bracelet wraps around; flat area under the case. */
export const WRAP_R = 28;
const FLAT = 21;
/** Case thickness (mm) behind the crystal. */
const CASE_T = 12;
const CASE_R = 20.6;
/** Forearm centre axis (mm, along z); the wrist rotates around this. */
export const ARM_Z = -CASE_T - WRAP_R + 4;

function wrappedPlane() {
  const g = new THREE.PlaneGeometry(W_MM, H_MM, 8, 160);
  const pos = g.attributes['position']!;
  const offY = (0.5 - CENTER_V) * H_MM;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + offY;
    const a = Math.abs(y);
    let ny = y, nz = 0;
    if (a > FLAT) {
      // Bracelet drops from the lugs down to the skin, then follows the wrist.
      const th = Math.min(Math.PI, (a - FLAT) / WRAP_R);
      ny = Math.sign(y) * (FLAT + WRAP_R * Math.sin(th));
      nz = -WRAP_R * (1 - Math.cos(th)) - Math.min(1, (a - FLAT) / 8) * (CASE_T - 4);
    }
    pos.setXYZ(i, pos.getX(i), ny, nz);
  }
  g.computeVertexNormals();
  return g;
}

/** Brushed caseback with engraved ring text. */
function casebackTexture(metal: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d')!;
  x.fillStyle = metal; x.fillRect(0, 0, 512, 512);
  for (let r = 4; r < 256; r += 1.5) {
    x.strokeStyle = `rgba(${Math.random() > .5 ? '255,255,255' : '0,0,0'},${.03 + Math.random() * .05})`;
    x.beginPath(); x.arc(256, 256, r, 0, Math.PI * 2); x.stroke();
  }
  x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 3;
  x.beginPath(); x.arc(256, 256, 200, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.arc(256, 256, 120, 0, Math.PI * 2); x.stroke();
  x.fillStyle = 'rgba(0,0,0,.45)'; x.font = '600 26px Georgia, serif'; x.textAlign = 'center';
  const txt = 'OCEANWARD · AUTOMATIC · 300M WATER RESISTANT · STAINLESS STEEL · ';
  [...txt].forEach((ch, i) => {
    x.save(); x.translate(256, 256); x.rotate((i / txt.length) * Math.PI * 2); x.fillText(ch, 0, -160); x.restore();
  });
  x.font = 'italic 44px Georgia, serif'; x.fillText('Timepiece', 256, 270);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Brushed side texture for case flanks and the bracelet underside. */
function brushedTexture(metal: string) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = metal; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 400; i++) {
    x.fillStyle = `rgba(${Math.random() > .5 ? '255,255,255' : '0,0,0'},${Math.random() * .06})`;
    x.fillRect(0, Math.random() * 256, 256, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Bracelet band bent around the underside of the wrist (plane x = along the arm, y = around the wrist). */
function undersideBand(width: number, radius: number, armZ: number, arc = 2.3) {
  const g = new THREE.PlaneGeometry(width, radius * arc, 1, 48);
  const pos = g.attributes['position']!;
  for (let i = 0; i < pos.count; i++) {
    const th = pos.getY(i) / radius;
    pos.setXYZ(i, pos.getX(i), radius * Math.sin(th), armZ - radius * Math.cos(th));
  }
  g.computeVertexNormals();
  return g;
}

/** Crop a region (u0..u1, v0..v1 in UV space, v up) of the product photo. */
function crop(tex: THREE.Texture, u0: number, u1: number, v0: number, v1: number) {
  const t = tex.clone();
  t.repeat.set(u1 - u0, v1 - v0); t.offset.set(u0, v0);
  t.needsUpdate = true;
  return t;
}

export function PhotoWatch({ finish, occlude, tint, back, caseScale = 1 }: { finish: Finish; occlude: React.RefObject<boolean>; tint: React.RefObject<THREE.Color>; back: React.RefObject<boolean>; caseScale?: number }) {
  const tex = useTexture(tryOnImages[finish]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  // Crop the photo's dark edge rows (they showed as a black line above the bracelet).
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(.96, .94); tex.offset.set(.02, .03);
  const metal = finishes[finish].metal;
  const geo = useMemo(wrappedPlane, []);
  // Three.js alphaMap reads the GREEN channel; the photo's transparent pixels are white,
  // so build a mask whose RGB = the real alpha channel.
  const alphaTex = useMemo(() => {
    const img = tex.image as CanvasImageSource & { width: number; height: number };
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d')!;
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < d.data.length; i += 4) { const a = d.data[i + 3]!; d.data[i] = d.data[i + 1] = d.data[i + 2] = a; d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.repeat.copy(tex.repeat); t.offset.copy(tex.offset);
    return t;
  }, [tex]);
  const backTex = useMemo(() => casebackTexture(metal), [metal]);
  const brushed = useMemo(() => brushedTexture(metal), [metal]);
  const armZ = ARM_Z;
  // Back of the hand turned over: the real bracelet links and clasp from the product photo.
  const linksTex = useMemo(() => crop(tex, .365, .635, .66, .97), [tex]);
  const claspTex = useMemo(() => crop(tex, .36, .64, .015, .115), [tex]);
  // Full-width band wrapping ~200 deg so it hugs both sides of the inner wrist.
  const bandGeo = useMemo(() => undersideBand(26, WRAP_R + .6, armZ, 6.1), [armZ]);
  const claspGeo = useMemo(() => undersideBand(30, WRAP_R + 1.4, armZ, 21 / (WRAP_R + 1.4)), [armZ]);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const bandMat = useRef<THREE.MeshBasicMaterial>(null);
  const claspMat = useRef<THREE.MeshBasicMaterial>(null);
  const mask = useRef<THREE.Mesh>(null);
  const glass = useRef<THREE.MeshPhysicalMaterial>(null);
  const front = useRef<THREE.Group>(null);
  const under = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (mask.current) mask.current.visible = !!occlude.current;
    const b = !!back.current;
    if (front.current) front.current.visible = !b;
    if (under.current) under.current.visible = b;
    for (const m of [mat.current, bandMat.current, claspMat.current]) m?.color.lerp(tint.current, .08);
    if (glass.current) glass.current.opacity = .06 + .05 * Math.sin(clock.elapsedTime * .8);
  });

  const steel = { color: '#ffffff', map: brushed, metalness: 1, roughness: .32, clearcoat: .6, clearcoatRoughness: .15, envMapIntensity: 1.6 };

  return <group>
    {/* Depth-only forearm: hides whatever is behind the wrist. */}
    <mesh ref={mask} renderOrder={-1} position={[0, 0, armZ]} rotation={[0, 0, Math.PI / 2]} scale={[WRAP_R - 1, 400, WRAP_R - 1]}>
      <cylinderGeometry args={[1, 1, 1, 64, 1, true]} />
      <meshBasicMaterial colorWrite={false} side={THREE.DoubleSide} />
    </mesh>

    <group ref={front} scale={[caseScale, caseScale, 1]}>
    {/* Case flank: real thickness visible when the wrist tilts. */}
    <mesh position={[0, 0, -CASE_T / 2 - .3]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[CASE_R, CASE_R - 1.2, CASE_T - .6, 96, 1, true]} />
      <meshPhysicalMaterial {...steel} side={THREE.DoubleSide} />
    </mesh>
    <mesh position={[0, 0, -.6]}>
      <torusGeometry args={[CASE_R - .3, .7, 16, 96]} />
      <meshPhysicalMaterial color={metal} metalness={1} roughness={.08} clearcoat={1} envMapIntensity={2.2} />
    </mesh>
    <mesh position={[CASE_R + 1.6, 0, -CASE_T / 2]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[3, 3, 3.4, 24]} />
      <meshPhysicalMaterial {...steel} roughness={.25} />
    </mesh>
    <mesh position={[0, 0, -CASE_T]} rotation={[0, Math.PI, 0]}>
      <circleGeometry args={[CASE_R - 1.2, 96]} />
      <meshPhysicalMaterial color="#ffffff" map={backTex} metalness={1} roughness={.28} clearcoat={.8} envMapIntensity={1.6} />
    </mesh>

    {/* Bracelet: product photo outside, brushed metal on the inside surface. */}
    <mesh geometry={geo}>
      <meshBasicMaterial ref={mat} map={tex} transparent alphaTest={.35} side={THREE.FrontSide} toneMapped={false} />
    </mesh>
    <mesh geometry={geo}>
      <meshPhysicalMaterial {...steel} alphaMap={alphaTex} alphaTest={.5} side={THREE.BackSide} roughness={.4} />
    </mesh>

    {/* Sapphire glint */}
    <mesh position={[0, 0, .4]}>
      <circleGeometry args={[14.5, 64]} />
      <meshPhysicalMaterial ref={glass} color="#ffffff" metalness={0} roughness={0} clearcoat={1} transparent opacity={.08} depthWrite={false} envMapIntensity={3} />
    </mesh>
    </group>

    {/* Palm side: the case is hidden behind the arm; the real links and clasp of this watch hug the inner wrist. */}
    <group ref={under}>
      <mesh geometry={bandGeo}>
        <meshBasicMaterial ref={bandMat} map={linksTex} transparent alphaTest={.35} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh geometry={claspGeo}>
        <meshBasicMaterial ref={claspMat} map={claspTex} transparent alphaTest={.35} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  </group>;
}
