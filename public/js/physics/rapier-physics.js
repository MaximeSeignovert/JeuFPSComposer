import RAPIER from "/vendor/rapier/rapier.mjs";

const PLAYER_RADIUS = 0.34;
const PLAYER_EXTRA_HEADROOM = 0.25;
const PLAYER_CONTROLLER_OFFSET = 0.01;
const FIXED_STEP = 1 / 120;
const MAX_STEPS = 5;
const FLOOR_THICKNESS = 0.2;

function quatFromZRotation(angle) {
  const half = angle * 0.5;
  return { x: 0, y: 0, z: Math.sin(half), w: Math.cos(half) };
}

function quatFromXRotation(angle) {
  const half = angle * 0.5;
  return { x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) };
}

function vectorFrom(input, fallback = { x: 0, y: 0, z: 0 }) {
  return {
    x: Number(input?.x) || fallback.x,
    y: Number(input?.y) || fallback.y,
    z: Number(input?.z) || fallback.z
  };
}

function addFixedCuboid(world, { x, y, z, hx, hy, hz, rotation, friction = 0.82, restitution = 0 }) {
  const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
    .setTranslation(x, y, z)
    .setFriction(friction)
    .setRestitution(restitution);
  if (rotation) desc.setRotation(rotation);
  return world.createCollider(desc);
}

