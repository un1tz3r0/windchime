import * as THREE from 'three';

const CHIME_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xc0c0c0,
  metalness: 0.09,
  roughness: 0.05,
});

const STRING_MATERIAL = new THREE.LineBasicMaterial({ color: 0x776644 });

const CLAPPER_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xdddbd0,
  metalness: 0.09,
  roughness: 0.03,
});

import { params } from './params.js';

// Scratch vectors for computing world-space offsets
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

/**
 * Build Three.js meshes for the windchime and return an update() function
 * that syncs them with cannon-es physics state each frame.
 */
export function createWindchimeMeshes(scene, physics) {
  const group = new THREE.Group();

  // --- Anchor string (fixed point → ring) ---
  const anchorStringGeo = new THREE.BufferGeometry();
  anchorStringGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  const anchorString = new THREE.Line(anchorStringGeo, STRING_MATERIAL);
  group.add(anchorString);

  // --- Support ring ---
  const ringGeo = new THREE.TorusGeometry(params.ringRadius, params.ringThickness, 8, 32);
  const ringMesh = new THREE.Mesh(ringGeo, CHIME_MATERIAL);
  ringMesh.rotation.x = Math.PI / 2; // will be overwritten by quaternion
  group.add(ringMesh);

  // --- Chime tubes + strings ---
  const chimeMeshes = physics.chimes.map((c) => {
    const tubeHeight = c.halfLen * 2;

    // Cylinder
    const geo = new THREE.CylinderGeometry(c.radius, c.radius, tubeHeight, 12, 1, true);
    const mesh = new THREE.Mesh(geo, CHIME_MATERIAL);
    mesh.castShadow = true;
    group.add(mesh);

    // End caps
    const capGeo = new THREE.CircleGeometry(c.radius, 12);
    const topCap = new THREE.Mesh(capGeo, CHIME_MATERIAL);
    const botCap = new THREE.Mesh(capGeo, CHIME_MATERIAL);
    group.add(topCap, botCap);

    // String from ring pivot to top of chime
    const stringGeo = new THREE.BufferGeometry();
    stringGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    const stringLine = new THREE.Line(stringGeo, STRING_MATERIAL);
    group.add(stringLine);

    return { mesh, topCap, botCap, stringLine };
  });

  // --- Clapper ---
  const clapperGeo = new THREE.SphereGeometry(physics.clapper.radius, 12, 8);
  const clapperMesh = new THREE.Mesh(clapperGeo, CLAPPER_MATERIAL);
  clapperMesh.castShadow = true;
  group.add(clapperMesh);

  const clapperStringGeo = new THREE.BufferGeometry();
  clapperStringGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  const clapperString = new THREE.Line(clapperStringGeo, STRING_MATERIAL);
  group.add(clapperString);

  scene.add(group);

  // --- Sync function ---
  function update() {
    const ringBody = physics.ring.body;
    const ringPos = ringBody.position;
    const ringQuat = ringBody.quaternion;

    // Ring mesh — cannon-es Cylinder is Y-up, Three.js Torus needs X rotation,
    // so we compose the physics quaternion with a 90° X rotation.
    ringMesh.position.set(ringPos.x, ringPos.y, ringPos.z);
    _q.set(ringQuat.x, ringQuat.y, ringQuat.z, ringQuat.w);
    ringMesh.quaternion.copy(_q);
    // Torus geometry lies in XY plane, but we want XZ; apply the local rotation
    ringMesh.quaternion.multiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
    );

    // Anchor string
    const ap = physics.anchor.position;
    const asp = anchorString.geometry.attributes.position;
    asp.array[0] = ap.x; asp.array[1] = ap.y; asp.array[2] = ap.z;
    asp.array[3] = ringPos.x; asp.array[4] = ringPos.y; asp.array[5] = ringPos.z;
    asp.needsUpdate = true;

    // Chimes
    for (let i = 0; i < physics.chimes.length; i++) {
      const c = physics.chimes[i];
      const m = chimeMeshes[i];
      const bp = c.body.position;
      const bq = c.body.quaternion;

      // Cylinder mesh — cannon-es Cylinder is Y-axis aligned, same as Three.js
      m.mesh.position.set(bp.x, bp.y, bp.z);
      m.mesh.quaternion.set(bq.x, bq.y, bq.z, bq.w);

      // Compute world-space top and bottom endpoints
      // In local space: top = (0, +halfLen, 0), bot = (0, -halfLen, 0)
      _q.set(bq.x, bq.y, bq.z, bq.w);

      _v.set(0, c.halfLen, 0).applyQuaternion(_q);
      const topX = bp.x + _v.x, topY = bp.y + _v.y, topZ = bp.z + _v.z;

      _v.set(0, -c.halfLen, 0).applyQuaternion(_q);
      const botX = bp.x + _v.x, botY = bp.y + _v.y, botZ = bp.z + _v.z;

      // End caps
      m.topCap.position.set(topX, topY, topZ);
      m.topCap.quaternion.copy(m.mesh.quaternion);
      // Top cap faces "up" along local Y — rotate 180° so it faces outward
      m.topCap.quaternion.multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
      );

      m.botCap.position.set(botX, botY, botZ);
      m.botCap.quaternion.copy(m.mesh.quaternion);
      m.botCap.quaternion.multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
      );

      // String: from ring pivot point (world space) to top of chime
      // Ring pivot in world space = ringPos + ringQuat * pivotOnRing
      const pv = c.pivotOnRing;
      _q.set(ringQuat.x, ringQuat.y, ringQuat.z, ringQuat.w);
      _v.set(pv.x, pv.y, pv.z).applyQuaternion(_q);
      const pivotWorldX = ringPos.x + _v.x;
      const pivotWorldY = ringPos.y + _v.y;
      const pivotWorldZ = ringPos.z + _v.z;

      const sp = m.stringLine.geometry.attributes.position;
      sp.array[0] = pivotWorldX; sp.array[1] = pivotWorldY; sp.array[2] = pivotWorldZ;
      sp.array[3] = topX; sp.array[4] = topY; sp.array[5] = topZ;
      sp.needsUpdate = true;
    }

    // Clapper
    const clb = physics.clapper.body;
    clapperMesh.position.set(clb.position.x, clb.position.y, clb.position.z);

    // Clapper string: ring center (world) to clapper position
    const csp = clapperString.geometry.attributes.position;
    csp.array[0] = ringPos.x; csp.array[1] = ringPos.y; csp.array[2] = ringPos.z;
    csp.array[3] = clb.position.x; csp.array[4] = clb.position.y; csp.array[5] = clb.position.z;
    csp.needsUpdate = true;
  }

  function dispose() {
    scene.remove(group);
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
    });
  }

  return { update, dispose };
}

