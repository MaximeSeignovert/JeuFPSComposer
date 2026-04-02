import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

const state = {
  ws: null,
  playerId: null,
  roomId: null,
  team: null,
  weapon: "ak47",
  players: new Map(),
  keys: new Set(),
  yaw: 0,
  pitch: 0,
  moveSpeed: 5,
  sprintMultiplier: 2,
  playerHeight: 1.7,
  gravity: 26,
  jumpSpeed: 8.8,
  fireRate: 8,
  bulletSpeed: 68,
  bulletLife: 1.1,
  verticalVelocity: 0,
  onGround: true,
  movementBlend: 0,
  lastShotAt: 0,
  isFiring: false,
  isAiming: false,
  health: 100,
  isAlive: true,
  respawnUntil: 0,
  respawnDelayMs: 3200,
  joined: false,
  pauseOpen: false
};

const BASE_FOV = 74;
const PLAYER_NAME_STORAGE_KEY = "fps.playerName";
const MAP_HALF_SIZE = 40;
const WEAPON_STATS = {
  shotgun: {
    label: "Fusil a pompe",
    fireRate: 1.0,
    pellets: 6,
    spread: 0.07,
    damage: 14,
    range: 22,
    bulletSpeed: 56,
    auto: false,
    zoomFov: BASE_FOV
  },
  ak47: {
    label: "AK47",
    fireRate: 8.2,
    pellets: 1,
    spread: 0.017,
    damage: 20,
    range: 58,
    bulletSpeed: 72,
    auto: true,
    zoomFov: BASE_FOV
  },
  sniper: {
    label: "Sniper",
    fireRate: 0.72,
    pellets: 1,
    spread: 0.002,
    damage: 92,
    range: 125,
    bulletSpeed: 100,
    auto: false,
    zoomFov: 28
  }
};

const menu = document.getElementById("menu");
const roomsList = document.getElementById("roomsList");
const nameInput = document.getElementById("nameInput");
const weaponChoice = document.getElementById("weaponChoice");
const teamChoice = document.getElementById("teamChoice");
const pauseMenu = document.getElementById("pauseMenu");
const resumeBtn = document.getElementById("resumeBtn");
const hud = document.getElementById("hud");
const crosshair = document.getElementById("crosshair");
const hitmarker = document.getElementById("hitmarker");
const sniperScope = document.getElementById("sniperScope");
const playerList = document.getElementById("playerList");
const hudRoom = document.getElementById("hudRoom");
const hudTeam = document.getElementById("hudTeam");
const hudWeapon = document.getElementById("hudWeapon");
const hudHealth = document.getElementById("hudHealth");
const respawnNotice = document.getElementById("respawnNotice");
const canvas = document.getElementById("gameCanvas");

function sanitizePlayerName(rawName) {
  const cleaned = String(rawName || "").trim().slice(0, 20);
  return cleaned || "Player";
}

function savePlayerName(name) {
  try {
    localStorage.setItem(PLAYER_NAME_STORAGE_KEY, sanitizePlayerName(name));
  } catch {
    // Ignore localStorage failures (private mode / quota)
  }
}

function loadPlayerName() {
  try {
    return sanitizePlayerName(localStorage.getItem(PLAYER_NAME_STORAGE_KEY) || "Player");
  } catch {
    return "Player";
  }
}

nameInput.value = loadPlayerName();
nameInput.addEventListener("input", () => {
  savePlayerName(nameInput.value);
});

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd3ff);
scene.fog = new THREE.Fog(0xaedfff, 55, 180);

const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, state.playerHeight, 0);
scene.add(camera);

const viewModel = createViewModel();
camera.add(viewModel);
setActiveWeaponModel(state.weapon);

const hemi = new THREE.HemisphereLight(0xc7ebff, 0x6a8f4c, 1.25);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xfff3d1, 1.15);
dir.position.set(18, 30, 14);
scene.add(dir);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: 0x7fbf65, roughness: 0.95 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const worldColliders = [floor];
const staticBlockColliders = [];
const playerCollisionRadius = 0.34;

function addStaticWorldMesh(mesh, includePhysics = true) {
  scene.add(mesh);
  worldColliders.push(mesh);
  if (includePhysics) {
    staticBlockColliders.push(new THREE.Box3().setFromObject(mesh));
  }
}

