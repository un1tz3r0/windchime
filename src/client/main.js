import { createScene }          from './scene.js';
import { createPhysicsWorld }    from './physics.js';
import { createWindchimeMeshes, createWindArrow } from './rendering.js';
import { createFractalWind }     from './wind.js';
import { initAudio }             from './audio.js';
import { params, buildChimeConfigs, buildClapperConfig } from './params.js';
import { createGUI } from './gui.js';
import { createSky } from './sky.js';
import { initPresets, scheduleSave } from './preset-storage.js';
import { decodeDefaults, applyPreset } from './preset-codec.js';

applyPreset(decodeDefaults(), params);

// --- Set up scene ---
const { renderer, scene, camera, composer, key, ground } = createScene();

// --- Background scenery ---
const scenery = createSky(scene);

// --- Wind ---
const wind = createFractalWind();

// --- Wind arrow (persistent, not part of rebuild cycle) ---
const windArrow = createWindArrow(scene);

// --- Build / rebuild state ---
let physics = null;
let meshes  = null;
let audioHandle = null;

function build() {
  if (meshes)   meshes.dispose();
  if (physics)  physics.destroy();

  const chimeConfigs  = buildChimeConfigs(params);
  const clapperConfig = buildClapperConfig(params);

  physics = createPhysicsWorld(chimeConfigs, clapperConfig, {
    ringRadius: params.ringRadius,
    ringMass: params.ringMass,
    anchorY: params.anchorY,
    anchorStringLen: params.anchorStringLen,
  });

  meshes = createWindchimeMeshes(scene, physics);

  if (audioHandle) {
    audioHandle.rebuild(params.numChimes);
    physics.setOnCollision(audioHandle.strike);
  }
}

build();

// --- GUI ---
const gui = createGUI({
  onRebuild: () => {
    build();
    gui.buildPitchSliders();
  },
  onAudioUpdate: () => {
    if (audioHandle) audioHandle.updateFromParams();
  },
  onAnyChange: () => {
    scheduleSave();
  },
});

// --- Presets: load from URL hash or localStorage ---
initPresets({
  onLoad: () => {
    gui.refreshFromParams();
    build();
    gui.buildPitchSliders();
    if (audioHandle) audioHandle.updateFromParams();
  },
});

// --- Camera parallax state ---
// Smoothly tracks wind X to create a gentle horizontal sway.
// Different scene depths produce genuine parallax against the fixed windchime.
let smoothCamX = 0;

// --- Main loop ---
let lastTime = performance.now() / 1000;

function frame() {
  requestAnimationFrame(frame);

  const now = performance.now() / 1000;
  let elapsed = now - lastTime;
  lastTime = now;
  if (elapsed > 0.1) elapsed = 0.1;

  // Sync wind params from tweakpane
  wind.state.amplitude.x = params.windAmplitudeX;
  wind.state.amplitude.z = params.windAmplitudeZ;
  wind.state.rate        = params.windRate;

  wind.update(now);
  windArrow.update(wind.state);
  physics.step(elapsed, wind.state);

  if (audioHandle) audioHandle.updateWind(wind.state);

  meshes.update();
  scenery.update(wind.state, elapsed);

  // Sync lighting and ground from params
  key.color.set(params.lightColor);
  key.intensity = params.lightIntensity;
  key.position.set(params.lightDirX, params.lightDirY, params.lightDirZ);
  ground.position.y = params.groundY;

  // Parallax: gentle camera drift in wind direction.
  // Amplitude ≈ ±0.06 units → near objects shift, far mountains barely move.
  const targetCamX = wind.state.x * 0.06;
  smoothCamX += (targetCamX - smoothCamX) * Math.min(elapsed * 0.55, 1.0);
  camera.position.x = smoothCamX;
  camera.lookAt(0, -0.5, 0); // always re-aim at windchime center

  composer.render();
}

frame();

// --- Audio (gated on user gesture) ---
const unmuteBtn = document.getElementById('unmute');
unmuteBtn.addEventListener('click', () => {
  audioHandle = initAudio(params.numChimes);
  physics.setOnCollision(audioHandle.strike);
  unmuteBtn.classList.add('faded');
}, { once: true });
