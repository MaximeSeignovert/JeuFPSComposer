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
  joined: false,
  pauseOpen: false
};

const BASE_FOV = 74;
const WEAPON_STATS = {
  shotgun: {
    label: "Fusil a pompe",
    fireRate: 1.1,
    pellets: 4,
    spread: 0.08,
    damage: 70,
    range: 26,
    bulletSpeed: 52,
    auto: false,
    zoomFov: BASE_FOV
  },
  ak47: {
    label: "AK47",
    fireRate: 9,
    pellets: 1,
    spread: 0.014,
    damage: 28,
    range: 62,
    bulletSpeed: 70,
    auto: true,
    zoomFov: BASE_FOV
  },
  sniper: {
    label: "Sniper",
    fireRate: 0.9,
    pellets: 1,
    spread: 0.001,
    damage: 120,
    range: 140,
    bulletSpeed: 95,
    auto: false,
    zoomFov: 28
  }
};

const menu = document.getElementById("menu");
const roomsList = document.getElementById("roomsList");
const nameInput = document.getElementById("nameInput");
const weaponChoice = document.getElementById("weaponChoice");
const pauseMenu = document.getElementById("pauseMenu");
const resumeBtn = document.getElementById("resumeBtn");
const hud = document.getElementById("hud");
const crosshair = document.getElementById("crosshair");
const playerList = document.getElementById("playerList");
const hudRoom = document.getElementById("hudRoom");
const hudTeam = document.getElementById("hudTeam");
const hudWeapon = document.getElementById("hudWeapon");
const canvas = document.getElementById("gameCanvas");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111823);
scene.fog = new THREE.Fog(0x111823, 25, 90);

const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, state.playerHeight, 0);
scene.add(camera);

const viewModel = createViewModel();
camera.add(viewModel);

const hemi = new THREE.HemisphereLight(0xa2c2ff, 0x203040, 1.1);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(7, 20, 9);
scene.add(dir);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: 0x1a2738, roughness: 0.95 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const worldColliders = [floor];

for (let i = 0; i < 26; i += 1) {
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(3, 4, 3),
    new THREE.MeshStandardMaterial({
      color: i % 2 ? 0x2a466f : 0x3e5c8a,
      roughness: 0.8
    })
  );
  wall.position.set((Math.random() - 0.5) * 70, 2, (Math.random() - 0.5) * 70);
  scene.add(wall);
  worldColliders.push(wall);
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
  leftShoe.position.set(-0.13, 0.52, 0.04);
  root.add(leftShoe);

  const rightShoe = new THREE.Mesh(shoeGeo, shoeMaterial);
  rightShoe.position.set(0.13, 0.52, 0.04);
  root.add(rightShoe);

  const hitbox = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 1.1, 6, 10),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitbox.position.y = 1.2;
  hitbox.visible = false;
  root.add(hitbox);

  const nameTag = createNameTagSprite("Player");
  nameTag.position.set(0, 2.45, 0);
  root.add(nameTag);

  root.userData.hitbox = hitbox;
  root.userData.nameTag = nameTag;
  root.userData.materials = { shirtMaterial };
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
    depthTest: false
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

const localBody = createPlayerMesh(true);
localBody.visible = false;
scene.add(localBody);
const bullets = [];
const flashes = [];
const impacts = [];
const raycaster = new THREE.Raycaster();

const clock = new THREE.Clock();
let lastNetworkSend = 0;

