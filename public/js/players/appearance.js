import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

const localMaterial = new THREE.MeshStandardMaterial({ color: 0x45e0a8, roughness: 0.72 });
const soldierUrl = new URL("../imported weapons/Soldier.glb", import.meta.url).href;
const soldierLoader = new GLTFLoader();
let soldierAssetPromise = null;
let soldierAsset = null;
const remoteWeaponFiles = {
  ak47: "AKM.glb",
  shotgun: "Mossberg 590A1.glb",
  sniper: "Sniper Rifle.glb",
  knife: "Combat Knife.glb"
};
const remoteWeaponAssets = new Map();
const remoteWeaponPoses = {
  ak47: {
    length: 1.08,
    mount: [0, 1.27, 0.5],
    rotation: [0, Math.PI * 0.5, 0],
    rightHand: [-0.1, 1.19, 0.37],
    leftHand: [0.08, 1.23, 0.67],
    rightPole: [-0.46, 1.03, 0.24],
    leftPole: [0.46, 1.08, 0.43]
  },
  shotgun: {
    length: 1.12,
    mount: [0, 1.27, 0.52],
    rotation: [0, -Math.PI * 0.5, 0],
    rightHand: [-0.1, 1.18, 0.36],
    leftHand: [0.08, 1.22, 0.7],
    rightPole: [-0.46, 1.02, 0.23],
    leftPole: [0.46, 1.07, 0.45]
  },
  sniper: {
    length: 1.2,
    mount: [0, 1.29, 0.54],
    rotation: [0, -Math.PI * 0.5, 0],
    rightHand: [-0.1, 1.2, 0.36],
    leftHand: [0.08, 1.25, 0.74],
    rightPole: [-0.46, 1.04, 0.23],
    leftPole: [0.46, 1.1, 0.48]
  },
  knife: {
    length: 0.42,
    mount: [-0.2, 1.09, 0.49],
    rotation: [Math.PI * 0.5, 0, 0],
    rightHand: [-0.2, 1.09, 0.34],
    leftHand: [0.12, 1.14, 0.3],
    rightPole: [-0.5, 0.96, 0.2],
    leftPole: [0.42, 1.04, 0.2]
  }
};

export function preloadPlayerAppearanceAssets() {
  if (!soldierAssetPromise) {
    const weaponEntries = Object.entries(remoteWeaponFiles);
    soldierAssetPromise = Promise.all([
      soldierLoader.loadAsync(soldierUrl),
      ...weaponEntries.map(([, file]) =>
        soldierLoader.loadAsync(new URL(`../imported weapons/${file}`, import.meta.url).href)
      )
    ]).then(([asset, ...weaponAssets]) => {
      soldierAsset = asset;
      weaponAssets.forEach((weaponAsset, index) => {
        remoteWeaponAssets.set(weaponEntries[index][0], weaponAsset);
      });
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

function createRemoteWeaponMount() {
  return new THREE.Group();
}

export function setRemoteWeapon(root, weaponKey) {
  const combatPose = root?.userData?.combatPose;
  const mount = combatPose?.weapon;
  const normalizedKey = remoteWeaponFiles[weaponKey] ? weaponKey : "ak47";
  const asset = remoteWeaponAssets.get(normalizedKey);
  const pose = remoteWeaponPoses[normalizedKey];
  if (!mount || !asset || root.userData.remoteWeaponKey === normalizedKey) return;

  mount.clear();
  const weapon = cloneSkeleton(asset.scene);
  weapon.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = false;
    object.frustumCulled = false;
  });

  weapon.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(weapon);
  const size = bounds.getSize(new THREE.Vector3());
  const longestSide = Math.max(size.x, size.y, size.z) || 1;
  weapon.scale.multiplyScalar(pose.length / longestSide);
  weapon.updateMatrixWorld(true);
  weapon.position.sub(new THREE.Box3().setFromObject(weapon).getCenter(new THREE.Vector3()));

  weapon.rotation.fromArray(pose.rotation);
  mount.add(weapon);
  mount.position.fromArray(pose.mount);
  combatPose.rightHandTarget = pose.rightHand;
  combatPose.leftHandTarget = pose.leftHand;
  combatPose.rightPoleTarget = pose.rightPole;
  combatPose.leftPoleTarget = pose.leftPole;
  combatPose.twoHanded = normalizedKey !== "knife";
  root.userData.remoteWeaponKey = normalizedKey;
}

function rotateBoneAroundWorldAxis(bone, axis, angle) {
  if (!bone || Math.abs(angle) < 0.0001) return;
  const parentWorldRotation = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  const localAxis = axis.clone().applyQuaternion(parentWorldRotation.invert()).normalize();
  bone.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(localAxis, angle));
}

function rotateBoneToward(bone, child, target) {
  if (!bone || !child) return;

  bone.updateWorldMatrix(true, false);
  child.updateWorldMatrix(true, false);
  const origin = bone.getWorldPosition(new THREE.Vector3());
  const currentEnd = child.getWorldPosition(new THREE.Vector3());
  const currentDirection = currentEnd.sub(origin).normalize();
  const targetDirection = target.clone().sub(origin).normalize();
  if (currentDirection.lengthSq() < 0.0001 || targetDirection.lengthSq() < 0.0001) return;

  const worldRotation = new THREE.Quaternion().setFromUnitVectors(currentDirection, targetDirection);
  const parentRotation = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  const localRotation = parentRotation.clone().invert()
    .multiply(worldRotation)
    .multiply(parentRotation);
  bone.quaternion.premultiply(localRotation);
}

function solveTwoBoneIk(root, upperArm, foreArm, hand, target, pole) {
  if (!upperArm || !foreArm || !hand) return;

  root.updateMatrixWorld(true);
  const shoulderPosition = upperArm.getWorldPosition(new THREE.Vector3());
  const elbowPosition = foreArm.getWorldPosition(new THREE.Vector3());
  const handPosition = hand.getWorldPosition(new THREE.Vector3());
  const upperLength = shoulderPosition.distanceTo(elbowPosition);
  const lowerLength = elbowPosition.distanceTo(handPosition);
  if (upperLength < 0.001 || lowerLength < 0.001) return;

  const shoulderToTarget = target.clone().sub(shoulderPosition);
  const rawDistance = shoulderToTarget.length();
  if (rawDistance < 0.001) return;

  const direction = shoulderToTarget.normalize();
  const minReach = Math.abs(upperLength - lowerLength) + 0.002;
  const maxReach = upperLength + lowerLength - 0.002;
  const distance = THREE.MathUtils.clamp(rawDistance, minReach, maxReach);
  const reachableTarget = shoulderPosition.clone().addScaledVector(direction, distance);
  const along = (upperLength * upperLength - lowerLength * lowerLength + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));

  const shoulderToPole = pole.clone().sub(shoulderPosition);
  const poleDirection = shoulderToPole.clone()
    .addScaledVector(direction, -shoulderToPole.dot(direction));
  if (poleDirection.lengthSq() < 0.0001) poleDirection.set(0, -1, 0);
  poleDirection.normalize();
  const solvedElbow = shoulderPosition.clone()
    .addScaledVector(direction, along)
    .addScaledVector(poleDirection, height);

  rotateBoneToward(upperArm, foreArm, solvedElbow);
  root.updateMatrixWorld(true);
  rotateBoneToward(foreArm, hand, reachableTarget);
  root.updateMatrixWorld(true);
}

