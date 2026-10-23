import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WatchTone } from './watches';

// Bespoke generated geometry: no remote models or fonts are needed by the viewer.
export function buildWatch(tone: WatchTone) {
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
  const gold = color('--watch-metal-gold');
  const materials = [
    new THREE.MeshPhysicalMaterial({ color: metal, metalness: 1, roughness: tone === 'black' ? .3 : .23, clearcoat: .8 }),
    new THREE.MeshPhysicalMaterial({ color: metal, metalness: .85, roughness: .4 }),
    new THREE.MeshStandardMaterial({ color: dark, metalness: .25, roughness: .33 }),
    new THREE.MeshStandardMaterial({ color: ink, metalness: .35, roughness: .25 }),
    new THREE.MeshStandardMaterial({ color: gold, metalness: .9, roughness: .28 }),
  ];
  const parts: THREE.BufferGeometry[][] = materials.map(() => []);
  const add = (geometry: THREE.BufferGeometry, material: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    geometry.rotateX(rx); geometry.rotateY(ry); geometry.rotateZ(rz); geometry.translate(x, y, z);
    parts[material]?.push(geometry.toNonIndexed()); geometry.dispose();
  };
  const cylinder = (r: number, depth: number, mat: number, x = 0, y = 0, z = 0) => add(new THREE.CylinderGeometry(r, r, depth, 64), mat, x, y, z, Math.PI / 2);
  const ring = (r: number, tube: number, mat: number, z: number) => add(new THREE.TorusGeometry(r, tube, 10, 96), mat, 0, 0, z);
  cylinder(1.12, .36, 0);
  cylinder(1.07, .045, 1, 0, 0, -.2);
  ring(1.06, .085, 0, .19);
  ring(.94, .036, 1, .24);
  cylinder(.965, .035, 2, 0, 0, .19);
  // Articulated, curved three-piece bracelet and tapered lugs.
  for (const side of [-1, 1]) {
    for (const x of [-.66, .66]) add(new THREE.BoxGeometry(.21, .55, .29), 0, x, side * 1.05, -.025, side * -.18);
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * 2.3;
      const y = side * (1.3 + Math.sin(angle) * 1.58);
      const z = -.12 - (1 - Math.cos(angle)) * 1.08;
      for (const column of [-1, 0, 1]) {
        add(new THREE.BoxGeometry(column === 0 ? .49 : .3, .29, .16), column === 0 ? 0 : 1, column * .4, y, z, side * -angle);
      }
    }
  }
  add(new THREE.CylinderGeometry(.17, .17, .27, 32), 0, 1.23, 0, 0, 0, 0, Math.PI / 2);
  for (let i = 0; i < 20; i++) {
    const a = i / 20 * Math.PI * 2;
    add(new THREE.BoxGeometry(.018, .022, .26), 1, 1.23, Math.sin(a) * .17, Math.cos(a) * .17);
  }
  if (tone === 'gold') for (const y of [-.48, .48]) add(new THREE.CylinderGeometry(.12, .12, .25, 24), 0, 1.17, y, -.02, 0, 0, Math.PI / 2);
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * Math.PI * 2;
    const major = i % 5 === 0;
    add(new THREE.BoxGeometry(major ? .065 : .016, major ? .17 : .055, .022), major ? 3 : 1, Math.sin(a) * .83, Math.cos(a) * .83, .245, 0, 0, -a);
    if (tone === 'steel') add(new THREE.BoxGeometry(.03, .045, .027), 0, Math.sin(a) * 1.12, Math.cos(a) * 1.12, .16, 0, 0, -a);
  }
  ctx.fillStyle = dark.getStyle(); ctx.fillRect(0, 0, 512, 512);
  // Fine concentric machining pattern, minute numerals and brand-free dial.
  ctx.strokeStyle = metal.getStyle(); ctx.globalAlpha = .1;
  for (let r = 12; r < 255; r += 3) { ctx.beginPath(); ctx.arc(256, 256, r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.fillStyle = ink.getStyle(); ctx.textAlign = 'center';
  ctx.font = '18px Georgia'; ctx.fillText(tone === 'black' ? 'S K E L E T O N' : 'A U T O M A T I C', 256, 172);
  ctx.font = '11px sans-serif'; ctx.fillText('THE COLLECTION', 256, 195);
  if (tone !== 'black') { ctx.font = '12px sans-serif'; ctx.fillText(tone === 'gold' ? 'CHRONOGRAPH' : 'PRECISION', 256, 345); }
  if (tone === 'steel' || tone === 'rosegold') { ctx.strokeRect(371, 243, 40, 30); ctx.font = '21px sans-serif'; ctx.fillText('28', 392, 265); }
  if (tone === 'gold') {
    for (const [x, y] of [[165, 256], [347, 256], [256, 345]]) {
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x ?? 0, y ?? 0, 51, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ctx.beginPath(); ctx.moveTo((x ?? 0) + Math.sin(a) * 40, (y ?? 0) + Math.cos(a) * 40); ctx.lineTo((x ?? 0) + Math.sin(a) * 47, (y ?? 0) + Math.cos(a) * 47); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(x ?? 0, y ?? 0); ctx.lineTo((x ?? 0) + 20, (y ?? 0) - 30); ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const group = new THREE.Group();
  parts.forEach((geometries, i) => {
    if (!geometries.length) return;
    const merged = mergeGeometries(geometries);
    geometries.forEach(g => g.dispose());
    if (merged) group.add(new THREE.Mesh(merged, materials[i]));
  });
  const dialMaterial = new THREE.MeshStandardMaterial({ map: texture, roughness: .52, metalness: .18 });
  const dial = new THREE.Mesh(new THREE.CircleGeometry(.795, 80), dialMaterial);
  dial.position.z = .226; group.add(dial);
  const gears: THREE.Group[] = [];
  if (tone === 'black') {
    for (const [x, y, r] of [[-.34, .22, .24], [.31, .16, .2], [0, -.4, .29]]) {
      const gear = new THREE.Group(); gear.position.set(x ?? 0, y ?? 0, .26);
      gear.add(new THREE.Mesh(new THREE.TorusGeometry(r, .026, 8, 32), materials[4]));
      for (let i = 0; i < 6; i++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(.025, (r ?? .2) * 2, .018), materials[1]);
        spoke.rotation.z = i / 6 * Math.PI; gear.add(spoke);
      }
      gears.push(gear); group.add(gear);
    }
  }
  const hands = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
  hands.forEach((hand, i) => {
    const length = [.48, .68, .76][i] ?? .5;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(i === 2 ? .013 : .045, length, .016), materials[i === 2 ? 4 : 3]);
    mesh.position.y = length / 2 - .065; hand.add(mesh); hand.position.z = .32 + i * .02; group.add(hand);
  });
  const pin = new THREE.Mesh(new THREE.SphereGeometry(.06, 16, 12), materials[0]); pin.position.z = .39; group.add(pin);
  return { group, hands, gears, dispose: () => {
    group.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    materials.forEach(m => m.dispose()); dialMaterial.dispose(); texture.dispose();
  } };
}