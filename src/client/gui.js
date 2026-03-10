/**
 * Tweakpane GUI for the windchime simulation.
 */

import { Pane } from 'tweakpane';
import { params } from './params.js';
import { damp } from 'three/src/math/MathUtils.js';

// --- Logarithmic slider helper ---
// Binds a slider operating in normalized 0..1 space, mapped through a log curve.
// The slider track position corresponds to log-scaled values, giving more
// precision at the low end. `base` controls steepness (higher = more low-end room).

function logFromNorm(t, min, max, base) {
  if (base <= 1) return min + t * (max - min);
  return min + (max - min) * (Math.pow(base, t) - 1) / (base - 1);
}

function normFromLog(value, min, max, base) {
  if (base <= 1) return (value - min) / (max - min);
  return Math.log(1 + (value - min) / (max - min) * (base - 1)) / Math.log(base);
}

// --- Logarithmic slider helper ---
// Binds a slider operating in normalized 0..1 space, mapped through a log curve.
// The slider track position corresponds to log-scaled values, giving more
// precision at the low end. `base` controls steepness (higher = more low-end room).

function expFromNorm(t, min, max, power) {
	if (power <= 1) return min + t * (max - min);
	return min + (max - min) * Math.pow(t, power);
}

function normFromExp(value, min, max, power) {
	if (power <= 1) return (value - min) / (max - min);
	return Math.pow((value - min) / (max - min), 1 / power);
}

/**
 * Add a logarithmic-scale slider to a folder.
 * @param {*} folder  Tweakpane folder or tab page
 * @param {Object} obj  Object containing the property
 * @param {string} key  Property name
 * @param {Object} opts  { min, max, step, label? }
 */
function addLinBinding(folder, obj, key, opts) {
  const { min, max, step, label } = opts;
  const proxy = { value: obj[key] };

  const binding = folder.addBinding(proxy, 'value', {
    label: label || key,
    min: min,
    max: max,
    step: step,
    format: (v) => Number(v).toFixed(4),
  });

  binding.on('change', (ev) => {
		obj[key] = ev.value;
  });

  return binding;
}


/**
 * Add a logarithmic-scale slider to a folder.
 * @param {*} folder  Tweakpane folder or tab page
 * @param {Object} obj  Object containing the property
 * @param {string} key  Property name
 * @param {Object} opts  { min, max, base, label? }
 */
function addLogBinding(folder, obj, key, opts) {
  const { min, max, base = 10, label } = opts;
  const proxy = { value: normFromLog(obj[key], min, max, base) };

  const binding = folder.addBinding(proxy, 'value', {
    label: label || key,
    min: 0,
    max: 1,
    step: 0.001,
    format: (v) => logFromNorm(v, min, max, base).toFixed(4),
  });

  binding.on('change', (ev) => {
    obj[key] = logFromNorm(ev.value, min, max, base);
  });

  return binding;
}

/** * Add an exponential-scale slider to a folder.
 * @param {*} folder  Tweakpane folder or tab page
 * @param {Object} obj  Object containing the property
 * @param {string} key  Property name
 * @param {Object} opts  { min, max, power, label? }
 */
function addExpBinding(folder, obj, key, opts) {
	const { min, max, power = 10, label } = opts;
	const proxy = { value: normFromExp(obj[key], min, max, power) };

	const binding = folder.addBinding(proxy, 'value', {
		label: label || key,
		min: 0,
		max: 1,
		step: 0.001,
		format: (v) => expFromNorm(v, min, max, power).toFixed(4),
	});

	binding.on('change', (ev) => {
		obj[key] = expFromNorm(ev.value, min, max, power);
	});

	return binding;
}

/**
 * @param {Object} callbacks
 * @param {Function} callbacks.onRebuild — called when geometry params change (debounced)
 * @param {Function} callbacks.onAudioUpdate — called when audio params change
 */
export function createGUI({ onRebuild, onAudioUpdate }) {
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
    ],
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

  /*
  // Wind
  windForceCurveExp: 2.5,
  windForceScale: 1.5,
  windAmplitudeX: 0.15,
	windAmplitudeZ: 0.15,
	windBiasX: 0.25,
  windBiasZ: -0.1,
  windRate: 0.1,
  */

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

	//worldFolder.on('change', scheduleRebuild);

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
    // Remove existing children by disposing and recreating the folder
    pitchFolder.dispose();
    pitchFolder = aud.addFolder({ title: 'Chime Pitches' });

    // Ensure chimeSemitones array matches numChimes
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

  /*
  windSoundGain: 0.4,
  windSoundMinGain: 0.05,
  windGainFadeIn: 0.33,
  windFilterMinFreq: 600,
  windFilterMaxFreq: 6000,
  windFilterQ: 1.5,
  windFlangerDepth: 0.003,
  windFlangerRate: 0.25,
  windFlangerMix: 0.5,
  windFlangerFeedback: 0.6,
  */

  const envFolder = aud.addFolder({ title: 'Envelope' });
  envFolder.addBinding(params, 'attack', { min: 0.001, max: 0.1, step: 0.001 });
  envFolder.addBinding(params, 'decay', { min: 0.1, max: 10, step: 0.1 });
  envFolder.addBinding(params, 'maxGain', { min: 0, max: 1, step: 0.01 });
  envFolder.addBinding(params, 'masterGain', { min: 0, max: 1, step: 0.01 });

  envFolder.on('change', () => {
    if (onAudioUpdate) onAudioUpdate();
  });

  return { pane, buildPitchSliders };
}
