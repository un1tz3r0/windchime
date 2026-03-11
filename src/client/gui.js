/**
 * Tweakpane GUI for the windchime simulation.
 */

import { Pane } from 'tweakpane';
import { params } from './params.js';
import { logFromNorm, normFromLog, expFromNorm, normFromExp } from './scales.js';

// ---------------------------------------------------------------------------
// Proxy tracking for preset refresh
// ---------------------------------------------------------------------------
// Log/exp/lin helpers create local proxy objects that Tweakpane binds to.
// When params change externally (preset load), we must update these proxies
// before calling pane.refresh().

const proxyEntries = [];  // { key, proxy, fromParam }

/**
 * Add a linear-scale slider to a folder.
 */
function addLinBinding(folder, obj, key, opts) {
  const { min, max, step, label } = opts;
  const proxy = { value: obj[key] };

  proxyEntries.push({
    key,
    proxy,
    fromParam: (v) => v,
  });

  const binding = folder.addBinding(proxy, 'value', {
    label: label || key,
    min, max, step,
    format: (v) => Number(v).toFixed(4),
  });

  binding.on('change', (ev) => { obj[key] = ev.value; });
  return binding;
}

/**
 * Add a logarithmic-scale slider to a folder.
 */
function addLogBinding(folder, obj, key, opts) {
  const { min, max, base = 10, label } = opts;
  const proxy = { value: normFromLog(obj[key], min, max, base) };

  proxyEntries.push({
    key,
    proxy,
    fromParam: (v) => normFromLog(v, min, max, base),
  });

  const binding = folder.addBinding(proxy, 'value', {
    label: label || key,
    min: 0, max: 1, step: 0.001,
    format: (v) => logFromNorm(v, min, max, base).toFixed(4),
  });

  binding.on('change', (ev) => {
    obj[key] = logFromNorm(ev.value, min, max, base);
  });
  return binding;
}

/**
 * Add an exponential-scale slider to a folder.
 */
function addExpBinding(folder, obj, key, opts) {
  const { min, max, power = 10, label } = opts;
  const proxy = { value: normFromExp(obj[key], min, max, power) };

  proxyEntries.push({
    key,
    proxy,
    fromParam: (v) => normFromExp(v, min, max, power),
  });

  const binding = folder.addBinding(proxy, 'value', {
    label: label || key,
    min: 0, max: 1, step: 0.001,
    format: (v) => expFromNorm(v, min, max, power).toFixed(4),
  });

  binding.on('change', (ev) => {
    obj[key] = expFromNorm(ev.value, min, max, power);
  });
  return binding;
}

// ---------------------------------------------------------------------------
// GUI creation
// ---------------------------------------------------------------------------

/**
 * @param {Object} callbacks
 * @param {Function} callbacks.onRebuild — called when geometry params change (debounced)
 * @param {Function} callbacks.onAudioUpdate — called when audio params change
 * @param {Function} callbacks.onAnyChange — called on any param change (for storage)
 */
