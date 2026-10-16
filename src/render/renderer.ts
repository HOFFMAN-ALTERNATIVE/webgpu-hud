import * as THREE from 'three/webgpu';
import type { Backend, RendererPreference } from '../core/settings';

export interface RendererHandle {
  renderer: THREE.WebGPURenderer;
  backend: Backend;
}

export const webgpuAvailable = (): boolean => typeof navigator !== 'undefined' && 'gpu' in navigator;

/**
 * Creates a WebGPURenderer. With `auto` it targets WebGPU and lets three.js
 * fall back to its WebGL 2 backend when no adapter is available (headless
 * CI, older Safari/Firefox, blocklisted GPUs); the same TSL node materials
 * compile to WGSL or GLSL.
 */
export async function createRenderer(canvas: HTMLCanvasElement, pref: RendererPreference): Promise<RendererHandle> {
  const renderer = new THREE.WebGPURenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    forceWebGL: pref === 'webgl' || (pref === 'auto' && !webgpuAvailable()),
  });
  await renderer.init();
  const backend: Backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2';
  if (pref === 'webgpu' && backend !== 'webgpu') console.error('WebGPU requested but unavailable; using WebGL 2');
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x02040a, 1);
  return { renderer, backend };
}