const mapConfig = {
  platform: { width: 18, depth: 14, topY: 3.8, thickness: 1.2 },
  ramp: { width: 8.4, depth: 7.6, topY: 3.8, baseY: 0, thickness: 0.34 }
};

const platform = new THREE.Mesh(
  new THREE.BoxGeometry(
    mapConfig.platform.width,
    mapConfig.platform.thickness,
    mapConfig.platform.depth
  ),
  new THREE.MeshStandardMaterial({ color: 0xe4d1a9, roughness: 0.72, metalness: 0.03 })
);
platform.position.set(0, mapConfig.platform.topY - mapConfig.platform.thickness * 0.5, 0);
// Keep platform out of lateral blockers to avoid sticking while walking on top.
addStaticWorldMesh(platform, false);

const rampRise = mapConfig.ramp.topY - mapConfig.ramp.baseY;
const rampAngle = Math.atan2(rampRise, mapConfig.ramp.width);
const rampLength = Math.hypot(mapConfig.ramp.width, rampRise);
const rampGeometry = new THREE.BoxGeometry(rampLength, mapConfig.ramp.thickness, mapConfig.ramp.depth);

const leftRamp = new THREE.Mesh(
  rampGeometry,
  new THREE.MeshStandardMaterial({ color: 0xffc74d, roughness: 0.72, metalness: 0.02 })
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
  color: 0x4f80d9,
  roughness: 0.8,
  metalness: 0.02
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
    new THREE.MeshStandardMaterial({ color: 0xff6a6a, roughness: 0.76, metalness: 0.03 })
  );
  pillar.position.set(x, 2.6, z);
  addStaticWorldMesh(pillar);
}

[-1, 1].forEach((side) => {
  const x = side * 30;
  addCoverBlock(x, -24, 5.4, 2.6, 3.4, 0.02);
  addCoverBlock(x, -8, 3.8, 2.2, 3.2, -0.08);
  addCoverBlock(x, 8, 3.8, 2.2, 3.2, 0.1);
  addCoverBlock(x, 24, 5.4, 2.6, 3.4, -0.12);
  addCoverBlock(side * 22, -16, 3.2, 1.6, 2.8, 0.16);
  addCoverBlock(side * 22, 16, 3.2, 1.6, 2.8, -0.18);
});

addTallPillar(0, -24);
addTallPillar(0, 24);

const sideWallMaterial = new THREE.MeshStandardMaterial({ color: 0x8ec66b, roughness: 0.9 });
const sideWallLeft = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 85), sideWallMaterial);
sideWallLeft.position.set(-42, 2, 0);
addStaticWorldMesh(sideWallLeft);

const sideWallRight = sideWallLeft.clone();
sideWallRight.position.x = 42;
addStaticWorldMesh(sideWallRight);

const backWall = new THREE.Mesh(new THREE.BoxGeometry(85, 4, 2), sideWallMaterial);
backWall.position.set(0, 2, -42);
addStaticWorldMesh(backWall);

const frontWall = backWall.clone();
frontWall.position.z = 42;
addStaticWorldMesh(frontWall);

const localMaterial = new THREE.MeshStandardMaterial({ color: 0x45e0a8 });
const remoteMeshes = new Map();

function createPlayerMesh(isLocal = false) {
  if (isLocal) {
    const localMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 6, 10), localMaterial);
    localMesh.position.y = 1.2;
    return localMesh;
  }

  const root = new THREE.Group();
  root.position.y = 0;

  const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xd9ad84, roughness: 0.78 });
  const shirtMaterial = new THREE.MeshStandardMaterial({ color: 0x4f8cf6, roughness: 0.75 });
  const pantMaterial = new THREE.MeshStandardMaterial({ color: 0x1e2f4f, roughness: 0.88 });
  const shoeMaterial = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.95 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.68, 0.26), shirtMaterial);
  torso.position.set(0, 1.44, 0);
  root.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14), skinMaterial);
  head.position.set(0, 1.95, 0);
  root.add(head);

  const armGeo = new THREE.CapsuleGeometry(0.09, 0.34, 5, 10);
  const leftArm = new THREE.Mesh(armGeo, skinMaterial);
  leftArm.position.set(-0.33, 1.45, 0);
  leftArm.rotation.z = 0.1;
  root.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, skinMaterial);
  rightArm.position.set(0.33, 1.45, 0);
  rightArm.rotation.z = -0.1;
  root.add(rightArm);

  const legGeo = new THREE.CapsuleGeometry(0.1, 0.42, 5, 10);
  const leftLeg = new THREE.Mesh(legGeo, pantMaterial);
  leftLeg.position.set(-0.13, 0.82, 0);
  root.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, pantMaterial);
  rightLeg.position.set(0.13, 0.82, 0);
  root.add(rightLeg);

  const shoeGeo = new THREE.BoxGeometry(0.14, 0.08, 0.22);
  const leftShoe = new THREE.Mesh(shoeGeo, shoeMaterial);
  leftShoe.position.set(-0.13, 0.52, -0.04);
  root.add(leftShoe);

  const rightShoe = new THREE.Mesh(shoeGeo, shoeMaterial);
  rightShoe.position.set(0.13, 0.52, -0.04);
  root.add(rightShoe);

  const hitbox = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 1.1, 6, 10),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false
    })
  );
  hitbox.position.y = 1.2;
  root.add(hitbox);

  const nameTag = createNameTagSprite("Player");
  nameTag.position.set(0, 2.45, 0);
  root.add(nameTag);

  root.userData.hitbox = hitbox;
  root.userData.nameTag = nameTag;
  root.userData.materials = { shirtMaterial };
  root.userData.groundOffset = 0.48;
  return root;
}

