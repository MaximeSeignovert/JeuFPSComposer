import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { GRENADE_CONFIG } from "../config.js";

export function createGrenadesController(ctx) {
  const { camera, scene, state } = ctx;

  function createGrenadePickupMesh() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 14, 12),
      new THREE.MeshStandardMaterial({ color: 0x4d7f57, roughness: 0.55, metalness: 0.32 })
    );
    group.add(body);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.1, 10),
      new THREE.MeshStandardMaterial({ color: 0x2f3338, roughness: 0.45, metalness: 0.75 })
    );
    cap.position.y = 0.18;
    group.add(cap);
    const pin = new THREE.Mesh(
      new THREE.TorusGeometry(0.06, 0.012, 8, 18),
      new THREE.MeshStandardMaterial({ color: 0xe8df9f, roughness: 0.3, metalness: 0.82 })
    );
    pin.rotation.x = Math.PI / 2;
    pin.position.set(0.07, 0.18, 0);
    group.add(pin);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 14, 12),
      new THREE.MeshBasicMaterial({ color: 0x9dff9e, transparent: true, opacity: 0.2 })
    );
    group.add(glow);
    group.userData.baseY = 0.42;
    group.userData.spinOffset = Math.random() * Math.PI * 2;
    return group;
  }

  function syncPickups(pickups = []) {
    const nextIds = new Set();
    pickups.forEach((pickup) => {
      if (!pickup?.id || !pickup.position) return;
      nextIds.add(pickup.id);
      ctx.grenadePickups.set(pickup.id, pickup);
      let mesh = ctx.grenadePickupMeshes.get(pickup.id);
      if (!mesh) {
        mesh = createGrenadePickupMesh();
        ctx.grenadePickupMeshes.set(pickup.id, mesh);
        scene.add(mesh);
      }
      mesh.userData.baseY = (Number(pickup.position.y) || 0) + 0.42;
      mesh.position.set(Number(pickup.position.x) || 0, mesh.userData.baseY, Number(pickup.position.z) || 0);
      mesh.visible = pickup.available !== false;
    });

    ctx.grenadePickupMeshes.forEach((mesh, id) => {
      if (nextIds.has(id)) return;
      scene.remove(mesh);
      mesh.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      ctx.grenadePickupMeshes.delete(id);
      ctx.grenadePickups.delete(id);
    });
  }

  function updatePickupVisuals(time) {
    ctx.grenadePickupMeshes.forEach((mesh) => {
      if (!mesh.visible) return;
      const t = time * 2 + mesh.userData.spinOffset;
      mesh.rotation.y += 0.02;
      mesh.position.y = mesh.userData.baseY + Math.sin(t) * 0.12;
    });
  }

  function createThrownGrenadeMesh() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(GRENADE_CONFIG.radius, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x556f49, roughness: 0.52, metalness: 0.28 })
    );
    group.add(body);
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.11, 0.016, 8, 18),
      new THREE.MeshStandardMaterial({ color: 0x25282d, roughness: 0.38, metalness: 0.72 })
    );
    band.rotation.x = Math.PI / 2;
    group.add(band);
    return group;
  }

  function createGrenadeTrail() {
    return new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xffe19c, transparent: true, opacity: 0.72 })
    );
  }

  function spawnThrown(grenadeData) {
    if (!grenadeData?.id || !grenadeData.origin || !grenadeData.direction) return null;
    const existing = ctx.activeGrenades.get(grenadeData.id);
    if (existing) {
      existing.ownerId = grenadeData.ownerId || existing.ownerId;
      existing.fuseMs = Number(grenadeData.fuseMs) || existing.fuseMs;
      return existing;
    }

    const mesh = createThrownGrenadeMesh();
    mesh.position.set(Number(grenadeData.origin.x) || 0, Number(grenadeData.origin.y) || 0, Number(grenadeData.origin.z) || 0);
    scene.add(mesh);
    const trail = createGrenadeTrail();
    trail.geometry.setFromPoints([mesh.position.clone(), mesh.position.clone()]);
    scene.add(trail);

    const direction = new THREE.Vector3(
      Number(grenadeData.direction.x) || 0,
      Number(grenadeData.direction.y) || 0,
      Number(grenadeData.direction.z) || 0
    );
    if (direction.lengthSq() <= 0.0001) direction.set(0, 0.25, -1);
    direction.normalize();

    const grenade = {
      id: grenadeData.id,
      ownerId: grenadeData.ownerId || null,
      mesh,
      trail,
      lastPosition: mesh.position.clone(),
      ageMs: 0,
      fuseMs: Number(grenadeData.fuseMs) || GRENADE_CONFIG.fuseMs
    };
    ctx.physics?.spawnGrenade({
      id: grenade.id,
      origin: mesh.position,
      direction,
      speed: Number(grenadeData.speed) || GRENADE_CONFIG.throwSpeed
    });
    ctx.activeGrenades.set(grenade.id, grenade);
    return grenade;
  }

  function disposeGrenade(grenade) {
    if (!grenade) return;
    ctx.physics?.disposeGrenade(grenade.id);
    scene.remove(grenade.mesh);
    scene.remove(grenade.trail);
    grenade.mesh.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    grenade.trail.geometry.dispose();
    grenade.trail.material.dispose();
  }

  function createExplosionEffect(position, radius) {
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(0.4, radius * 0.22), 18, 14),
      new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.95 })
    );
    flash.position.set(position.x, position.y, position.z);
    scene.add(flash);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(Math.max(0.5, radius * 0.35), 0.08, 10, 28),
      new THREE.MeshBasicMaterial({ color: 0xfff1aa, transparent: true, opacity: 0.88 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(position.x, position.y + 0.06, position.z);
    scene.add(ring);
    ctx.explosionEffects.push({ flash, ring, life: 0.34, maxLife: 0.34, radius });
  }

  function explode(grenadeId, position, radius = GRENADE_CONFIG.blastRadius, shouldNotify = false) {
    if (!grenadeId || !position || ctx.explodedGrenadeIds.has(grenadeId)) return;
    ctx.explodedGrenadeIds.add(grenadeId);
    const grenade = ctx.activeGrenades.get(grenadeId);
    if (grenade) {
      disposeGrenade(grenade);
      ctx.activeGrenades.delete(grenadeId);
    }
    createExplosionEffect(position, radius);
    if (shouldNotify) ctx.controllers.socket?.sendGrenadeExplode({ id: grenadeId, position });
  }

  function updateExplosionEffects(delta) {
    for (let i = ctx.explosionEffects.length - 1; i >= 0; i -= 1) {
      const effect = ctx.explosionEffects[i];
      effect.life -= delta;
      const progress = 1 - effect.life / effect.maxLife;
      const opacity = Math.max(0, effect.life / effect.maxLife);
      effect.flash.scale.setScalar(1 + progress * 2.6);
      effect.flash.material.opacity = opacity * 0.95;
      effect.ring.scale.setScalar(1 + progress * 2.1);
      effect.ring.material.opacity = opacity * 0.85;
      if (effect.life <= 0) {
        scene.remove(effect.flash);
        scene.remove(effect.ring);
        effect.flash.geometry.dispose();
        effect.flash.material.dispose();
        effect.ring.geometry.dispose();
        effect.ring.material.dispose();
        ctx.explosionEffects.splice(i, 1);
      }
    }
  }

  function tryPickupNearby() {
    if (!state.joined || state.pauseOpen || !state.isAlive) return;
    if (state.grenadesHeld >= 1 || !ctx.controllers.socket?.isOpen()) return;
    const now = performance.now();
    if (now - state.lastGrenadePickupAttemptAt < 220) return;

    for (const pickup of ctx.grenadePickups.values()) {
      if (!pickup?.position || pickup.available === false) continue;
      const dx = camera.position.x - (Number(pickup.position.x) || 0);
      const dz = camera.position.z - (Number(pickup.position.z) || 0);
      if (dx * dx + dz * dz > GRENADE_CONFIG.pickupRadius * GRENADE_CONFIG.pickupRadius) continue;
      state.lastGrenadePickupAttemptAt = now;
      ctx.controllers.socket?.sendGrenadePickup(pickup.id);
      break;
    }
  }

  function throwGrenade() {
    if (!state.joined || state.pauseOpen || !state.isAlive) return;
    if (state.grenadesHeld < 1 || !ctx.controllers.socket?.isOpen()) return;

    const throwDirection = new THREE.Vector3();
    camera.getWorldDirection(throwDirection);
    throwDirection.normalize();
    throwDirection.y += 0.18;
    throwDirection.normalize();
    const origin = new THREE.Vector3(
      camera.position.x + throwDirection.x * 0.7,
      camera.position.y - 0.12 + throwDirection.y * 0.35,
      camera.position.z + throwDirection.z * 0.7
    );
    const grenadeId = `${state.playerId || "local"}-${Date.now()}-${state.grenadeSequence}`;
    state.grenadeSequence += 1;
    const payload = {
      id: grenadeId,
      ownerId: state.playerId,
      origin: { x: origin.x, y: origin.y, z: origin.z },
      direction: { x: throwDirection.x, y: throwDirection.y, z: throwDirection.z },
      speed: GRENADE_CONFIG.throwSpeed,
      fuseMs: GRENADE_CONFIG.fuseMs
    };
    spawnThrown(payload);
    state.grenadesHeld = 0;
    ctx.controllers.hud?.updateGrenade();
    ctx.controllers.socket?.sendGrenadeThrow({
      id: grenadeId,
      origin: payload.origin,
      direction: payload.direction
    });
  }

  function update(delta, time) {
    updatePickupVisuals(time);
    tryPickupNearby();
    ctx.physics?.step(delta);
    ctx.activeGrenades.forEach((grenade, grenadeId) => {
      const transform = ctx.physics?.getGrenadeTransform(grenadeId);
      if (transform) {
        const previous = grenade.lastPosition?.clone() || grenade.mesh.position.clone();
        grenade.mesh.position.set(transform.position.x, transform.position.y, transform.position.z);
        grenade.mesh.quaternion.set(transform.rotation.x, transform.rotation.y, transform.rotation.z, transform.rotation.w);
        grenade.trail.geometry.setFromPoints([previous, grenade.mesh.position.clone()]);
        grenade.lastPosition = grenade.mesh.position.clone();
      }
      grenade.ageMs += delta * 1000;
      if (grenade.ageMs >= grenade.fuseMs) {
        const position = { x: grenade.mesh.position.x, y: grenade.mesh.position.y, z: grenade.mesh.position.z };
        explode(grenadeId, position, GRENADE_CONFIG.blastRadius, grenade.ownerId === state.playerId);
      }
    });
    updateExplosionEffects(delta);
  }

  return { explode, spawnThrown, syncPickups, throwGrenade, update };
}
