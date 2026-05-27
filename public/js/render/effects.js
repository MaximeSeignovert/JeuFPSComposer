import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

export function createEffectsController(ctx) {
  const { camera, scene, state } = ctx;
  const { damageOverlay, hitmarker } = ctx.dom;

  function triggerHitmarker() {
    if (!hitmarker) return;
    hitmarker.classList.remove("hidden");
    hitmarker.classList.add("show");
    if (ctx.hitmarkerTimer) clearTimeout(ctx.hitmarkerTimer);
    ctx.hitmarkerTimer = setTimeout(() => {
      hitmarker.classList.remove("show");
      hitmarker.classList.add("hidden");
    }, 110);
  }

  function triggerDamageOverlay(damageAmount = 0) {
    if (!damageOverlay) return;
    const intensity = THREE.MathUtils.clamp((Number(damageAmount) || 0) / 45, 0.2, 0.65);
    damageOverlay.style.opacity = String(intensity);
    damageOverlay.classList.remove("hidden");
    damageOverlay.classList.add("show");
    if (ctx.damageOverlayTimer) clearTimeout(ctx.damageOverlayTimer);
    ctx.damageOverlayTimer = setTimeout(() => {
      damageOverlay.classList.remove("show");
      damageOverlay.style.opacity = "";
      damageOverlay.classList.add("hidden");
    }, 220);
  }

  function spawnBulletVisual(origin, direction, localShot, bulletSpeed, maxTravelDistance = 120) {
    const bulletMesh = new THREE.Mesh(
      new THREE.SphereGeometry(localShot ? 0.035 : 0.03, 8, 8),
      new THREE.MeshBasicMaterial({ color: localShot ? 0xffde59 : 0xff9aaf })
    );
    bulletMesh.position.set(origin.x, origin.y, origin.z);
    scene.add(bulletMesh);

    const trail = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([bulletMesh.position.clone(), bulletMesh.position.clone()]),
      new THREE.LineBasicMaterial({
        color: localShot ? 0xffefad : 0xffcad6,
        transparent: true,
        opacity: 0.82
      })
    );
    scene.add(trail);

    ctx.bullets.push({
      mesh: bulletMesh,
      trail,
      velocity: new THREE.Vector3(direction.x, direction.y, direction.z).multiplyScalar(bulletSpeed),
      life: Math.max(0.1, Math.min(2.2, 95 / Math.max(1, bulletSpeed))),
      distanceTravelled: 0,
      maxDistance: Math.max(0.2, Number(maxTravelDistance) || 120)
    });
  }

  function spawnMuzzleFlash(position) {
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffc768, transparent: true, opacity: 0.96 })
    );
    flash.position.set(position.x, position.y, position.z);
    scene.add(flash);
    ctx.flashes.push({ mesh: flash, life: 0.06 });
  }

  function spawnKnifeSlash(origin, direction, localShot = false) {
    if (!origin) return;
    const slashDir = new THREE.Vector3(
      Number(direction?.x) || 0,
      Number(direction?.y) || 0,
      Number(direction?.z) || -1
    );
    if (slashDir.lengthSq() <= 0.0001) slashDir.set(0, 0, -1);
    slashDir.normalize();

    const slashRadius = localShot ? 0.32 : 0.28;
    const slash = new THREE.Group();
    const arcMaterial = new THREE.MeshBasicMaterial({
      color: localShot ? 0xf8fbff : 0xffd6d6,
      transparent: true,
      opacity: localShot ? 0.66 : 0.48,
      side: THREE.DoubleSide
    });
    const mainArc = new THREE.Mesh(
      new THREE.RingGeometry(slashRadius, slashRadius + 0.045, 32, 1, -0.1, 1.75),
      arcMaterial
    );
    const innerArc = new THREE.Mesh(
      new THREE.RingGeometry(slashRadius * 0.74, slashRadius * 0.76, 24, 1, 0.1, 1.35),
      arcMaterial.clone()
    );
    innerArc.material.opacity *= 0.55;
    slash.add(mainArc);
    slash.add(innerArc);
    slash.position.set(origin.x, origin.y, origin.z);
    slash.position.addScaledVector(slashDir, localShot ? 0.08 : 0.04);
    slash.lookAt(slash.position.x + slashDir.x, slash.position.y + slashDir.y, slash.position.z + slashDir.z);
    slash.rotateZ(localShot ? -2.3 : -2.1);
    scene.add(slash);
    ctx.flashes.push({ mesh: slash, life: 0.16, maxLife: 0.16 });
  }

  function traceImpact(origin, direction, maxDistance = 120, reportHit = false, damage = 0) {
    const rayOrigin = new THREE.Vector3(origin.x, origin.y, origin.z);
    const rayDir = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
    ctx.raycaster.set(rayOrigin, rayDir);
    ctx.raycaster.far = maxDistance;

    const targets = [...ctx.worldColliders];
    ctx.remoteMeshes.forEach((remotePlayer) => {
      const hitbox = remotePlayer.root?.userData?.hitbox;
      if (hitbox) targets.push(hitbox);
    });
    const hit = ctx.raycaster.intersectObjects(targets, false)[0];
    if (!hit) return null;

    const impactPos = hit.point.clone();
    if (hit.face?.normal) impactPos.add(hit.face.normal.clone().normalize().multiplyScalar(0.03));

    const impact = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 })
    );
    impact.position.copy(impactPos);
    scene.add(impact);
    ctx.impacts.push({ mesh: impact, life: 0.16 });

    if (!reportHit || !ctx.controllers.socket?.isOpen()) return hit;
    const hitPlayerId = hit.object?.userData?.playerId;
    if (!hitPlayerId || hitPlayerId === state.playerId) return hit;
    triggerHitmarker();
    ctx.controllers.socket?.sendHit({
      targetId: hitPlayerId,
      damage: Math.max(1, Number(damage) || 1)
    });
    return hit;
  }

  function updateDeathCamera(delta) {
    if (state.isAlive || !state.deathKillerId) return;
    const killer = ctx.remoteMeshes.get(state.deathKillerId);
    if (!killer?.root?.visible) return;

    const focusPos = killer.root.position.clone().add(new THREE.Vector3(0, 1.35, 0));
    const killerForward = new THREE.Vector3(
      -Math.sin(killer.root.rotation.y || 0),
      0,
      -Math.cos(killer.root.rotation.y || 0)
    );
    const desiredCam = focusPos.clone().addScaledVector(killerForward, -3.3);
    desiredCam.y += 1.1;
    camera.position.lerp(desiredCam, THREE.MathUtils.clamp(delta * 4.2, 0, 1));
    camera.lookAt(focusPos);
  }

  function updateBullets(delta) {
    for (let i = ctx.bullets.length - 1; i >= 0; i -= 1) {
      const bullet = ctx.bullets[i];
      bullet.life -= delta;
      const prev = bullet.mesh.position.clone();
      bullet.mesh.position.addScaledVector(bullet.velocity, delta);
      bullet.trail.geometry.setFromPoints([prev, bullet.mesh.position.clone()]);
      bullet.distanceTravelled += prev.distanceTo(bullet.mesh.position);

      const p = bullet.mesh.position;
      const outBounds = Math.abs(p.x) > 120 || Math.abs(p.z) > 120 || p.y < 0 || p.y > 50;
      const reachedMaxDistance = bullet.distanceTravelled >= bullet.maxDistance;
      if (bullet.life <= 0 || outBounds || reachedMaxDistance) {
        scene.remove(bullet.mesh);
        scene.remove(bullet.trail);
        bullet.mesh.geometry.dispose();
        bullet.mesh.material.dispose();
        bullet.trail.geometry.dispose();
        bullet.trail.material.dispose();
        ctx.bullets.splice(i, 1);
      }
    }
  }

  function updateFlashes(delta) {
    for (let i = ctx.flashes.length - 1; i >= 0; i -= 1) {
      const flash = ctx.flashes[i];
      flash.life -= delta;
      const maxLife = flash.maxLife || 0.06;
      const opacity = Math.max(0, flash.life / maxLife);
      flash.mesh.traverse((child) => {
        if (child.material) child.material.opacity = opacity;
      });
      if (flash.life <= 0) {
        scene.remove(flash.mesh);
        flash.mesh.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
        ctx.flashes.splice(i, 1);
      }
    }
  }

  function updateImpacts(delta) {
    for (let i = ctx.impacts.length - 1; i >= 0; i -= 1) {
      const impact = ctx.impacts[i];
      impact.life -= delta;
      impact.mesh.scale.multiplyScalar(0.95);
      impact.mesh.material.opacity = Math.max(0, impact.life / 0.16);
      if (impact.life <= 0) {
        scene.remove(impact.mesh);
        impact.mesh.geometry.dispose();
        impact.mesh.material.dispose();
        ctx.impacts.splice(i, 1);
      }
    }
  }

  function update(delta) {
    updateBullets(delta);
    updateFlashes(delta);
    updateImpacts(delta);
    updateDeathCamera(delta);
  }

  return {
    spawnBulletVisual,
    spawnKnifeSlash,
    spawnMuzzleFlash,
    traceImpact,
    triggerDamageOverlay,
    triggerHitmarker,
    update
  };
}
