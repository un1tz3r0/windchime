/**
 * Simple procedural wind model.
 * Returns a time-varying wind vector { x, z } using layered sine waves.
 */

import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';

class FractalNoise {
	constructor(octaves = 3, persistance = 0.5, lacunarity = 2.0, scale = 1.0) {
		this.octaves = octaves;
		this.persistance = persistance;
		this.lacunarity = lacunarity;
		this.scale = scale;
		this.noise = [];
		for (let i = 0; i < octaves; i++) {
			this.noise[i] = {x: new SimplexNoise(), y: new SimplexNoise(), z: new SimplexNoise() };
		}
	}

	noise3d(x, y, z) {
		// Fractal noise by summing multiple octaves of simplex noise
		let norm = 1/(2 - Math.pow(this.persistance, this.octaves));
		let amplitude = 1.0;
		let frequency = 1.0;
		let total;
		for (let i = 0; i < this.octaves; i++) {
			let vec = {
				x: this.noise[i].x.noise3d(x * frequency / this.scale, y * frequency / this.scale, z * frequency / this.scale),
				y: this.noise[i].y.noise3d(x * frequency / this.scale, y * frequency / this.scale, z * frequency / this.scale),
				z: this.noise[i].z.noise3d(x * frequency / this.scale, y * frequency / this.scale, z * frequency / this.scale),
			};
			vec.x *= amplitude * norm;
			vec.y *= amplitude * norm;
			vec.z *= amplitude * norm;
			if (i == 0) {
				total = vec;
			} else {
				total.x += vec.x;
				total.y += vec.y;
				total.z += vec.z;
			}
			amplitude *= this.persistance;
			frequency *= this.lacunarity;
		}
		return total; // Normalize to [-1, 1]
	}
};


export function createAdditiveWind() {
  const state = { x: 0, z: 0 };

  function update(t) {
    // Layered gusts at different frequencies
    state.x = 0.8 * Math.sin(t * 0.7)
             + 0.4 * Math.sin(t * 1.9 + 1.0)
             + 0.2 * Math.sin(t * 4.3 + 2.5);

    state.z = 0.6 * Math.sin(t * 0.5 + 0.8)
             + 0.3 * Math.sin(t * 2.1 + 3.0)
             + 0.15 * Math.sin(t * 5.0 + 1.2);
	}

  return { state, update };
}

export function createFractalWind() {
	const state = { x: 0, y: 0, z: 0, amplitude: { x: 1.0, y: 0, z: 1.0 }, rate: 0.1, tint: 0, tprev: 0};
	const noise = new FractalNoise(3, 0.5, 2.0, 1.0);

	function update(t) {
		state.tint = state.tint + (t - state.tprev) * state.rate;
		state.tprev = t;
		const v = noise.noise3d(0, 0, state.tint);
		state.x = v.x * state.amplitude.x;
		state.y = v.y * state.amplitude.y;
		state.z = v.z * state.amplitude.z;
	}

	return { state, update };
}