function createNameTagSprite(name) {
  const canvasTag = document.createElement("canvas");
  canvasTag.width = 512;
  canvasTag.height = 128;
  const ctx = canvasTag.getContext("2d");
  const texture = new THREE.CanvasTexture(canvasTag);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(1.9, 0.46, 1);
  sprite.renderOrder = 9;
  sprite.userData = { canvas: canvasTag, ctx, texture, currentName: "", currentTeam: null };
  updateNameTagSprite(sprite, name, null);
  return sprite;
}

function updateNameTagSprite(sprite, name, team) {
  if (!sprite?.userData?.ctx) return;
  const safeName = String(name || "Player").slice(0, 20);
  if (sprite.userData.currentName === safeName && sprite.userData.currentTeam === team) return;

  sprite.userData.currentName = safeName;
  sprite.userData.currentTeam = team;

  const { canvas: canvasTag, ctx, texture } = sprite.userData;
  ctx.clearRect(0, 0, canvasTag.width, canvasTag.height);

  const bgColor = team === "alpha" ? "rgba(53, 119, 255, 0.85)" : team === "bravo" ? "rgba(255, 95, 122, 0.85)" : "rgba(22, 26, 32, 0.85)";
  ctx.fillStyle = bgColor;
  roundRect(ctx, 10, 18, canvasTag.width - 20, 94, 26);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 4;
  roundRect(ctx, 10, 18, canvasTag.width - 20, 94, 26);
  ctx.stroke();

  ctx.font = "700 46px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(safeName, canvasTag.width / 2, canvasTag.height / 2 + 1);

  texture.needsUpdate = true;
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width * 0.5, height * 0.5));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function applyRemoteTeamStyle(root, team) {
  const shirtMaterial = root?.userData?.materials?.shirtMaterial;
  if (!shirtMaterial) return;
  if (team === "alpha") shirtMaterial.color.setHex(0x3f79f0);
  else if (team === "bravo") shirtMaterial.color.setHex(0xdc5f85);
  else shirtMaterial.color.setHex(0x4f8cf6);
}

function setRemoteAliveVisual(root, alive) {
  if (!root) return;
  root.visible = alive !== false;
}

function updateHealthHud() {
  hudHealth.textContent = `Vie: ${Math.max(0, Math.round(state.health))}`;
  hudHealth.style.color = state.health <= 25 ? "#ff607f" : state.health <= 55 ? "#ffbf66" : "";
}

function updateTeamHud() {
  hudTeam.textContent = `Equipe: ${(state.team || "?").toUpperCase()}`;
  teamChoice?.querySelectorAll("button[data-team]").forEach((button) => {
    button.classList.toggle("active", button.getAttribute("data-team") === state.team);
  });
}

function setLocalAlive(alive) {
  state.isAlive = Boolean(alive);
  if (!state.isAlive) {
    state.isFiring = false;
    state.isAiming = false;
    sniperScope.classList.add("hidden");
  }
}

function updateRespawnNotice() {
  if (!state.joined || state.isAlive) {
    respawnNotice.classList.add("hidden");
    return;
  }
  const left = Math.max(0, state.respawnUntil - performance.now());
  const seconds = Math.ceil(left / 1000);
  respawnNotice.textContent = `Vous etes mort. Respawn dans ${seconds}s...`;
  respawnNotice.classList.remove("hidden");
}

