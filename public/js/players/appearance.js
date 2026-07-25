import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

const localMaterial = new THREE.MeshStandardMaterial({ color: 0x45e0a8, roughness: 0.72 });
const soldierUrl = new URL("../imported weapons/Soldier.glb", import.meta.url).href;
const soldierLoader = new GLTFLoader();
let soldierAssetPromise = null;
let soldierAsset = null;

export function preloadPlayerAppearanceAssets() {
  if (!soldierAssetPromise) {
    soldierAssetPromise = soldierLoader.loadAsync(soldierUrl).then((asset) => {
      soldierAsset = asset;
      return asset;
    });
  }
  return soldierAssetPromise;
}

function cloneSoldierMaterial(material) {
  const clonedMaterial = material.clone();
  clonedMaterial.side = THREE.FrontSide;
  return clonedMaterial;
}

function prepareSoldierModel(sourceScene) {
  const model = cloneSkeleton(sourceScene);
  const teamMaterials = [];

  model.traverse((object) => {
    if (!object.isMesh) return;

    object.castShadow = false;
    object.receiveShadow = false;

    if (Array.isArray(object.material)) {
      object.material = object.material.map(cloneSoldierMaterial);
    } else if (object.material) {
      object.material = cloneSoldierMaterial(object.material);
    }

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (material && /^(shirt|jacket)$/i.test(material.name || "")) {
        material.userData.originalColor = material.color.clone();
        teamMaterials.push(material);
      }
    });
  });

  model.updateMatrixWorld(true);
  let bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const targetHeight = 1.82;
  if (size.y > 0.001) {
    model.scale.multiplyScalar(targetHeight / size.y);
  }

  model.updateMatrixWorld(true);
  bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.y -= bounds.min.y;
  model.position.z -= center.z;
  model.updateMatrixWorld(true);

  return { model, teamMaterials };
}

function createHitbox() {
  const hitbox = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 1.1, 6, 10),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false
    })
  );
  hitbox.position.y = 1.2;
  return hitbox;
}

export function createPlayerMesh(isLocal = false) {
  if (isLocal) {
    const localMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 6, 10), localMaterial);
    localMesh.position.y = 1.2;
    return localMesh;
  }

  if (!soldierAssetPromise) {
    throw new Error("Soldier.glb doit être préchargé avant de créer un joueur distant.");
  }

  if (!soldierAsset) {
    throw new Error("Soldier.glb n'est pas encore chargé.");
  }

  const root = new THREE.Group();
  const modelPivot = new THREE.Group();
  modelPivot.rotation.y = Math.PI;
  root.add(modelPivot);

  const { model, teamMaterials } = prepareSoldierModel(soldierAsset.scene);
  modelPivot.add(model);

  const hitbox = createHitbox();
  root.add(hitbox);

  const nameTag = createNameTagSprite("Player");
  nameTag.position.set(0, 2.08, 0);
  root.add(nameTag);

  const mixer = new THREE.AnimationMixer(model);
  const idleClip = soldierAsset.animations?.[0];
  if (idleClip) {
    const action = mixer.clipAction(idleClip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
  }

  root.userData.hitbox = hitbox;
  root.userData.nameTag = nameTag;
  root.userData.materials = { teamMaterials };
  root.userData.groundOffset = 0;
  root.userData.mixer = mixer;

  return root;
}

export async function resolvePlayerAppearanceAssets() {
  return preloadPlayerAppearanceAssets();
}

export function createNameTagSprite(name) {
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
  sprite.scale.set(1.55, 0.37, 1);
  sprite.renderOrder = 9;
  sprite.userData = { canvas: canvasTag, ctx, texture, currentName: "", currentColor: "" };
  updateNameTagSprite(sprite, name, null);
  return sprite;
}

export function colorFromPlayerId(playerId) {
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

export function updateNameTagSprite(sprite, name, playerColor) {
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

export function applyRemoteTeamStyle(root, team, playerId) {
  const teamMaterials = root?.userData?.materials?.teamMaterials;
  if (!Array.isArray(teamMaterials) || teamMaterials.length === 0) return;

  const playerColor = colorFromPlayerId(playerId);
  teamMaterials.forEach((material) => {
    const originalColor = material.userData.originalColor;
    if (!originalColor) return;
    material.color.copy(originalColor).lerp(playerColor, 0.16);
  });
}

export function setRemoteAliveVisual(root, alive) {
  if (!root) return;
  root.visible = alive !== false;
}
