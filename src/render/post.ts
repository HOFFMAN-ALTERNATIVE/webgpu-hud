import * as THREE from 'three/webgpu';
import { float, hash, length, mix, pass, screenCoordinate, screenUV, sin, smoothstep, vec2, vec3, vec4 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import type { Quality } from '../core/settings';
import { U } from './uniforms';

/**
 * Post stack, all TSL: scene pass → radial chromatic aberration → mip bloom →
 * vignette, scanlines and film grain. Runs identically on WebGPU and WebGL 2.
 */
export function createPost(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera, q: Quality) {
  const pipeline = new THREE.RenderPipeline(renderer);
  const scenePass = pass(scene, camera);
  const tex = scenePass.getTextureNode('output');

  const uv0 = screenUV;
  const dir = uv0.sub(0.5);
  const dist = length(dir);
  const caAmt = float(0.0018).add(U.threat.mul(0.0025)).mul(dist.mul(1.4)).add(U.pointer.mul(0.0006).mul(U.flicker));
  const shift = dir.mul(caAmt);
  const r = tex.sample(uv0.add(shift)).r;
  const g = tex.sample(uv0).g;
  const b = tex.sample(uv0.sub(shift)).b;
  let col: THREE.Node<'vec3'> = vec3(r, g, b);

  const glow = bloom(tex, q.bloom.strength, q.bloom.radius, q.bloom.threshold);
  col = col.add(glow.rgb);

  const vignette = float(1).sub(smoothstep(0.35, 0.95, dist.mul(1.15)));
  const scan = sin(screenCoordinate.y.mul(Math.PI * 0.66)).mul(0.035).add(0.965);
  const grain = hash(screenCoordinate.xy.dot(vec2(12.9898, 78.233)).add(U.time.mul(60).floor())).sub(0.5).mul(0.05).mul(U.flicker);
  const threatTint = mix(vec3(1), vec3(1.15, 0.85, 0.9), U.threat.mul(0.35));
  col = col.mul(vignette.mul(0.8).add(0.2)).mul(scan).mul(threatTint).add(grain);

  pipeline.outputNode = vec4(col, 1);
  return { pipeline, glow };
}
