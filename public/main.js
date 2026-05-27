import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import {
  BASE_FOV,
  GRENADE_CONFIG,
  KNIFE_MOVE_SPEED_MULTIPLIER,
  MAP_HALF_SIZE,
  REMOTE_INTERP_SPEED,
  VIEW_RECOIL_BOB_SUPPRESS_K,
  VIEW_RECOIL_DECAY,
  VIEW_RECOIL_NORM_CAP,
  WEAPON_STATS
} from "./js/config.js";
import {
  canvas,
  crosshair,
  damageOverlay,
  deathCountdown,
  deathKillerName,
  deathKillerWeapon,
  deathKillerWeaponIcon,
  deathScreen,
  hitmarker,
  hud,
  hudGrenade,
  hudHealth,
  hudHealthFill,
  killFeed,
  menu,
  mobileControlsQuery,
  nameInput,
  pauseMenuOverlay,
  playerList,
  respawnNotice,
  roomsList,
  sniperScope,
  touchAimBtn,
  touchGrenadeBtn,
  touchInput,
  weaponChoice
} from "./js/dom.js";
import { formatKeyLabel } from "./js/key-bindings.js";
import { bindKeyboardMouseControls } from "./js/input/keyboard-mouse.js";
import { cancelKeyRebind, keyBindings, initializeKeyBindingUi, updateHudKeyHints } from "./js/input/keybinding-ui.js";
import { syncFullscreenButton } from "./js/input/fullscreen.js";
import {
  bindTouchControls,
  hasGameLookInput,
  resetTouchInput,
  shouldUsePointerLock,
  syncTouchControls
} from "./js/input/touch-controls.js";
import { loadPlayerName, sanitizePlayerName, savePlayerName } from "./js/player-name.js";
import {
  applyRemoteTeamStyle,
  colorFromPlayerId,
  createPlayerMesh,
  setRemoteAliveVisual,
  updateNameTagSprite
} from "./js/players/appearance.js";
import { state } from "./js/state.js";
import { createViewModel } from "./js/weapons.js";
import { MAP_LAYOUT } from "./js/world/map-layout.js";
import { createSceneSetup } from "./js/world/scene.js";

/** 0–1 : transition visée épaule (AK / pompe) vers alignement sous le réticule */
let aimViewBlend = 0;
const KNIFE_ATTACK_DURATION = 0.34;
let knifeAttackTime = 0;
let renderedDeathWeapon = null;
const DEATH_WEAPON_LABELS = {
  grenade: "Grenade"
};

nameInput.value = loadPlayerName();
nameInput.addEventListener("input", () => {
  savePlayerName(nameInput.value);
});

function jump() {
  if (!state.joined || state.pauseOpen || !state.isAlive || !state.onGround) return;
  state.verticalVelocity = state.jumpSpeed;
  state.onGround = false;
}

const { camera, renderer, scene } = createSceneSetup(canvas);

function resizeRendererToViewport() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

const viewModel = createViewModel();
camera.add(viewModel);
setActiveWeaponModel(state.weapon);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: 0x7fbf65, roughness: 0.95 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const worldColliders = [floor];
const staticBlockColliders = [];
const playerCollisionRadius = 0.34;
const blockStandTolerance = 0.08;
const collisionEpsilon = 0.001;
const mapAnimators = [];
const jumpPads = [];
const grenadePickups = new Map();
const grenadePickupMeshes = new Map();

function addStaticWorldMesh(mesh, includePhysics = true) {
  scene.add(mesh);
  worldColliders.push(mesh);
  if (includePhysics) {
    staticBlockColliders.push(new THREE.Box3().setFromObject(mesh));
  }
}

const mapConfig = MAP_LAYOUT;

const platform = new THREE.Mesh(
  new THREE.BoxGeometry(
    mapConfig.platform.width,
    mapConfig.platform.thickness,
    mapConfig.platform.depth
  ),
  new THREE.MeshStandardMaterial(mapConfig.platform.material)
);
platform.position.set(
  mapConfig.platform.x,
  mapConfig.platform.topY - mapConfig.platform.thickness * 0.5,
  mapConfig.platform.z
);
// Keep platform out of lateral blockers to avoid sticking while walking on top.
addStaticWorldMesh(platform, false);

const rampRise = mapConfig.ramp.topY - mapConfig.ramp.baseY;
const rampAngle = Math.atan2(rampRise, mapConfig.ramp.width);
const rampLength = Math.hypot(mapConfig.ramp.width, rampRise);
const rampGeometry = new THREE.BoxGeometry(rampLength, mapConfig.ramp.thickness, mapConfig.ramp.depth);

const leftRamp = new THREE.Mesh(
  rampGeometry,
  new THREE.MeshStandardMaterial(mapConfig.ramp.material)
);
leftRamp.position.set(
  -(mapConfig.platform.width / 2 + mapConfig.ramp.width / 2),
  (mapConfig.ramp.topY + mapConfig.ramp.baseY) / 2 + mapConfig.ramp.thickness * 0.25,
  0
);
leftRamp.rotation.z = rampAngle;
addStaticWorldMesh(leftRamp, false);

const rightRamp = leftRamp.clone();
rightRamp.position.x = mapConfig.platform.width / 2 + mapConfig.ramp.width / 2;
rightRamp.rotation.z = -leftRamp.rotation.z;
addStaticWorldMesh(rightRamp, false);

const coverMaterial = new THREE.MeshStandardMaterial({
  color: mapConfig.coverMaterial.color,
  roughness: mapConfig.coverMaterial.roughness,
  metalness: mapConfig.coverMaterial.metalness
});

function addCoverBlock(x, z, width, height, depth, colorOffset = 0) {
  const mat = coverMaterial.clone();
  mat.color.offsetHSL(colorOffset, 0.05, 0.05);
  const block = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
  block.position.set(x, height / 2, z);
  addStaticWorldMesh(block);
}

function addTallPillar(x, z) {
  const pillar = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 5.2, 2.2),
    new THREE.MeshStandardMaterial(mapConfig.pillarMaterial)
  );
  pillar.position.set(x, 2.6, z);
  addStaticWorldMesh(pillar);
}

function addStackedCrates(x, z, side = 1, colorOffset = 0) {
  addCoverBlock(x, z, 3.2, 1.2, 3.2, colorOffset);
  addCoverBlock(x + side * 0.55, z - side * 0.35, 1.8, 3.1, 1.8, colorOffset + 0.08);
}

mapConfig.coverBlocks.forEach((block) => {
  addCoverBlock(block.x, block.z, block.width, block.height, block.depth, block.colorOffset);
});

mapConfig.stackedCrates.forEach((crateStack) => {
  addStackedCrates(crateStack.x, crateStack.z, crateStack.side, crateStack.colorOffset);
});

mapConfig.tallPillars.forEach((pillar) => {
  addTallPillar(pillar.x, pillar.z);
});

const sideWallMaterial = new THREE.MeshStandardMaterial(mapConfig.wallMaterial);
mapConfig.boundaryWalls.forEach((wall) => {
  const wallMesh = new THREE.Mesh(
    new THREE.BoxGeometry(wall.width, wall.height, wall.depth),
    sideWallMaterial
  );
  wallMesh.position.set(wall.x, wall.y, wall.z);
  addStaticWorldMesh(wallMesh);
});

function addJumpPad(x, z, color = 0x5fe1ff) {
  const pad = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.7, 1.9, 0.3, 24),
    new THREE.MeshStandardMaterial({ color: 0x2b3550, roughness: 0.55, metalness: 0.45 })
  );
  base.position.y = 0.16;
  pad.add(base);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.1, 0.12, 10, 28),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.4,
      roughness: 0.2,
      metalness: 0.7
    })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.32;
  pad.add(ring);

  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.65, 0.08, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 1.15 })
  );
  core.position.y = 0.35;
  pad.add(core);

  pad.position.set(x, 0, z);
  scene.add(pad);
  jumpPads.push({ x, z, radius: 1.8, boost: 17.2, ring, core });
  mapAnimators.push((time) => {
    const pulse = 0.6 + (Math.sin(time * 4 + x * 0.1 + z * 0.08) + 1) * 0.45;
    ring.material.emissiveIntensity = 0.8 + pulse;
    core.material.emissiveIntensity = 0.7 + pulse * 0.8;
  });
}

