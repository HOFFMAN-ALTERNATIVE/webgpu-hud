import '@fontsource-variable/jetbrains-mono';
import './styles.css';
import { damp, FixedStep, stepSpring, type Spring } from './core/anim';
import { mulberry32, seedFrom } from './core/prng';
import { motionProfile, parseParams, qualityFor, type Backend, type MotionProfile } from './core/settings';
import { createPost } from './render/post';
import { createRenderer } from './render/renderer';
import { createScene } from './render/scene';
import { U } from './render/uniforms';
import { RadarSim } from './sim/radar';
import { TelemetryStream } from './sim/telemetry';
import { Overlay } from './ui/overlay';

/** Test/automation hook (read by the Playwright smoke test). */
export interface HudState {
  ready: boolean;
  backend: Backend | null;
  frames: number;
  tier: string;
  motion: 'full' | 'reduced';
  error: string | null;
}
declare global {
  interface Window {
    __HUD__: HudState;
  }
}

const SIM_HZ = 30;
const MAX_CONTACTS = 24;
const WARMUP_S = 30;

async function boot() {
  const params = parseParams(location.search);
  const state: HudState = { ready: false, backend: null, frames: 0, tier: '', motion: 'full', error: null };
  window.__HUD__ = state;

  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  let motionOverride = params.motion;
  let motion: MotionProfile = motionProfile(mq.matches, motionOverride);

  const seed = seedFrom(params.seed);
  const telemetry = new TelemetryStream({ rng: mulberry32(seed), historyLength: 90 });
  const radar = new RadarSim({ rng: mulberry32(seed ^ 0x9e3779b9), contacts: 16 });
  const overlay = new Overlay();
  // Warm-up: the station has "been running" for 30 s, so sparklines, the
  // contact picture and the event log are populated on the very first frame.
  for (let i = 0; i < SIM_HZ * WARMUP_S; i++) {
    const frame = telemetry.step(1 / SIM_HZ);
    radar.step(1 / SIM_HZ);
    if (frame.events.length) overlay.pushEvents(frame.events);
  }
  const applyMotion = () => {
    U.flicker.value = motion.flicker;
    state.motion = motion.reduced ? 'reduced' : 'full';
    overlay.setMotion(motion);
  };
  applyMotion();
  mq.addEventListener('change', () => {
    motion = motionProfile(mq.matches, motionOverride);
    applyMotion();
  });

  const canvas = document.querySelector<HTMLCanvasElement>('#gl')!;
  let handle;
  try {
    handle = await createRenderer(canvas, params.renderer);
  } catch (err) {
    state.error = String(err);
    document.documentElement.dataset.gpu = 'unavailable';
    console.error('No WebGPU or WebGL 2 available:', err);
    return;
  }
  const { renderer, backend } = handle;
  state.backend = backend;
  overlay.setBackend(backend);

  const q = qualityFor(
    { backend, devicePixelRatio: devicePixelRatio, hardwareConcurrency: navigator.hardwareConcurrency || 4, width: innerWidth, height: innerHeight },
    params.quality,
  );
  state.tier = q.tier;
  document.documentElement.dataset.tier = q.tier;
  renderer.setPixelRatio(q.pixelRatio);

  const world = createScene(q, seed, MAX_CONTACTS);
  const { pipeline } = createPost(renderer, world.scene, world.camera, q);

  // ---- input: pointer parallax (springs), keyboard + buttons --------------
  let pointerX = 0;
  let pointerY = 0;
  addEventListener('pointermove', (e) => {
    pointerX = (e.clientX / innerWidth) * 2 - 1;
    pointerY = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });
  let paused = false;
  const togglePause = () => {
    paused = !paused;
    overlay.setPaused(paused);
  };
  const toggleMotion = () => {
    motionOverride = motion.reduced ? 'full' : 'reduced';
    motion = motionProfile(mq.matches, motionOverride);
    applyMotion();
  };
  document.querySelector('#pause-toggle')!.addEventListener('click', togglePause);
  document.querySelector('#motion-toggle')!.addEventListener('click', toggleMotion);
  addEventListener('keydown', (e) => {
    // Space on a focused button already "clicks" it; don't toggle twice.
    if (e.code === 'Space' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); togglePause(); }
    if (e.key === 'm' || e.key === 'M') toggleMotion();
  });

  // ---- resize --------------------------------------------------------------
  const resize = () => {
    const w = innerWidth;
    const h = innerHeight;
    renderer.setSize(w, h, false);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  };
  addEventListener('resize', resize);
  resize();

  // ---- loop ------------------------------------------------------------------
  const fixed = new FixedStep(1 / SIM_HZ);
  let last = performance.now();
  let sceneTime = 0;
  let uiAcc = 0;
  let fps = 60;
  let yaw: Spring = { value: 0.0, velocity: 0 };
  let pitch: Spring = { value: 0, velocity: 0 };
  let threat = 0;

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    fps = damp(fps, dt > 0 ? 1 / dt : fps, 0.5, dt);
    const hidden = document.visibilityState === 'hidden';

    if (!paused && !hidden) {
      const steps = fixed.advance(dt * motion.timeScale);
      for (let i = 0; i < steps; i++) {
        const frame = telemetry.step(1 / SIM_HZ);
        radar.step(1 / SIM_HZ);
        if (frame.events.length) overlay.pushEvents(frame.events);
      }
      sceneTime += dt * motion.timeScale;
    }

    const drift = Math.sin(sceneTime * 0.07) * 0.35 * motion.cameraDrift;
    yaw = stepSpring(yaw, drift + pointerX * 0.25 * motion.parallax, 2.5, dt);
    pitch = stepSpring(pitch, -pointerY * 0.35 * motion.parallax, 2.5, dt);
    threat = damp(threat, radar.threat(), 0.6, dt);

    U.time.value = sceneTime;
    U.sweep.value = radar.sweep / (Math.PI * 2);
    U.threat.value = threat;
    U.pointer.value = pointerX;

    world.frame(innerWidth, innerHeight, yaw.value, pitch.value);
    world.update(sceneTime, radar);
    pipeline.render();

    uiAcc += dt;
    if (uiAcc >= 0.1 || state.frames === 0) {
      overlay.update(uiAcc, telemetry, radar, fps);
      uiAcc = 0;
    }
    state.frames++;
    if (state.frames === 3) {
      state.ready = true;
      document.documentElement.dataset.ready = 'true';
    }
  });
}

boot().catch((err: unknown) => {
  console.error(err);
  if (window.__HUD__) window.__HUD__.error = String(err);
});