const localBody = createPlayerMesh(true);
localBody.visible = false;
scene.add(localBody);
const bullets = [];
const flashes = [];
const impacts = [];
const raycaster = new THREE.Raycaster();

const clock = new THREE.Clock();
let lastNetworkSend = 0;
const smoothedMoveVelocity = new THREE.Vector3();
let hitmarkerTimer = null;

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

function createViewModel() {
  const group = new THREE.Group();
  group.position.set(0.3, -0.31, -0.52);
  group.rotation.set(-0.14, -0.22, -0.1);

  const armMaterial = new THREE.MeshStandardMaterial({ color: 0xd1a57b, roughness: 0.82 });
  const sleeveMaterial = new THREE.MeshStandardMaterial({ color: 0x2b3f66, roughness: 0.88 });
  const metalDark = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.45, metalness: 0.35 });
  const metalAccent = new THREE.MeshStandardMaterial({ color: 0x6f6f77, roughness: 0.35, metalness: 0.65 });
  const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x6f4a2a, roughness: 0.8, metalness: 0.05 });
  const scopeGlass = new THREE.MeshStandardMaterial({
    color: 0x4cb7ff,
    roughness: 0.15,
    metalness: 0.25,
    transparent: true,
    opacity: 0.78
  });

  const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.36, 6, 12), armMaterial);
  forearm.rotation.z = 0.85;
  forearm.rotation.x = -0.16;
  forearm.position.set(-0.12, -0.16, 0.14);
  group.add(forearm);

  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.22, 12), sleeveMaterial);
  sleeve.rotation.z = 0.9;
  sleeve.rotation.x = -0.2;
  sleeve.position.set(-0.18, -0.22, 0.2);
  group.add(sleeve);

  const ak47 = new THREE.Group();
  const akReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.15, 0.52), metalDark);
  akReceiver.position.set(-0.03, -0.19, -0.27);
  akReceiver.rotation.y = -0.035;
  ak47.add(akReceiver);
  const akDustCover = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.34), metalAccent);
  akDustCover.position.set(-0.03, -0.11, -0.27);
  akDustCover.rotation.y = -0.03;
  ak47.add(akDustCover);
  const akFrontBlock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.12), metalAccent);
  akFrontBlock.position.set(-0.02, -0.16, -0.58);
  ak47.add(akFrontBlock);
  const akBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.66, 14), metalAccent);
  akBarrel.rotation.x = Math.PI / 2;
  akBarrel.position.set(-0.02, -0.18, -0.78);
  ak47.add(akBarrel);
  const akMuzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.05, 12), metalDark);
  akMuzzleBrake.rotation.x = Math.PI / 2;
  akMuzzleBrake.position.set(-0.02, -0.18, -1.11);
  ak47.add(akMuzzleBrake);
  const akGasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.42, 10), metalAccent);
  akGasTube.rotation.x = Math.PI / 2;
  akGasTube.position.set(-0.02, -0.13, -0.66);
  ak47.add(akGasTube);
  const akHandguard = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.28), woodMaterial);
  akHandguard.position.set(-0.02, -0.2, -0.54);
  ak47.add(akHandguard);
  const akGrip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.08), woodMaterial);
  akGrip.position.set(-0.07, -0.31, -0.12);
  akGrip.rotation.z = 0.23;
  ak47.add(akGrip);
  const akMagazine = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.27, 0.11), metalDark);
  akMagazine.position.set(-0.01, -0.34, -0.23);
  akMagazine.rotation.z = -0.26;
  akMagazine.rotation.x = 0.06;
  ak47.add(akMagazine);
  const akStock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.26), woodMaterial);
  akStock.position.set(-0.04, -0.23, 0.08);
  akStock.rotation.x = -0.2;
  ak47.add(akStock);
  const akRearSight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.045), metalAccent);
  akRearSight.position.set(-0.03, -0.09, -0.12);
  ak47.add(akRearSight);

  const shotgun = new THREE.Group();
  shotgun.position.set(-0.015, -0.005, 0.01);
  const sgBody = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.15, 0.5), metalDark);
  sgBody.position.set(-0.03, -0.2, -0.24);
  shotgun.add(sgBody);
  const sgBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.78, 12), metalAccent);
  sgBarrel.rotation.x = Math.PI / 2;
  sgBarrel.position.set(-0.03, -0.19, -0.72);
  shotgun.add(sgBarrel);
  const sgPump = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.2), woodMaterial);
  sgPump.position.set(-0.03, -0.24, -0.5);
  shotgun.add(sgPump);
  const sgStock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.22), woodMaterial);
  sgStock.position.set(-0.04, -0.23, 0.02);
  sgStock.rotation.x = -0.18;
  shotgun.add(sgStock);

  const sniper = new THREE.Group();
  sniper.position.set(0.005, -0.01, 0.015);
  const snBody = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.82), metalDark);
  snBody.position.set(-0.02, -0.19, -0.34);
  sniper.add(snBody);
  const snBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.92, 12), metalAccent);
  snBarrel.rotation.x = Math.PI / 2;
  snBarrel.position.set(-0.015, -0.18, -0.84);
  sniper.add(snBarrel);
  const snScopeBody = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.36, 16), metalAccent);
  snScopeBody.rotation.x = Math.PI / 2;
  snScopeBody.position.set(-0.015, -0.1, -0.41);
  sniper.add(snScopeBody);
  const snScopeLens = new THREE.Mesh(new THREE.CircleGeometry(0.038, 20), scopeGlass);
  snScopeLens.position.set(-0.015, -0.1, -0.23);
  sniper.add(snScopeLens);
  const snStock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.11, 0.28), woodMaterial);
  snStock.position.set(-0.03, -0.24, 0.02);
  snStock.rotation.x = -0.22;
  sniper.add(snStock);

  group.add(ak47);
  group.add(shotgun);
  group.add(sniper);

  const muzzleAk = new THREE.Object3D();
  muzzleAk.position.set(-0.02, -0.18, -1.15);
  ak47.add(muzzleAk);

  const muzzleShotgun = new THREE.Object3D();
  muzzleShotgun.position.set(-0.03, -0.19, -1.04);
  shotgun.add(muzzleShotgun);

  const muzzleSniper = new THREE.Object3D();
  muzzleSniper.position.set(-0.015, -0.18, -1.19);
  sniper.add(muzzleSniper);

  group.userData.weaponModels = { ak47, shotgun, sniper };
  group.userData.muzzles = { ak47: muzzleAk, shotgun: muzzleShotgun, sniper: muzzleSniper };
  group.userData.activeMuzzle = muzzleAk;
  group.userData.activeWeapon = "ak47";

  return group;
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
      setLocalAlive(msg.alive !== false);
      if (msg.spawn) {
        camera.position.set(msg.spawn.x, state.playerHeight + getGroundHeightAt(msg.spawn.x, msg.spawn.z), msg.spawn.z);
      }
      setActiveWeaponModel(state.weapon);
      weaponChoice.querySelectorAll("button").forEach((b) => {
        b.classList.toggle("active", b.getAttribute("data-weapon") === state.weapon);
      });
      updateTeamHud();
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

    if (msg.type === "player:update") {
      if (!msg.id) return;
      if (msg.id === state.playerId) return;
      let remotePlayer = remoteMeshes.get(msg.id);
      if (!remotePlayer) {
        const root = createPlayerMesh(false);
        scene.add(root);
        remotePlayer = { root };
        remoteMeshes.set(msg.id, remotePlayer);
      }
      remotePlayer.id = msg.id;
      remotePlayer.team = msg.team || remotePlayer.team || null;
      remotePlayer.root.userData.playerId = msg.id;
      if (remotePlayer.root.userData.hitbox) {
        remotePlayer.root.userData.hitbox.userData.playerId = msg.id;
      }
      if (msg.position) {
        const groundOffset = Number(remotePlayer.root.userData.groundOffset) || 0;
        remotePlayer.root.position.set(msg.position.x, msg.position.y - groundOffset, msg.position.z);
        remotePlayer.root.rotation.y = msg.rotationY || 0;
      }
      setRemoteAliveVisual(remotePlayer.root, msg.alive !== false);
      if (msg.name || msg.team) {
        const nameTag = remotePlayer.root.userData.nameTag;
        updateNameTagSprite(nameTag, msg.name || "Player", msg.team || null);
        applyRemoteTeamStyle(remotePlayer.root, msg.team);
      }
      return;
    }

    if (msg.type === "player:health") {
      state.health = Number(msg.health) || 0;
      updateHealthHud();
      return;
    }

    if (msg.type === "player:died") {
      if (msg.id === state.playerId) {
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
        camera.position.set(
          msg.spawn.x,
          state.playerHeight + getGroundHeightAt(msg.spawn.x, msg.spawn.z),
          msg.spawn.z
        );
      }
      state.health = Number(msg.health) || 100;
      state.respawnUntil = 0;
      setLocalAlive(msg.alive !== false);
      updateHealthHud();
      return;
    }

    if (msg.type === "player:shoot") {
      if (!msg.id || msg.id === state.playerId) return;
      if (!msg.origin || !Array.isArray(msg.shots)) return;
      spawnMuzzleFlash(msg.origin);
      msg.shots.forEach((shot) => {
        if (!shot?.direction) return;
        const range = Number(shot.range) || 80;
        const bulletSpeed = Number(shot.bulletSpeed) || 68;
        const impact = traceImpact(msg.origin, shot.direction, range, false, 0);
        const maxTravel = impact?.distance || range;
        spawnBulletVisual(msg.origin, shot.direction, false, bulletSpeed, maxTravel);
      });
    }
  });
}

