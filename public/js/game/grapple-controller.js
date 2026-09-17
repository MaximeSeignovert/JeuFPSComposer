import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { GRAPPLE_CONFIG } from "../config.js";

const ROPE_HAND_OFFSET = new THREE.Vector3(0.32, -0.28, -0.5);
const UP = new THREE.Vector3(0, 1, 0);

export function createGrappleController(ctx) {
  const { camera, scene, state } = ctx;
  const { crosshair } = ctx.dom;
  const raycaster = new THREE.Raycaster();
  raycaster.near = 0;

  const ropePositions = new Float32Array(6);
  const ropeAttribute = new THREE.BufferAttribute(ropePositions, 3);
  ropeAttribute.setUsage(THREE.DynamicDrawUsage);
  const ropeGeometry = new THREE.BufferGeometry();
  ropeGeometry.setAttribute("position", ropeAttribute);
  const rope = new THREE.Line(
    ropeGeometry,
    new THREE.LineBasicMaterial({ color: 0x1c1f24, transparent: true, opacity: 0.92 })
  );
  rope.frustumCulled = false;
  rope.visible = false;
  scene.add(rope);

  const hook = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.36, 8),
    new THREE.MeshStandardMaterial({ color: 0x9a8b73, roughness: 0.62, metalness: 0.45 })
  );
  hook.frustumCulled = false;
  hook.visible = false;
  scene.add(hook);

  const anchor = new THREE.Vector3();
  const pullVelocity = new THREE.Vector3();
  const aimDirection = new THREE.Vector3();
  const hookDirection = new THREE.Vector3();
  const handPosition = new THREE.Vector3();
  let active = false;
  let cooldownUntil = 0;
  let cooldownVisualActive = false;

  function isBlockedContext() {
    return !state.joined || state.pauseOpen || !state.isAlive;
  }

  function isOnCooldown() {
    return performance.now() < cooldownUntil;
  }

  function startCooldown() {
    cooldownUntil = performance.now() + Math.max(0, Number(GRAPPLE_CONFIG.cooldownMs) || 0);
  }

  function syncCooldownVisual() {
    const onCooldown = isOnCooldown();
    if (onCooldown === cooldownVisualActive) return;
    cooldownVisualActive = onCooldown;
    crosshair?.classList.toggle("crosshair--grapple-cooldown", onCooldown);
  }

  function refreshAimDirection() {
    return aimDirection.set(0, 0, -1).applyQuaternion(camera.quaternion);
  }

  function updateRopeVisual() {
    handPosition.copy(ROPE_HAND_OFFSET).applyQuaternion(camera.quaternion).add(camera.position);
    ropePositions[0] = handPosition.x;
    ropePositions[1] = handPosition.y;
    ropePositions[2] = handPosition.z;
    ropePositions[3] = anchor.x;
    ropePositions[4] = anchor.y;
    ropePositions[5] = anchor.z;
    ropeAttribute.needsUpdate = true;
  }

  function release(startCooldownTimer) {
    if (!active) return false;
    active = false;
    rope.visible = false;
    hook.visible = false;
    if (startCooldownTimer) startCooldown();
    return true;
  }

  // Relâchement volontaire (touche, blur) : le grappin part en cooldown.
  function end() {
    return release(true);
  }

  function begin() {
    if (isBlockedContext() || isOnCooldown()) return false;
    refreshAimDirection();
    raycaster.set(camera.position, aimDirection);
    raycaster.far = GRAPPLE_CONFIG.range;
    const hit = raycaster.intersectObjects(ctx.worldColliders, false)[0];
    if (!hit) return false;

    anchor.copy(hit.point).addScaledVector(aimDirection, -GRAPPLE_CONFIG.surfaceOffset);
    hookDirection.copy(aimDirection);
    hook.quaternion.setFromUnitVectors(UP, hookDirection);
    hook.position.copy(anchor);
    active = true;
    rope.visible = true;
    hook.visible = true;
    updateRopeVisual();
    return true;
  }

  function getPullVelocity() {
    if (!active) return null;
    if (isBlockedContext()) {
      release(false);
      return null;
    }

    pullVelocity.set(
      anchor.x - camera.position.x,
      anchor.y - camera.position.y,
      anchor.z - camera.position.z
    );
    const distance = pullVelocity.length();
    if (distance <= GRAPPLE_CONFIG.minDistance) {
      release(true);
      return null;
    }
    pullVelocity.multiplyScalar(GRAPPLE_CONFIG.pullSpeed / distance);
    return pullVelocity;
  }

  function update() {
    syncCooldownVisual();
    if (!active) return;
    if (isBlockedContext()) {
      release(false);
      return;
    }
    updateRopeVisual();
  }

  return {
    begin,
    end,
    getPullVelocity,
    isActive: () => active,
    isOnCooldown,
    update
  };
}