function addSpinnerProp(x, z, color = 0xffa64d) {
  const root = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.45, 4.2, 14),
    new THREE.MeshStandardMaterial({ color: 0x3f4666, roughness: 0.65, metalness: 0.35 })
  );
  pillar.position.y = 2.1;
  root.add(pillar);

  const rotor = new THREE.Group();
  rotor.position.y = 3.5;
  for (let i = 0; i < 3; i += 1) {
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.24, 2.8),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45, metalness: 0.45 })
    );
    blade.rotation.y = (Math.PI * 2 * i) / 3;
    blade.position.set(Math.sin(blade.rotation.y) * 1.2, 0, Math.cos(blade.rotation.y) * 1.2);
    rotor.add(blade);
  }
  root.add(rotor);
  root.position.set(x, 0, z);
  scene.add(root);
  mapAnimators.push((time, delta) => {
    rotor.rotation.y += delta * 2.6;
    root.position.y = Math.sin(time * 1.4 + x * 0.05) * 0.12;
  });
}

mapConfig.jumpPads.forEach((pad) => {
  addJumpPad(pad.x, pad.z, pad.color);
});

mapConfig.spinnerProps.forEach((prop) => {
  addSpinnerProp(prop.x, prop.z, prop.color);
});

function createGrenadePickupMesh() {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 14, 12),
    new THREE.MeshStandardMaterial({
      color: 0x4d7f57,
      roughness: 0.55,
      metalness: 0.32
    })
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

function syncGrenadePickups(pickups = []) {
  const nextIds = new Set();

  pickups.forEach((pickup) => {
    if (!pickup?.id || !pickup.position) return;
    nextIds.add(pickup.id);
    grenadePickups.set(pickup.id, pickup);

    let mesh = grenadePickupMeshes.get(pickup.id);
    if (!mesh) {
      mesh = createGrenadePickupMesh();
      grenadePickupMeshes.set(pickup.id, mesh);
      scene.add(mesh);
    }

    mesh.userData.baseY = (Number(pickup.position.y) || 0) + 0.42;
    mesh.position.set(Number(pickup.position.x) || 0, mesh.userData.baseY, Number(pickup.position.z) || 0);
    mesh.visible = pickup.available !== false;
  });

  grenadePickupMeshes.forEach((mesh, id) => {
    if (nextIds.has(id)) return;
    scene.remove(mesh);
    mesh.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    grenadePickupMeshes.delete(id);
    grenadePickups.delete(id);
  });
}

function updateGrenadePickupVisuals(time) {
  grenadePickupMeshes.forEach((mesh) => {
    if (!mesh.visible) return;
    const t = time * 2 + mesh.userData.spinOffset;
    mesh.rotation.y += 0.02;
    mesh.position.y = mesh.userData.baseY + Math.sin(t) * 0.12;
  });
}

const remoteMeshes = new Map();

function updateHealthHud() {
  const clampedHealth = THREE.MathUtils.clamp(Math.round(state.health), 0, 100);
  if (hudHealth) hudHealth.textContent = `Vie: ${clampedHealth}`;
  const healthMeter = hudHealthFill?.closest("[role='meter']");
  if (healthMeter) healthMeter.setAttribute("aria-valuenow", String(clampedHealth));
  if (hudHealthFill) {
    const ratio = clampedHealth / 100;
    hudHealthFill.style.transform = `scaleY(${ratio})`;
    hudHealthFill.style.filter = clampedHealth <= 25 ? "brightness(0.85)" : "";
  }
}

function ensureRemotePlayer(id) {
  let remotePlayer = remoteMeshes.get(id);
  if (!remotePlayer) {
    const root = createPlayerMesh(false);
    scene.add(root);
    remotePlayer = { root, targetPosition: null, targetRotationY: 0 };
    remoteMeshes.set(id, remotePlayer);
  }
  remotePlayer.id = id;
  remotePlayer.root.userData.playerId = id;
  if (remotePlayer.root.userData.hitbox) {
    remotePlayer.root.userData.hitbox.userData.playerId = id;
  }
  return remotePlayer;
}

function applyRemoteSnapshot(remotePlayer, payload, snap = false) {
  if (!payload?.position) return;
  const groundOffset = Number(remotePlayer.root.userData.groundOffset) || 0;
  const targetPos = new THREE.Vector3(
    payload.position.x,
    payload.position.y - groundOffset,
    payload.position.z
  );
  const targetRot = Number(payload.rotationY) || 0;

  if (snap || !remotePlayer.targetPosition) {
    remotePlayer.root.position.copy(targetPos);
    remotePlayer.root.rotation.y = targetRot;
  }
  remotePlayer.targetPosition = targetPos;
  remotePlayer.targetRotationY = targetRot;
}

function updateRemotePlayers(delta, time) {
  const t = THREE.MathUtils.clamp(delta * REMOTE_INTERP_SPEED, 0, 1);
  remoteMeshes.forEach((remotePlayer) => {
    if (!remotePlayer?.targetPosition) return;
    
    if (remotePlayer.root.userData.parts && time !== undefined) {
      const parts = remotePlayer.root.userData.parts;
      const dist = remotePlayer.root.position.distanceTo(remotePlayer.targetPosition);
      const speed = Math.min(dist / delta, 5);
      
      if (speed > 0.5) {
        const walkCycle = time * 12;
        parts.leftLeg.rotation.x = Math.sin(walkCycle) * 0.6;
        parts.rightLeg.rotation.x = Math.sin(walkCycle + Math.PI) * 0.6;
        parts.leftArm.rotation.x = Math.sin(walkCycle + Math.PI) * 0.5;
        parts.rightArm.rotation.x = Math.sin(walkCycle) * 0.1 + 0.4;
        parts.torso.rotation.y = Math.sin(walkCycle) * 0.1;
        parts.torso.position.y = 1.44 + Math.abs(Math.sin(walkCycle * 2)) * 0.05;
      } else {
        const idleCycle = time * 2;
        parts.leftLeg.rotation.x = THREE.MathUtils.lerp(parts.leftLeg.rotation.x, 0, 0.1);
        parts.rightLeg.rotation.x = THREE.MathUtils.lerp(parts.rightLeg.rotation.x, 0, 0.1);
        parts.leftArm.rotation.x = THREE.MathUtils.lerp(parts.leftArm.rotation.x, 0, 0.1);
        parts.rightArm.rotation.x = THREE.MathUtils.lerp(parts.rightArm.rotation.x, 0.4, 0.1);
        parts.torso.rotation.y = THREE.MathUtils.lerp(parts.torso.rotation.y, 0, 0.1);
        parts.torso.position.y = 1.44 + Math.sin(idleCycle) * 0.02;
      }
    }

    remotePlayer.root.position.lerp(remotePlayer.targetPosition, t);
    remotePlayer.root.rotation.y = lerpAngle(
      remotePlayer.root.rotation.y,
      remotePlayer.targetRotationY || 0,
      t
    );
  });
}

function lerpAngle(from, to, t) {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * t;
}

function setLocalAlive(alive) {
  state.isAlive = Boolean(alive);
  if (!state.isAlive) {
    state.isFiring = false;
    state.isAiming = false;
    resetTouchInput();
    sniperScope.classList.add("hidden");
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
    syncTouchControls();
    return;
  }
  state.deathKillerId = null;
  state.deathKillerName = "";
  state.deathKillerWeapon = "";
  renderedDeathWeapon = null;
  deathScreen?.classList.add("hidden");
  syncTouchControls();
}

function getDeathWeaponLabel(weapon) {
  return WEAPON_STATS[weapon]?.label || DEATH_WEAPON_LABELS[weapon] || "Inconnue";
}

function normalizeWeaponKey(weapon) {
  return WEAPON_STATS[weapon] || weapon === "grenade" ? weapon : "ak47";
}

function createWeaponIcon(weapon, className) {
  const weaponKey = normalizeWeaponKey(weapon);
  const sourceSvg =
    weaponKey === "grenade"
      ? document.querySelector("#hudGrenade svg")
      : weaponChoice?.querySelector(`button[data-weapon="${weaponKey}"] svg`);
  const icon = sourceSvg?.cloneNode(true);
  if (!icon) return null;
  icon.removeAttribute("width");
  icon.removeAttribute("height");
  icon.classList.add(className);
  return icon;
}

