import * as THREE from 'three/webgpu';
import { color, mix, screenUV, smoothstep, vec3 } from 'three/tsl';
import { cameraFraming, type Quality } from '../core/settings';
import type { RadarSim } from '../sim/radar';
import { createBeam, createGrid, createHologram, createParticles } from './fx';
import { createRadar } from './radar';

export function createScene(q: Quality, seed: number, maxContacts: number) {
  const scene = new THREE.Scene();
  // Deep-space gradient with a faint horizon glow, evaluated per pixel.
  const horizon = smoothstep(0.25, 0.6, screenUV.y).oneMinus().mul(smoothstep(0.0, 0.45, screenUV.y));
  scene.backgroundNode = mix(color(0x010208), color(0x050c1f), screenUV.y.oneMinus()).add(vec3(0.0, 0.05, 0.11).mul(horizon));

  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
  const target = new THREE.Vector3(0, 1.2, 0);

  const radar = createRadar(maxContacts);
  const hologram = createHologram();
  scene.add(radar.group, hologram.group, createBeam(), createGrid(), createParticles(q.particles, seed));

  function frame(width: number, height: number, yaw: number, pitch: number) {
    const aspect = width / height;
    const f = cameraFraming(aspect);
    camera.fov = f.fov;
    camera.aspect = aspect;
    if (f.shift > 0) camera.setViewOffset(width, height, 0, height * f.shift, width, height);
    else camera.clearViewOffset();
    camera.position.set(Math.sin(yaw) * f.distance, f.height + pitch, Math.cos(yaw) * f.distance);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }

  function update(t: number, sim: RadarSim) {
    hologram.update(t);
    radar.update(sim, camera);
  }

  return { scene, camera, frame, update };
}
