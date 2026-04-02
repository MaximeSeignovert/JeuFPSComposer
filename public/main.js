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
  joined: false,
  pauseOpen: false
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

const camera = new THREE.PerspectiveCamera(
  74,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
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

const remoteMaterial = new THREE.MeshStandardMaterial({ color: 0xff607f });
const localMaterial = new THREE.MeshStandardMaterial({ color: 0x45e0a8 });
const remoteMeshes = new Map();

function createPlayerMesh(isLocal = false) {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 1.1, 6, 10),
    isLocal ? localMaterial : remoteMaterial
  );
  mesh.position.y = 1.2;
  return mesh;
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
      let mesh = remoteMeshes.get(msg.id);
      if (!mesh) {
        mesh = createPlayerMesh(false);
        scene.add(mesh);
        remoteMeshes.set(msg.id, mesh);
      }
      if (msg.position) {
        mesh.position.set(msg.position.x, msg.position.y, msg.position.z);
        mesh.rotation.y = msg.rotationY || 0;
      }
      return;
    }

    if (msg.type === "player:shoot") {
      if (!msg.id || msg.id === state.playerId) return;
      if (!msg.origin || !msg.direction) return;
      spawnMuzzleFlash(msg.origin);
      spawnBulletVisual(msg.origin, msg.direction, false);
      traceImpact(msg.origin, msg.direction);
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
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
  }
}

function togglePauseMenu() {
  setPauseMenu(!state.pauseOpen);
}

function weaponLabel(w) {
  if (w === "shotgun") return "Fusil a pompe";
  if (w === "sniper") return "Sniper";
  return "AK47";
}

function updatePlayerList(players) {
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
  state.isFiring = true;
  shoot();
});
canvas.addEventListener("mouseup", (event) => {
  if (event.button === 0) state.isFiring = false;
});
window.addEventListener("blur", () => {
  state.isFiring = false;
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

  camera.rotation.set(state.pitch, state.yaw, 0, "YXZ");
  updateMovement(delta);
  if (state.isFiring && !state.pauseOpen && document.pointerLockElement === canvas) {
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
  const now = performance.now();
  const msBetweenShots = 1000 / state.fireRate;
  if (now - state.lastShotAt < msBetweenShots) return;
  state.lastShotAt = now;

  const muzzle = viewModel.userData.muzzle;
  const spawnPos = new THREE.Vector3();
  const shotDir = new THREE.Vector3();
  muzzle.getWorldPosition(spawnPos);
  camera.getWorldDirection(shotDir).normalize();
  const origin = { x: spawnPos.x, y: spawnPos.y, z: spawnPos.z };
  const direction = { x: shotDir.x, y: shotDir.y, z: shotDir.z };

  spawnMuzzleFlash(origin);
  spawnBulletVisual(origin, direction, true);
  traceImpact(origin, direction);

  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: "player:shoot", origin, direction }));
  }
}

function spawnBulletVisual(origin, direction, localShot) {
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
    velocity: new THREE.Vector3(direction.x, direction.y, direction.z).multiplyScalar(state.bulletSpeed),
    life: state.bulletLife
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

function traceImpact(origin, direction) {
  const rayOrigin = new THREE.Vector3(origin.x, origin.y, origin.z);
  const rayDir = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
  raycaster.set(rayOrigin, rayDir);
  raycaster.far = 120;

  const targets = [...worldColliders, ...remoteMeshes.values()];
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