function updateDeathWeaponIcon(weapon) {
  if (!deathKillerWeaponIcon) return;
  if (renderedDeathWeapon === weapon) return;
  renderedDeathWeapon = weapon;
  deathKillerWeaponIcon.replaceChildren();
  deathKillerWeaponIcon.className = `death-weapon__icon death-weapon__icon--${weapon || "unknown"}`;

  const icon = createWeaponIcon(weapon, "death-weapon__svg");
  if (!icon) return;
  deathKillerWeaponIcon.append(icon);
}

function addKillFeedEntry({ killerName, victimName, weapon }) {
  if (!killFeed || !killerName || !victimName) return;
  const weaponKey = normalizeWeaponKey(weapon);

  const item = document.createElement("div");
  item.className = `kill-feed__item kill-feed__item--${weaponKey}`;

  const killer = document.createElement("span");
  killer.className = "kill-feed__name kill-feed__name--killer";
  killer.textContent = killerName;

  const iconWrap = document.createElement("span");
  iconWrap.className = "kill-feed__weapon";
  iconWrap.setAttribute("aria-label", getDeathWeaponLabel(weaponKey));
  const icon = createWeaponIcon(weaponKey, "kill-feed__svg");
  if (icon) iconWrap.append(icon);

  const victim = document.createElement("span");
  victim.className = "kill-feed__name kill-feed__name--victim";
  victim.textContent = victimName;

  item.append(killer, iconWrap, victim);
  killFeed.prepend(item);

  window.setTimeout(() => item.classList.add("kill-feed__item--leaving"), 2400);
  window.setTimeout(() => item.remove(), 3000);
}

function updateRespawnNotice() {
  if (!state.joined || state.isAlive) {
    respawnNotice.classList.add("hidden");
    return;
  }
  respawnNotice.classList.add("hidden");
}

function updateDeathScreen() {
  if (!state.joined || state.isAlive) {
    deathScreen?.classList.add("hidden");
    return;
  }
  const left = Math.max(0, state.respawnUntil - performance.now());
  const seconds = Math.ceil(left / 1000);
  if (deathKillerName) {
    deathKillerName.textContent = state.deathKillerName || "Inconnu";
  }
  if (deathKillerWeapon) {
    deathKillerWeapon.textContent = getDeathWeaponLabel(state.deathKillerWeapon);
  }
  updateDeathWeaponIcon(state.deathKillerWeapon);
  if (deathCountdown) {
    deathCountdown.textContent = `Respawn dans ${seconds}s...`;
  }
  deathScreen?.classList.remove("hidden");
}

function updateDeathCamera(delta) {
  if (state.isAlive || !state.deathKillerId) return;
  const killer = remoteMeshes.get(state.deathKillerId);
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

const localBody = createPlayerMesh(true);
localBody.visible = false;
scene.add(localBody);
const bullets = [];
const flashes = [];
const impacts = [];
const activeGrenades = new Map();
const explosionEffects = [];
const explodedGrenadeIds = new Set();
const raycaster = new THREE.Raycaster();

const clock = new THREE.Clock();
let lastNetworkSend = 0;
const smoothedMoveVelocity = new THREE.Vector3();
let hitmarkerTimer = null;
let damageOverlayTimer = null;

function triggerHitmarker() {
  if (!hitmarker) return;
  hitmarker.classList.remove("hidden");
  hitmarker.classList.add("show");
  if (hitmarkerTimer) {
    clearTimeout(hitmarkerTimer);
  }
  hitmarkerTimer = setTimeout(() => {
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
  if (damageOverlayTimer) {
    clearTimeout(damageOverlayTimer);
  }
  damageOverlayTimer = setTimeout(() => {
    damageOverlay.classList.remove("show");
    damageOverlay.style.opacity = "";
    damageOverlay.classList.add("hidden");
  }, 220);
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

function connect() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  state.ws = new WebSocket(`${protocol}://${location.host}`);

  state.ws.addEventListener("open", () => {
    savePlayerName(nameInput.value);
    state.ws.send(
      JSON.stringify({ type: "player:setName", name: sanitizePlayerName(nameInput.value) })
    );
  });

  state.ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === "rooms:update") {
      renderRooms(msg.rooms);
      return;
    }

    if (msg.type === "room:joined") {
      state.joined = true;
      state.playerId = msg.id;
      state.roomId = msg.roomId;
      state.team = msg.team;
      state.weapon = msg.weapon;
      state.health = Number(msg.health) || 100;
      state.grenadesHeld = Math.max(0, Math.min(1, Number(msg.grenades) || 0));
      setLocalAlive(msg.alive !== false);
      if (msg.spawn) {
        applyLocalSpawn(msg.spawn);
      }
      setActiveWeaponModel(state.weapon);
      weaponChoice.querySelectorAll("button").forEach((b) => {
        b.classList.toggle("active", b.getAttribute("data-weapon") === state.weapon);
      });
      updateGrenadeHud();
      enterGame();
      return;
    }

    if (msg.type === "room:players") {
      updatePlayerList(msg.players);
      return;
    }

    if (msg.type === "room:error") {
      respawnNotice.textContent = msg.message || "Action impossible";
      respawnNotice.classList.remove("hidden");
      setTimeout(() => {
        if (state.isAlive) respawnNotice.classList.add("hidden");
      }, 1500);
      return;
    }

    if (msg.type === "room:grenades") {
      syncGrenadePickups(Array.isArray(msg.pickups) ? msg.pickups : []);
      return;
    }

    if (msg.type === "player:update") {
      if (!msg.id) return;
      if (msg.id === state.playerId) return;
      const remotePlayer = ensureRemotePlayer(msg.id);
      remotePlayer.team = msg.team || remotePlayer.team || null;
      applyRemoteSnapshot(remotePlayer, msg, false);
      setRemoteAliveVisual(remotePlayer.root, msg.alive !== false);
      if (msg.name || msg.team) {
        const nameTag = remotePlayer.root.userData.nameTag;
        const playerColor = colorFromPlayerId(msg.id);
        updateNameTagSprite(nameTag, msg.name || "Player", playerColor);
        applyRemoteTeamStyle(remotePlayer.root, msg.team, msg.id);
      }
      return;
    }

    if (msg.type === "player:health") {
      const previousHealth = state.health;
      state.health = Number(msg.health) || 0;
      const damageTaken = Math.max(0, previousHealth - state.health);
      if (damageTaken > 0) {
        triggerDamageOverlay(damageTaken);
      }
      updateHealthHud();
      return;
    }

    if (msg.type === "player:grenadeInventory") {
      state.grenadesHeld = Math.max(0, Math.min(1, Number(msg.count) || 0));
      updateGrenadeHud();
      return;
    }

    if (msg.type === "player:died") {
      if (msg.killerId) {
        addKillFeedEntry({
          killerName: String(msg.killerName || "Inconnu"),
          victimName: String(msg.victimName || "Inconnu"),
          weapon: String(msg.killerWeapon || "")
        });
      }
      if (msg.id === state.playerId) {
        state.deathKillerId = msg.killerId || null;
        state.deathKillerName = String(msg.killerName || "Inconnu");
        state.deathKillerWeapon = String(msg.killerWeapon || "");
        setLocalAlive(false);
        state.respawnUntil = performance.now() + state.respawnDelayMs;
      } else {
        const remotePlayer = remoteMeshes.get(msg.id);
        if (remotePlayer) setRemoteAliveVisual(remotePlayer.root, false);
      }
      return;
    }

    if (msg.type === "player:respawn") {
      if (msg.spawn) {
        applyLocalSpawn(msg.spawn);
      }
      state.health = Number(msg.health) || 100;
      state.grenadesHeld = Math.max(0, Math.min(1, Number(msg.grenades) || 0));
      state.respawnUntil = 0;
      setLocalAlive(msg.alive !== false);
      setPauseMenu(false);
      if (shouldUsePointerLock() && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
      }
      updateHealthHud();
      updateGrenadeHud();
      syncTouchControls();
      return;
    }

    if (msg.type === "player:shoot") {
      if (!msg.id || msg.id === state.playerId) return;
      if (!msg.origin || !Array.isArray(msg.shots)) return;
      if (msg.weapon === "knife") {
        const slashDirection = msg.shots.find((shot) => shot?.direction)?.direction;
        spawnKnifeSlash(msg.origin, slashDirection, false);
        return;
      }
      spawnMuzzleFlash(msg.origin);
      msg.shots.forEach((shot) => {
        if (!shot?.direction) return;
        if (shot.melee) {
          spawnKnifeSlash(msg.origin, shot.direction, false);
          return;
        }
        const range = Number(shot.range) || 80;
        const bulletSpeed = Number(shot.bulletSpeed) || 68;
        const impact = traceImpact(msg.origin, shot.direction, range, false, 0);
        const maxTravel = impact?.distance || range;
        spawnBulletVisual(msg.origin, shot.direction, false, bulletSpeed, maxTravel);
      });
      return;
    }

    if (msg.type === "grenade:thrown") {
      spawnThrownGrenade(msg.grenade);
      return;
    }

    if (msg.type === "grenade:explode") {
      explodeGrenade(msg.id, msg.position, Number(msg.radius) || GRENADE_CONFIG.blastRadius, false);
    }
  });
}

