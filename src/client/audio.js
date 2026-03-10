/**
 * Web Audio chime synthesiser.
 *
 * Each chime gets a sine oscillator running continuously at its pitch.
 * The oscillator feeds through a gain node that sits at 0. On collision,
 * we schedule a sharp attack ramp followed by an exponential decay on
 * that gain node — this is the "ping" envelope.
 *
 * initAudio(numChimes) must be called from inside a user-gesture handler.
 * It returns { strike, updateFromParams, rebuild }.
 */

import { params, buildFrequencies } from './params.js';

export function initAudio(numChimes) {
  const ctx = new AudioContext();

  // Master gain so we can fade everything
  const master = ctx.createGain();
  master.gain.value = params.masterGain;
  master.connect(ctx.destination);

  let oscillators = [];
  let gains = [];

  function createVoices(count) {
    const freqs = buildFrequencies(params);

    for (let i = 0; i < count; i++) {
      const freq = i < freqs.length ? freqs[i] : params.baseFreq;

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      gain.gain.value = 0;

      osc.connect(gain);
      gain.connect(master);
      osc.start();

      oscillators.push(osc);
      gains.push(gain);
    }
  }

  createVoices(numChimes);

  /**
   * Collision callback — schedule an envelope ping on the given chime.
   * `velocity` scales the volume (clamped to [0, 1]).
   */
  function strike(chimeIndex, velocity) {
    if (chimeIndex < 0 || chimeIndex >= gains.length) return;

    const vol = Math.min(velocity * velocity, 1) * params.maxGain;
    if (vol < 0.001) return;

    const g = gains[chimeIndex].gain;
    const now = ctx.currentTime;

    // Cancel any in-progress envelope so we can re-trigger cleanly
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);

    // Attack: ramp to peak
    g.linearRampToValueAtTime(vol, now + params.attack);

    // Decay: exponential fall to ~silence
    g.exponentialRampToValueAtTime(0.0001, now + params.attack + params.decay);
    g.setValueAtTime(0, now + params.attack + params.decay + 0.001);
  }

  /** Update oscillator frequencies and master gain from current params. */
  function updateFromParams() {
    master.gain.setValueAtTime(params.masterGain, ctx.currentTime);

    const freqs = buildFrequencies(params);
    for (let i = 0; i < oscillators.length; i++) {
      const freq = i < freqs.length ? freqs[i] : params.baseFreq;
      oscillators[i].frequency.setValueAtTime(freq, ctx.currentTime);
    }
  }

  /** Rebuild oscillators for a new chime count, reusing the AudioContext. */
  function rebuild(newNumChimes) {
    // Stop and disconnect old oscillators
    for (const osc of oscillators) {
      osc.stop();
      osc.disconnect();
    }
    for (const g of gains) {
      g.disconnect();
    }
    oscillators = [];
    gains = [];

    createVoices(newNumChimes);
  }

  // ---- Wind sound synthesis ----
  // White noise → bandpass filter → (dry + flanger mix) → panner → gain → master
  // All modulated per-frame by the wind vector.

  // White noise source: large looping buffer
  const noiseLen = ctx.sampleRate * 4;
  const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const noiseData = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) noiseData[i] = Math.random() * 2 - 1;

  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = noiseBuf;
  noiseSrc.loop = true;

  // Resonant bandpass filter — cutoff modulated by wind magnitude
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.value = params.windFilterMinFreq;
  windFilter.Q.value = params.windFilterQ;

  // Flanger: short delay modulated by triangle LFO
  const flangerDelay = ctx.createDelay(0.02);
  flangerDelay.delayTime.value = 0.005;

  const flangerLFO = ctx.createOscillator();
  flangerLFO.type = 'sine';
  flangerLFO.frequency.value = params.windFlangerRate;

  const flangerLFOGain = ctx.createGain();
  flangerLFOGain.gain.value = params.windFlangerDepth;

  flangerLFO.connect(flangerLFOGain);
  flangerLFOGain.connect(flangerDelay.delayTime);
  flangerLFO.start();

  // Dry/wet mix for flanger
  const flangerDry = ctx.createGain();
  flangerDry.gain.value = 1 - params.windFlangerMix;
  const flangerWet = ctx.createGain();
  flangerWet.gain.value = params.windFlangerMix;
  const flangerFeedback = ctx.createGain();
	flangerFeedback.gain.value = Math.max(Math.min(params.windFlangerFeedback, 0.95), -0.95);

  const flangerMerge = ctx.createGain();

  // Stereo panner — pan modulated by wind x
  const windPanner = ctx.createStereoPanner();
  windPanner.pan.value = 0;

  // Wind gain — amplitude modulated by wind magnitude
  const windGain = ctx.createGain();
  windGain.gain.value = 0;

  // Wire it up
  noiseSrc.connect(windFilter);

  windFilter.connect(flangerDry);
  windFilter.connect(flangerDelay);
  flangerDelay.connect(flangerWet);
  flangerDelay.connect(flangerFeedback);

  flangerDry.connect(flangerMerge);
  flangerWet.connect(flangerMerge);
  flangerFeedback.connect(flangerDelay);

  flangerMerge.connect(windPanner);
  windPanner.connect(windGain);
  windGain.connect(master);

  noiseSrc.start();

  /**
   * Called each frame with the current wind state to modulate the wind sound.
   * @param {{ x: number, y: number, z: number }} windState
   */
  function updateWind(windState) {
/*
// Parameters that affect wind sound synthesis.

// Wind (physical simulation)
windAmpCurveExp: 2.5, // exponent applied to normalized wind magnitude to get a more dynamic range of amplitudes (higher = more contrast between light and strong wind)
windAmpCurveScale: 0.15, // scale factor applied to normalized wind magnitude after applying the curve exponent, before applying the final amplitude scaling
windAmplitudeX: 1.0, // scale factor applied post amplitude curve
windAmplitudeZ: 1.0, // same, but for z
windBiasX: 0.25, // shifts wind left/right, added to normalized noise output before re-normalizing and applying amplitude curve
windBiasZ: -0.1, // shifts wind forward/back, added to normalized noise output before re-normalizing and applying amplitude curve
windRate: 0.1, // rate at which we move through the noise field, changes how quickly the wind direction and amplitude fluctuates

// so, our windState vector's peak values are: windPeakX = windAmplitude * windAmplitudeX

// Wind sound (synthesis)
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

		function clip(value, low=0.0, high=1.0) {
			return Math.max(low, Math.min(high, value));
		}

		function lerpmap(value, fromlow=0, fromhigh=1, tolow=0, tohigh=1, clamp=True, wrap=False, fold=False)
		{
			const t = (value - fromlow) / (fromhigh - fromlow);
			const mapped = tolow + t * (tohigh - tolow);
			if (wrap) {
				const range = tohigh - tolow;
				return ((mapped - tolow) % range + range) % range + tolow;
			} else if (fold) {
				const range = tohigh - tolow;
				const doubleRange = 2 * range;
				const mod = ((mapped - tolow) % doubleRange + doubleRange) % doubleRange;
				return mod < range ? mod + tolow : doubleRange - mod + tolow;
			} else if (clamp) {
				return clip(mapped, Math.min(tolow, tohigh), Math.max(tolow, tohigh));
			} else {
				return mapped;
			}
		}

		function signedPow(base, exp) {
			return Math.sign(base) * Math.pow(Math.abs(base), exp);
		}

		const windNormX = Math.min(Math.max(signedPow((windState.x + params.windBiasX) / (1 + Math.abs(params.windBiasX)), params.windForceCurveExp) * params.windAmplitudeX, -1), 1);
		const windNormZ = Math.min(Math.max(signedPow((windState.z + params.windBiasZ) / (1 + Math.abs(params.windBiasZ)), params.windForceCurveExp) * params.windAmplitudeZ, -1), 1);
		const mag = Math.sqrt(windNormX * windNormX + windNormZ * windNormZ) / Math.sqrt(2);
    const normMag = Math.max(0, Math.min(mag, 1)); // normalize roughly to 0..1

    const now = ctx.currentTime;

    // Filter cutoff: sweep from min to max with wind intensity
    const freq = params.windFilterMinFreq +
      normMag * (params.windFilterMaxFreq - params.windFilterMinFreq);
    windFilter.frequency.setTargetAtTime(freq, now, 0.05);
    windFilter.Q.setTargetAtTime(params.windFilterQ, now, 0.05);

    // Gain: log-scaled wind magnitude → gain with min floor
		const windAmp = Math.max(0, Math.min(normMag / params.windGainFadeIn, 1));
    const gain = params.windSoundMinGain + windAmp * (params.windSoundGain - params.windSoundMinGain);
    windGain.gain.setTargetAtTime(Math.max(gain, 0), now, 0.05);

    // Pan: wind x-component maps to stereo field
    const pan = Math.max(-1, Math.min(1, windNormX));
    windPanner.pan.setTargetAtTime(pan, now, 0.05);

    // Flanger: z-component modulates depth
    const zNorm = Math.min(Math.max(windNormZ + 1, 0)/2, 1);
    flangerLFOGain.gain.setTargetAtTime(zNorm * params.windFlangerDepth, now, 0.05);
    flangerLFO.frequency.setTargetAtTime(params.windFlangerRate, now, 0.05);
    flangerDry.gain.setTargetAtTime(1 - params.windFlangerMix, now, 0.05);
    flangerWet.gain.setTargetAtTime(params.windFlangerMix, now, 0.05);
    flangerFeedback.gain.setTargetAtTime(params.windFlangerFeedback, now, 0.05);
	}

  return { strike, updateFromParams, rebuild, updateWind };
}
