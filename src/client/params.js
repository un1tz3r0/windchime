/**
 * Central parameter store for all tweakable values.
 * Tweakpane binds to this object; modules read from it each frame.
 */

const SEMITONE_RATIO = Math.pow(2, 1 / 12);

export const params = {
  // Physics
  gravity: -9.81,
  solverIterations: 10,
  anchorY: 1.85,
	anchorStringLen: 0.85,

	ringMass: 0.3,
  ringDamping: 0.6,
  chimeDamping: 0.05,
  chimeAngularDamping: 0.15,
  clapperDamping: 0.03,
  chimeFriction: 0.1,
  chimeRestitution: 0.35,
  clapperFriction: 0.1,
  clapperRestitution: 0.4,

  // Geometry (changes trigger debounced rebuild)
  numChimes: 6,
  ringRadius: 0.20,
  ringThickness: 0.02,
  chimeRadius: 0.024,
  chimeBaseHalfLen: 0.25,
  chimeHalfLenStep: 0.06,
  chimeBaseMass: 0.03,
  chimeMassStep: 0.01,
  chimeBaseStringLen: 0.55,
  chimeStringLenStep: -0.03,
  clapperRadius: 0.09,
  clapperMass: 0.12,
  clapperStringLen: 0.8,

  // Wind
  windForceScale: 0.15,
  windForceCurveExp: 2.5,
  windAmplitudeX: 1.0,
	windAmplitudeZ: 1.0,
	windBiasX: 0.25,
  windBiasZ: -0.1,
  windRate: 0.1,

  // Wind sound
  windSoundGain: 0.8,
  windSoundMinGain: 0.05,
  windGainFadeIn: 0.33,
  windFilterMinFreq: 600,
  windFilterMaxFreq: 12000,
  windFilterQ: 1.5,
  windFlangerDepth: 0.003,
  windFlangerRate: 0.25,
  windFlangerMix: 0.0,
  windFlangerFeedback: 0.6,

  // Wind arrow
  windArrowVisible: true,
  windArrowY: -1.3,
  windArrowLength: 1.3,
  windArrowColor: '#88ccff',
  windArrowWidth: 0.01875,

  // Audio
  baseFreq: 440,
  chimeSemitones: [0, 3, 7, 0, 3, 7, 10, 12, 15, 19],
  detuneAmount: 0.10,
  attack: 0.003,
  decay: 2.3,
  maxGain: 0.25,
	masterGain: 0.7,

	// Rendering
	enableBokeh: false,
	bokehFocus: 3.0,

	// Sky
	backgroundColor: '#001020',

	skyGradients: [
		[
			{ offset: 0.0, color: '#001020' },
			{ offset: 0.5, color: '#004080' },
			{ offset: 1.0, color: '#88ccff' },
		], [
			{ offset: 0.0, color: '#202020' },
			{ offset: 0.5, color: '#400040' },
			{ offset: 1.0, color: '#ff88ff' },
		], [
			{ offset: 0.0, color: '#201000' },
			{ offset: 0.5, color: '#403000' },
			{ offset: 1.0, color: '#ffcc88' },
		], [
			{ offset: 0.0, color: '#102020' },
			{ offset: 0.5, color: '#304040' },
			{ offset: 1.0, color: '#88ff88' },
		]
	]
};

/** Build per-chime physics/geometry configs from flat params. */
export function buildChimeConfigs(p) {
  const configs = [];
  for (let i = 0; i < p.numChimes; i++) {
    const angle = (i / p.numChimes) * Math.PI * 2;
    configs.push({
      radius: p.chimeRadius,
      halfLen: p.chimeBaseHalfLen + i * p.chimeHalfLenStep,
      mass: p.chimeBaseMass + i * p.chimeMassStep,
      pivotAngle: angle,
      stringLen: p.chimeBaseStringLen + i * p.chimeStringLenStep,
    });
  }
  return configs;
}

/** Build clapper config from flat params. */
export function buildClapperConfig(p) {
  return {
    radius: p.clapperRadius,
    mass: p.clapperMass,
    stringLen: p.clapperStringLen,
  };
}

/**
 * Compute frequencies for each chime.
 *
 * When multiple chimes share the same semitone value, alternating +/- detune
 * offsets are applied to create a chorus/beating effect. Chimes with unique
 * pitches get no detune.
 */
export function buildFrequencies(p) {
  const semitones = p.chimeSemitones;
  const n = Math.min(semitones.length, p.numChimes);

  // Count occurrences of each semitone value to know which are duplicated
  const counts = {};
  for (let i = 0; i < n; i++) {
    const s = semitones[i];
    counts[s] = (counts[s] || 0) + 1;
  }

  // Track how many of each semitone we've seen so far for alternating detune
  const seen = {};
  const freqs = [];

  for (let i = 0; i < n; i++) {
    const s = semitones[i];
    let detune = 0;

    if (counts[s] > 1) {
      const idx = seen[s] || 0;
      seen[s] = idx + 1;
      // Alternate: +detune, -detune, +detune, ...
      detune = (idx % 2 === 0 ? 1 : -1) * p.detuneAmount;
    }

    freqs.push(p.baseFreq * Math.pow(SEMITONE_RATIO, s + detune));
  }

  return freqs;
}
