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
  bulletSpeed: 300,
  bulletLife: 1.1,
  verticalVelocity: 0,
  onGround: true,
  movementBlend: 0,
  lastShotAt: 0,
  lastJumpPadBoostAt: 0,
  isFiring: false,
  isAiming: false,
  health: 100,
  isAlive: true,
  grenadesHeld: 0,
  respawnUntil: 0,
  respawnDelayMs: 3200,
  deathKillerId: null,
  deathKillerName: "",
  joined: false,
  pauseOpen: false,
  grenadeSequence: 0,
  lastGrenadePickupAttemptAt: 0,
  viewRecoilZ: 0,
  viewRecoilY: 0,
  viewRecoilRotX: 0,
  viewRecoilRotZ: 0
};

const BASE_FOV = 74;
const PLAYER_NAME_STORAGE_KEY = "fps.playerName";
const MAP_HALF_SIZE = 40;
const REMOTE_INTERP_SPEED = 12;
const VIEW_RECOIL_DECAY = 15;
const VIEW_RECOIL_BOB_SUPPRESS_K = 0.48;
const VIEW_RECOIL_NORM_CAP = 0.16;
const WEAPON_STATS = {
  shotgun: {
    label: "Fusil a pompe",
    fireRate: 1.0,
    pellets: 6,
    spread: 0.07,
    damage: 14,
    range: 22,
    bulletSpeed: 120,
    auto: false,
    zoomFov: BASE_FOV,
    viewRecoil: { z: 0.135, y: -0.02, rotX: 0.078, rotZ: 0.05 }
  },
  ak47: {
    label: "AK47",
    fireRate: 8.2,
    pellets: 1,
    spread: 0.017,
    damage: 20,
    range: 58,
    bulletSpeed: 145,
    auto: true,
    zoomFov: BASE_FOV,
    viewRecoil: { z: 0.042, y: -0.006, rotX: 0.032, rotZ: 0.02 }
  },
  sniper: {
    label: "Sniper",
    fireRate: 0.72,
    pellets: 1,
    spread: 0.002,
    damage: 92,
    range: 125,
    bulletSpeed: 210,
    auto: false,
    zoomFov: 28,
    viewRecoil: { z: 0.158, y: -0.014, rotX: 0.068, rotZ: 0.028 }
  }
};
const GRENADE_CONFIG = {
  pickupRadius: 1.7,
  radius: 0.18,
  gravity: 24,
  throwSpeed: 16,
  fuseMs: 1600,
  blastRadius: 8.5,
  bounceDamping: 0.62,
  friction: 0.84,
  minVerticalBounce: 1.4,
  minHorizontalSpeed: 0.2
};

const menu = document.getElementById("menu");
const roomsList = document.getElementById("roomsList");
const nameInput = document.getElementById("nameInput");
const weaponChoice = document.getElementById("weaponChoice");
const pauseMenuOverlay = document.getElementById("pauseMenuOverlay");
const pauseMenu = document.getElementById("pauseMenu");
const resumeBtn = document.getElementById("resumeBtn");
const hud = document.getElementById("hud");
const crosshair = document.getElementById("crosshair");
const damageOverlay = document.getElementById("damageOverlay");
const hitmarker = document.getElementById("hitmarker");
const sniperScope = document.getElementById("sniperScope");
const playerList = document.getElementById("playerList");
const hudRoom = document.getElementById("hudRoom");
const hudTeam = document.getElementById("hudTeam");
const hudWeapon = document.getElementById("hudWeapon");
const hudWeaponName = document.getElementById("hudWeaponName");
const hudGrenade = document.getElementById("hudGrenade");
const hudHealth = document.getElementById("hudHealth");
const hudHealthFill = document.getElementById("hudHealthFill");
const respawnNotice = document.getElementById("respawnNotice");
const deathScreen = document.getElementById("deathScreen");
const deathKillerName = document.getElementById("deathKillerName");
const deathCountdown = document.getElementById("deathCountdown");
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

