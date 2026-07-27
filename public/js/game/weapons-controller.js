import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import {
  PRIMARY_WEAPONS,
  VIEW_RECOIL_BOB_SUPPRESS_K,
  VIEW_RECOIL_DECAY,
  VIEW_RECOIL_NORM_CAP,
  WEAPON_STATS
} from "../config.js";
import { keyBindings } from "../input/keybinding-ui.js";
import { hasGameLookInput } from "../input/touch-controls.js";

const KNIFE_ATTACK_DURATION = 0.46;
const ADS_VIEW_POSES = {
  ak47: {
    // Place la pointe du guidon, et non l'axe du canon, sur le rayon central de la caméra.
    position: { x: -0.065, y: -0.095, z: -0.35 },
    rotation: { x: 0.085, y: 0 },
    modelRotation: { x: -0.035, y: 0 }
  },
  shotgun: {
    // Superpose l'œilleton arrière et le guidon avant sur le rayon central.
    position: { x: -0.082, y: -0.013, z: -0.35 },
    rotation: { x: 0.024, y: 0 },
    modelRotation: { x: 0, y: 0 }
  }
};

export function createWeaponsController(ctx) {
  const { camera, state, viewModel } = ctx;
  const { touchAimBtn, touchInput } = ctx.dom;
  let aimViewBlend = 0;
  let knifeAttackTime = 0;

  function getWeaponStats(weapon = state.weapon) {
    return WEAPON_STATS[weapon] || WEAPON_STATS.ak47;
  }

  function hasMagazine(weapon = state.weapon) {
    const stats = getWeaponStats(weapon);
    return !stats.melee && !stats.throwable;
  }

  function getMagazineSize(weapon = state.weapon) {
    return Math.max(0, Number(getWeaponStats(weapon).magazineSize) || 0);
  }

  function getReloadDurationMs(weapon = state.weapon) {
    return Math.max(0, Number(getWeaponStats(weapon).reloadMs) || 1200);
  }

  function ensureWeaponAmmo(weapon = state.weapon) {
    if (!hasMagazine(weapon)) return Infinity;
    const maxAmmo = getMagazineSize(weapon);
    if (!Number.isFinite(state.ammoByWeapon[weapon])) state.ammoByWeapon[weapon] = maxAmmo;
    state.ammoByWeapon[weapon] = THREE.MathUtils.clamp(Math.round(state.ammoByWeapon[weapon]), 0, maxAmmo);
    return state.ammoByWeapon[weapon];
  }

  function refillAllMagazines() {
    Object.keys(WEAPON_STATS).forEach((weapon) => {
      if (hasMagazine(weapon)) state.ammoByWeapon[weapon] = getMagazineSize(weapon);
    });
    state.reloadWeapon = null;
    state.reloadUntil = 0;
    ctx.controllers.hud?.updateAmmo();
  }

  function cancelReload() {
    state.reloadWeapon = null;
    state.reloadUntil = 0;
    ctx.controllers.hud?.updateAmmo();
  }

  function clearShotCooldown() {
    state.shotCooldownWeapon = null;
    state.shotCooldownUntil = 0;
    state.shotCooldownDuration = 0;
  }

  function isReloadingWeapon(weapon = state.weapon) {
    return state.reloadWeapon === weapon && performance.now() < state.reloadUntil;
  }

  function getReloadProgress(weapon = state.weapon) {
    if (!isReloadingWeapon(weapon)) return 0;
    const reloadMs = getReloadDurationMs(weapon);
    if (reloadMs <= 0) return 1;
    return THREE.MathUtils.clamp(1 - (state.reloadUntil - performance.now()) / reloadMs, 0, 1);
  }

  function startReload(manual = false) {
    const weapon = state.weapon;
    if (!hasMagazine(weapon) || isReloadingWeapon(weapon)) return false;
    const ammo = ensureWeaponAmmo(weapon);
    if (ammo >= getMagazineSize(weapon)) return false;

    state.reloadWeapon = weapon;
    state.reloadUntil = performance.now() + getReloadDurationMs(weapon);
    state.isFiring = false;
    if (manual) state.primaryFireHeld = false;
    viewModel.userData.playAnimation?.(weapon, "reload");
    ctx.controllers.sound?.playReload(weapon);
    ctx.controllers.hud?.updateAmmo();
    return true;
  }

  function reloadWeapon() {
    return startReload(true);
  }

  function updateReloadState() {
    if (!state.reloadWeapon) return;
    if (performance.now() < state.reloadUntil) {
      ctx.controllers.hud?.updateAmmo();
      return;
    }
    const weapon = state.reloadWeapon;
    state.ammoByWeapon[weapon] = getMagazineSize(weapon);
    state.reloadWeapon = null;
    state.reloadUntil = 0;
    ctx.controllers.hud?.updateAmmo();
  }

  function setActiveWeaponModel(weapon) {
    const weaponModels = viewModel?.userData?.weaponModels;
    const muzzles = viewModel?.userData?.muzzles;
    if (!weaponModels || !muzzles) return;
    const key = WEAPON_STATS[weapon] ? weapon : "ak47";
    Object.keys(weaponModels).forEach((name) => {
      weaponModels[name].visible = name === key;
    });
    viewModel.userData.activeMuzzle = muzzles[key] || muzzles.ak47;
    viewModel.userData.activeWeapon = key;
  }

  function normalizeWeaponSlotIndex(index) {
    const slotCount = state.weaponSlots.length;
    if (slotCount === 0) return -1;
    return ((Math.trunc(index) % slotCount) + slotCount) % slotCount;
  }

  function equipWeaponSlot(index) {
    const slotIndex = normalizeWeaponSlotIndex(index);
    if (slotIndex < 0) return false;
    const weapon = state.weaponSlots[slotIndex];
    if (!WEAPON_STATS[weapon]) return false;

    const weaponChanged = state.weapon !== weapon;
    const slotChanged = state.activeWeaponSlot !== slotIndex;
    if (!weaponChanged && !slotChanged) return false;

    cancelPrimaryFire();
    state.isAiming = false;
    knifeAttackTime = 0;
    state.weapon = weapon;
    state.activeWeaponSlot = slotIndex;
    cancelReload();
    ensureWeaponAmmo(weapon);
    ctx.controllers.hud?.updateAmmo();
    touchAimBtn?.classList.remove("is-active");
    setActiveWeaponModel(weapon);
    ctx.controllers.hud?.syncWeaponChoice();
    if (weaponChanged && weapon !== "grenade") ctx.controllers.socket?.sendWeaponSelect(weapon);
    return true;
  }

  function selectPrimaryWeapon(weapon) {
    if (!PRIMARY_WEAPONS.includes(weapon)) return false;
    state.weaponSlots[0] = weapon;
    if (state.activeWeaponSlot === 0 && state.weapon === weapon) {
      ctx.controllers.hud?.syncWeaponChoice();
      return false;
    }
    return equipWeaponSlot(0);
  }

  function cycleWeaponSlot(direction = 1) {
    if (!state.joined || state.pauseOpen || !state.isAlive || state.weaponSlots.length < 2) return false;
    const step = Number(direction) < 0 ? -1 : 1;
    return equipWeaponSlot(state.activeWeaponSlot + step);
  }

  function equipPrimaryWeapon() {
    return equipWeaponSlot(0);
  }

  function equipGrenade() {
    const grenadeSlot = state.weaponSlots.indexOf("grenade");
    if (grenadeSlot < 0 || state.grenadesHeld < 1) return false;
    return equipWeaponSlot(grenadeSlot);
  }

  function setGrenadeSlotAvailable(available) {
    const grenadeSlot = state.weaponSlots.indexOf("grenade");
    if (available) {
      if (grenadeSlot < 0) state.weaponSlots.push("grenade");
      ctx.controllers.hud?.syncWeaponChoice();
      ctx.controllers.hud?.updateGrenade();
      return;
    }
    if (grenadeSlot < 0) return;

    const wasActive = state.activeWeaponSlot === grenadeSlot || state.weapon === "grenade";
    state.weaponSlots.splice(grenadeSlot, 1);
    if (wasActive) {
      state.activeWeaponSlot = Math.min(grenadeSlot, state.weaponSlots.length - 1);
      equipWeaponSlot(0);
    } else if (state.activeWeaponSlot > grenadeSlot) {
      state.activeWeaponSlot -= 1;
    }
    ctx.controllers.hud?.syncWeaponChoice();
    ctx.controllers.hud?.updateGrenade();
  }

  function initializeWeaponSlots(primaryWeapon = "ak47") {
    const primary = PRIMARY_WEAPONS.includes(primaryWeapon) ? primaryWeapon : "ak47";
    state.weaponSlots = [primary, "knife"];
    state.activeWeaponSlot = 0;
    state.weapon = primary;
    setActiveWeaponModel(primary);
    ctx.controllers.hud?.syncWeaponChoice();
  }

  function beginPrimaryFire() {
    if (!state.joined || state.pauseOpen || !state.isAlive || !hasGameLookInput()) return false;
    const stats = getWeaponStats();
    if (stats.throwable) {
      if (!ctx.controllers.grenades?.beginThrowCharge()) return false;
      state.primaryFireHeld = true;
      state.isFiring = true;
      return true;
    }
    state.primaryFireHeld = true;
    state.isFiring = true;
    shoot();
    if (!stats.auto) state.isFiring = false;
    return true;
  }

  function endPrimaryFire() {
    const shouldReleaseGrenade =
      state.weapon === "grenade" && state.primaryFireHeld && ctx.controllers.grenades?.isThrowCharging();
    state.primaryFireHeld = false;
    state.isFiring = false;
    if (shouldReleaseGrenade) ctx.controllers.grenades?.releaseThrowCharge();
  }

  function cancelPrimaryFire() {
    state.primaryFireHeld = false;
    state.isFiring = false;
    ctx.controllers.grenades?.cancelThrowCharge();
  }

  function endPrimaryFireFromMouseEvent(event) {
    if (event.buttons !== undefined && (event.buttons & 1) !== 0) return;
    endPrimaryFire();
  }

  function impulseViewRecoilFromWeapon(stats) {
    const r = stats.viewRecoil;
    if (!r) return;
    const scoped = state.weapon === "sniper" && state.isAiming && state.joined && state.isAlive && !state.pauseOpen;
    const mul = scoped ? 0.68 : 1;
    state.viewRecoilZ = Math.min(state.viewRecoilZ + r.z * mul, 0.32);
    state.viewRecoilY = Math.max(state.viewRecoilY + (r.y || 0) * mul, -0.09);
    state.viewRecoilRotX = Math.min(state.viewRecoilRotX + r.rotX * mul, 0.2);
    state.viewRecoilRotZ = THREE.MathUtils.clamp(
      state.viewRecoilRotZ + (Math.random() - 0.5) * r.rotZ * mul,
      -0.12,
      0.12
    );
  }

  function shoot() {
    if (!state.isAlive) return;
    const stats = getWeaponStats();
    const now = performance.now();
    updateReloadState();
    if (!stats.melee) {
      if (isReloadingWeapon()) return;
      const ammo = ensureWeaponAmmo();
      if (ammo <= 0) {
        startReload(false);
        return;
      }
    }
    const msBetweenShots = 1000 / stats.fireRate;
    if (now - state.lastShotAt < msBetweenShots) return;
    state.lastShotAt = now;
    viewModel.userData.playAnimation?.(state.weapon, "shoot");
    if (state.weapon === "shotgun" || state.weapon === "sniper") {
      state.shotCooldownWeapon = state.weapon;
      state.shotCooldownUntil = now + msBetweenShots;
      state.shotCooldownDuration = msBetweenShots;
    } else {
      clearShotCooldown();
    }

    const muzzle = viewModel.userData.activeMuzzle || viewModel.userData.muzzle;
    const spawnPos = new THREE.Vector3();
    muzzle.getWorldPosition(spawnPos);
    const muzzleOrigin = { x: spawnPos.x, y: spawnPos.y, z: spawnPos.z };
    const aimOrigin = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    const baseDirection = new THREE.Vector3();
    camera.getWorldDirection(baseDirection).normalize();

    if (stats.melee) {
      const direction = { x: baseDirection.x, y: baseDirection.y, z: baseDirection.z };
      knifeAttackTime = KNIFE_ATTACK_DURATION;
      ctx.controllers.sound?.playShot(state.weapon);
      ctx.controllers.effects.traceMeleeSweep(aimOrigin, direction, stats.range, true, stats.damage, {
        halfAngle: stats.swingHalfAngle,
        targetRadius: stats.swingTargetRadius
      });
      ctx.controllers.socket?.sendShoot({
        origin: muzzleOrigin,
        weapon: state.weapon,
        shots: [{ direction, damage: stats.damage, range: stats.range, bulletSpeed: 0, melee: true }]
      });
      return;
    }

    state.ammoByWeapon[state.weapon] = Math.max(0, ensureWeaponAmmo() - 1);
    ctx.controllers.hud?.updateAmmo();
    impulseViewRecoilFromWeapon(stats);
    ctx.controllers.sound?.playShot(state.weapon);

    const right = new THREE.Vector3().crossVectors(camera.up, baseDirection).normalize();
    const up = new THREE.Vector3().crossVectors(baseDirection, right).normalize();
    const shots = [];

    for (let i = 0; i < stats.pellets; i += 1) {
      const sX = stats.spreadX !== undefined ? stats.spreadX : stats.spread;
      const sY = stats.spreadY !== undefined ? stats.spreadY : stats.spread;
      const shotDirection = baseDirection
        .clone()
        .addScaledVector(right, (Math.random() - 0.5) * sX)
        .addScaledVector(up, (Math.random() - 0.5) * sY)
        .normalize();
      const direction = { x: shotDirection.x, y: shotDirection.y, z: shotDirection.z };
      shots.push({ direction, damage: stats.damage, range: stats.range, bulletSpeed: stats.bulletSpeed });
      const impact = ctx.controllers.effects.traceImpact(aimOrigin, direction, stats.range, true, stats.damage);
      ctx.controllers.effects.spawnBulletVisual(muzzleOrigin, direction, true, stats.bulletSpeed, impact?.distance || stats.range);
    }
    ctx.controllers.effects.spawnMuzzleFlash(muzzleOrigin);
    ctx.controllers.socket?.sendShoot({ origin: muzzleOrigin, weapon: state.weapon, shots });
    if (ensureWeaponAmmo() <= 0) startReload(false);
  }

  function animateViewModel(delta) {
    knifeAttackTime = Math.max(0, knifeAttackTime - delta);
    const decay = Math.exp(-VIEW_RECOIL_DECAY * delta);
    state.viewRecoilZ *= decay;
    state.viewRecoilY *= decay;
    state.viewRecoilRotX *= decay;
    state.viewRecoilRotZ *= decay;

    const wantsAimView =
      state.joined &&
      state.isAlive &&
      !state.pauseOpen &&
      !isReloadingWeapon() &&
      state.isAiming &&
      (state.weapon === "ak47" || state.weapon === "shotgun") &&
      hasGameLookInput();
    aimViewBlend = THREE.MathUtils.lerp(aimViewBlend, wantsAimView ? 1 : 0, 1 - Math.exp(-14 * delta));

    const t = performance.now() * 0.001;
    const intensity = state.movementBlend;
    const recoilNorm = Math.min(
      1,
      (Math.abs(state.viewRecoilZ) + Math.abs(state.viewRecoilRotX) + Math.abs(state.viewRecoilY)) /
        VIEW_RECOIL_NORM_CAP
    );
    const bobIntensity = intensity * (1 - VIEW_RECOIL_BOB_SUPPRESS_K * recoilNorm);
    const sprinting =
      state.joined &&
      state.isAlive &&
      !state.pauseOpen &&
      (state.keys.has(keyBindings.sprint) || touchInput.move.strength > 0.86);
    const sprintFactor = sprinting ? 1.7 : 1;
    const bobMul = 1 - 0.55 * aimViewBlend;
    const bobX = 0.008 * sprintFactor * bobMul;
    const bobY = 0.008 * sprintFactor * bobMul;
    const bobRotZ = 0.014 * sprintFactor * bobMul;
    const bobRotX = 0.01 * sprintFactor * bobMul;
    const bobRotY = 0.008 * sprintFactor * bobMul;
    const s95 = Math.sin(t * 9.5 * sprintFactor);
    const c75 = Math.cos(t * 7.5 * sprintFactor);
    const s15 = Math.sin(t * 15 * sprintFactor);
    const s85 = Math.sin(t * 8.5 * sprintFactor);
    const c8 = Math.cos(t * 8 * sprintFactor);
    const s67 = Math.sin(t * 6.7 * sprintFactor);

    const activeArmMesh = viewModel.userData.armMeshes?.[state.weapon];
    if (activeArmMesh) {
      activeArmMesh.visible = aimViewBlend < 0.8;
    }
    const activeWeaponModel = viewModel.userData.weaponModels?.[state.weapon];
    const activeAimPivot = activeWeaponModel?.userData.aimPivot;
    const activeModelRotation = ADS_VIEW_POSES[state.weapon]?.modelRotation;
    if (activeAimPivot) {
      activeAimPivot.rotation.x = (activeModelRotation?.x || 0) * aimViewBlend;
      activeAimPivot.rotation.y = (activeModelRotation?.y || 0) * aimViewBlend;
    }

    if (state.weapon === "grenade") {
      const charge = ctx.controllers.grenades?.getThrowChargeProgress() || 0;
      const airY = state.onGround ? 0 : -0.03;
      viewModel.position.set(
        0.34 + s95 * bobX * bobIntensity + charge * 0.08,
        -0.24 + c75 * bobY * bobIntensity + airY + charge * 0.07,
        -0.48 + s15 * 0.004 * bobIntensity + charge * 0.04
      );
      viewModel.rotation.set(
        -0.08 + c8 * bobRotX * bobIntensity - charge * 0.18,
        -0.12 + s67 * bobRotY * bobIntensity,
        -0.24 + s85 * bobRotZ * bobIntensity - charge * 0.16
      );
      return;
    }

    if (state.weapon === "knife") {
      const airY = state.onGround ? 0 : -0.03;
      const rest = {
        x: 0.27 + s95 * bobX * bobIntensity,
        y: -0.2 + c75 * bobY * bobIntensity + airY,
        z: -0.49 + s15 * 0.004 * bobIntensity,
        rx: -0.06 + c8 * bobRotX * bobIntensity,
        ry: -0.14 + s67 * bobRotY * bobIntensity,
        rz: -0.14 + s85 * bobRotZ * bobIntensity
      };
      viewModel.position.set(rest.x, rest.y, rest.z);
      viewModel.rotation.set(rest.rx, rest.ry, rest.rz);
      const knifeModel = viewModel.userData.weaponModels?.knife;
      const attackProgress = knifeAttackTime > 0
        ? THREE.MathUtils.clamp(1 - knifeAttackTime / KNIFE_ATTACK_DURATION, 0, 1)
        : 1;
      knifeModel?.userData.animateKnifeAttack?.(attackProgress);
      return;
    }

    const isShotgun = state.weapon === "shotgun";
    const isSniper = state.weapon === "sniper";
    const reloadProgress = getReloadProgress();
    const aimPose = ADS_VIEW_POSES[state.weapon] || ADS_VIEW_POSES.shotgun;
    const restY = isSniper ? -0.22 : -0.31;
    const airY = state.onGround ? 0 : -0.03;

    viewModel.position.x = THREE.MathUtils.lerp(
      0.3 + s95 * bobX * bobIntensity,
      aimPose.position.x,
      aimViewBlend
    );
    viewModel.position.y = THREE.MathUtils.lerp(
      restY + c75 * bobY * bobIntensity + airY + state.viewRecoilY,
      aimPose.position.y + state.viewRecoilY,
      aimViewBlend
    );
    viewModel.position.z = THREE.MathUtils.lerp(
      -0.52 + s15 * 0.004 * bobIntensity + state.viewRecoilZ,
      aimPose.position.z + state.viewRecoilZ,
      aimViewBlend
    );
    viewModel.rotation.z = THREE.MathUtils.lerp(
      s85 * bobRotZ * bobIntensity + state.viewRecoilRotZ,
      state.viewRecoilRotZ,
      aimViewBlend
    );
    viewModel.rotation.x = THREE.MathUtils.lerp(
      -0.02 + c8 * bobRotX * bobIntensity + state.viewRecoilRotX,
      aimPose.rotation.x + state.viewRecoilRotX,
      aimViewBlend
    );
    viewModel.rotation.y = THREE.MathUtils.lerp(
      -0.22 + s67 * bobRotY * bobIntensity,
      aimPose.rotation.y,
      aimViewBlend
    );

    if (reloadProgress > 0) {
      const lift = Math.sin(reloadProgress * Math.PI);
      const enter = THREE.MathUtils.smoothstep(reloadProgress, 0, 0.28);
      const exit = 1 - THREE.MathUtils.smoothstep(reloadProgress, 0.72, 1);
      const hold = Math.min(enter, exit);
      const click = Math.sin(THREE.MathUtils.clamp((reloadProgress - 0.48) / 0.18, 0, 1) * Math.PI);
      const side = isShotgun ? -1 : 1;
      viewModel.position.x += side * (0.08 * hold + 0.018 * click);
      viewModel.position.y += 0.24 * lift + 0.04 * hold;
      viewModel.position.z += 0.12 * hold;
      viewModel.rotation.x -= 0.48 * lift;
      viewModel.rotation.y += side * 0.3 * hold;
      viewModel.rotation.z += side * (0.34 * lift + 0.08 * click);
    }
  }

  function update(delta) {
    viewModel.userData.updateAnimations?.(delta);
    updateReloadState();
    if (state.primaryFireHeld && getWeaponStats().auto && !state.pauseOpen && state.isAlive) {
      state.isFiring = true;
      shoot();
    }
    animateViewModel(delta);
  }

  return {
    beginPrimaryFire,
    cancelReload,
    cancelPrimaryFire,
    clearShotCooldown,
    cycleWeaponSlot,
    endPrimaryFire,
    endPrimaryFireFromMouseEvent,
    equipGrenade,
    equipPrimaryWeapon,
    equipWeaponSlot,
    ensureWeaponAmmo,
    getMagazineSize,
    getReloadProgress,
    getWeaponStats,
    isReloadingWeapon,
    initializeWeaponSlots,
    refillAllMagazines,
    reloadWeapon,
    selectPrimaryWeapon,
    setGrenadeSlotAvailable,
    setActiveWeaponModel,
    shoot,
    update
  };
}