function renderRooms(rooms) {
  roomsList.innerHTML = "";
  rooms.forEach((room) => {
    const item = document.createElement("article");
    item.className = `room-item ${room.count >= room.max ? "full" : ""}`;
    item.innerHTML = `<strong>${room.id}</strong><span>${room.count}/${room.max}</span>`;
    const btn = document.createElement("button");
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
  pauseMenu.classList.add("hidden");
  hudRoom.textContent = state.roomId;
  updateTeamHud();
  hudWeapon.textContent = `Arme: ${weaponLabel(state.weapon)}`;
  updateHealthHud();
  updateRespawnNotice();
}

function setPauseMenu(open) {
  if (!state.joined) return;
  state.pauseOpen = open;
  pauseMenu.classList.toggle("hidden", !open);
  crosshair.classList.toggle("hidden", open);
  sniperScope.classList.add("hidden");
  if (open) {
    state.keys.clear();
    state.isFiring = false;
    state.isAiming = false;
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
  }
}

function togglePauseMenu() {
  setPauseMenu(!state.pauseOpen);
}

function weaponLabel(w) {
  return WEAPON_STATS[w]?.label || WEAPON_STATS.ak47.label;
}

function getWeaponStats(weapon = state.weapon) {
  return WEAPON_STATS[weapon] || WEAPON_STATS.ak47;
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
    updateTeamHud();
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
    let remotePlayer = remoteMeshes.get(p.id);
    if (!remotePlayer) {
      const root = createPlayerMesh(false);
      scene.add(root);
      remotePlayer = { root };
      remoteMeshes.set(p.id, remotePlayer);
    }
    remotePlayer.id = p.id;
    remotePlayer.team = p.team || remotePlayer.team || null;
    remotePlayer.root.userData.playerId = p.id;
    if (remotePlayer.root.userData.hitbox) {
      remotePlayer.root.userData.hitbox.userData.playerId = p.id;
    }
    if (p.position) {
      const groundOffset = Number(remotePlayer.root.userData.groundOffset) || 0;
      remotePlayer.root.position.set(p.position.x, p.position.y - groundOffset, p.position.z);
      remotePlayer.root.rotation.y = p.rotationY || 0;
    }
    updateNameTagSprite(remotePlayer.root.userData.nameTag, p.name || "Player", p.team || null);
    applyRemoteTeamStyle(remotePlayer.root, p.team);
    setRemoteAliveVisual(remotePlayer.root, p.alive !== false);
  });

  const html = players
    .map((p) => {
      const life = p.alive === false ? "MORT" : `${Math.max(0, Number(p.health) || 0)}PV`;
      const score = `${Number(p.kills) || 0}/${Number(p.deaths) || 0}`;
      return `<li>${p.name} - ${p.team} - ${weaponLabel(p.weapon)} - ${life} - K/D ${score}</li>`;
    })
    .join("");
  playerList.innerHTML = `<strong>Joueurs (${players.length}/10)</strong><ul>${html}</ul>`;
}

