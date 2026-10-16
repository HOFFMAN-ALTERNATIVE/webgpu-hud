import * as THREE from 'three/webgpu';
import {
  abs, cameraPosition, color, cos, dot, exp, float, fract, hash, instancedBufferAttribute, length, mix, normalWorld, normalize,
  positionLocal, positionWorld, pow, sin, smoothstep, uv, vec3, vec4, normalLocal, TWO_PI,
} from 'three/tsl';
import { mulberry32, range } from '../core/prng';
import { U } from './uniforms';

const CYAN = color(0x19f0ff);
const MAGENTA = color(0xff2bd6);
const DEEP = color(0x1450ff);

const additive = () =>
  new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });

/** Particle field: GPU-animated instanced sprites — zero per-frame CPU work. */
export function createParticles(count: number, seed: number) {
  const rng = mulberry32(seed);
  const data = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const column = i % 4 === 0; // a quarter swirl tightly around the hologram column
    data[i * 4] = column ? range(rng, 0.15, 1.6) : 1.5 + Math.pow(rng(), 0.7) * 13; // radius
    data[i * 4 + 1] = range(rng, 0, Math.PI * 2); // angle
    data[i * 4 + 2] = rng(); // height phase
    data[i * 4 + 3] = range(rng, 0.3, 1.2) * (column ? 2.2 : 1); // speed
  }
  const seeds = instancedBufferAttribute<'vec4'>(new THREE.InstancedBufferAttribute(data, 4), 'vec4');
  const rad = seeds.x;
  const t = U.time;
  const ang = seeds.y.add(t.mul(seeds.w).mul(0.35).div(rad.add(0.6)));
  const h = fract(seeds.z.add(t.mul(seeds.w).mul(0.025)));
  const wob = sin(t.mul(0.6).add(seeds.y.mul(7))).mul(0.12);
  const y = h.mul(5.5).sub(0.3);

  const mat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  mat.positionNode = vec3(cos(ang).mul(rad.add(wob)), y, sin(ang).mul(rad.add(wob)));
  const tw = sin(t.mul(seeds.w.mul(3)).add(seeds.y.mul(40))).mul(0.5).add(0.5);
  mat.scaleNode = float(0.012).add(tw.mul(0.022)).mul(smoothstep(0, 0.15, h)).mul(float(1).sub(smoothstep(0.75, 1, h)));
  const d = length(uv().sub(0.5)).mul(2);
  const disc = exp(d.mul(d).mul(-6)).mul(float(1).sub(smoothstep(0.8, 1, d)));
  const tint = mix(CYAN, MAGENTA, smoothstep(0.55, 1, hash(seeds.y.mul(1000)))).mul(mix(float(0.9), float(0.45), smoothstep(1.5, 9, rad)));
  mat.colorNode = vec4(tint.mul(disc).mul(tw.mul(0.6).add(0.4)), 1);
  const sprite = new THREE.Sprite(mat);
  sprite.count = count;
  sprite.frustumCulled = false;
  return sprite;
}