function renderRooms(rooms) {
  roomsList.innerHTML = "";
  rooms.forEach((room) => {
    const item = document.createElement("article");
    item.className = `room-item ${room.count >= room.max ? "full" : ""}`;
    item.innerHTML = `
      <div class="room-item__meta">
        <strong>${room.id}</strong>
        <span>${room.count}/${room.max} joueurs</span>
      </div>
    `;
    const btn = document.createElement("button");
    btn.className = "room-join-button";
    btn.textContent = room.count >= room.max ? "Pleine" : "Rejoindre";
    btn.disabled = room.count >= room.max;
    btn.addEventListener("click", () => joinRoom(room.id));
    item.appendChild(btn);
    roomsList.appendChild(item);
  });
}

function joinRoom(roomId) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
  savePlayerName(nameInput.value);
  state.ws.send(JSON.stringify({ type: "player:setName", name: sanitizePlayerName(nameInput.value) }));
  state.ws.send(JSON.stringify({ type: "room:join", roomId }));
}

function enterGame() {
  menu.classList.add("hidden");
  hud.classList.remove("hidden");
  crosshair.classList.remove("hidden");
  playerList.classList.remove("hidden");
  pauseMenuOverlay.classList.add("hidden");
  updateGrenadeHud();
  updateHealthHud();
  updateRespawnNotice();
  syncTouchControls();
}

function setPauseMenu(open) {
  if (!state.joined) return;
  state.pauseOpen = open;
  cancelKeyRebind();
  pauseMenuOverlay.classList.toggle("hidden", !open);
  crosshair.classList.toggle("hidden", open);
  sniperScope.classList.add("hidden");
  if (open) {
    state.keys.clear();
    state.isFiring = false;
    state.isAiming = false;
    resetTouchInput();
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
  }
  syncTouchControls();
}

function togglePauseMenu() {
  setPauseMenu(!state.pauseOpen);
}

function getWeaponStats(weapon = state.weapon) {
  return WEAPON_STATS[weapon] || WEAPON_STATS.ak47;
}

function updateGrenadeHud() {
  if (!hudGrenade) return;
  const has = state.grenadesHeld >= 1;
  hudGrenade.classList.toggle("hud-grenade--ready", has);
  hudGrenade.classList.toggle("hud-grenade--empty", !has);
  const gLabel = formatKeyLabel(keyBindings.grenade);
  hudGrenade.setAttribute(
    "aria-label",
    has ? `Grenade prête, touche ${gLabel} pour lancer` : "Pas de grenade"
  );
  if (touchGrenadeBtn) {
    touchGrenadeBtn.disabled = !has;
    touchGrenadeBtn.classList.toggle("is-active", has);
  }
}

function updateZoomState() {
  const stats = getWeaponStats();
  const shouldZoom =
    state.joined && state.isAlive && state.isAiming && state.weapon === "sniper" && !state.pauseOpen;
  const targetFov = shouldZoom ? stats.zoomFov : BASE_FOV;
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.2);
  camera.updateProjectionMatrix();
  sniperScope.classList.toggle("hidden", !shouldZoom);
  const showCrosshair = state.joined && state.isAlive && !state.pauseOpen && !shouldZoom;
  crosshair.classList.toggle("hidden", !showCrosshair);
}

function updatePlayerList(players) {
  const me = players.find((p) => p.id === state.playerId);
  if (me) {
    state.health = Number(me.health) || state.health;
    setLocalAlive(me.alive !== false);
    state.team = me.team || state.team;
    updateHealthHud();
  }

  const remoteIds = new Set(players.filter((p) => p.id !== state.playerId).map((p) => p.id));
  remoteMeshes.forEach((remotePlayer, id) => {
    if (remoteIds.has(id)) return;
    scene.remove(remotePlayer.root);
    remoteMeshes.delete(id);
  });

  players.forEach((p) => {
    if (!p.id || p.id === state.playerId) return;
    const remotePlayer = ensureRemotePlayer(p.id);
    remotePlayer.team = p.team || remotePlayer.team || null;
    applyRemoteSnapshot(remotePlayer, p, true);
    const playerColor = colorFromPlayerId(p.id);
    updateNameTagSprite(remotePlayer.root.userData.nameTag, p.name || "Player", playerColor);
    applyRemoteTeamStyle(remotePlayer.root, p.team, p.id);
    setRemoteAliveVisual(remotePlayer.root, p.alive !== false);
  });

  const scoreboard = [...players].sort((a, b) => {
    const killDiff = (Number(b.kills) || 0) - (Number(a.kills) || 0);
    if (killDiff !== 0) return killDiff;
    const deathDiff = (Number(a.deaths) || 0) - (Number(b.deaths) || 0);
    if (deathDiff !== 0) return deathDiff;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  const html = scoreboard
    .map((p, idx) => {
      const life = p.alive === false ? "MORT" : `${Math.max(0, Number(p.health) || 0)}PV`;
      const isMe = p.id === state.playerId;
      return `<li class="${isMe ? "me" : ""}">
        <span class="rank">#${idx + 1}</span>
        <span class="name">${p.name}${isMe ? " (Toi)" : ""}</span>
        <span class="kd">${Number(p.kills) || 0}/${Number(p.deaths) || 0}</span>
        <span class="life">${life}</span>
      </li>`;
    })
    .join("");
  playerList.innerHTML = `
    <strong>Scoreboard FFA (${players.length}/10)</strong>
    <ul class="scoreboard-list">${html}</ul>
  `;
}

weaponChoice.addEventListener("click", (event) => {
  const target = event.target.closest("button[data-weapon]");
  if (!target) return;
  const weapon = target.getAttribute("data-weapon");
  state.weapon = weapon;
  state.isAiming = false;
  touchAimBtn?.classList.remove("is-active");
  setActiveWeaponModel(weapon);
  weaponChoice.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
  target.classList.add("active");
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: "weapon:select", weapon }));
  }
});

window.addEventListener("resize", () => {
  resizeRendererToViewport();
  syncTouchControls();
});

document.addEventListener("fullscreenchange", syncFullscreenButton);
document.addEventListener("webkitfullscreenchange", syncFullscreenButton);

if (mobileControlsQuery.addEventListener) {
  mobileControlsQuery.addEventListener("change", syncTouchControls);
} else if (mobileControlsQuery.addListener) {
  mobileControlsQuery.addListener(syncTouchControls);
}
initializeKeyBindingUi({ onBindingsChanged: updateGrenadeHud });
bindTouchControls({
  beginPrimaryFire,
  endPrimaryFire,
  getWeaponStats,
  jump,
  resizeRendererToViewport,
  throwGrenade,
  togglePauseMenu,
  updateHudKeyHints
});

function beginPrimaryFire() {
  if (!state.joined || state.pauseOpen || !state.isAlive || !hasGameLookInput()) return false;
  const stats = getWeaponStats();
  state.primaryFireHeld = true;
  state.isFiring = true;
  shoot();
  if (!stats.auto) state.isFiring = false;
  return true;
}