weaponChoice.addEventListener("click", (event) => {
  const target = event.target.closest("button[data-weapon]");
  if (!target) return;
  const weapon = target.getAttribute("data-weapon");
  state.weapon = weapon;
  state.isAiming = false;
  setActiveWeaponModel(weapon);
  weaponChoice.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
  target.classList.add("active");
  hudWeapon.textContent = `Arme: ${weaponLabel(weapon)}`;
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: "weapon:select", weapon }));
  }
});

teamChoice?.addEventListener("click", (event) => {
  const target = event.target.closest("button[data-team]");
  if (!target) return;
  const team = target.getAttribute("data-team");
  if (!team || team === state.team) return;
  state.team = team;
  updateTeamHud();
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: "team:select", team }));
  }
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.addEventListener("keydown", (e) => {
  if (e.code === "Escape" && state.joined) {
    e.preventDefault();
    togglePauseMenu();
    return;
  }
  state.keys.add(e.code);
  if (e.code === "Space" && state.joined && !state.pauseOpen && state.onGround) {
    if (!state.isAlive) return;
    state.verticalVelocity = state.jumpSpeed;
    state.onGround = false;
  }
});
document.addEventListener("keyup", (e) => state.keys.delete(e.code));
document.addEventListener("contextmenu", (e) => {
  if (state.joined) e.preventDefault();
});
document.addEventListener("mousemove", (e) => {
  if (!state.joined || document.pointerLockElement !== canvas) return;
  state.yaw -= e.movementX * 0.0025;
  state.pitch -= e.movementY * 0.002;
  state.pitch = Math.max(-1.4, Math.min(1.4, state.pitch));
});
document.addEventListener("pointerlockchange", () => {
  if (!state.joined) return;
  const lockedOnCanvas = document.pointerLockElement === canvas;
  if (!lockedOnCanvas && !state.pauseOpen) {
    setPauseMenu(true);
  }
});