export function updateRemoteCombatPose(root) {
  const combatPose = root?.userData?.combatPose;
  if (!combatPose) return;

  const { bones, modelPivot } = combatPose;
  const target = (position) => modelPivot.localToWorld(new THREE.Vector3().fromArray(position));
  const rightHandTarget = target(combatPose.rightHandTarget);
  const leftHandTarget = target(combatPose.leftHandTarget);
  const rightPoleTarget = target(combatPose.rightPoleTarget);
  const leftPoleTarget = target(combatPose.leftPoleTarget);

  solveTwoBoneIk(root, bones.rightArm, bones.rightForeArm, bones.rightHand, rightHandTarget, rightPoleTarget);
  if (combatPose.twoHanded) {
    solveTwoBoneIk(root, bones.leftArm, bones.leftForeArm, bones.leftHand, leftHandTarget, leftPoleTarget);
  }
}

function createLocomotionController(model, bones) {
  const bone = (name) => bones[name] || null;
  return {
    phase: 0,
    blend: 0,
    baseModelY: model.position.y,
    bones: {
      spine: bone("mixamorig:Spine"),
      leftUpLeg: bone("mixamorig:LeftUpLeg"),
      rightUpLeg: bone("mixamorig:RightUpLeg"),
      leftLeg: bone("mixamorig:LeftLeg"),
      rightLeg: bone("mixamorig:RightLeg"),
      leftFoot: bone("mixamorig:LeftFoot"),
      rightFoot: bone("mixamorig:RightFoot")
    }
  };
}