addJumpPad(-26, 0, 0x68e6ff);
addJumpPad(26, 0, 0x7fff95);
addJumpPad(0, -30, 0xff89cf);
addJumpPad(0, 30, 0xffd05a);
addSpinnerProp(-14, -14, 0x74f7ff);
addSpinnerProp(14, 14, 0xff8ad7);
addSpinnerProp(-14, 14, 0xffd673);
addSpinnerProp(14, -14, 0x8cff7b);

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

  const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xd9ad84, roughness: 0.78, flatShading: true });
  const shirtMaterial = new THREE.MeshStandardMaterial({ color: 0x4f8cf6, roughness: 0.75, flatShading: true });
  const pantMaterial = new THREE.MeshStandardMaterial({ color: 0x1e2f4f, roughness: 0.88, flatShading: true });
  const shoeMaterial = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.95, flatShading: true });
  const accMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8, flatShading: true });
  const visorMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.8, flatShading: true });

  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 1.44, 0);

  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.3), shirtMaterial);
  chest.position.y = 0.1;
  torsoGroup.add(chest);

  const abdomen = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.25), shirtMaterial);
  abdomen.position.y = -0.25;
  torsoGroup.add(abdomen);

  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.1, 0.28), accMaterial);
  belt.position.y = -0.35;
  torsoGroup.add(belt);

  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.2), accMaterial);
  backpack.position.set(0, 0, -0.2);
  torsoGroup.add(backpack);
  
  root.add(torsoGroup);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.95, 0);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skinMaterial);
  headGroup.add(head);

  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.15, 0.32), accMaterial);
  helmet.position.y = 0.12;
  headGroup.add(helmet);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.1), visorMaterial);
  visor.position.set(0, 0, 0.15);
  headGroup.add(visor);
  
  root.add(headGroup);

  const armGeo = new THREE.BoxGeometry(0.15, 0.45, 0.15);
  const handGeo = new THREE.BoxGeometry(0.12, 0.15, 0.12);
  
  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(-0.35, 1.65, 0);
  const leftArm = new THREE.Mesh(armGeo, shirtMaterial);
  leftArm.position.y = -0.225;
  leftArmGroup.add(leftArm);
  const leftHand = new THREE.Mesh(handGeo, skinMaterial);
  leftHand.position.y = -0.525;
  leftArmGroup.add(leftHand);
  leftArmGroup.rotation.z = 0.1;
  root.add(leftArmGroup);

  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(0.35, 1.65, 0);
  const rightArm = new THREE.Mesh(armGeo, shirtMaterial);
  rightArm.position.y = -0.225;
  rightArmGroup.add(rightArm);
  const rightHand = new THREE.Mesh(handGeo, skinMaterial);
  rightHand.position.y = -0.525;
  rightArmGroup.add(rightHand);
  
  const gunMaterial = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7, flatShading: true });
  const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.45), gunMaterial);
  gunBody.position.set(0, -0.525, 0.15);
  rightArmGroup.add(gunBody);
  const gunBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), gunMaterial);
  gunBarrel.position.set(0, -0.48, 0.45);
  rightArmGroup.add(gunBarrel);
  
  rightArmGroup.rotation.z = -0.1;
  root.add(rightArmGroup);

  const legGeo = new THREE.BoxGeometry(0.18, 0.5, 0.18);
  const leftLegGroup = new THREE.Group();
  leftLegGroup.position.set(-0.15, 0.9, 0);
  const leftLeg = new THREE.Mesh(legGeo, pantMaterial);
  leftLeg.position.y = -0.25;
  leftLegGroup.add(leftLeg);
  const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.25), shoeMaterial);
  leftShoe.position.set(0, -0.575, 0.03);
  leftLegGroup.add(leftShoe);
  root.add(leftLegGroup);

  const rightLegGroup = new THREE.Group();
  rightLegGroup.position.set(0.15, 0.9, 0);
  const rightLeg = new THREE.Mesh(legGeo, pantMaterial);
  rightLeg.position.y = -0.25;
  rightLegGroup.add(rightLeg);
  const rightShoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.25), shoeMaterial);
  rightShoe.position.set(0, -0.575, 0.03);
  rightLegGroup.add(rightShoe);
  root.add(rightLegGroup);

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
  
  root.userData.parts = {
    torso: torsoGroup,
    head: headGroup,
    leftArm: leftArmGroup,
    rightArm: rightArmGroup,
    leftLeg: leftLegGroup,
    rightLeg: rightLegGroup
  };

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
  sprite.userData = { canvas: canvasTag, ctx, texture, currentName: "", currentColor: "" };
  updateNameTagSprite(sprite, name, null);
  return sprite;
}

function colorFromPlayerId(playerId) {
  const key = String(playerId || "default");
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  const color = new THREE.Color();
  color.setHSL(hue / 360, 0.62, 0.56);
  return color;
}