/** Holographic core: fresnel shell with scanlines, wireframe lattice, orbit rings. */
export function createHologram() {
  const group = new THREE.Group();
  group.position.y = 1.85;

  const viewDir = normalize(cameraPosition.sub(positionWorld));
  const fresnel = pow(float(1).sub(abs(dot(normalWorld, viewDir))), 2.2);
  const scan = sin(positionWorld.y.mul(70).sub(U.time.mul(5))).mul(0.5).add(0.5);
  const band = smoothstep(0.92, 1, fract(positionWorld.y.mul(0.6).sub(U.time.mul(0.35)))).mul(1.2);
  const flick = float(1).sub(hash(float(U.time.mul(24)).floor()).mul(0.18).mul(U.flicker));

  const shellMat = additive();
  shellMat.side = THREE.FrontSide;
  // vertex: gentle breathing displacement along the normal
  shellMat.positionNode = positionLocal.add(normalLocal.mul(sin(positionLocal.y.mul(9).add(U.time.mul(1.6))).mul(0.018)));
  shellMat.colorNode = vec4(
    mix(DEEP, CYAN, fresnel).mul(fresnel.mul(1.3).add(scan.mul(0.12)).add(band.mul(0.8))).mul(flick),
    1,
  );
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.78, 6), shellMat);
  group.add(shell);

  const latticeMat = additive();
  latticeMat.wireframe = true;
  latticeMat.colorNode = vec4(CYAN.mul(0.35).mul(flick), 1);
  const lattice = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), latticeMat);
  group.add(lattice);

  const coreMat = additive();
  const pulse = sin(U.time.mul(2.4)).mul(0.25).add(1);
  coreMat.colorNode = vec4(mix(CYAN, color(0xffffff), fresnel.oneMinus()).mul(pulse).mul(1.1), 1);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 3), coreMat);
  group.add(core);

  const rings: THREE.Mesh[] = [];
  const specs = [
    { r: 1.15, tilt: [Math.PI / 2, 0, 0], dash: 48, c: CYAN },
    { r: 1.35, tilt: [Math.PI / 2.4, 0.4, 0], dash: 96, c: MAGENTA },
    { r: 1.6, tilt: [Math.PI / 1.7, -0.3, 0.2], dash: 24, c: CYAN },
  ] as const;
  for (const sp of specs) {
    const m = additive();
    const dashes = smoothstep(0.35, 0.45, fract(uv().x.mul(sp.dash))).mul(float(1).sub(smoothstep(0.85, 0.95, fract(uv().x.mul(sp.dash)))));
    m.colorNode = vec4(sp.c.mul(dashes.mul(0.9).add(0.12)).mul(flick), 1);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(sp.r, 0.008, 6, 256), m);
    ring.rotation.set(sp.tilt[0], sp.tilt[1], sp.tilt[2]);
    group.add(ring);
    rings.push(ring);
  }

  function update(t: number) {
    shell.rotation.y = t * 0.15;
    lattice.rotation.set(t * 0.07, -t * 0.11, 0);
    rings.forEach((r, i) => (r.rotation.z = t * (i % 2 ? -0.22 : 0.16) * (i + 1)));
  }
  return { group, update };
}

/** Volumetric light cone from the radar to the hologram (faked with layered additive shells). */
export function createBeam() {
  const group = new THREE.Group();
  for (let layer = 0; layer < 3; layer++) {
    const m = additive();
    const v = uv();
    const streaks = sin(v.x.mul(TWO_PI.mul(18 + layer * 7)).add(U.time.mul(1.5 + layer))).mul(0.5).add(0.5);
    const rise = fract(v.y.mul(3).sub(U.time.mul(0.6 + layer * 0.2)));
    const fade = pow(v.y, 1.6).mul(float(1).sub(smoothstep(0.88, 1, v.y)));
    const a = fade.mul(streaks.mul(0.5).add(0.5)).mul(rise.mul(0.4).add(0.6)).mul(0.11 - layer * 0.025);
    m.colorNode = vec4(mix(CYAN, DEEP, float(layer / 3)).mul(a), 1);
    const r = 1 - layer * 0.18;
    const geo = new THREE.CylinderGeometry(0.95 * r, 0.12, 1.65, 96, 1, true);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.y = 0.825;
    group.add(mesh);
  }
  return group;
}

/** Infinite-feeling floor grid fading with distance. */
export function createGrid() {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const p = positionWorld.xz;
  const g = abs(fract(p.mul(1.25)).sub(0.5));
  const lineW = 0.47;
  const lines = smoothstep(lineW, 0.5, g.x).add(smoothstep(lineW, 0.5, g.y)).min(1);
  const big = abs(fract(p.mul(0.25)).sub(0.5));
  const major = smoothstep(0.485, 0.5, big.x).add(smoothstep(0.485, 0.5, big.y)).min(1);
  const dist = length(p);
  const fade = exp(dist.mul(-0.16)).mul(smoothstep(2.9, 3.4, dist).mul(0.8).add(0.2));
  const pulse = exp(abs(fract(dist.mul(0.08).sub(U.time.mul(0.12))).sub(0.5)).mul(-30)).mul(0.6);
  m.colorNode = vec4(DEEP.mul(lines.mul(0.35).add(major.mul(0.7))).add(CYAN.mul(major.mul(pulse))).mul(fade), 1);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.02;
  return mesh;
}