function createViewModel() {
  const group = new THREE.Group();
  group.position.set(0.3, -0.31, -0.52);
  group.rotation.set(-0.14, -0.22, -0.1);

  const armMaterial = new THREE.MeshStandardMaterial({ color: 0xd1a57b, roughness: 0.82 });
  const sleeveMaterial = new THREE.MeshStandardMaterial({ color: 0x2b3f66, roughness: 0.88 });
  const weaponMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.45, metalness: 0.35 });
  const weaponAccent = new THREE.MeshStandardMaterial({ color: 0x6f6f77, roughness: 0.35, metalness: 0.65 });

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

  const weaponBody = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.74), weaponMaterial);
  weaponBody.position.set(-0.03, -0.19, -0.3);
  weaponBody.rotation.y = -0.04;
  group.add(weaponBody);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.62, 12), weaponAccent);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(-0.02, -0.18, -0.66);
  group.add(barrel);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.08), weaponMaterial);
  grip.position.set(-0.06, -0.29, -0.13);
  grip.rotation.z = 0.18;
  group.add(grip);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(-0.02, -0.18, -0.96);
  group.add(muzzle);
  group.userData.muzzle = muzzle;

  return group;
}

function connect() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  state.ws = new WebSocket(`${protocol}://${location.host}`);

  state.ws.addEventListener("open", () => {
    state.ws.send(
      JSON.stringify({ type: "player:setName", name: nameInput.value.trim() || "Player" })
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
      enterGame();
      return;
    }

    if (msg.type === "room:players") {
      updatePlayerList(msg.players);
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
      if (msg.position) {
        remotePlayer.root.position.set(msg.position.x, msg.position.y - 0.5, msg.position.z);
        remotePlayer.root.rotation.y = msg.rotationY || 0;
      }
      if (msg.name || msg.team) {
        const nameTag = remotePlayer.root.userData.nameTag;
        updateNameTagSprite(nameTag, msg.name || "Player", msg.team || null);
        applyRemoteTeamStyle(remotePlayer.root, msg.team);
      }
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
        spawnBulletVisual(msg.origin, shot.direction, false, bulletSpeed);
        traceImpact(msg.origin, shot.direction, range);
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
  state.ws.send(JSON.stringify({ type: "player:setName", name: nameInput.value.trim() || "Player" }));
  state.ws.send(JSON.stringify({ type: "room:join", roomId }));
}

function enterGame() {
  menu.classList.add("hidden");
  hud.classList.remove("hidden");
  crosshair.classList.remove("hidden");
  playerList.classList.remove("hidden");
  pauseMenu.classList.add("hidden");
  hudRoom.textContent = state.roomId;
  hudTeam.textContent = `Equipe: ${state.team.toUpperCase()}`;
  hudWeapon.textContent = `Arme: ${weaponLabel(state.weapon)}`;
}

function setPauseMenu(open) {
  if (!state.joined) return;
  state.pauseOpen = open;
  pauseMenu.classList.toggle("hidden", !open);
  crosshair.classList.toggle("hidden", open);
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
  const shouldZoom = state.isAiming && state.weapon === "sniper" && !state.pauseOpen;
  const targetFov = shouldZoom ? stats.zoomFov : BASE_FOV;
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.2);
  camera.updateProjectionMatrix();
}

function updatePlayerList(players) {
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
    updateNameTagSprite(remotePlayer.root.userData.nameTag, p.name || "Player", p.team || null);
    applyRemoteTeamStyle(remotePlayer.root, p.team);
  });

  const html = players
    .map((p) => `<li>${p.name} - ${p.team} - ${weaponLabel(p.weapon)}</li>`)
    .join("");
  playerList.innerHTML = `<strong>Joueurs (${players.length}/10)</strong><ul>${html}</ul>`;
}