function addWorldColliders(world, mapConfig, mapHalfSize) {
  addFixedCuboid(world, {
    x: 0,
    y: -FLOOR_THICKNESS * 0.5,
    z: 0,
    hx: 100,
    hy: FLOOR_THICKNESS * 0.5,
    hz: 100,
    friction: 0.95
  });

  addFixedCuboid(world, {
    x: mapConfig.platform.x,
    y: mapConfig.platform.topY - mapConfig.platform.thickness * 0.5,
    z: mapConfig.platform.z,
    hx: mapConfig.platform.width * 0.5,
    hy: mapConfig.platform.thickness * 0.5,
    hz: mapConfig.platform.depth * 0.5
  });

  const rampRise = mapConfig.ramp.topY - mapConfig.ramp.baseY;
  const rampAngle = Math.atan2(rampRise, mapConfig.ramp.width);
  const rampLength = Math.hypot(mapConfig.ramp.width, rampRise);
  const rampY = (mapConfig.ramp.topY + mapConfig.ramp.baseY) * 0.5 + mapConfig.ramp.thickness * 0.25;
  const rampOffsetX = mapConfig.platform.width * 0.5 + mapConfig.ramp.width * 0.5;
  addFixedCuboid(world, {
    x: -rampOffsetX,
    y: rampY,
    z: 0,
    hx: rampLength * 0.5,
    hy: mapConfig.ramp.thickness * 0.5,
    hz: mapConfig.ramp.depth * 0.5,
    rotation: quatFromZRotation(rampAngle)
  });
  addFixedCuboid(world, {
    x: rampOffsetX,
    y: rampY,
    z: 0,
    hx: rampLength * 0.5,
    hy: mapConfig.ramp.thickness * 0.5,
    hz: mapConfig.ramp.depth * 0.5,
    rotation: quatFromZRotation(-rampAngle)
  });

  const centralRailHeight = 0.72;
  const centralRailThickness = 0.12;
  const centralRailInset = 0.24;
  for (const side of [-1, 1]) {
    addFixedCuboid(world, {
      x: mapConfig.platform.x,
      y: mapConfig.platform.topY + centralRailHeight,
      z: mapConfig.platform.z + side * (mapConfig.platform.depth * 0.5 - centralRailInset),
      hx: (mapConfig.platform.width - centralRailInset * 2) * 0.5,
      hy: centralRailThickness * 0.5,
      hz: centralRailThickness * 0.5
    });
  }

  mapConfig.coverBlocks.forEach((block) => {
    addFixedCuboid(world, {
      x: block.x,
      y: block.height * 0.5,
      z: block.z,
      hx: block.width * 0.5,
      hy: block.height * 0.5,
      hz: block.depth * 0.5
    });
  });

  mapConfig.stackedCrates.forEach((crateStack) => {
    const side = Number(crateStack.side) || 1;
    addFixedCuboid(world, {
      x: crateStack.x,
      y: 0.6,
      z: crateStack.z,
      hx: 1.6,
      hy: 0.6,
      hz: 1.6
    });
    addFixedCuboid(world, {
      x: crateStack.x + side * 0.55,
      y: 1.55,
      z: crateStack.z - side * 0.35,
      hx: 0.9,
      hy: 1.55,
      hz: 0.9
    });
  });

  mapConfig.tallPillars.forEach((pillar) => {
    addFixedCuboid(world, {
      x: pillar.x,
      y: 2.6,
      z: pillar.z,
      hx: 1.1,
      hy: 2.6,
      hz: 1.1
    });
  });

  mapConfig.wallPlatforms.forEach(({ x, z, width, depth, axis }) => {
    const topY = mapConfig.platform.topY;
    const thickness = 0.65;
    const rampRun = 5.4;
    const rampThickness = 0.34;
    const rampRise = topY;
    const rampAngle = Math.atan2(rampRise, rampRun);
    const rampLength = Math.hypot(rampRun, rampRise);
    const alongX = axis === "x";

    addFixedCuboid(world, {
      x,
      y: topY - thickness * 0.5,
      z,
      hx: (alongX ? width : depth) * 0.5,
      hy: thickness * 0.5,
      hz: (alongX ? depth : width) * 0.5
    });

    const offset = width * 0.5 + rampRun * 0.5;
    const rampY = (topY + rampThickness * 0.5) * 0.5;
    const rampHalfDepth = (alongX ? depth : width) * 0.5;
    if (alongX) {
      addFixedCuboid(world, {
        x: x - offset, y: rampY, z, hx: rampLength * 0.5, hy: rampThickness * 0.5, hz: rampHalfDepth,
        rotation: quatFromZRotation(rampAngle)
      });
      addFixedCuboid(world, {
        x: x + offset, y: rampY, z, hx: rampLength * 0.5, hy: rampThickness * 0.5, hz: rampHalfDepth,
        rotation: quatFromZRotation(-rampAngle)
      });
    } else {
      addFixedCuboid(world, {
        x, y: rampY, z: z - offset, hx: rampHalfDepth, hy: rampThickness * 0.5, hz: rampLength * 0.5,
        rotation: quatFromXRotation(-rampAngle)
      });
      addFixedCuboid(world, {
        x, y: rampY, z: z + offset, hx: rampHalfDepth, hy: rampThickness * 0.5, hz: rampLength * 0.5,
        rotation: quatFromXRotation(rampAngle)
      });
    }
  });

  mapConfig.boundaryWalls.forEach((wall) => {
    addFixedCuboid(world, {
      x: wall.x,
      y: wall.y,
      z: wall.z,
      hx: wall.width * 0.5,
      hy: wall.height * 0.5,
      hz: wall.depth * 0.5
    });
  });

  const outerWallThickness = 0.35;
  const outerWallHeight = 6;
  const outerWallY = outerWallHeight * 0.5;
  const limit = mapHalfSize + outerWallThickness;
  addFixedCuboid(world, { x: -limit, y: outerWallY, z: 0, hx: outerWallThickness, hy: outerWallHeight * 0.5, hz: mapHalfSize + outerWallThickness });
  addFixedCuboid(world, { x: limit, y: outerWallY, z: 0, hx: outerWallThickness, hy: outerWallHeight * 0.5, hz: mapHalfSize + outerWallThickness });
  addFixedCuboid(world, { x: 0, y: outerWallY, z: -limit, hx: mapHalfSize + outerWallThickness, hy: outerWallHeight * 0.5, hz: outerWallThickness });
  addFixedCuboid(world, { x: 0, y: outerWallY, z: limit, hx: mapHalfSize + outerWallThickness, hy: outerWallHeight * 0.5, hz: outerWallThickness });
}