function endPrimaryFire() {
  state.primaryFireHeld = false;
  state.isFiring = false;
}

function endPrimaryFireFromMouseEvent(event) {
  if (event.buttons !== undefined && (event.buttons & 1) !== 0) return;
  endPrimaryFire();
}

bindKeyboardMouseControls({
  beginPrimaryFire,
  endPrimaryFire,
  endPrimaryFireFromMouseEvent,
  jump,
  setPauseMenu,
  throwGrenade,
  togglePauseMenu
});

function updateMovement(delta) {
  if (!state.joined || state.pauseOpen || !state.isAlive) {
    smoothedMoveVelocity.set(0, 0, 0);
    return;
  }
  const previousPos = camera.position.clone();
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
  const speedMultiplier = (isSprinting ? state.sprintMultiplier : 1) * weaponSpeedMultiplier;
  const currentMoveSpeed = state.moveSpeed * speedMultiplier;

  const targetVelocity = new THREE.Vector3()
    .addScaledVector(dir, fwd)
    .addScaledVector(side, right)
    .clampLength(0, 1)
    .multiplyScalar(currentMoveSpeed);
  const hasInput = fwd !== 0 || right !== 0;
  const smoothing = Math.min(delta * (hasInput ? 14 : 10), 1);
  smoothedMoveVelocity.lerp(targetVelocity, smoothing);
  if (hasInput) smoothedMoveVelocity.clampLength(0, currentMoveSpeed);

  state.verticalVelocity -= state.gravity * delta;
  camera.position.y += state.verticalVelocity * delta;

  const feetY = camera.position.y - state.playerHeight;
  const groundHeight = getGroundHeightAt(camera.position.x, camera.position.z, feetY);
  const minY = state.playerHeight + groundHeight;
  if (camera.position.y <= minY) {
    camera.position.y = minY;
    state.verticalVelocity = 0;
    state.onGround = true;
  }
  resolveHorizontalMovement(previousPos, delta);

  const lim = MAP_HALF_SIZE;
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -lim, lim);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -lim, lim);
  applyJumpPads();

  const horizontalSpeed = smoothedMoveVelocity.length();
  const isMoving = horizontalSpeed > 0.3 ? 1 : 0;
  state.movementBlend = THREE.MathUtils.lerp(state.movementBlend, isMoving, Math.min(delta * 12, 1));
}

function applyJumpPads() {
  if (!state.onGround) return;
  const now = performance.now();
  if (now - state.lastJumpPadBoostAt < 350) return;
  for (const pad of jumpPads) {
    const dx = camera.position.x - pad.x;
    const dz = camera.position.z - pad.z;
    const distSq = dx * dx + dz * dz;
    if (distSq > pad.radius * pad.radius) continue;
    state.verticalVelocity = Math.max(state.verticalVelocity, pad.boost);
    state.onGround = false;
    state.lastJumpPadBoostAt = now;
    break;
  }
}

function resolveHorizontalMovement(previousPos, delta) {
  const playerBottom = camera.position.y - state.playerHeight;
  const playerTop = camera.position.y + 0.25;
  const desiredX = previousPos.x + smoothedMoveVelocity.x * delta;
  const desiredZ = previousPos.z + smoothedMoveVelocity.z * delta;

  camera.position.x = desiredX;
  camera.position.z = previousPos.z;
  if (isCollidingAt(camera.position.x, camera.position.z, playerBottom, playerTop)) {
    camera.position.x = previousPos.x;
    smoothedMoveVelocity.x = 0;
  }

  camera.position.z = desiredZ;
  if (isCollidingAt(camera.position.x, camera.position.z, playerBottom, playerTop)) {
    camera.position.z = previousPos.z;
    smoothedMoveVelocity.z = 0;
  }

  resolveHorizontalPenetration(playerBottom, playerTop);
}

function isCollidingAt(x, z, playerBottom, playerTop) {
  for (const box of staticBlockColliders) {
    if (!isBlockLateralCollider(box, playerBottom, playerTop)) continue;
    const closestX = THREE.MathUtils.clamp(x, box.min.x, box.max.x);
    const closestZ = THREE.MathUtils.clamp(z, box.min.z, box.max.z);
    const deltaX = x - closestX;
    const deltaZ = z - closestZ;
    const distSq = deltaX * deltaX + deltaZ * deltaZ;
    if (distSq < playerCollisionRadius * playerCollisionRadius) return true;
  }
  return false;
}

function isBlockLateralCollider(box, playerBottom, playerTop) {
  if (playerTop <= box.min.y || playerBottom >= box.max.y) return false;
  // Only ignore side walls near the top while landing or standing. While rising,
  // the player must still collide with the block side instead of slipping inside it.
  if (state.verticalVelocity <= 0 && playerBottom >= box.max.y - blockStandTolerance) return false;
  return true;
}

function resolveHorizontalPenetration(playerBottom, playerTop) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let moved = false;
    for (const box of staticBlockColliders) {
      if (!isBlockLateralCollider(box, playerBottom, playerTop)) continue;
      const push = getCircleBoxPush(camera.position.x, camera.position.z, box);
      if (!push) continue;
      camera.position.x += push.x;
      camera.position.z += push.z;
      if (push.x !== 0) smoothedMoveVelocity.x = 0;
      if (push.z !== 0) smoothedMoveVelocity.z = 0;
      moved = true;
    }
    if (!moved) break;
  }
}

function getCircleBoxPush(x, z, box) {
  const closestX = THREE.MathUtils.clamp(x, box.min.x, box.max.x);
  const closestZ = THREE.MathUtils.clamp(z, box.min.z, box.max.z);
  const deltaX = x - closestX;
  const deltaZ = z - closestZ;
  const distSq = deltaX * deltaX + deltaZ * deltaZ;
  const radiusSq = playerCollisionRadius * playerCollisionRadius;
  if (distSq >= radiusSq) return null;

  if (distSq > 0.000001) {
    const dist = Math.sqrt(distSq);
    const pushDistance = playerCollisionRadius - dist + collisionEpsilon;
    return {
      x: (deltaX / dist) * pushDistance,
      z: (deltaZ / dist) * pushDistance
    };
  }

  const toLeft = x - box.min.x;
  const toRight = box.max.x - x;
  const toBack = z - box.min.z;
  const toFront = box.max.z - z;
  const minDistance = Math.min(toLeft, toRight, toBack, toFront);
  if (minDistance === toLeft) return { x: -(toLeft + playerCollisionRadius + collisionEpsilon), z: 0 };
  if (minDistance === toRight) return { x: toRight + playerCollisionRadius + collisionEpsilon, z: 0 };
  if (minDistance === toBack) return { x: 0, z: -(toBack + playerCollisionRadius + collisionEpsilon) };
  return { x: 0, z: toFront + playerCollisionRadius + collisionEpsilon };
}

function getGroundHeightAt(x, z, feetY = 0) {
  const rampSnapTolerance = 0.2;
  const platformSnapTolerance = 0.35;
  const blockSnapTolerance = 0.28;
  const halfPlatformW = mapConfig.platform.width / 2;
  const halfPlatformD = mapConfig.platform.depth / 2;
  const halfRampD = mapConfig.ramp.depth / 2;
  const halfRampW = mapConfig.ramp.width / 2;
  let bestGround = 0;

  if (Math.abs(x) <= halfPlatformW && Math.abs(z) <= halfPlatformD) {
    if (feetY >= mapConfig.platform.topY - platformSnapTolerance) {
      bestGround = Math.max(bestGround, mapConfig.platform.topY);
    }
  }

  const leftCenterX = -(halfPlatformW + halfRampW);
  if (x >= leftCenterX - halfRampW && x <= leftCenterX + halfRampW && Math.abs(z) <= halfRampD) {
    const localX = x - (leftCenterX - halfRampW);
    const rampHeight = THREE.MathUtils.clamp(
      (localX / mapConfig.ramp.width) * mapConfig.ramp.topY,
      mapConfig.ramp.baseY,
      mapConfig.ramp.topY
    );
    if (feetY >= rampHeight - rampSnapTolerance) {
      bestGround = Math.max(bestGround, rampHeight);
    }
  }

  const rightCenterX = halfPlatformW + halfRampW;
  if (
    x >= rightCenterX - halfRampW &&
    x <= rightCenterX + halfRampW &&
    Math.abs(z) <= halfRampD
  ) {
    const localX = rightCenterX + halfRampW - x;
    const rampHeight = THREE.MathUtils.clamp(
      (localX / mapConfig.ramp.width) * mapConfig.ramp.topY,
      mapConfig.ramp.baseY,
      mapConfig.ramp.topY
    );
    if (feetY >= rampHeight - rampSnapTolerance) {
      bestGround = Math.max(bestGround, rampHeight);
    }
  }

  for (const box of staticBlockColliders) {
    if (x < box.min.x || x > box.max.x || z < box.min.z || z > box.max.z) continue;
    if (feetY >= box.max.y - blockSnapTolerance) {
      bestGround = Math.max(bestGround, box.max.y);
    }
  }

  return bestGround;
}