function toRgbaString(color, alpha = 1) {
  const r = Math.round(THREE.MathUtils.clamp(color.r, 0, 1) * 255);
  const g = Math.round(THREE.MathUtils.clamp(color.g, 0, 1) * 255);
  const b = Math.round(THREE.MathUtils.clamp(color.b, 0, 1) * 255);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function updateNameTagSprite(sprite, name, playerColor) {
  if (!sprite?.userData?.ctx) return;
  const safeName = String(name || "Player").slice(0, 20);
  const bgColor = playerColor || new THREE.Color(0x3d5a85);
  const bgColorKey = bgColor.getHexString();
  if (sprite.userData.currentName === safeName && sprite.userData.currentColor === bgColorKey) return;

  sprite.userData.currentName = safeName;
  sprite.userData.currentColor = bgColorKey;

  const { canvas: canvasTag, ctx, texture } = sprite.userData;
  ctx.clearRect(0, 0, canvasTag.width, canvasTag.height);

  ctx.fillStyle = toRgbaString(bgColor, 0.88);
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

function applyRemoteTeamStyle(root, team, playerId) {
  const shirtMaterial = root?.userData?.materials?.shirtMaterial;
  if (!shirtMaterial) return;
  const playerColor = colorFromPlayerId(playerId);
  shirtMaterial.color.copy(playerColor);
}

function setRemoteAliveVisual(root, alive) {
  if (!root) return;
  root.visible = alive !== false;
}

function updateHealthHud() {
  const clampedHealth = THREE.MathUtils.clamp(Math.round(state.health), 0, 100);
  hudHealth.textContent = `Vie: ${clampedHealth}`;
  hudHealth.style.color = clampedHealth <= 25 ? "#ff607f" : clampedHealth <= 55 ? "#ffbf66" : "";
  if (hudHealthFill) {
    const ratio = clampedHealth / 100;
    hudHealthFill.style.transform = `scaleX(${ratio})`;
    hudHealthFill.style.filter = clampedHealth <= 25 ? "brightness(0.85)" : "";
  }
}

function updateTeamHud() {
  hudTeam.textContent = "Mode: Chacun pour soi";
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
    sniperScope.classList.add("hidden");
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
    return;
  }
  state.deathKillerId = null;
  state.deathKillerName = "";
  deathScreen?.classList.add("hidden");
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
    Math.sin(killer.root.rotation.y || 0),
    0,
    Math.cos(killer.root.rotation.y || 0)
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
  const akReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.45), metalDark);
  akReceiver.position.set(-0.02, -0.19, -0.27);
  ak47.add(akReceiver);
  
  const akDustCover = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.35), metalAccent);
  akDustCover.position.set(-0.02, -0.11, -0.27);
  ak47.add(akDustCover);

  const akBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 8), metalAccent);
  akBarrel.rotation.x = Math.PI / 2;
  akBarrel.position.set(-0.02, -0.16, -0.75);
  ak47.add(akBarrel);

  const akGasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.35, 8), metalAccent);
  akGasTube.rotation.x = Math.PI / 2;
  akGasTube.position.set(-0.02, -0.12, -0.65);
  ak47.add(akGasTube);

  const akHandguard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.25), woodMaterial);
  akHandguard.position.set(-0.02, -0.15, -0.6);
  ak47.add(akHandguard);

  const akGrip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.05), woodMaterial);
  akGrip.position.set(-0.02, -0.3, -0.15);
  akGrip.rotation.x = -0.2;
  ak47.add(akGrip);

  const akMag = new THREE.Group();
  const magTop = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.15, 0.08), metalDark);
  magTop.position.set(0, -0.05, 0);
  const magBot = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.15, 0.08), metalDark);
  magBot.position.set(0, -0.18, 0.03);
  magBot.rotation.x = 0.25;
  akMag.add(magTop);
  akMag.add(magBot);
  akMag.position.set(-0.02, -0.25, -0.35);
  akMag.rotation.x = 0.1;
  ak47.add(akMag);

  const akStock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.11, 0.22), woodMaterial);
  akStock.position.set(-0.02, -0.22, 0.05);
  akStock.rotation.x = -0.15;
  ak47.add(akStock);

  const akFrontSight = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.05, 0.02), metalDark);
  akFrontSight.position.set(-0.02, -0.13, -0.98);
  ak47.add(akFrontSight);
  
  const akRearSight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.03), metalDark);
  akRearSight.position.set(-0.02, -0.08, -0.4);
  ak47.add(akRearSight);

  const shotgun = new THREE.Group();
  shotgun.position.set(-0.015, -0.005, 0.01);
  
  const sgBody = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.4), metalDark);
  sgBody.position.set(-0.02, -0.18, -0.25);
  shotgun.add(sgBody);

  const sgBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.7, 8), metalAccent);
  sgBarrel.rotation.x = Math.PI / 2;
  sgBarrel.position.set(-0.02, -0.14, -0.75);
  shotgun.add(sgBarrel);
  
  const sgTube = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.65, 8), metalDark);
  sgTube.rotation.x = Math.PI / 2;
  sgTube.position.set(-0.02, -0.18, -0.72);
  shotgun.add(sgTube);

  const sgPump = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.2), woodMaterial);
  sgPump.position.set(-0.02, -0.18, -0.65);
  shotgun.add(sgPump);

  const sgStock = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.25), woodMaterial);
  sgStock.position.set(-0.02, -0.22, 0.05);
  sgStock.rotation.x = -0.15;
  shotgun.add(sgStock);
  
  const sgGrip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.06), woodMaterial);
  sgGrip.position.set(-0.02, -0.26, -0.12);
  sgGrip.rotation.x = -0.3;
  shotgun.add(sgGrip);

  const sniper = new THREE.Group();
  sniper.position.set(0.005, -0.01, 0.015);
  
  const snBody = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.5), woodMaterial);
  snBody.position.set(-0.02, -0.18, -0.35);
  sniper.add(snBody);
  
  const snAction = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.3), metalDark);
  snAction.position.set(-0.02, -0.12, -0.35);
  sniper.add(snAction);

  const snBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.8, 8), metalAccent);
  snBarrel.rotation.x = Math.PI / 2;
  snBarrel.position.set(-0.02, -0.14, -0.85);
  sniper.add(snBarrel);
  
  const snMuzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 8), metalDark);
  snMuzzle.rotation.x = Math.PI / 2;
  snMuzzle.position.set(-0.02, -0.14, -1.25);
  sniper.add(snMuzzle);

  const snScope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 12), metalDark);
  snScope.rotation.x = Math.PI / 2;
  snScope.position.set(-0.02, -0.04, -0.35);
  sniper.add(snScope);
  
  const snScopeMount1 = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.04, 0.02), metalDark);
  snScopeMount1.position.set(-0.02, -0.07, -0.25);
  sniper.add(snScopeMount1);
  const snScopeMount2 = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.04, 0.02), metalDark);
  snScopeMount2.position.set(-0.02, -0.07, -0.45);
  sniper.add(snScopeMount2);

  const snScopeLens = new THREE.Mesh(new THREE.CircleGeometry(0.025, 12), scopeGlass);
  snScopeLens.position.set(-0.02, -0.04, -0.17);
  sniper.add(snScopeLens);

  const snStock = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.3), woodMaterial);
  snStock.position.set(-0.02, -0.2, -0.05);
  snStock.rotation.x = -0.1;
  sniper.add(snStock);
  
  const snCheek = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.12), metalDark);
  snCheek.position.set(-0.02, -0.13, -0.1);
  sniper.add(snCheek);

  group.add(ak47);
  group.add(shotgun);
  group.add(sniper);

  const muzzleAk = new THREE.Object3D();
  muzzleAk.position.set(-0.02, -0.16, -1.05);
  ak47.add(muzzleAk);

  const muzzleShotgun = new THREE.Object3D();
  muzzleShotgun.position.set(-0.03, -0.14, -1.1);
  shotgun.add(muzzleShotgun);

  const muzzleSniper = new THREE.Object3D();
  muzzleSniper.position.set(-0.015, -0.14, -1.3);
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
      state.grenadesHeld = Math.max(0, Math.min(1, Number(msg.grenades) || 0));
      setLocalAlive(msg.alive !== false);
      if (msg.spawn) {
        applyLocalSpawn(msg.spawn);
      }
      setActiveWeaponModel(state.weapon);
      weaponChoice.querySelectorAll("button").forEach((b) => {
        b.classList.toggle("active", b.getAttribute("data-weapon") === state.weapon);
      });
      updateTeamHud();
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
      if (msg.id === state.playerId) {
        state.deathKillerId = msg.killerId || null;
        state.deathKillerName = String(msg.killerName || "Inconnu");
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
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
      }
      updateHealthHud();
      updateGrenadeHud();
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
  pauseMenuOverlay.classList.add("hidden");
  hudRoom.textContent = state.roomId;
  updateTeamHud();
  updateWeaponHud();
  updateGrenadeHud();
  updateHealthHud();
  updateRespawnNotice();
}

