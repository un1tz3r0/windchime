import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass }     from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass }      from 'three/examples/jsm/postprocessing/BokehPass.js';
import { OutputPass }     from 'three/examples/jsm/postprocessing/OutputPass.js';
import { params } from './params.js';

export function createScene() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // Dark purple-black to match sky zenith (sky sphere covers everything anyway)
  scene.background = new THREE.Color(0x070512);
  // Warm sunset atmospheric haze — fog blends distant objects toward horizon orange
  scene.fog = new THREE.Fog(0xa05830, 20, 72);

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    200,
  );
  camera.position.set(0, 1.5, 3);
  camera.lookAt(0, 1.25, 0);

  // ── Lighting (warm sunset palette) ────────────────────────────────────────
  // Ambient: dim, warm-tinted dusk light
  const ambient = new THREE.AmbientLight(0x201018, 0.55);
  scene.add(ambient);

  // Key: low-angle sunset from camera-left, warm deep orange
  const key = new THREE.DirectionalLight(0xff6a25, 1.35);
  key.position.set(-2.5, 1.8, 3.5);
  key.castShadow = true;
  scene.add(key);

  // Sky fill: cool blue-violet from sky dome above
  const fill = new THREE.HemisphereLight(0x304060, 0x1a1008, 0.30);
  scene.add(fill);

  // ── Post-processing: Depth of Field ───────────────────────────────────────
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  // focus=3.0 keeps the windchime (3 units from camera) sharp;
  // background at z=-10…-40 gets progressively blurred.
	if (params.enableBokeh)
	{
		const bokeh = new BokehPass(scene, camera, {
	    focus:   params.bokehFocus,
	    aperture: 0.005,
	    maxblur:  0.014,
	  });
		composer.addPass(bokeh);
	}
	composer.addPass(new OutputPass());

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera, composer };
}
