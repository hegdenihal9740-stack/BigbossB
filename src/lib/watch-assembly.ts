import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WatchTone } from './watches';

type Vec3 = [number, number, number];

export interface AssemblyPart {
  group: THREE.Group;
  exploded: { position: Vec3; rotation: Vec3 };
}

// Part-based watch geometry for the assembling animation: each major component
// (case, bezel, dial, crown, bracelet halves, hands) is its own group so it can
// fly in from a scattered position and click together. Shares the CSS-token
// materials and geometry style of the product viewer; no remote assets needed.
export function buildWatchAssembly(tone: WatchTone = 'steel') {
  const style = getComputedStyle(document.documentElement);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Watch dial could not be created');
  const color = (name: string) => {
    ctx.fillStyle = style.getPropertyValue(name).trim();
    ctx.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
    return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
  };
  const metal = color(`--watch-metal-${tone}`);
  const dark = color('--watch-dial');
  const ink = color('--watch-ink');
  const materials = {
    polished: new THREE.MeshPhysicalMaterial({ color: metal, metalness: 1, roughness: .23, clearcoat: .8 }),
    brushed: new THREE.MeshPhysicalMaterial({ color: metal, metalness: .85, roughness: .4 }),
    dark: new THREE.MeshStandardMaterial({ color: dark, metalness: .25, roughness: .33 }),
    ink: new THREE.MeshStandardMaterial({ color: ink, metalness: .35, roughness: .25 }),
  };
  const place = (geometry: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    geometry.rotateX(rx); geometry.rotateY(ry); geometry.rotateZ(rz); geometry.translate(x, y, z);
    return geometry;
  };
  const cylinder = (r: number, depth: number, z = 0) => place(new THREE.CylinderGeometry(r, r, depth, 64), 0, 0, z, Math.PI / 2);
  const parts: AssemblyPart[] = [];
  const createPart = (exploded: { position: Vec3; rotation: Vec3 }, ...layers: Array<{ material: THREE.Material; geometry: THREE.BufferGeometry[] }>) => {
    const group = new THREE.Group();
    for (const layer of layers) {
      const merged = mergeGeometries(layer.geometry.map(g => g.toNonIndexed()));
      layer.geometry.forEach(g => g.dispose());
      if (merged) group.add(new THREE.Mesh(merged, layer.material));
    }
    parts.push({ group, exploded });
  };

  // Case body and caseback.
  createPart({ position: [0, -2.4, -1.6], rotation: [.5, .4, .3] },
    { material: materials.polished, geometry: [cylinder(1.12, .36)] },
    { material: materials.brushed, geometry: [cylinder(1.07, .045, -.2)] });
  // Bezel rings.
  createPart({ position: [0, 2.2, 1.4], rotation: [-.4, -.5, .2] },
    { material: materials.polished, geometry: [place(new THREE.TorusGeometry(1.06, .085, 10, 96), 0, 0, .19)] },
    { material: materials.brushed, geometry: [place(new THREE.TorusGeometry(.94, .036, 10, 96), 0, 0, .24)] });

  // Dial texture: same concentric machining and dial text as the product viewer.
  ctx.fillStyle = dark.getStyle(); ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = metal.getStyle(); ctx.globalAlpha = .1;
  for (let r = 12; r < 255; r += 3) { ctx.beginPath(); ctx.arc(256, 256, r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.fillStyle = ink.getStyle(); ctx.textAlign = 'center';
  ctx.font = '18px Georgia'; ctx.fillText(tone === 'black' ? 'S K E L E T O N' : 'A U T O M A T I C', 256, 172);
  ctx.font = '11px sans-serif'; ctx.fillText('THE COLLECTION', 256, 195);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const dialMaterial = new THREE.MeshStandardMaterial({ map: texture, roughness: .52, metalness: .18 });
  const markers: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * Math.PI * 2;
    const major = i % 5 === 0;
    markers.push(place(new THREE.BoxGeometry(major ? .065 : .016, major ? .17 : .055, .022), Math.sin(a) * .83, Math.cos(a) * .83, .245, 0, 0, -a));
  }
  createPart({ position: [0, 1.9, 2.2], rotation: [.6, .3, -.4] },
    { material: dialMaterial, geometry: [place(new THREE.CircleGeometry(.795, 80), 0, 0, .226)] },
    { material: materials.ink, geometry: markers });

  // Crown with winding teeth.
  const teeth: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 20; i++) {
    const a = i / 20 * Math.PI * 2;
    teeth.push(place(new THREE.BoxGeometry(.018, .022, .26), 1.23, Math.sin(a) * .17, Math.cos(a) * .17));
  }
  createPart({ position: [2.6, .8, .4], rotation: [0, 0, 1.1] },
    { material: materials.polished, geometry: [place(new THREE.CylinderGeometry(.17, .17, .27, 32), 1.23, 0, 0, 0, 0, Math.PI / 2)] },
    { material: materials.brushed, geometry: teeth });

  // Articulated, curved three-piece bracelet halves with tapered lugs.
  for (const side of [-1, 1]) {
    const lugs: THREE.BufferGeometry[] = [];
    const centerLinks: THREE.BufferGeometry[] = [];
    const outerLinks: THREE.BufferGeometry[] = [];
    for (const x of [-.66, .66]) lugs.push(place(new THREE.BoxGeometry(.21, .55, .29), x, side * 1.05, -.025, side * -.18));
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * 2.3;
      const y = side * (1.3 + Math.sin(angle) * 1.58);
      const z = -.12 - (1 - Math.cos(angle)) * 1.08;
      for (const column of [-1, 0, 1]) {
        const geometry = new THREE.BoxGeometry(column === 0 ? .49 : .3, .29, .16);
        (column === 0 ? centerLinks : outerLinks).push(place(geometry, column * .4, y, z, side * -angle));
      }
    }
    createPart({ position: [side * 1.8, -1.6, 1.8], rotation: [side * .7, side * -.6, side * .9] },
      { material: materials.polished, geometry: [...lugs, ...centerLinks] },
      { material: materials.brushed, geometry: outerLinks });
  }

  // Hands and pin, baked at their assembled positions.
  const hourHand = place(new THREE.BoxGeometry(.045, .48, .016), 0, .48 / 2 - .065, .32);
  const minuteHand = place(new THREE.BoxGeometry(.045, .68, .016), 0, .68 / 2 - .065, .34);
  const secondHand = place(new THREE.BoxGeometry(.013, .76, .016), 0, .76 / 2 - .065, .36);
  const pin = place(new THREE.SphereGeometry(.06, 16, 12), 0, 0, .39);
  createPart({ position: [0, -.6, 3], rotation: [.9, .2, -.3] },
    { material: materials.ink, geometry: [hourHand, minuteHand] },
    { material: materials.polished, geometry: [secondHand, pin] });

  return {
    parts,
    dispose: () => {
      parts.forEach(part => part.group.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }));
      Object.values(materials).forEach(m => m.dispose());
      dialMaterial.dispose(); texture.dispose();
    },
  };
}