weaponChoice.addEventListener("click", (event) => {
  const target = event.target.closest("button[data-weapon]");
  if (!target) return;
  const weapon = target.getAttribute("data-weapon");
  state.weapon = weapon;
  state.isAiming = false;
  weaponChoice.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
  target.classList.add("active");
  hudWeapon.textContent = `Arme: ${weaponLabel(weapon)}`;
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
  state.keys.add(e.code);
  if (e.code === "Space" && state.joined && !state.pauseOpen && state.onGround) {
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
  if (!state.joined || state.pauseOpen || document.pointerLockElement !== canvas) return;
  const stats = getWeaponStats();
  state.isFiring = true;
  shoot();
  if (!stats.auto) state.isFiring = false;
});
canvas.addEventListener("mousedown", (event) => {
  if (event.button !== 2) return;
  if (!state.joined || state.pauseOpen) return;
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
  if (!state.joined || state.pauseOpen) return;
  const fwd = Number(state.keys.has("KeyW")) - Number(state.keys.has("KeyS"));
  const right = Number(state.keys.has("KeyD")) - Number(state.keys.has("KeyA"));
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.y = 0;
  dir.normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();

  const velocity = new THREE.Vector3()
    .addScaledVector(dir, fwd * state.moveSpeed * delta)
    .addScaledVector(side, right * state.moveSpeed * delta);

  camera.position.add(velocity);

  state.verticalVelocity -= state.gravity * delta;
  camera.position.y += state.verticalVelocity * delta;

  if (camera.position.y <= state.playerHeight) {
    camera.position.y = state.playerHeight;
    state.verticalVelocity = 0;
    state.onGround = true;
  }

  const lim = 90;
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -lim, lim);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -lim, lim);

  const horizontalSpeed = velocity.length() / Math.max(delta, 0.0001);
  const isMoving = horizontalSpeed > 0.3 ? 1 : 0;
  state.movementBlend = THREE.MathUtils.lerp(state.movementBlend, isMoving, Math.min(delta * 12, 1));
}

function sendPlayerUpdate() {
  if (!state.joined || state.pauseOpen || !state.ws || state.ws.readyState !== WebSocket.OPEN) return;
  const now = performance.now();
  if (now - lastNetworkSend < 50) return;
  lastNetworkSend = now;

  state.ws.send(
    JSON.stringify({
      type: "player:update",
      position: {
        x: camera.position.x,
        y: camera.position.y - 0.5,
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
  viewModel.position.x = 0.3 + Math.sin(t * 9.5) * 0.008 * intensity;
  viewModel.position.y =
    -0.31 + Math.cos(t * 7.5) * 0.008 * intensity + (state.onGround ? 0 : -0.03);
  viewModel.rotation.z = Math.sin(t * 8.5) * 0.014 * intensity;
  viewModel.rotation.x = -0.02 + Math.cos(t * 8) * 0.01 * intensity;
}

function shoot() {
  const stats = getWeaponStats();
  const now = performance.now();
  const msBetweenShots = 1000 / stats.fireRate;
  if (now - state.lastShotAt < msBetweenShots) return;
  state.lastShotAt = now;

  const muzzle = viewModel.userData.muzzle;
  const spawnPos = new THREE.Vector3();
  muzzle.getWorldPosition(spawnPos);
  const origin = { x: spawnPos.x, y: spawnPos.y, z: spawnPos.z };
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
    spawnBulletVisual(origin, direction, true, stats.bulletSpeed);
    traceImpact(origin, direction, stats.range);
  }
  spawnMuzzleFlash(origin);

  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(
      JSON.stringify({
        type: "player:shoot",
        origin,
        weapon: state.weapon,
        shots
      })
    );
  }
}

function spawnBulletVisual(origin, direction, localShot, bulletSpeed) {
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
    life: Math.max(0.1, Math.min(2.2, 95 / Math.max(1, bulletSpeed)))
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

function traceImpact(origin, direction, maxDistance = 120) {
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
  if (!hit) return;

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
}

function updateBullets(delta) {
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const bullet = bullets[i];
    bullet.life -= delta;
    const prev = bullet.mesh.position.clone();
    bullet.mesh.position.addScaledVector(bullet.velocity, delta);
    bullet.trail.geometry.setFromPoints([prev, bullet.mesh.position.clone()]);

    const p = bullet.mesh.position;
    const outBounds = Math.abs(p.x) > 120 || Math.abs(p.z) > 120 || p.y < 0 || p.y > 50;
    if (bullet.life <= 0 || outBounds) {
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