export function updateRemoteLocomotion(root, delta, speed) {
  const locomotion = root?.userData?.locomotion;
  if (!locomotion) return;

  const targetBlend = speed > 0.18 ? 1 : 0;
  locomotion.blend = THREE.MathUtils.damp(locomotion.blend, targetBlend, 10, Math.max(delta, 0));
  const amount = locomotion.blend;
  if (amount < 0.002) {
    root.userData.model.position.y = locomotion.baseModelY;
    return;
  }

  // A complete step is faster when the replicated character is moving faster,
  // while remaining readable at the low movement speeds of interpolated peers.
  locomotion.phase += delta * THREE.MathUtils.clamp(4.5 + speed * 1.7, 4.5, 10.5);
  const stride = Math.sin(locomotion.phase) * 0.5 * amount;
  const leftKnee = Math.max(0, -Math.sin(locomotion.phase)) * 0.38 * amount;
  const rightKnee = Math.max(0, Math.sin(locomotion.phase)) * 0.38 * amount;
  const leftFootLift = Math.max(0, -Math.sin(locomotion.phase)) * 0.22 * amount;
  const rightFootLift = Math.max(0, Math.sin(locomotion.phase)) * 0.22 * amount;
  const { bones } = locomotion;
  const characterRight = new THREE.Vector3(1, 0, 0).transformDirection(root.matrixWorld);

  // Mixamo leg bones have rotated local axes. Applying the stride around the
  // character's world-space right axis produces an actual forward/back step.
  rotateBoneAroundWorldAxis(bones.leftUpLeg, characterRight, stride);
  rotateBoneAroundWorldAxis(bones.rightUpLeg, characterRight, -stride);
  rotateBoneAroundWorldAxis(bones.leftLeg, characterRight, -leftKnee);
  rotateBoneAroundWorldAxis(bones.rightLeg, characterRight, -rightKnee);
  rotateBoneAroundWorldAxis(bones.leftFoot, characterRight, leftFootLift);
  rotateBoneAroundWorldAxis(bones.rightFoot, characterRight, rightFootLift);

  root.userData.model.position.y = locomotion.baseModelY + Math.abs(Math.sin(locomotion.phase * 2)) * 0.018 * amount;
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
  let idleAction = null;
  if (idleClip) {
    idleAction = mixer.clipAction(idleClip);
    idleAction.setLoop(THREE.LoopRepeat, Infinity);
    idleAction.play();
  }

  root.userData.hitbox = hitbox;
  root.userData.nameTag = nameTag;
  root.userData.model = model;
  root.userData.modelPivot = modelPivot;
  root.userData.bones = {};
  const registerBone = (bone) => {
    if (!bone?.name) return;
    root.userData.bones[bone.name] = bone;
    if (bone.name.startsWith("mixamorig") && !bone.name.startsWith("mixamorig:")) {
      root.userData.bones[`mixamorig:${bone.name.slice("mixamorig".length)}`] = bone;
    }
  };
  model.traverse((object) => {
    if (object.isBone) registerBone(object);
    if (!object.isSkinnedMesh || !object.skeleton?.bones) return;
    object.skeleton.bones.forEach(registerBone);
  });
  const weaponMount = createRemoteWeaponMount();
  modelPivot.add(weaponMount);
  root.userData.materials = { teamMaterials };
  root.userData.groundOffset = 0;
  root.userData.mixer = mixer;
  root.userData.idleAction = idleAction;
  root.userData.locomotion = createLocomotionController(model, root.userData.bones);
  root.userData.combatPose = {
    weapon: weaponMount,
    modelPivot,
    rightHandTarget: remoteWeaponPoses.ak47.rightHand,
    leftHandTarget: remoteWeaponPoses.ak47.leftHand,
    rightPoleTarget: remoteWeaponPoses.ak47.rightPole,
    leftPoleTarget: remoteWeaponPoses.ak47.leftPole,
    twoHanded: true,
    bones: {
      leftArm: root.userData.bones["mixamorig:LeftArm"],
      leftForeArm: root.userData.bones["mixamorig:LeftForeArm"],
      leftHand: root.userData.bones["mixamorig:LeftHand"],
      rightArm: root.userData.bones["mixamorig:RightArm"],
      rightForeArm: root.userData.bones["mixamorig:RightForeArm"],
      rightHand: root.userData.bones["mixamorig:RightHand"]
    }
  };
  setRemoteWeapon(root, "ak47");

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

function forEachModelMaterial(root, callback) {
  root?.userData?.model?.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material && callback(material));
  });
}

export function setRemoteDeathOpacity(root, opacity) {
  const nextOpacity = THREE.MathUtils.clamp(Number(opacity) || 0, 0, 1);
  forEachModelMaterial(root, (material) => {
    let materialStateChanged = false;
    if (!material.userData.remoteDeathOriginal) {
      material.userData.remoteDeathOriginal = {
        depthWrite: material.depthWrite,
        opacity: material.opacity,
        transparent: material.transparent
      };
      materialStateChanged = true;
    }
    material.transparent = true;
    material.depthWrite = false;
    material.opacity = nextOpacity;
    if (materialStateChanged) material.needsUpdate = true;
  });
}

export function resetRemoteDeathVisual(root) {
  if (!root) return;

  root.visible = true;
  root.userData.modelPivot?.rotation.set(0, Math.PI, 0);
  if (root.userData.locomotion) root.userData.model.position.y = root.userData.locomotion.baseModelY;
  if (root.userData.nameTag) root.userData.nameTag.visible = true;
  if (root.userData.hitbox) root.userData.hitbox.visible = true;

  forEachModelMaterial(root, (material) => {
    const original = material.userData.remoteDeathOriginal;
    if (!original) return;
    material.depthWrite = original.depthWrite;
    material.opacity = original.opacity;
    material.transparent = original.transparent;
    material.needsUpdate = true;
    delete material.userData.remoteDeathOriginal;
  });

  if (root.userData.idleAction) {
    root.userData.idleAction.paused = false;
    root.userData.idleAction.reset().play();
  }
  root.userData.mixer?.update(0);
}
