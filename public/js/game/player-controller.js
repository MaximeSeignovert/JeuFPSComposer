import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { KNIFE_MOVE_SPEED_MULTIPLIER, MAP_HALF_SIZE } from "../config.js";
import { keyBindings } from "../input/keybinding-ui.js";

const PLAYER_COLLISION_RADIUS = 0.34;
const LADDER_CLIMB_SPEED = 4.8;

export function createPlayerController(ctx) {
  const { camera, state } = ctx;
  const { touchInput } = ctx.dom;

  function jump() {
    if (!state.joined || state.pauseOpen || !state.isAlive || !state.onGround) return;
    state.verticalVelocity = state.jumpSpeed;
    state.onGround = false;
  }

  function findNearbyLadder(position) {
    for (const ladder of ctx.mapConfig.ladders || []) {
      const dx = position.x - ladder.x;
      const dz = position.z - ladder.z;
      const tangentDistance = dx * -ladder.normalZ + dz * ladder.normalX;
      const outwardDistance = dx * ladder.normalX + dz * ladder.normalZ;
      if (Math.abs(tangentDistance) > ladder.width * 0.5 + PLAYER_COLLISION_RADIUS) continue;
      if (outwardDistance < -0.25 || outwardDistance > 0.9) continue;
      return ladder;
    }
    return null;
  }

  function updateMovement(delta) {
    if (!ctx.physics || !state.joined || state.pauseOpen || !state.isAlive) {
      ctx.smoothedMoveVelocity.set(0, 0, 0);
      return;
    }
    const kb = keyBindings;
    const keyboardFwd = Number(state.keys.has(kb.forward)) - Number(state.keys.has(kb.back));
    const keyboardRight = Number(state.keys.has(kb.right)) - Number(state.keys.has(kb.left));
    const touchFwd = -touchInput.move.y;
    const touchRight = touchInput.move.x;
    const fwd = THREE.MathUtils.clamp(keyboardFwd + touchFwd, -1, 1);
    const right = THREE.MathUtils.clamp(keyboardRight + touchRight, -1, 1);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    const isSprinting = state.keys.has(kb.sprint) || touchInput.move.strength > 0.86;
    const weaponSpeedMultiplier = state.weapon === "knife" ? KNIFE_MOVE_SPEED_MULTIPLIER : 1;
    const currentMoveSpeed = state.moveSpeed * (isSprinting ? state.sprintMultiplier : 1) * weaponSpeedMultiplier;
    const targetVelocity = new THREE.Vector3()
      .addScaledVector(dir, fwd)
      .addScaledVector(side, right)
      .clampLength(0, 1)
      .multiplyScalar(currentMoveSpeed);
    const hasInput = fwd !== 0 || right !== 0;
    const smoothing = Math.min(delta * (hasInput ? 14 : 10), 1);
    ctx.smoothedMoveVelocity.lerp(targetVelocity, smoothing);
    if (hasInput) ctx.smoothedMoveVelocity.clampLength(0, currentMoveSpeed);

    const feetPosition = {
      x: camera.position.x,
      y: camera.position.y - state.playerHeight,
      z: camera.position.z
    };
    const ladder = findNearbyLadder(feetPosition);
    if (ladder && fwd !== 0 && feetPosition.y < ladder.height) {
      if (fwd > 0 && feetPosition.y >= ladder.height - 0.5) {
        ctx.physics.setPlayerPosition({
          x: ladder.x - ladder.normalX * 0.18,
          y: ladder.height + 0.03,
          z: ladder.z - ladder.normalZ * 0.18
        });
        const cameraPosition = ctx.physics.getPlayerCameraPosition();
        camera.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
        state.verticalVelocity = 0;
        state.onGround = true;
        ctx.smoothedMoveVelocity.set(0, 0, 0);
        return;
      }

      state.verticalVelocity = fwd * LADDER_CLIMB_SPEED;
      state.onGround = false;
      ctx.smoothedMoveVelocity.set(0, 0, 0);
    } else {
      state.verticalVelocity -= state.gravity * delta;
    }
    const result = ctx.physics.movePlayer({
      horizontalVelocity: ctx.smoothedMoveVelocity,
      verticalVelocity: state.verticalVelocity,
      delta
    });
    camera.position.set(result.cameraPosition.x, result.cameraPosition.y, result.cameraPosition.z);
    if (result.hitCeiling && state.verticalVelocity > 0) state.verticalVelocity = 0;
    if (result.grounded && state.verticalVelocity <= 0) {
      state.verticalVelocity = 0;
      state.onGround = true;
    } else {
      state.onGround = false;
    }
    const horizontalSpeed = ctx.smoothedMoveVelocity.length();
    state.movementBlend = THREE.MathUtils.lerp(
      state.movementBlend,
      horizontalSpeed > 0.3 ? 1 : 0,
      Math.min(delta * 12, 1)
    );
  }

  function findSafeSpawnPosition(spawn) {
    const fallback = {
      x: Number(spawn?.x) || 0,
      y: Number(spawn?.y) || 0,
      z: Number(spawn?.z) || 0
    };
    const maxBound = MAP_HALF_SIZE - PLAYER_COLLISION_RADIUS - 0.2;
    fallback.x = THREE.MathUtils.clamp(fallback.x, -maxBound, maxBound);
    fallback.z = THREE.MathUtils.clamp(fallback.z, -maxBound, maxBound);
    const isSafeAt = (x, z) => !ctx.physics || ctx.physics.isPlayerPositionFree({ x, y: fallback.y, z });
    if (isSafeAt(fallback.x, fallback.z)) return fallback;

    for (let radius = 0.6; radius <= 8; radius += 0.6) {
      for (let i = 0; i < 24; i += 1) {
        const angle = (i / 24) * Math.PI * 2;
        const x = THREE.MathUtils.clamp(fallback.x + Math.cos(angle) * radius, -maxBound, maxBound);
        const z = THREE.MathUtils.clamp(fallback.z + Math.sin(angle) * radius, -maxBound, maxBound);
        if (isSafeAt(x, z)) return { x, y: fallback.y, z };
      }
    }
    return fallback;
  }

  function applySpawn(spawn) {
    const safe = findSafeSpawnPosition(spawn);
    ctx.physics?.setPlayerPosition(safe);
    const cameraPos = ctx.physics?.getPlayerCameraPosition() || {
      x: safe.x,
      y: safe.y + state.playerHeight,
      z: safe.z
    };
    camera.position.set(cameraPos.x, cameraPos.y, cameraPos.z);
    state.verticalVelocity = 0;
    state.onGround = true;
  }

  function sendPlayerUpdate() {
    if (!state.joined || state.pauseOpen || !state.isAlive || !ctx.controllers.socket?.isOpen()) return;
    const now = performance.now();
    if (now - ctx.lastNetworkSend < 50) return;
    ctx.lastNetworkSend = now;
    ctx.controllers.socket?.sendPlayerUpdate({
      position: {
        x: camera.position.x,
        y: camera.position.y - state.playerHeight,
        z: camera.position.z
      },
      rotationY: state.yaw
    });
  }

  function update(delta) {
    updateMovement(delta);
    sendPlayerUpdate();
  }

  return { applySpawn, jump, sendPlayerUpdate, update };
}