export async function initPhysics({ mapConfig, mapHalfSize, playerHeight, gravity, grenadeConfig }) {
  await RAPIER.init({ module_or_path: undefined });

  const world = new RAPIER.World({ x: 0, y: -Math.abs(Number(gravity) || 26), z: 0 });
  world.maxCcdSubsteps = 4;
  addWorldColliders(world, mapConfig, mapHalfSize);

  const playerTotalHeight = playerHeight + PLAYER_EXTRA_HEADROOM;
  const playerCapsuleHalfHeight = Math.max(0.1, (playerTotalHeight - PLAYER_RADIUS * 2) * 0.5);
  const playerCenterFromFeet = playerCapsuleHalfHeight + PLAYER_RADIUS;
  const cameraFromPlayerCenter = playerHeight - playerCenterFromFeet;
  const playerCollider = world.createCollider(
    RAPIER.ColliderDesc.capsule(playerCapsuleHalfHeight, PLAYER_RADIUS)
      .setTranslation(0, playerCenterFromFeet, 0)
      .setFriction(0)
      .setRestitution(0)
  );
  const playerShape = new RAPIER.Capsule(playerCapsuleHalfHeight, PLAYER_RADIUS);
  const identityRotation = { x: 0, y: 0, z: 0, w: 1 };
  const controller = world.createCharacterController(PLAYER_CONTROLLER_OFFSET);
  controller.enableSnapToGround(0.18);
  controller.enableAutostep(0.42, 0.18, false);
  controller.setMaxSlopeClimbAngle(Math.PI / 3);
  controller.setMinSlopeSlideAngle(Math.PI / 3.1);

  const grenades = new Map();
  let accumulator = 0;

  function getPlayerCenter() {
    return playerCollider.translation();
  }

  function getPlayerFeetPosition() {
    const center = getPlayerCenter();
    return { x: center.x, y: center.y - playerCenterFromFeet, z: center.z };
  }

  function getPlayerCameraPosition() {
    const center = getPlayerCenter();
    return { x: center.x, y: center.y + cameraFromPlayerCenter, z: center.z };
  }

  function setPlayerPosition(position) {
    const feet = vectorFrom(position);
    playerCollider.setTranslation({ x: feet.x, y: feet.y + playerCenterFromFeet, z: feet.z });
  }

  function isPlayerPositionFree(position) {
    const feet = vectorFrom(position);
    const hit = world.intersectionWithShape(
      { x: feet.x, y: feet.y + playerCenterFromFeet, z: feet.z },
      identityRotation,
      playerShape,
      undefined,
      undefined,
      playerCollider,
      undefined,
      (collider) => !collider.parent()
    );
    return !hit;
  }

  function movePlayer({ horizontalVelocity, verticalVelocity, delta }) {
    const dt = Math.min(Math.max(Number(delta) || 0, 0), 0.05);
    const desired = {
      x: (Number(horizontalVelocity?.x) || 0) * dt,
      y: (Number(verticalVelocity) || 0) * dt,
      z: (Number(horizontalVelocity?.z) || 0) * dt
    };
    controller.computeColliderMovement(playerCollider, desired);
    const movement = controller.computedMovement();
    const center = getPlayerCenter();
    playerCollider.setTranslation({
      x: center.x + movement.x,
      y: center.y + movement.y,
      z: center.z + movement.z
    });

    return {
      movement,
      grounded: controller.computedGrounded(),
      hitCeiling: desired.y > 0 && movement.y < desired.y - 0.001,
      cameraPosition: getPlayerCameraPosition(),
      feetPosition: getPlayerFeetPosition()
    };
  }

  function spawnGrenade(grenadeData) {
    if (!grenadeData?.id) return null;
    const existing = grenades.get(grenadeData.id);
    if (existing) return existing;

    const origin = vectorFrom(grenadeData.origin);
    const direction = vectorFrom(grenadeData.direction, { x: 0, y: 0.25, z: -1 });
    const len = Math.hypot(direction.x, direction.y, direction.z) || 1;
    const speed = Number(grenadeData.speed) || grenadeConfig.throwSpeed;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(origin.x, origin.y, origin.z)
        .setLinvel((direction.x / len) * speed, (direction.y / len) * speed, (direction.z / len) * speed)
        .setCcdEnabled(true)
        .setAngularDamping(0.08)
        .setLinearDamping(0.02)
    );
    const collider = world.createCollider(
      RAPIER.ColliderDesc.ball(grenadeConfig.radius)
        .setRestitution(grenadeConfig.bounceDamping)
        .setFriction(1 - grenadeConfig.friction),
      body
    );
    const grenade = { id: grenadeData.id, body, collider };
    grenades.set(grenadeData.id, grenade);
    return grenade;
  }

  function disposeGrenade(id) {
    const grenade = grenades.get(id);
    if (!grenade) return;
    world.removeRigidBody(grenade.body);
    grenades.delete(id);
  }

  function getGrenadeTransform(id) {
    const grenade = grenades.get(id);
    if (!grenade) return null;
    const position = grenade.body.translation();
    const rotation = grenade.body.rotation();
    const linvel = grenade.body.linvel();
    return { position, rotation, linvel };
  }

  function step(delta) {
    accumulator += Math.min(Math.max(Number(delta) || 0, 0), 0.08);
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < MAX_STEPS) {
      world.timestep = FIXED_STEP;
      world.step();
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (steps === MAX_STEPS) accumulator = 0;
  }

  return {
    RAPIER,
    world,
    step,
    movePlayer,
    setPlayerPosition,
    isPlayerPositionFree,
    getPlayerFeetPosition,
    getPlayerCameraPosition,
    spawnGrenade,
    disposeGrenade,
    getGrenadeTransform
  };
}