function findSafeSpawnPosition(spawn) {
  const fallback = {
    x: Number(spawn?.x) || 0,
    z: Number(spawn?.z) || 0
  };
  const maxBound = MAP_HALF_SIZE - playerCollisionRadius - 0.2;
  fallback.x = THREE.MathUtils.clamp(fallback.x, -maxBound, maxBound);
  fallback.z = THREE.MathUtils.clamp(fallback.z, -maxBound, maxBound);

  const isSafeAt = (x, z) => {
    const ground = getGroundHeightAt(x, z);
    const playerBottom = ground;
    const playerTop = ground + state.playerHeight + 0.25;
    return !isCollidingAt(x, z, playerBottom, playerTop);
  };

  if (isSafeAt(fallback.x, fallback.z)) return fallback;

  const radiusStep = 0.6;
  const maxRadius = 8;
  const angleSteps = 24;
  for (let radius = radiusStep; radius <= maxRadius; radius += radiusStep) {
    for (let i = 0; i < angleSteps; i += 1) {
      const angle = (i / angleSteps) * Math.PI * 2;
      const x = THREE.MathUtils.clamp(fallback.x + Math.cos(angle) * radius, -maxBound, maxBound);
      const z = THREE.MathUtils.clamp(fallback.z + Math.sin(angle) * radius, -maxBound, maxBound);
      if (isSafeAt(x, z)) return { x, z };
    }
  }

  return fallback;
}

function applyLocalSpawn(spawn) {
  const safe = findSafeSpawnPosition(spawn);
  const ground = getGroundHeightAt(safe.x, safe.z);
  camera.position.set(safe.x, state.playerHeight + ground, safe.z);
  state.verticalVelocity = 0;
  state.onGround = true;
}

function sendPlayerUpdate() {
  if (!state.joined || state.pauseOpen || !state.isAlive || !state.ws || state.ws.readyState !== WebSocket.OPEN) return;
  const now = performance.now();
  if (now - lastNetworkSend < 50) return;
  lastNetworkSend = now;

  state.ws.send(
    JSON.stringify({
      type: "player:update",
      position: {
        x: camera.position.x,
        y: camera.position.y - state.playerHeight,
        z: camera.position.z
      },
      rotationY: state.yaw
    })
  );
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const time = performance.now() * 0.001;

  updateZoomState();
  updateRespawnNotice();
  updateDeathScreen();
  camera.rotation.set(state.pitch, state.yaw, 0, "YXZ");
  updateMovement(delta);
  if (
    state.primaryFireHeld &&
    getWeaponStats().auto &&
    !state.pauseOpen &&
    state.isAlive
  ) {
    state.isFiring = true;
    shoot();
  }
  animateViewModel(delta);
  updateRemotePlayers(delta, time);
  updateDeathCamera(delta);
  updateBullets(delta);
  updateFlashes(delta);
  updateImpacts(delta);
  updateGrenades(delta, time);
  updateMapFun(time, delta);
  sendPlayerUpdate();

  renderer.render(scene, camera);
}

function updateMapFun(time, delta) {
  for (const animateMapPart of mapAnimators) {
    animateMapPart(time, delta);
  }
}

