import * as THREE from 'three';

const defaults = {
	radius: 20,
	widthSegments: 64,
	heightSegments: 32,
	floorColor: 0x333333,
	gradients: [
		// 0° azimuth — warm sunset horizon
		[
			{ stop: 0, color: 0xff6633 },
			{ stop: 0.25, color: 0xcc66aa },
			{ stop: 0.55, color: 0x337788 },
			{ stop: 1, color: 0x0a0a2e },
		],
		// 90° — transitional mid-sky
		[
			{ stop: 0, color: 0xcc6699 },
			{ stop: 0.3, color: 0x5544bb },
			{ stop: 0.6, color: 0x222266 },
			{ stop: 1, color: 0x0b0b30 },
		],
		// 180° — cool teal opposite horizon
		[
			{ stop: 0, color: 0x336688 },
			{ stop: 0.3, color: 0x2244aa },
			{ stop: 0.6, color: 0x191955 },
			{ stop: 1, color: 0x080820 },
		],
	],
};

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

/** Sample a single gradient at parameter t (0 = horizon, 1 = zenith). */
function sampleGradient(gradient, t) {
	if (t <= gradient[0].stop) return _c1.set(gradient[0].color);
	if (t >= gradient[gradient.length - 1].stop) return _c1.set(gradient[gradient.length - 1].color);

	for (let i = 0; i < gradient.length - 1; i++) {
		const a = gradient[i];
		const b = gradient[i + 1];
		if (t >= a.stop && t <= b.stop) {
			const frac = (t - a.stop) / (b.stop - a.stop);
			_c1.set(a.color);
			_c2.set(b.color);
			_c1.lerp(_c2, frac);
			return _c1;
		}
	}
	return _c1.set(gradient[0].color);
}

/** Sample the gradient array at mirrored azimuth u (0–1) and elevation v (0–1). */
function sampleGradients(gradients, u, v) {
	const n = gradients.length;
	if (n === 1) return sampleGradient(gradients[0], v);

	const pos = u * (n - 1);
	const lo = Math.floor(pos);
	const hi = Math.min(lo + 1, n - 1);
	const frac = pos - lo;

	const colorLo = sampleGradient(gradients[lo], v).clone();
	const colorHi = sampleGradient(gradients[hi], v);
	return colorLo.lerp(colorHi, frac);
}

export function createSky(scene, options = {}) {
	const {
		radius,
		widthSegments,
		heightSegments,
		floorColor,
		gradients,
	} = { ...defaults, ...options };

	// --- Hemisphere dome ---
	const domeGeo = new THREE.SphereGeometry(
		radius, widthSegments, heightSegments,
		0, Math.PI * 2,   // full azimuth
		0, Math.PI,   // upper hemisphere only
	);

	const pos = domeGeo.attributes.position;
	const colors = new Float32Array(pos.count * 3);

	for (let i = 0; i < pos.count; i++) {
		const x = pos.getX(i);
		const y = pos.getY(i);
		const z = pos.getZ(i);

		// Mirrored azimuth: 0 at +X, 1 at -X, symmetric about the XY plane
		const u = Math.abs(Math.atan2(z, x)) / Math.PI;
		// Elevation: 0 at horizon, 1 at zenith
		const v = Math.asin(Math.min(y / radius, 1)) / (Math.PI / 2);

		const c = sampleGradients(gradients, u, v);
		colors[i * 3] = c.r;
		colors[i * 3 + 1] = c.g;
		colors[i * 3 + 2] = c.b;
	}

	domeGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

	const domeMat = new THREE.MeshBasicMaterial({
		vertexColors: true,
		side: THREE.BackSide,
		depthWrite: false,
	});
	const domeMesh = new THREE.Mesh(domeGeo, domeMat);

	scene.add(domeMesh);

	return {
		update(_windState, _elapsed) {
			// No-op — vertex colors are static; keeps the interface compatible.
		},
		dispose() {
			scene.remove(domeMesh);
			domeGeo.dispose();
			domeMat.dispose();
		},
	};
}
