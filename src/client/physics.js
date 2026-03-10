import * as CANNON from 'cannon-es';
import { params } from './params.js';

const FIXED_TIMESTEP = 1 / 30;
const MAX_SUBSTEPS = 64;

// Collision groups
const GROUP_RING    = 1;
const GROUP_CHIME   = 2;
const GROUP_CLAPPER = 4;

/**
 * Create the cannon-es physics world for the windchime.
 *
 * @param {Array} chimeConfigs — [{ radius, halfLen, mass, pivotAngle, stringLen }]
 * @param {Object} clapperConfig — { radius, mass, stringLen }
 * @param {Object} opts — { ringRadius, ringMass, anchorY }
 */
export function createPhysicsWorld(chimeConfigs, clapperConfig, opts = {}) {
  const {
    ringRadius = 0.18,
    ringMass = 0.3,
    anchorY = 2.85,
    anchorStringLen = 0.850,
  } = opts;

  let onCollision = null;

  // --- World ---
  const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, params.gravity, 0),
  });
  world.solver.iterations = params.solverIterations;
  world.solver.tolerance = 0.0001;

  // Contact materials — store refs so step() can update live
  const chimeMaterial = new CANNON.Material('chime');
  const clapperMaterial = new CANNON.Material('clapper');
  const chimeChimeCM = new CANNON.ContactMaterial(chimeMaterial, chimeMaterial, {
    friction: params.chimeFriction,
    restitution: params.chimeRestitution,
  });
  const chimeClapperCM = new CANNON.ContactMaterial(chimeMaterial, clapperMaterial, {
    friction: params.clapperFriction,
    restitution: params.clapperRestitution,
  });
  world.addContactMaterial(chimeChimeCM);
  world.addContactMaterial(chimeClapperCM);

  // --- Anchor (static) ---
  const anchorBody = new CANNON.Body({ mass: 0, position: new CANNON.Vec3(0, anchorY, 0) });
  world.addBody(anchorBody);

  // --- Ring (dynamic) ---
  const ringShape = new CANNON.Cylinder(ringRadius, ringRadius, 0.02, 12);
  const ringBody = new CANNON.Body({
    mass: ringMass,
    position: new CANNON.Vec3(0, anchorY - anchorStringLen, 0),
    angularDamping: params.ringDamping,
    linearDamping: 0.05,
    collisionFilterGroup: GROUP_RING,
    collisionFilterMask: 0, // ring collides with nothing
  });
  ringBody.addShape(ringShape);
  world.addBody(ringBody);

  // Anchor → Ring constraint
  world.addConstraint(new CANNON.PointToPointConstraint(
    anchorBody, new CANNON.Vec3(0, 0, 0),
    ringBody, new CANNON.Vec3(0, anchorStringLen, 0),
  ));

  // --- Chimes ---
  const chimes = chimeConfigs.map((cfg, i) => {
    const { radius, halfLen, mass, pivotAngle, stringLen } = cfg;
    const tubeHeight = halfLen * 2;

    // Where this chime attaches on the ring (local to ring body)
    const pivotOnRing = new CANNON.Vec3(
      Math.cos(pivotAngle) * ringRadius,
      0,
      Math.sin(pivotAngle) * ringRadius,
    );

    // Initial world position: below the ring at the pivot point
    const ringPos = ringBody.position;
    const startX = ringPos.x + pivotOnRing.x;
    const startY = ringPos.y + pivotOnRing.y - stringLen - halfLen;
    const startZ = ringPos.z + pivotOnRing.z;

    const chimeShape = new CANNON.Cylinder(radius, radius, tubeHeight, 8);
    const body = new CANNON.Body({
      mass,
      position: new CANNON.Vec3(startX, startY, startZ),
      linearDamping: params.chimeDamping,
      angularDamping: params.chimeAngularDamping,
      material: chimeMaterial,
      collisionFilterGroup: GROUP_CHIME,
      collisionFilterMask: GROUP_CHIME | GROUP_CLAPPER,
    });
    body.addShape(chimeShape);
    world.addBody(body);

    // Ring → Chime constraint
    // On the chime body, the attachment point is at the top + stringLen above
    const pivotOnChime = new CANNON.Vec3(0, halfLen + stringLen, 0);
    world.addConstraint(new CANNON.PointToPointConstraint(
      ringBody, pivotOnRing,
      body, pivotOnChime,
    ));

    // Collision listener
    body.addEventListener('collide', (event) => {
      if (!onCollision) return;
      const contact = event.contact;
      const vel = Math.abs(contact.getImpactVelocityAlongNormal());
      if (vel > 0.01) onCollision(i, vel);
    });

    return {
      body,
      index: i,
      radius,
      halfLen,
      stringLen,
      pivotOnRing,
    };
  });

  // --- Clapper ---
  const clapperShape = new CANNON.Sphere(clapperConfig.radius);
  const clapperStartY = ringBody.position.y - clapperConfig.stringLen;
  const clapperBody = new CANNON.Body({
    mass: clapperConfig.mass,
    position: new CANNON.Vec3(0, clapperStartY, 0),
    linearDamping: params.clapperDamping,
    angularDamping: 0.1,
    material: clapperMaterial,
    collisionFilterGroup: GROUP_CLAPPER,
    collisionFilterMask: GROUP_CHIME,
  });
  clapperBody.addShape(clapperShape);
  world.addBody(clapperBody);

  // Ring → Clapper constraint (hangs from center of ring)
  world.addConstraint(new CANNON.PointToPointConstraint(
    ringBody, new CANNON.Vec3(0, 0, 0),
    clapperBody, new CANNON.Vec3(0, clapperConfig.stringLen, 0),
  ));

  const clapper = {
    body: clapperBody,
    radius: clapperConfig.radius,
    stringLen: clapperConfig.stringLen,
  };

  // Reusable vector for wind forces
  const _windForce = new CANNON.Vec3();

  function step(dt, wind) {
    // Sync live params
    world.gravity.y = params.gravity;
    world.solver.iterations = params.solverIterations;
    chimeChimeCM.friction = params.chimeFriction;
    chimeChimeCM.restitution = params.chimeRestitution;
    chimeClapperCM.friction = params.clapperFriction;
    chimeClapperCM.restitution = params.clapperRestitution;

    // Apply wind forces to all dynamic bodies.
    // Use signed power so negative wind values produce negative forces (Math.pow of a
    // negative base with a fractional exponent returns NaN, which corrupts physics state).
    const wx = (wind.x + params.windBiasX) / (1 + Math.abs(params.windBiasX));
    const wz = (wind.z + params.windBiasZ) / (1 + Math.abs(params.windBiasZ));
    _windForce.set(
      Math.sign(wx) * Math.pow(Math.abs(wx), params.windForceCurveExp) * params.windAmplitudeX * params.windForceScale,
      0,
      Math.sign(wz) * Math.pow(Math.abs(wz), params.windForceCurveExp) * params.windAmplitudeZ * params.windForceScale
    );

    // Wind on ring (scaled down — it's sheltered at the top)
    ringBody.applyForce(_windForce.scale(0.3, new CANNON.Vec3()));

    // Wind on each chime (proportional to surface area ~ halfLen)
    for (const c of chimes) {
      const scale = c.halfLen * 10; // longer chimes catch more wind
      ringBody.applyForce(_windForce); // intentional: ring feels chime drag too
      c.body.applyForce(_windForce.scale(scale, new CANNON.Vec3()));
    }

    // Wind on clapper
    clapperBody.applyForce(_windForce.scale(0.5, new CANNON.Vec3()));

    world.step(FIXED_TIMESTEP, dt, MAX_SUBSTEPS);
  }

  function setOnCollision(fn) {
    onCollision = fn;
  }

  function destroy() {
    while (world.constraints.length) world.removeConstraint(world.constraints[0]);
    while (world.bodies.length) world.removeBody(world.bodies[0]);
  }

  return {
    step,
    setOnCollision,
    destroy,
    chimes,
    clapper,
    ring: { body: ringBody },
    anchor: { position: anchorBody.position },
    world,
  };
}