function impulseViewRecoilFromWeapon(stats) {
  const r = stats.viewRecoil;
  if (!r) return;
  const scoped =
    state.weapon === "sniper" &&
    state.isAiming &&
    state.joined &&
    state.isAlive &&
    !state.pauseOpen;
  const mul = scoped ? 0.68 : 1;
  const kickZ = r.z * mul;
  const kickY = (r.y || 0) * mul;
  const kickRotX = r.rotX * mul;
  const kickRotZRand = (Math.random() - 0.5) * r.rotZ * mul;
  state.viewRecoilZ = Math.min(state.viewRecoilZ + kickZ, 0.32);
  state.viewRecoilY = Math.max(state.viewRecoilY + kickY, -0.09);
  state.viewRecoilRotX = Math.min(state.viewRecoilRotX + kickRotX, 0.2);
  state.viewRecoilRotZ = THREE.MathUtils.clamp(state.viewRecoilRotZ + kickRotZRand, -0.12, 0.12);
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
    state.isAiming &&
    (state.weapon === "ak47" || state.weapon === "shotgun") &&
    hasGameLookInput();
  const aimTarget = wantsAimView ? 1 : 0;
  aimViewBlend = THREE.MathUtils.lerp(aimViewBlend, aimTarget, 1 - Math.exp(-14 * delta));

  const t = performance.now() * 0.001;
  const intensity = state.movementBlend;
  const recoilNorm = Math.min(
    1,
    (Math.abs(state.viewRecoilZ) +
      Math.abs(state.viewRecoilRotX) +
      Math.abs(state.viewRecoilY)) /
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

  if (viewModel.userData.armGroup) {
    viewModel.userData.armGroup.position.y = -aimViewBlend * 0.5;
    viewModel.userData.armGroup.visible = aimViewBlend < 0.8;
  }

  const isKnife = state.weapon === "knife";
  if (isKnife) {
    const p = knifeAttackTime > 0 ? 1 - knifeAttackTime / KNIFE_ATTACK_DURATION : 1;
    const slashP = THREE.MathUtils.clamp(p / 0.72, 0, 1);
    const recoverP = THREE.MathUtils.clamp((p - 0.72) / 0.28, 0, 1);
    const slashEase = 1 - Math.pow(1 - slashP, 3);
    const recoverEase = recoverP * recoverP * (3 - 2 * recoverP);
    const airY = state.onGround ? 0 : -0.03;
    const start = {
      x: 0.48,
      y: -0.12,
      z: -0.49,
      rx: -0.24,
      ry: -0.25,
      rz: -0.72
    };
    const end = {
      x: 0.1,
      y: -0.42,
      z: -0.54,
      rx: 0.2,
      ry: 0.22,
      rz: 0.82
    };
    const rest = {
      x: 0.34 + s95 * bobX * bobIntensity,
      y: -0.25 + c75 * bobY * bobIntensity + airY,
      z: -0.49 + s15 * 0.004 * bobIntensity,
      rx: -0.1 + c8 * bobRotX * bobIntensity,
      ry: -0.16 + s67 * bobRotY * bobIntensity,
      rz: -0.18 + s85 * bobRotZ * bobIntensity
    };

    const cut = {
      x: THREE.MathUtils.lerp(start.x, end.x, slashEase),
      y: THREE.MathUtils.lerp(start.y, end.y, slashEase) + airY,
      z: THREE.MathUtils.lerp(start.z, end.z, slashEase),
      rx: THREE.MathUtils.lerp(start.rx, end.rx, slashEase),
      ry: THREE.MathUtils.lerp(start.ry, end.ry, slashEase),
      rz: THREE.MathUtils.lerp(start.rz, end.rz, slashEase)
    };

    const active = knifeAttackTime > 0;
    const pose = active
      ? {
          x: THREE.MathUtils.lerp(cut.x, rest.x, recoverEase),
          y: THREE.MathUtils.lerp(cut.y, rest.y, recoverEase),
          z: THREE.MathUtils.lerp(cut.z, rest.z, recoverEase),
          rx: THREE.MathUtils.lerp(cut.rx, rest.rx, recoverEase),
          ry: THREE.MathUtils.lerp(cut.ry, rest.ry, recoverEase),
          rz: THREE.MathUtils.lerp(cut.rz, rest.rz, recoverEase)
        }
      : rest;

    viewModel.position.set(pose.x, pose.y, pose.z);
    viewModel.rotation.set(pose.rx, pose.ry, pose.rz);
    return;
  }

  const isAk = state.weapon === "ak47";
  const isShotgun = state.weapon === "shotgun";
  const rotXTarget = isAk ? 0.085 : 0.024;
  const yTarget = isAk ? 0.0 : 0.1;
  const xTarget = isShotgun ? 0 : 0.02; // Aligne parfaitement les modèles (origin -0.02) au centre

  const idleX = 0.3 + s95 * bobX * bobIntensity;
  const adsX = xTarget + s95 * bobX * bobIntensity * 0.35;
  viewModel.position.x = THREE.MathUtils.lerp(idleX, adsX, aimViewBlend);

  const airY = state.onGround ? 0 : -0.03;
  const idleY = -0.31 + c75 * bobY * bobIntensity + airY + state.viewRecoilY;
  const adsY = yTarget + c75 * bobY * bobIntensity * 0.35 + airY + state.viewRecoilY;
  viewModel.position.y = THREE.MathUtils.lerp(idleY, adsY, aimViewBlend);

  const idleZ = -0.52 + s15 * 0.004 * bobIntensity + state.viewRecoilZ;
  const adsZ = -0.35 + s15 * 0.004 * bobIntensity * 0.35 + state.viewRecoilZ;
  viewModel.position.z = THREE.MathUtils.lerp(idleZ, adsZ, aimViewBlend);

  const idleRotZ = s85 * bobRotZ * bobIntensity + state.viewRecoilRotZ;
  const adsRotZ = 0 + s85 * bobRotZ * bobIntensity * 0.35 + state.viewRecoilRotZ;
  viewModel.rotation.z = THREE.MathUtils.lerp(idleRotZ, adsRotZ, aimViewBlend);

  const idleRotX = -0.02 + c8 * bobRotX * bobIntensity + state.viewRecoilRotX;
  const adsRotX = rotXTarget + c8 * bobRotX * bobIntensity * 0.35 + state.viewRecoilRotX;
  viewModel.rotation.x = THREE.MathUtils.lerp(idleRotX, adsRotX, aimViewBlend);

  const idleRotY = -0.22 + s67 * bobRotY * bobIntensity;
  const adsRotY = 0 + s67 * bobRotY * bobIntensity * 0.35;
  viewModel.rotation.y = THREE.MathUtils.lerp(idleRotY, adsRotY, aimViewBlend);
}

function shoot() {
  if (!state.isAlive) return;
  const stats = getWeaponStats();
  const now = performance.now();
  const msBetweenShots = 1000 / stats.fireRate;
  if (now - state.lastShotAt < msBetweenShots) return;
  state.lastShotAt = now;

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
    traceImpact(aimOrigin, direction, stats.range, true, stats.damage);
    spawnKnifeSlash(muzzleOrigin, direction, true);
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(
        JSON.stringify({
          type: "player:shoot",
          origin: muzzleOrigin,
          weapon: state.weapon,
          shots: [
            {
              direction,
              damage: stats.damage,
              range: stats.range,
              bulletSpeed: 0,
              melee: true
            }
          ]
        })
      );
    }
    return;
  }

  impulseViewRecoilFromWeapon(stats);

  const right = new THREE.Vector3().crossVectors(camera.up, baseDirection).normalize();
  const up = new THREE.Vector3().crossVectors(baseDirection, right).normalize();

  const shots = [];

  for (let i = 0; i < stats.pellets; i += 1) {
    const sX = stats.spreadX !== undefined ? stats.spreadX : stats.spread;
    const sY = stats.spreadY !== undefined ? stats.spreadY : stats.spread;
    const spreadX = (Math.random() - 0.5) * sX;
    const spreadY = (Math.random() - 0.5) * sY;
    const shotDirection = baseDirection
      .clone()
      .addScaledVector(right, spreadX)
      .addScaledVector(up, spreadY)
      .normalize();
    const direction = { x: shotDirection.x, y: shotDirection.y, z: shotDirection.z };
    shots.push({
      direction,
      damage: stats.damage,
      range: stats.range,
      bulletSpeed: stats.bulletSpeed
    });
    const impact = traceImpact(aimOrigin, direction, stats.range, true, stats.damage);
    const maxTravel = impact?.distance || stats.range;
    spawnBulletVisual(muzzleOrigin, direction, true, stats.bulletSpeed, maxTravel);
  }
  spawnMuzzleFlash(muzzleOrigin);

  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(
      JSON.stringify({
        type: "player:shoot",
        origin: aimOrigin,
        weapon: state.weapon,
        shots
      })
    );
  }
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
    new THREE.LineBasicMaterial({
      color: 0xffe19c,
      transparent: true,
      opacity: 0.72
    })
  );
}

function spawnThrownGrenade(grenadeData) {
  if (!grenadeData?.id || !grenadeData.origin || !grenadeData.direction) return null;

  const existing = activeGrenades.get(grenadeData.id);
  if (existing) {
    existing.ownerId = grenadeData.ownerId || existing.ownerId;
    existing.fuseMs = Number(grenadeData.fuseMs) || existing.fuseMs;
    return existing;
  }

  const mesh = createThrownGrenadeMesh();
  mesh.position.set(
    Number(grenadeData.origin.x) || 0,
    Number(grenadeData.origin.y) || 0,
    Number(grenadeData.origin.z) || 0
  );
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
    velocity: direction.multiplyScalar(Number(grenadeData.speed) || GRENADE_CONFIG.throwSpeed),
    ageMs: 0,
    fuseMs: Number(grenadeData.fuseMs) || GRENADE_CONFIG.fuseMs
  };
  activeGrenades.set(grenade.id, grenade);
  return grenade;
}

function disposeGrenade(grenade) {
  if (!grenade) return;
  scene.remove(grenade.mesh);
  scene.remove(grenade.trail);
  grenade.mesh.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
  });
  grenade.trail.geometry.dispose();
  grenade.trail.material.dispose();
}

function resolveGrenadeBlockCollisions(position, velocity) {
  const radius = GRENADE_CONFIG.radius;

  for (const box of staticBlockColliders) {
    const closest = new THREE.Vector3(
      THREE.MathUtils.clamp(position.x, box.min.x, box.max.x),
      THREE.MathUtils.clamp(position.y, box.min.y, box.max.y),
      THREE.MathUtils.clamp(position.z, box.min.z, box.max.z)
    );
    const delta = position.clone().sub(closest);
    const distSq = delta.lengthSq();
    if (distSq >= radius * radius) continue;

    let normal;
    let distance = Math.sqrt(distSq);
    if (distance > 0.0001) {
      normal = delta.multiplyScalar(1 / distance);
    } else {
      const center = box.getCenter(new THREE.Vector3());
      const offset = position.clone().sub(center);
      const absX = Math.abs(offset.x);
      const absY = Math.abs(offset.y);
      const absZ = Math.abs(offset.z);
      if (absX >= absY && absX >= absZ) {
        normal = new THREE.Vector3(Math.sign(offset.x) || 1, 0, 0);
      } else if (absY >= absX && absY >= absZ) {
        normal = new THREE.Vector3(0, Math.sign(offset.y) || 1, 0);
      } else {
        normal = new THREE.Vector3(0, 0, Math.sign(offset.z) || 1);
      }
      distance = 0;
    }

    position.addScaledVector(normal, radius - distance + 0.002);
    const velocityAlongNormal = velocity.dot(normal);
    if (velocityAlongNormal < 0) {
      velocity.addScaledVector(normal, -(1 + GRENADE_CONFIG.bounceDamping) * velocityAlongNormal);
      velocity.multiplyScalar(0.985);
    }
  }
}