function setPauseMenu(open) {
  if (!state.joined) return;
  state.pauseOpen = open;
  pauseMenuOverlay.classList.toggle("hidden", !open);
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

function updateWeaponHud(weapon = state.weapon) {
  if (!hudWeapon) return;
  const key = WEAPON_STATS[weapon] ? weapon : "ak47";
  hudWeapon.dataset.weapon = key;
  hudWeapon.classList.remove("hud-weapon--ak47", "hud-weapon--shotgun", "hud-weapon--sniper");
  hudWeapon.classList.add(`hud-weapon--${key}`);
  hudWeapon.querySelectorAll(".hud-weapon__svg").forEach((svg) => {
    svg.classList.toggle("is-active", svg.classList.contains(`hud-weapon__svg--${key}`));
  });
  if (hudWeaponName) {
    hudWeaponName.textContent = weaponLabel(key);
  }
  hudWeapon.setAttribute("aria-label", `Arme équipée : ${weaponLabel(key)}`);
}

function getWeaponStats(weapon = state.weapon) {
  return WEAPON_STATS[weapon] || WEAPON_STATS.ak47;
}

function updateGrenadeHud() {
  if (!hudGrenade) return;
  const has = state.grenadesHeld >= 1;
  hudGrenade.classList.toggle("hud-grenade--ready", has);
  hudGrenade.classList.toggle("hud-grenade--empty", !has);
  hudGrenade.setAttribute("aria-label", has ? "Grenade prête, touche G pour lancer" : "Pas de grenade");
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
  setActiveWeaponModel(weapon);
  weaponChoice.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
  target.classList.add("active");
  updateWeaponHud(weapon);
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: "weapon:select", weapon }));
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
  if (e.code === "KeyG") {
    if (state.joined && !state.pauseOpen && state.isAlive) {
      e.preventDefault();
      throwGrenade();
    }
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
  if (!lockedOnCanvas && !state.pauseOpen && state.isAlive) {
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

pauseMenuOverlay.addEventListener("click", (e) => {
  if (e.target !== pauseMenuOverlay) return;
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
}

function isCollidingAt(x, z, playerBottom, playerTop) {
  const standTolerance = 0.12;
  for (const box of staticBlockColliders) {
    // Allow movement when the player is standing on top of a block.
    if (playerBottom >= box.max.y - standTolerance) continue;
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
    state.isFiring &&
    getWeaponStats().auto &&
    !state.pauseOpen &&
    document.pointerLockElement === canvas
  ) {
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
  const decay = Math.exp(-VIEW_RECOIL_DECAY * delta);
  state.viewRecoilZ *= decay;
  state.viewRecoilY *= decay;
  state.viewRecoilRotX *= decay;
  state.viewRecoilRotZ *= decay;

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
    (state.keys.has("ShiftLeft") || state.keys.has("ShiftRight"));
  const sprintFactor = sprinting ? 1.7 : 1;
  const bobX = 0.008 * sprintFactor;
  const bobY = 0.008 * sprintFactor;
  const bobRotZ = 0.014 * sprintFactor;
  const bobRotX = 0.01 * sprintFactor;
  const bobRotY = 0.008 * sprintFactor;

  viewModel.position.x = 0.3 + Math.sin(t * 9.5 * sprintFactor) * bobX * bobIntensity;
  viewModel.position.y =
    -0.31 +
    Math.cos(t * 7.5 * sprintFactor) * bobY * bobIntensity +
    (state.onGround ? 0 : -0.03) +
    state.viewRecoilY;
  viewModel.position.z =
    -0.52 + Math.sin(t * 15 * sprintFactor) * 0.004 * bobIntensity + state.viewRecoilZ;
  viewModel.rotation.z =
    Math.sin(t * 8.5 * sprintFactor) * bobRotZ * bobIntensity + state.viewRecoilRotZ;
  viewModel.rotation.x =
    -0.02 + Math.cos(t * 8 * sprintFactor) * bobRotX * bobIntensity + state.viewRecoilRotX;
  viewModel.rotation.y = -0.22 + Math.sin(t * 6.7 * sprintFactor) * bobRotY * bobIntensity;
}

function shoot() {
  if (!state.isAlive) return;
  const stats = getWeaponStats();
  const now = performance.now();
  const msBetweenShots = 1000 / stats.fireRate;
  if (now - state.lastShotAt < msBetweenShots) return;
  state.lastShotAt = now;
  impulseViewRecoilFromWeapon(stats);

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