canvas.addEventListener("click", () => {
  if (state.joined && !state.pauseOpen && document.pointerLockElement !== canvas) {
    canvas.requestPointerLock();
  }
});
canvas.addEventListener("mousedown", (event) => {
  if (event.button !== 0) return;
  if (!state.joined || state.pauseOpen || !state.isAlive || document.pointerLockElement !== canvas) return;
  const stats = getWeaponStats();
  state.isFiring = true;
  shoot();
  if (!stats.auto) state.isFiring = false;
});
canvas.addEventListener("mousedown", (event) => {
  if (event.button !== 2) return;
  if (!state.joined || state.pauseOpen || !state.isAlive) return;
  state.isAiming = true;
});
canvas.addEventListener("mouseup", (event) => {
  if (event.button === 0) state.isFiring = false;
  if (event.button === 2) state.isAiming = false;
});
window.addEventListener("blur", () => {
  state.isFiring = false;
  state.isAiming = false;
});
resumeBtn.addEventListener("click", () => {
  setPauseMenu(false);
  canvas.requestPointerLock();
});

function updateMovement(delta) {
  if (!state.joined || state.pauseOpen || !state.isAlive) {
    smoothedMoveVelocity.set(0, 0, 0);
    return;
  }
  const previousPos = camera.position.clone();
  const fwd = Number(state.keys.has("KeyW")) - Number(state.keys.has("KeyS"));
  const right = Number(state.keys.has("KeyD")) - Number(state.keys.has("KeyA"));
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.y = 0;
  dir.normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
  const isSprinting = state.keys.has("ShiftLeft") || state.keys.has("ShiftRight");
  const speedMultiplier = isSprinting ? state.sprintMultiplier : 1;
  const currentMoveSpeed = state.moveSpeed * speedMultiplier;

  const targetVelocity = new THREE.Vector3()
    .addScaledVector(dir, fwd * currentMoveSpeed)
    .addScaledVector(side, right * currentMoveSpeed);
  const hasInput = fwd !== 0 || right !== 0;
  const smoothing = Math.min(delta * (hasInput ? 14 : 10), 1);
  smoothedMoveVelocity.lerp(targetVelocity, smoothing);

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

  const horizontalSpeed = smoothedMoveVelocity.length();
  const isMoving = horizontalSpeed > 0.3 ? 1 : 0;
  state.movementBlend = THREE.MathUtils.lerp(state.movementBlend, isMoving, Math.min(delta * 12, 1));
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
}