export function createGUI({ onRebuild, onAudioUpdate, onAnyChange }) {
  // Container element — floats over the canvas
  const container = document.createElement('div');
  container.id = 'tp-container';
  Object.assign(container.style, {
    position: 'fixed',
    top: '10px',
    right: '10px',
    zIndex: '20',
    maxHeight: 'calc(100vh-20px)',
    overflowY: 'auto',
  });
  document.body.appendChild(container);

  const pane = new Pane({ container, title: 'Windchime' });

  const tab = pane.addTab({
    pages: [
      { title: 'Physics' },
      { title: 'Geometry' },
      { title: 'Audio' },
      { title: 'Visual' },
    ],
  });

  // Global change handler for storage persistence
  pane.on('change', () => {
    if (onAnyChange) onAnyChange();
  });

  // ---- Debounced rebuild ----
  let rebuildTimer = null;
  function scheduleRebuild() {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(onRebuild, 300);
  }

  // ===== Tab 1: Physics =====
  const phys = tab.pages[0];

  const worldFolder = phys.addFolder({ title: 'World' });
  worldFolder.addBinding(params, 'gravity', { min: -20, max: 0, step: 0.1 });
  worldFolder.addBinding(params, 'solverIterations', { min: 1, max: 50, step: 1 });

  const windFolder = phys.addFolder({ title: 'Wind' });
  addLogBinding(windFolder, params, 'windForceScale', { min: 0.001, max: 0.3, base: 10 });
  addLogBinding(windFolder, params, 'windForceCurveExp', { min: 0.01, max: 10, base: 10 });
  addLogBinding(windFolder, params, 'windAmplitudeX', { label: 'amplitudeX', min: 0, max: 1, base: 10 });
  addLogBinding(windFolder, params, 'windAmplitudeZ', { label: 'amplitudeZ', min: 0, max: 1, base: 10 });
  addLinBinding(windFolder, params, 'windBiasX', { label: 'biasX', min: -1, max: 1, step: 0.01 });
  addLinBinding(windFolder, params, 'windBiasZ', { label: 'biasZ', min: -1, max: 1, step: 0.01 });
  addLogBinding(windFolder, params, 'windRate', { label: 'rate', min: 0.001, max: 5, base: 10 });

  const dampFolder = phys.addFolder({ title: 'Damping' });
  dampFolder.addBinding(params, 'ringDamping', { min: 0, max: 1, step: 0.01 });
  dampFolder.addBinding(params, 'chimeDamping', { min: 0, max: 1, step: 0.01 });
  dampFolder.addBinding(params, 'chimeAngularDamping', { min: 0, max: 1, step: 0.01 });
  dampFolder.addBinding(params, 'clapperDamping', { min: 0, max: 1, step: 0.01 });

  const contactFolder = phys.addFolder({ title: 'Contact Materials' });
  addLogBinding(contactFolder, params, 'chimeFriction', { min: 0.001, max: 1, base: 5 });
  addLogBinding(contactFolder, params, 'chimeRestitution', { min: 0.01, max: 1, base: 3 });
  addLogBinding(contactFolder, params, 'clapperFriction', { min: 0.001, max: 1, base: 5 });
  addLogBinding(contactFolder, params, 'clapperRestitution', { min: 0.01, max: 1, base: 3 });

  // ===== Tab 2: Geometry =====
  const geo = tab.pages[1];

  const ringFolder = geo.addFolder({ title: 'Ring' });
  ringFolder.addBinding(params, 'anchorY', { min: 0.5, max: 5, step: 0.05 });
  ringFolder.addBinding(params, 'anchorStringLen', { min: 0.1, max: 2, step: 0.01 });
  ringFolder.addBinding(params, 'ringRadius', { min: 0.05, max: 0.5, step: 0.01 });
  ringFolder.addBinding(params, 'ringThickness', { min: 0.002, max: 0.1, step: 0.001 });
  ringFolder.addBinding(params, 'ringMass', { min: 0.05, max: 2, step: 0.01 });

  const chimesFolder = geo.addFolder({ title: 'Chimes' });
  chimesFolder.addBinding(params, 'numChimes', { min: 1, max: 12, step: 1 });
  chimesFolder.addBinding(params, 'chimeRadius', { min: 0.005, max: 0.1, step: 0.001 });
  chimesFolder.addBinding(params, 'chimeBaseHalfLen', { min: 0.05, max: 0.8, step: 0.01 });
  chimesFolder.addBinding(params, 'chimeHalfLenStep', { min: -0.1, max: 0.2, step: 0.005 });
  chimesFolder.addBinding(params, 'chimeBaseMass', { min: 0.005, max: 0.2, step: 0.005 });
  chimesFolder.addBinding(params, 'chimeMassStep', { min: -0.05, max: 0.1, step: 0.005 });
  chimesFolder.addBinding(params, 'chimeBaseStringLen', { min: 0.1, max: 1.5, step: 0.01 });
  chimesFolder.addBinding(params, 'chimeStringLenStep', { min: -0.15, max: 0.15, step: 0.005 });

  const clapperFolder = geo.addFolder({ title: 'Clapper' });
  clapperFolder.addBinding(params, 'clapperRadius', { min: 0.02, max: 0.2, step: 0.005 });
  clapperFolder.addBinding(params, 'clapperMass', { min: 0.02, max: 0.5, step: 0.01 });
  clapperFolder.addBinding(params, 'clapperStringLen', { min: 0.2, max: 2, step: 0.01 });

  const arrowFolder = geo.addFolder({ title: 'Wind Arrow' });
  arrowFolder.addBinding(params, 'windArrowVisible', { label: 'visible' });
  arrowFolder.addBinding(params, 'windArrowY', { label: 'Y position', min: -3, max: 1, step: 0.05 });
  arrowFolder.addBinding(params, 'windArrowLength', { label: 'length', min: 0.05, max: 8, step: 0.05 });
  arrowFolder.addBinding(params, 'windArrowWidth', { label: 'width', min: 0.002, max: 0.1, step: 0.001 });
  arrowFolder.addBinding(params, 'windArrowColor', { label: 'color' });

  // Geometry changes trigger debounced rebuild (but NOT the arrow folder)
  ringFolder.on('change', scheduleRebuild);
  chimesFolder.on('change', scheduleRebuild);
  clapperFolder.on('change', scheduleRebuild);

  // ===== Tab 3: Audio =====
  const aud = tab.pages[2];

  const topAudioFolder = aud.addFolder({ title: 'Tuning' });
  topAudioFolder.addBinding(params, 'baseFreq', { min: 100, max: 2000, step: 1 });
  topAudioFolder.addBinding(params, 'detuneAmount', { min: 0, max: 1, step: 0.01 });
  topAudioFolder.on('change', () => {
    if (onAudioUpdate) onAudioUpdate();
  });

  // Dynamic per-chime pitch sliders
  let pitchFolder = aud.addFolder({ title: 'Chime Pitches' });

  function buildPitchSliders() {
    pitchFolder.dispose();
    pitchFolder = aud.addFolder({ title: 'Chime Pitches' });

    while (params.chimeSemitones.length < params.numChimes) {
      params.chimeSemitones.push(0);
    }
    params.chimeSemitones.length = params.numChimes;

    for (let i = 0; i < params.numChimes; i++) {
      pitchFolder.addBinding(params.chimeSemitones, String(i), {
        label: `Chime ${i + 1}`,
        min: 0,
        max: 36,
        step: 1,
      });
    }

    pitchFolder.on('change', () => {
      if (onAudioUpdate) onAudioUpdate();
    });
  }
  buildPitchSliders();

  const windSoundFolder = aud.addFolder({ title: 'Wind Sound' });
  windSoundFolder.addBinding(params, 'windSoundGain', { label: 'gain', min: 0, max: 2, step: 0.01 });
  windSoundFolder.addBinding(params, 'windSoundMinGain', { label: 'minGain', min: 0, max: 0.5, step: 0.005 });
  windSoundFolder.addBinding(params, 'windGainFadeIn', { label: 'fadeIn', min: 0, max: 1, step: 0.01 });
  addLogBinding(windSoundFolder, params, 'windFilterMinFreq', { label: 'filterMin', min: 50, max: 800, base: 2 });
  addLogBinding(windSoundFolder, params, 'windFilterMaxFreq', { label: 'filterMax', min: 100, max: 16000, base: 2 });
  windSoundFolder.addBinding(params, 'windFilterQ', { label: 'filterQ', min: 0.5, max: 15, step: 0.1 });
  windSoundFolder.addBinding(params, 'windFlangerDepth', { label: 'flangerDepth', min: 0, max: 0.5, step: 0.0005 });
  addLogBinding(windSoundFolder, params, 'windFlangerRate', { label: 'flangerRate', min: 0.005, max: 2, base: 2 });
  windSoundFolder.addBinding(params, 'windFlangerMix', { label: 'flangerMix', min: 0, max: 0.5, step: 0.01 });
  windSoundFolder.addBinding(params, 'windFlangerFeedback', { label: 'flangerFeedback', min: -0.95, max: 0.95, step: 0.01 });

  const envFolder = aud.addFolder({ title: 'Envelope' });
  envFolder.addBinding(params, 'attack', { min: 0.001, max: 0.1, step: 0.001 });
  envFolder.addBinding(params, 'decay', { min: 0.1, max: 10, step: 0.1 });
  envFolder.addBinding(params, 'maxGain', { min: 0, max: 1, step: 0.01 });
  envFolder.addBinding(params, 'masterGain', { min: 0, max: 1, step: 0.01 });

  envFolder.on('change', () => {
    if (onAudioUpdate) onAudioUpdate();
  });

  // ===== Tab 4: Visual =====
  const vis = tab.pages[3];

  const appearFolder = vis.addFolder({ title: 'Appearance' });
  appearFolder.addBinding(params, 'chimeColor', { label: 'Chimes' });
  appearFolder.addBinding(params, 'ringColor', { label: 'Ring' });
  appearFolder.addBinding(params, 'clapperColor', { label: 'Clapper' });
  appearFolder.addBinding(params, 'stringColor', { label: 'Strings' });
  appearFolder.addBinding(params, 'stringWidth', { label: 'String Width', min: 1, max: 5, step: 0.5 });

  const lightFolder = vis.addFolder({ title: 'Lighting' });
  lightFolder.addBinding(params, 'lightColor', { label: 'Color' });
  lightFolder.addBinding(params, 'lightIntensity', { label: 'Intensity', min: 0, max: 5, step: 0.05 });
  lightFolder.addBinding(params, 'lightDirX', { label: 'Dir X', min: -10, max: 10, step: 0.1 });
  lightFolder.addBinding(params, 'lightDirY', { label: 'Dir Y', min: -10, max: 10, step: 0.1 });
  lightFolder.addBinding(params, 'lightDirZ', { label: 'Dir Z', min: -10, max: 10, step: 0.1 });

  const groundFolder = vis.addFolder({ title: 'Ground' });
  groundFolder.addBinding(params, 'groundY', { label: 'Height', min: -5, max: 2, step: 0.05 });

  const skyFolder = vis.addFolder({ title: 'Sky' });
  skyFolder.addBinding(params, 'backgroundColor');

  const gradientNames = ['Gradient 1', 'Gradient 2', 'Gradient 3', 'Gradient 4'];
  for (let i = 0; i < 4; i++) {
    const gf = skyFolder.addFolder({ title: gradientNames[i] });
    gf.addBinding(params.skyGradients[i][0], 'color', { label: 'Bottom' });
    gf.addBinding(params.skyGradients[i][1], 'color', { label: 'Mid' });
    gf.addBinding(params.skyGradients[i][2], 'color', { label: 'Top' });
  }

  const renderFolder = vis.addFolder({ title: 'Rendering' });
  renderFolder.addBinding(params, 'enableBokeh');
  renderFolder.addBinding(params, 'bokehFocus', { min: 0.5, max: 10, step: 0.1 });

  // -----------------------------------------------------------------------
  // refreshFromParams — sync all proxy-based bindings after external change
  // -----------------------------------------------------------------------
  function refreshFromParams() {
    for (const entry of proxyEntries) {
      entry.proxy.value = entry.fromParam(params[entry.key]);
    }
    pane.refresh();
  }

  return { pane, buildPitchSliders, refreshFromParams };
}