function simulateGrenade(grenade, delta) {
  let remaining = delta;
  const timeStep = 1 / 120;
  const maxBound = MAP_HALF_SIZE - GRENADE_CONFIG.radius;

  while (remaining > 0) {
    const step = Math.min(timeStep, remaining);
    remaining -= step;

    grenade.velocity.y -= GRENADE_CONFIG.gravity * step;
    const previous = grenade.mesh.position.clone();
    grenade.mesh.position.addScaledVector(grenade.velocity, step);

    if (grenade.mesh.position.x < -maxBound || grenade.mesh.position.x > maxBound) {
      grenade.mesh.position.x = THREE.MathUtils.clamp(grenade.mesh.position.x, -maxBound, maxBound);
      grenade.velocity.x *= -GRENADE_CONFIG.bounceDamping;
    }

    if (grenade.mesh.position.z < -maxBound || grenade.mesh.position.z > maxBound) {
      grenade.mesh.position.z = THREE.MathUtils.clamp(grenade.mesh.position.z, -maxBound, maxBound);
      grenade.velocity.z *= -GRENADE_CONFIG.bounceDamping;
    }

    resolveGrenadeBlockCollisions(grenade.mesh.position, grenade.velocity);

    const groundHeight = getGroundHeightAt(
      grenade.mesh.position.x,
      grenade.mesh.position.z,
      grenade.mesh.position.y - GRENADE_CONFIG.radius
    );
    const minY = groundHeight + GRENADE_CONFIG.radius;
    if (grenade.mesh.position.y <= minY) {
      grenade.mesh.position.y = minY;
      if (Math.abs(grenade.velocity.y) > GRENADE_CONFIG.minVerticalBounce) {
        grenade.velocity.y = Math.abs(grenade.velocity.y) * GRENADE_CONFIG.bounceDamping;
      } else {
        grenade.velocity.y = 0;
      }
      grenade.velocity.x *= GRENADE_CONFIG.friction;
      grenade.velocity.z *= GRENADE_CONFIG.friction;
      if (Math.hypot(grenade.velocity.x, grenade.velocity.z) < GRENADE_CONFIG.minHorizontalSpeed) {
        grenade.velocity.x = 0;
        grenade.velocity.z = 0;
      }
    }

    grenade.mesh.rotation.x += step * (grenade.velocity.length() * 0.7 + 2.8);
    grenade.mesh.rotation.z += step * 4.2;
    grenade.trail.geometry.setFromPoints([previous, grenade.mesh.position.clone()]);
  }
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

  explosionEffects.push({ flash, ring, life: 0.34, maxLife: 0.34, radius });
}

function explodeGrenade(grenadeId, position, radius = GRENADE_CONFIG.blastRadius, shouldNotify = false) {
  if (!grenadeId || !position || explodedGrenadeIds.has(grenadeId)) return;
  explodedGrenadeIds.add(grenadeId);

  const grenade = activeGrenades.get(grenadeId);
  if (grenade) {
    disposeGrenade(grenade);
    activeGrenades.delete(grenadeId);
  }

  createExplosionEffect(position, radius);

  if (shouldNotify && state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(
      JSON.stringify({
        type: "grenade:explode",
        id: grenadeId,
        position
      })
    );
  }
}

function updateExplosionEffects(delta) {
  for (let i = explosionEffects.length - 1; i >= 0; i -= 1) {
    const effect = explosionEffects[i];
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
      explosionEffects.splice(i, 1);
    }
  }
}

function updateGrenades(delta, time) {
  updateGrenadePickupVisuals(time);
  tryPickupNearbyGrenade();

  activeGrenades.forEach((grenade, grenadeId) => {
    simulateGrenade(grenade, delta);
    grenade.ageMs += delta * 1000;
    if (grenade.ageMs >= grenade.fuseMs) {
      const position = {
        x: grenade.mesh.position.x,
        y: grenade.mesh.position.y,
        z: grenade.mesh.position.z
      };
      const shouldNotify = grenade.ownerId === state.playerId;
      explodeGrenade(grenadeId, position, GRENADE_CONFIG.blastRadius, shouldNotify);
    }
  });

  updateExplosionEffects(delta);
}

function tryPickupNearbyGrenade() {
  if (!state.joined || state.pauseOpen || !state.isAlive) return;
  if (state.grenadesHeld >= 1 || !state.ws || state.ws.readyState !== WebSocket.OPEN) return;

  const now = performance.now();
  if (now - state.lastGrenadePickupAttemptAt < 220) return;

  for (const pickup of grenadePickups.values()) {
    if (!pickup?.position || pickup.available === false) continue;
    const dx = camera.position.x - (Number(pickup.position.x) || 0);
    const dz = camera.position.z - (Number(pickup.position.z) || 0);
    if (dx * dx + dz * dz > GRENADE_CONFIG.pickupRadius * GRENADE_CONFIG.pickupRadius) continue;

    state.lastGrenadePickupAttemptAt = now;
    state.ws.send(JSON.stringify({ type: "grenade:pickup", pickupId: pickup.id }));
    break;
  }
}

function throwGrenade() {
  if (!state.joined || state.pauseOpen || !state.isAlive) return;
  if (state.grenadesHeld < 1 || !state.ws || state.ws.readyState !== WebSocket.OPEN) return;

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

  spawnThrownGrenade({
    id: grenadeId,
    ownerId: state.playerId,
    origin: { x: origin.x, y: origin.y, z: origin.z },
    direction: { x: throwDirection.x, y: throwDirection.y, z: throwDirection.z },
    speed: GRENADE_CONFIG.throwSpeed,
    fuseMs: GRENADE_CONFIG.fuseMs
  });

  state.grenadesHeld = 0;
  updateGrenadeHud();
  state.ws.send(
    JSON.stringify({
      type: "grenade:throw",
      id: grenadeId,
      origin: { x: origin.x, y: origin.y, z: origin.z },
      direction: { x: throwDirection.x, y: throwDirection.y, z: throwDirection.z }
    })
  );
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

  bullets.push({
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
  flashes.push({ mesh: flash, life: 0.06 });
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
  slash.lookAt(
    slash.position.x + slashDir.x,
    slash.position.y + slashDir.y,
    slash.position.z + slashDir.z
  );
  slash.rotateZ(localShot ? -2.3 : -2.1);
  scene.add(slash);
  flashes.push({ mesh: slash, life: 0.16, maxLife: 0.16 });
}

function traceImpact(origin, direction, maxDistance = 120, reportHit = false, damage = 0) {
  const rayOrigin = new THREE.Vector3(origin.x, origin.y, origin.z);
  const rayDir = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
  raycaster.set(rayOrigin, rayDir);
  raycaster.far = maxDistance;

  const targets = [...worldColliders];
  remoteMeshes.forEach((remotePlayer) => {
    const hitbox = remotePlayer.root?.userData?.hitbox;
    if (hitbox) targets.push(hitbox);
  });
  const hit = raycaster.intersectObjects(targets, false)[0];
  if (!hit) return null;

  const impactPos = hit.point.clone();
  if (hit.face?.normal) {
    impactPos.add(hit.face.normal.clone().normalize().multiplyScalar(0.03));
  }

  const impact = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 })
  );
  impact.position.copy(impactPos);
  scene.add(impact);
  impacts.push({ mesh: impact, life: 0.16 });

  if (!reportHit || !state.ws || state.ws.readyState !== WebSocket.OPEN) return hit;
  const hitPlayerId = hit.object?.userData?.playerId;
  if (!hitPlayerId) return hit;
  if (hitPlayerId === state.playerId) return hit;
  triggerHitmarker();
  state.ws.send(
    JSON.stringify({
      type: "player:hit",
      targetId: hitPlayerId,
      damage: Math.max(1, Number(damage) || 1)
    })
  );
  return hit;
}

function updateBullets(delta) {
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const bullet = bullets[i];
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
      bullets.splice(i, 1);
    }
  }
}

function updateFlashes(delta) {
  for (let i = flashes.length - 1; i >= 0; i -= 1) {
    const flash = flashes[i];
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
      flashes.splice(i, 1);
    }
  }
}

function updateImpacts(delta) {
  for (let i = impacts.length - 1; i >= 0; i -= 1) {
    const impact = impacts[i];
    impact.life -= delta;
    impact.mesh.scale.multiplyScalar(0.95);
    impact.mesh.material.opacity = Math.max(0, impact.life / 0.16);
    if (impact.life <= 0) {
      scene.remove(impact.mesh);
      impact.mesh.geometry.dispose();
      impact.mesh.material.dispose();
      impacts.splice(i, 1);
    }
  }
}

connect();
animate();