function isCollidingAt(x, z, playerBottom, playerTop) {
  for (const box of staticBlockColliders) {
    if (playerTop <= box.min.y || playerBottom >= box.max.y) continue;
    const closestX = THREE.MathUtils.clamp(x, box.min.x, box.max.x);
    const closestZ = THREE.MathUtils.clamp(z, box.min.z, box.max.z);
    const deltaX = x - closestX;
    const deltaZ = z - closestZ;
    const distSq = deltaX * deltaX + deltaZ * deltaZ;
    if (distSq < playerCollisionRadius * playerCollisionRadius) return true;
  }
  return false;
}

function getGroundHeightAt(x, z, feetY = 0) {
  const rampSnapTolerance = 0.2;
  const platformSnapTolerance = 0.35;
  const halfPlatformW = mapConfig.platform.width / 2;
  const halfPlatformD = mapConfig.platform.depth / 2;
  const halfRampD = mapConfig.ramp.depth / 2;
  const halfRampW = mapConfig.ramp.width / 2;

  if (Math.abs(x) <= halfPlatformW && Math.abs(z) <= halfPlatformD) {
    return feetY >= mapConfig.platform.topY - platformSnapTolerance ? mapConfig.platform.topY : 0;
  }

  const leftCenterX = -(halfPlatformW + halfRampW);
  if (x >= leftCenterX - halfRampW && x <= leftCenterX + halfRampW && Math.abs(z) <= halfRampD) {
    const localX = x - (leftCenterX - halfRampW);
    const rampHeight = THREE.MathUtils.clamp(
      (localX / mapConfig.ramp.width) * mapConfig.ramp.topY,
      mapConfig.ramp.baseY,
      mapConfig.ramp.topY
    );
    return feetY >= rampHeight - rampSnapTolerance ? rampHeight : 0;
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
    return feetY >= rampHeight - rampSnapTolerance ? rampHeight : 0;
  }

  return 0;
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

  updateZoomState();
  updateRespawnNotice();
  camera.rotation.set(state.pitch, state.yaw, 0, "YXZ");
  updateMovement(delta);
  if (
    state.isFiring &&
    getWeaponStats().auto &&
    !state.pauseOpen &&
    document.pointerLockElement === canvas
  ) {
    shoot();
  }
  animateViewModel(delta);
  updateBullets(delta);
  updateFlashes(delta);
  updateImpacts(delta);
  sendPlayerUpdate();

  renderer.render(scene, camera);
}

function animateViewModel(delta) {
  const t = performance.now() * 0.001;
  const intensity = state.movementBlend;
  const sprinting =
    state.joined &&
    state.isAlive &&
    !state.pauseOpen &&
    (state.keys.has("ShiftLeft") || state.keys.has("ShiftRight"));
  const sprintFactor = sprinting ? 1.7 : 1;
  const bobX = 0.008 * sprintFactor;
  const bobY = 0.008 * sprintFactor;
  const bobRotZ = 0.014 * sprintFactor;
  const bobRotX = 0.01 * sprintFactor;
  const bobRotY = 0.008 * sprintFactor;

  viewModel.position.x = 0.3 + Math.sin(t * 9.5 * sprintFactor) * bobX * intensity;
  viewModel.position.y =
    -0.31 + Math.cos(t * 7.5 * sprintFactor) * bobY * intensity + (state.onGround ? 0 : -0.03);
  viewModel.position.z = -0.52 + Math.sin(t * 15 * sprintFactor) * 0.004 * intensity;
  viewModel.rotation.z = Math.sin(t * 8.5 * sprintFactor) * bobRotZ * intensity;
  viewModel.rotation.x = -0.02 + Math.cos(t * 8 * sprintFactor) * bobRotX * intensity;
  viewModel.rotation.y = -0.22 + Math.sin(t * 6.7 * sprintFactor) * bobRotY * intensity;
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
  const shots = [];

  for (let i = 0; i < stats.pellets; i += 1) {
    const spreadX = (Math.random() - 0.5) * stats.spread;
    const spreadY = (Math.random() - 0.5) * stats.spread;
    const shotDirection = baseDirection
      .clone()
      .add(new THREE.Vector3(spreadX, spreadY, 0))
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
  const hitRemote = remoteMeshes.get(hitPlayerId);
  if (hitRemote?.team && state.team && hitRemote.team === state.team) return hit;
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
    flash.mesh.material.opacity = Math.max(0, flash.life / 0.06);
    if (flash.life <= 0) {
      scene.remove(flash.mesh);
      flash.mesh.geometry.dispose();
      flash.mesh.material.dispose();
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
