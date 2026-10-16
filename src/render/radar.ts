import * as THREE from 'three/webgpu';
import {
  abs, atan, color, exp, float, fract, instancedDynamicBufferAttribute, length, max, smoothstep, step, uv, vec4, sin, TWO_PI,
} from 'three/tsl';
import { U } from './uniforms';
import type { RadarSim } from '../sim/radar';

export const RADAR_RADIUS = 3;
const CYAN = color(0x19f0ff);
const SWEEP = color(0x3dffc5);

const kindColor = { hostile: new THREE.Color(0xff2b55), unknown: new THREE.Color(0xffc23d), friendly: new THREE.Color(0x39f5ff) };

/** Thin anti-aliased line at distance `d` with half-width `w`. */
const line = (d: THREE.Node<'float'>, w: number) => float(1).sub(smoothstep(float(w * 0.5), float(w), d));

export function createRadar(maxContacts: number) {
  const group = new THREE.Group();

  // --- radar disc: everything procedural in one TSL fragment ---------------
  const p = uv().sub(0.5).mul(2); // -1..1, y = north
  const r = length(p);
  const bearing01 = fract(atan(p.x, p.y).div(TWO_PI).add(1)); // compass bearing, clockwise
  const behind = fract(U.sweep.sub(bearing01)); // 0 at the beam, grows behind it
  const trail = exp(behind.mul(-9)).mul(0.9).add(exp(behind.mul(-60)).mul(1.6));

  const rings = line(abs(fract(r.mul(4).add(0.5)).sub(0.5)), 0.03).mul(0.32);
  const fineRings = line(abs(fract(r.mul(16).add(0.5)).sub(0.5)), 0.05).mul(0.05);
  const tickMask = smoothstep(0.9, 0.93, r).mul(float(1).sub(smoothstep(0.985, 1, r)));
  const ticks = line(abs(fract(bearing01.mul(72)).sub(0.5)), 0.06).mul(tickMask).mul(0.5);
  const majorTicks = line(abs(fract(bearing01.mul(8)).sub(0.5)), 0.01).mul(smoothstep(0.82, 0.86, r)).mul(0.9);
  const cross = max(line(abs(p.x), 0.004), line(abs(p.y), 0.004)).mul(0.22);
  const rim = line(abs(r.sub(1)), 0.012).mul(0.9);
  const noise = fract(sin(p.x.mul(91.7).add(p.y.mul(47.3)).add(U.time.mul(13))).mul(43758.5)).mul(0.05).mul(U.flicker);
  const inside = float(1).sub(step(1.0, r));
  const glow = exp(r.mul(-2.5)).mul(0.035);

  const lines = rings.add(fineRings).add(ticks).add(majorTicks).add(cross);
  const sweepGlow = trail.mul(inside).mul(smoothstep(0, 0.08, r));
  const rgb = CYAN.mul(lines.add(rim).add(glow).add(noise).mul(inside.max(rim)))
    .add(SWEEP.mul(sweepGlow.mul(0.28)))
    .add(SWEEP.mul(lines).mul(sweepGlow).mul(1.2)); // lines light up as the beam passes
  const alpha = inside.mul(0.92).add(rim).min(1);

  const discMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  discMat.colorNode = vec4(rgb.mul(alpha), alpha);
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(RADAR_RADIUS * 2, RADAR_RADIUS * 2), discMat);
  disc.rotation.x = -Math.PI / 2;
  group.add(disc);

  // --- contacts: instanced blips + holographic altitude stalks -------------
  const intensity = new THREE.InstancedBufferAttribute(new Float32Array(maxContacts), 1);
  intensity.setUsage(THREE.DynamicDrawUsage);
  const iNode = instancedDynamicBufferAttribute<'float'>(intensity, 'float');
  const tint = new THREE.InstancedBufferAttribute(new Float32Array(maxContacts * 3), 3);
  tint.setUsage(THREE.DynamicDrawUsage);
  const tintNode = instancedDynamicBufferAttribute<'vec3'>(tint, 'vec3');

  const bp = uv().sub(0.5).mul(2);
  const br = length(bp);
  const dot = exp(br.mul(br).mul(-18)).mul(2.4);
  const ring = line(abs(br.sub(0.62)), 0.08).mul(0.9);
  const blipShape = dot.add(ring).mul(float(1).sub(step(1, br)));
  const blipMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  blipMat.colorNode = vec4(tintNode.mul(blipShape.mul(iNode.mul(0.85).add(0.15))), 1);
  const blipGeo = new THREE.PlaneGeometry(0.42, 0.42);
  blipGeo.rotateX(-Math.PI / 2);
  const blips = new THREE.InstancedMesh(blipGeo, blipMat, maxContacts);
  blips.frustumCulled = false;
  group.add(blips);

  const stalkGeo = new THREE.PlaneGeometry(0.035, 1);
  stalkGeo.translate(0, 0.5, 0);
  const sv = uv();
  const stalkFade = sv.y.mul(0.8).add(0.2).mul(float(1).sub(smoothstep(0.85, 1, sv.y)).add(smoothstep(0.96, 1, sv.y).mul(2)));
  const stalkMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  stalkMat.colorNode = vec4(tintNode.mul(stalkFade.mul(iNode.mul(0.75).add(0.1))), 1);
  const stalks = new THREE.InstancedMesh(stalkGeo, stalkMat, maxContacts);
  stalks.frustumCulled = false;
  group.add(stalks);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const tmp = new THREE.Color();

  function update(sim: RadarSim, camera: THREE.Camera) {
    const n = Math.min(maxContacts, sim.contacts.length);
    const k = RADAR_RADIUS / sim.rangeKm;
    for (let i = 0; i < n; i++) {
      const c = sim.contacts[i]!;
      const it = sim.intensity(c);
      intensity.setX(i, it);
      pos.set(c.x * k, 0.01, -c.y * k);
      s.setScalar(0.8 + it * 0.6);
      m.compose(pos, q.identity(), s);
      blips.setMatrixAt(i, m);
      tmp.copy(kindColor[c.cls]);
      tint.setXYZ(i, tmp.r, tmp.g, tmp.b);
      // stalk: billboard around Y towards the camera, height = altitude
      const yaw = Math.atan2(camera.position.x - pos.x, camera.position.z - pos.z);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
      s.set(1, 0.25 + c.altitude * 1.4, 1);
      m.compose(pos, q, s);
      stalks.setMatrixAt(i, m);
    }
    blips.count = stalks.count = n;
    intensity.needsUpdate = true;
    blips.instanceMatrix.needsUpdate = stalks.instanceMatrix.needsUpdate = true;
    tint.needsUpdate = true;
  }

  return { group, update };
}