/**
 * Wind vector arrow — lives outside the chime rebuild cycle.
 * Built from a cylinder (shaft) + cone (head) for controllable thickness.
 */
export function createWindArrow(scene) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: params.windArrowColor });

  // Shaft: unit-length cylinder along Y, scaled at render time
  const shaftGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
  // Shift origin so bottom is at y=0, top at y=1
  shaftGeo.translate(0, 0.5, 0);
  const shaft = new THREE.Mesh(shaftGeo, material);
  group.add(shaft);

  // Head: unit cone along Y
  const headGeo = new THREE.ConeGeometry(0.5, 1, 8);
  headGeo.translate(0, 0.5, 0);
  const head = new THREE.Mesh(headGeo, material);
  group.add(head);

  group.position.y = params.windArrowY;
  scene.add(group);

  const _dir = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _quat = new THREE.Quaternion();

  function update(windState) {
    if (!params.windArrowVisible) {
      group.visible = false;
      return;
    }
    group.visible = true;

    const w = params.windArrowWidth;
    const headWidth = w * 3;
    const headLength = headWidth * 2;

    const mag = Math.sqrt(windState.x * windState.x + windState.z * windState.z);
    const totalLength = mag * params.windArrowLength;
    const shaftLength = Math.max(totalLength - headLength, 0);
    // shrink the arrow if it is smaller than the size of the arrowhead. alternative would
    // be to make the shaft length (not the shaft length + head length) proportional to the
    // wind vector magnitude
    const tinyVectorScale = (totalLength < headLength) ? (totalLength / headLength) : 1.0;

    // Direction → quaternion (rotate from Y-up to wind direction in XZ plane)
    if (mag > 0.001) {
      _dir.set(windState.x, 0, windState.z).normalize();
      _quat.setFromUnitVectors(_up, _dir);
      group.quaternion.copy(_quat);
    }

    // Scale shaft: width × shaftLength × width
    shaft.scale.set(w * tinyVectorScale, shaftLength, w * tinyVectorScale);

    // Position and scale head: sits on top of shaft
    head.position.set(0, shaftLength, 0);
    head.scale.set(headWidth * tinyVectorScale, headLength * tinyVectorScale, headWidth * tinyVectorScale);

    group.position.y = params.windArrowY;
    material.color.set(params.windArrowColor);
  }

  function dispose() {
    scene.remove(group);
    shaftGeo.dispose();
    headGeo.dispose();
    material.dispose();
  }

  return { update, dispose };
}
