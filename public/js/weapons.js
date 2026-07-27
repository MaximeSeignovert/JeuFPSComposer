import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

const loader = new GLTFLoader();
const assetCache = new Map();
const assetDirectory = new URL("./imported weapons/", import.meta.url);

const ASSETS = {
  firearmRig: "Fps Rig AKM.glb",
  armsRig: "Rigged Fps Arms.glb",
  shotgun: "Mossberg 590A1.glb",
  sniper: "Sniper Rifle.glb",
  knife: "Combat Knife.glb",
  grenade: "Grenade.glb"
};

function assetUrl(fileName) {
  return new URL(fileName, assetDirectory).href;
}

function loadAsset(fileName) {
  if (!assetCache.has(fileName)) {
    assetCache.set(fileName, loader.loadAsync(assetUrl(fileName)));
  }
  return assetCache.get(fileName);
}

async function instantiateAsset(fileName) {
  const gltf = await loadAsset(fileName);
  const scene = cloneSkeleton(gltf.scene);
  scene.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = false;
    object.frustumCulled = false;
    if (Array.isArray(object.material)) {
      object.material.forEach((material) => {
        material.side = THREE.FrontSide;
      });
    } else if (object.material) {
      object.material.side = THREE.FrontSide;
    }
  });
  return { animations: gltf.animations, scene };
}

function dominantAxis(size) {
  if (size.y > size.x && size.y > size.z) return 1;
  if (size.z > size.x && size.z > size.y) return 2;
  return 0;
}

function axisVector(index) {
  if (index === 1) return new THREE.Vector3(0, 1, 0);
  if (index === 2) return new THREE.Vector3(0, 0, 1);
  return new THREE.Vector3(1, 0, 0);
}

function alignObjectToBox(object, referenceBox) {
  object.updateMatrixWorld(true);
  let sourceBox = new THREE.Box3().setFromObject(object);
  const sourceSize = sourceBox.getSize(new THREE.Vector3());
  const referenceSize = referenceBox.getSize(new THREE.Vector3());
  const sourceAxis = dominantAxis(sourceSize);
  const referenceAxis = dominantAxis(referenceSize);

  if (sourceAxis !== referenceAxis) {
    object.quaternion.premultiply(
      new THREE.Quaternion().setFromUnitVectors(axisVector(sourceAxis), axisVector(referenceAxis))
    );
    object.updateMatrixWorld(true);
    sourceBox = new THREE.Box3().setFromObject(object);
  }

  const alignedSize = sourceBox.getSize(new THREE.Vector3());
  const sourceLength = alignedSize.getComponent(referenceAxis) || 1;
  const referenceLength = referenceSize.getComponent(referenceAxis) || 1;
  object.scale.multiplyScalar(referenceLength / sourceLength);
  object.updateMatrixWorld(true);

  const sourceCenter = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
  const referenceCenter = referenceBox.getCenter(new THREE.Vector3());
  object.position.add(referenceCenter.sub(sourceCenter));
  object.updateMatrixWorld(true);
}

function frameScene(scene, targetSize, position, rotation) {
  scene.updateMatrixWorld(true);
  let bounds = new THREE.Box3().setFromObject(scene);
  const size = bounds.getSize(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z) || 1;
  scene.scale.multiplyScalar(targetSize / maxSize);
  scene.updateMatrixWorld(true);
  bounds = new THREE.Box3().setFromObject(scene);
  scene.position.sub(bounds.getCenter(new THREE.Vector3()));

  const frame = new THREE.Group();
  frame.position.set(...position);
  frame.rotation.set(...rotation);
  frame.add(scene);
  return frame;
}

function createAnimationState(weapon, scene, animations) {
  if (!animations?.length) return null;
  const mixer = new THREE.AnimationMixer(scene);
  const actions = {};
  animations.forEach((clip) => {
    const key = clip.name.split("|").pop().toLowerCase();
    actions[key] = mixer.clipAction(clip);
  });
  actions.idle?.play();
  return { actions, mixer, weapon };
}

function median(values) {
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length * 0.5);
  return values.length % 2 === 0
    ? (values[middle - 1] + values[middle]) * 0.5
    : values[middle];
}

function createMuzzleAnchor(visibleWeapon, aimPivot) {
  const muzzle = new THREE.Object3D();
  aimPivot.add(muzzle);

  if (!visibleWeapon) {
    muzzle.position.set(0, 0.02, -0.6);
    return muzzle;
  }

  aimPivot.updateWorldMatrix(true, true);
  const worldToAim = new THREE.Matrix4().copy(aimPivot.matrixWorld).invert();
  const point = new THREE.Vector3();
  const bounds = new THREE.Box3().makeEmpty();

  const forEachWeaponVertex = (callback) => {
    visibleWeapon.traverse((object) => {
      const positions = object.geometry?.attributes?.position;
      if (!object.isMesh || !positions) return;

      for (let index = 0; index < positions.count; index += 1) {
        point.fromBufferAttribute(positions, index);
        point.applyMatrix4(object.matrixWorld).applyMatrix4(worldToAim);
        callback(point);
      }
    });
  };

  forEachWeaponVertex((vertex) => bounds.expandByPoint(vertex));
  if (bounds.isEmpty()) {
    muzzle.position.set(0, 0.02, -0.6);
    return muzzle;
  }

  const boundsSize = bounds.getSize(new THREE.Vector3());
  const forwardAxis = dominantAxis(boundsSize);
  const weaponLength = Math.max(0.001, boundsSize.getComponent(forwardAxis));
  const frontCoordinate = bounds.min.getComponent(forwardAxis);
  const frontDepth = Math.max(0.012, weaponLength * 0.035);
  const frontCoordinates = [[], [], []];
  forEachWeaponVertex((vertex) => {
    if (vertex.getComponent(forwardAxis) > frontCoordinate + frontDepth) return;
    for (let axis = 0; axis < 3; axis += 1) {
      if (axis !== forwardAxis) frontCoordinates[axis].push(vertex.getComponent(axis));
    }
  });

  muzzle.position.copy(bounds.getCenter(new THREE.Vector3()));
  for (let axis = 0; axis < 3; axis += 1) {
    if (axis === forwardAxis || frontCoordinates[axis].length === 0) continue;
    muzzle.position.setComponent(axis, median(frontCoordinates[axis]));
  }
  muzzle.position.setComponent(
    forwardAxis,
    frontCoordinate - Math.max(0.006, weaponLength * 0.008)
  );

  let skinnedWeapon = null;
  visibleWeapon.traverse((object) => {
    if (!skinnedWeapon && object.isSkinnedMesh) skinnedWeapon = object;
  });
  const weaponBone = skinnedWeapon?.skeleton?.bones.find((bone) => bone.name === "Root");
  if (weaponBone) {
    aimPivot.updateWorldMatrix(true, true);
    weaponBone.attach(muzzle);
  }
  return muzzle;
}

async function createFirearm(weapon, replacementFile = null) {
  const { animations, scene: rigScene } = await instantiateAsset(ASSETS.firearmRig);
  const importedRifle = rigScene.getObjectByName("AKM_model");
  let visibleWeapon = importedRifle;

  if (replacementFile && importedRifle) {
    importedRifle.updateMatrixWorld(true);
    const referenceBox = new THREE.Box3().setFromObject(importedRifle);
    const { scene: replacement } = await instantiateAsset(replacementFile);
    rigScene.add(replacement);
    alignObjectToBox(replacement, referenceBox);
    if (weapon === "sniper") {
      replacement.position.y += 0.5;
    }
    importedRifle.visible = false;
    visibleWeapon = replacement;
  }

  const weaponGroup = new THREE.Group();
  const aimPivot = new THREE.Group();
  aimPivot.position.set(0, -0.12, -0.18);
  aimPivot.add(frameScene(rigScene, 1.34, [0, 0, 0], [0, Math.PI * 0.5, 0]));
  const animationState = createAnimationState(weapon, rigScene, animations);
  animationState?.mixer.update(0);
  const muzzle = createMuzzleAnchor(visibleWeapon, aimPivot);
  weaponGroup.add(aimPivot);
  weaponGroup.userData.armMesh = rigScene.getObjectByName("ArmModel") || null;
  weaponGroup.userData.aimPivot = aimPivot;
  weaponGroup.userData.muzzle = muzzle;
  weaponGroup.userData.animationState = animationState;
  return weaponGroup;
}

async function createStandaloneWeapon(fileName, targetSize, modelPosition, modelRotation) {
  const { scene } = await instantiateAsset(fileName);
  const weaponGroup = new THREE.Group();
  weaponGroup.add(frameScene(scene, targetSize, modelPosition, modelRotation));
  return weaponGroup;
}

function rotateBoneAroundWorldAxis(bone, axis, angle) {
  if (!bone) return;
  const parentWorldQuaternion = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  const axisInParentSpace = axis.clone().applyQuaternion(parentWorldQuaternion.invert()).normalize();
  bone.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axisInParentSpace, angle));
  bone.updateMatrixWorld(true);
}

function getArmBone(armsScene, name) {
  return armsScene.getObjectByName(name) || armsScene.getObjectByName(name.replace(/\./g, ""));
}

function curlFinger(armsScene, boneNames, angle) {
  boneNames.forEach((name, index) => {
    const bone = getArmBone(armsScene, name);
    if (bone) bone.rotateX(angle * (index === 0 ? 0.78 : 1));
  });
}

function rotateFingerTips(armsScene, boneNames, angle) {
  boneNames.forEach((name) => {
    const bone = getArmBone(armsScene, name);
    if (bone) bone.rotateZ(angle);
  });
}

function lerpBoneOffset(from, to, amount) {
  return {
    depth: THREE.MathUtils.lerp(from.depth, to.depth, amount),
    vertical: THREE.MathUtils.lerp(from.vertical, to.vertical, amount),
    horizontal: THREE.MathUtils.lerp(from.horizontal, to.horizontal, amount)
  };
}

function applyKnifeBoneOffset(knifeGroup, bone, offset, axes) {
  if (!bone) return;
  rotateBoneAroundWorldAxis(bone, axes.depth, offset.depth);
  rotateBoneAroundWorldAxis(bone, axes.vertical, offset.vertical);
  rotateBoneAroundWorldAxis(bone, axes.horizontal, offset.horizontal);
  knifeGroup.updateMatrixWorld(true);
}

function animateKnifeArmRig(knifeGroup, attackState, progress) {
  if (!attackState?.bones?.length) return;

  attackState.bones.forEach((bone) => {
    bone.quaternion.copy(attackState.baseQuaternions.get(bone));
  });
  knifeGroup.updateMatrixWorld(true);

  const zero = { depth: 0, vertical: 0, horizontal: 0 };
  const windup = {
    upperArm: { depth: -0.12, vertical: 0.12, horizontal: -0.04 },
    lowerArm: { depth: 0.16, vertical: 0.18, horizontal: -0.12 },
    hand: { depth: 0.12, vertical: 0, horizontal: 0 }
  };
  const strike = {
    upperArm: { depth: 0.18, vertical: -0.24, horizontal: 0.08 },
    lowerArm: { depth: -0.35, vertical: -0.46, horizontal: 0.24 },
    hand: { depth: -0.24, vertical: 0.04, horizontal: 0.05 }
  };
  const followThrough = {
    upperArm: { depth: 0.08, vertical: -0.08, horizontal: 0.03 },
    lowerArm: { depth: -0.14, vertical: -0.16, horizontal: 0.12 },
    hand: { depth: -0.1, vertical: 0.02, horizontal: 0.03 }
  };

  let offsets = { upperArm: zero, lowerArm: zero, hand: zero };
  if (progress < 0.2) {
    const amount = THREE.MathUtils.smoothstep(progress / 0.2, 0, 1);
    offsets = {
      upperArm: lerpBoneOffset(zero, windup.upperArm, amount),
      lowerArm: lerpBoneOffset(zero, windup.lowerArm, amount),
      hand: lerpBoneOffset(zero, windup.hand, amount)
    };
  } else if (progress < 0.52) {
    const amount = 1 - Math.pow(1 - (progress - 0.2) / 0.32, 3);
    offsets = {
      upperArm: lerpBoneOffset(windup.upperArm, strike.upperArm, amount),
      lowerArm: lerpBoneOffset(windup.lowerArm, strike.lowerArm, amount),
      hand: lerpBoneOffset(windup.hand, strike.hand, amount)
    };
  } else if (progress < 0.7) {
    const amount = THREE.MathUtils.smoothstep((progress - 0.52) / 0.18, 0, 1);
    offsets = {
      upperArm: lerpBoneOffset(strike.upperArm, followThrough.upperArm, amount),
      lowerArm: lerpBoneOffset(strike.lowerArm, followThrough.lowerArm, amount),
      hand: lerpBoneOffset(strike.hand, followThrough.hand, amount)
    };
  } else {
    const amount = THREE.MathUtils.smoothstep((progress - 0.7) / 0.3, 0, 1);
    offsets = {
      upperArm: lerpBoneOffset(followThrough.upperArm, zero, amount),
      lowerArm: lerpBoneOffset(followThrough.lowerArm, zero, amount),
      hand: lerpBoneOffset(followThrough.hand, zero, amount)
    };
  }

  const axes = {
    depth: new THREE.Vector3(0, 0, 1),
    vertical: new THREE.Vector3(0, 1, 0),
    horizontal: new THREE.Vector3(1, 0, 0)
  };
  applyKnifeBoneOffset(knifeGroup, attackState.upperArm, offsets.upperArm, axes);
  applyKnifeBoneOffset(knifeGroup, attackState.lowerArm, offsets.lowerArm, axes);
  applyKnifeBoneOffset(knifeGroup, attackState.hand, offsets.hand, axes);
  knifeGroup.updateMatrixWorld(true);
}

function poseKnifeArms(armsScene, knifeGroup) {
  const horizontalAxis = new THREE.Vector3(1, 0, 0);
  const verticalAxis = new THREE.Vector3(0, 1, 0);
  const screenDepthAxis = new THREE.Vector3(0, 0, 1);
  const leftUpperArm = getArmBone(armsScene, "UpperArm.L");
  const leftLowerArm = getArmBone(armsScene, "LowerArm.L");
  const rightUpperArm = getArmBone(armsScene, "UpperArm.R.001");
  const rightLowerArm = getArmBone(armsScene, "LowerArm.R.001");
  const rightHand = getArmBone(armsScene, "Hand.R.001");

  // La main gauche vient soutenir l'avant du couteau, au lieu de rester
  // tendue au-dessus de la ligne de visée.
  rotateBoneAroundWorldAxis(leftUpperArm, screenDepthAxis, -0.22);
  rotateBoneAroundWorldAxis(leftUpperArm, verticalAxis, 0.42);
  rotateBoneAroundWorldAxis(leftUpperArm, horizontalAxis, -0.28);
  knifeGroup.updateMatrixWorld(true);
  rotateBoneAroundWorldAxis(leftLowerArm, screenDepthAxis, 0.42);
  rotateBoneAroundWorldAxis(leftLowerArm, verticalAxis, -0.18);
  rotateBoneAroundWorldAxis(leftLowerArm, horizontalAxis, 0.3);

  knifeGroup.updateMatrixWorld(true);
  rotateBoneAroundWorldAxis(rightUpperArm, screenDepthAxis, 0.08);
  rotateBoneAroundWorldAxis(rightUpperArm, verticalAxis, -0.3);
  rotateBoneAroundWorldAxis(rightUpperArm, horizontalAxis, -0.16);
  knifeGroup.updateMatrixWorld(true);
  rotateBoneAroundWorldAxis(rightLowerArm, screenDepthAxis, -0.46);
  rotateBoneAroundWorldAxis(rightLowerArm, verticalAxis, 0.42);
  rotateBoneAroundWorldAxis(rightLowerArm, horizontalAxis, 0.27);
  knifeGroup.updateMatrixWorld(true);
  rotateBoneAroundWorldAxis(rightHand, screenDepthAxis, 0.08);

  curlFinger(
    armsScene,
    ["DoubleFingersBeginning.001", "DoubleFingers.R.001", "DoubleFingersTip.R.001"],
    -0.86
  );
  curlFinger(armsScene, ["IndexBeginning.R.001", "Index.R.001", "IndexTip.R.001"], -0.76);
  curlFinger(armsScene, ["ThumbBeginning.R.001", "Thumb.R.001", "ThumbTip.R.001"], 0.38);

  curlFinger(armsScene, ["DoubleFingersBeginning", "DoubleFingers.L", "DoubleFingersTip.L"], 0.34);
  curlFinger(armsScene, ["IndexBeginning.L", "Index.L", "IndexTip.L"], 0.18);
  curlFinger(armsScene, ["ThumbBeginning.L", "Thumb.L", "ThumbTip.L"], -0.06);
  knifeGroup.updateMatrixWorld(true);
}

async function createKnifeRig() {
  const [{ scene: armsScene }, { scene: knifeScene }] = await Promise.all([
    instantiateAsset(ASSETS.armsRig),
    instantiateAsset(ASSETS.knife)
  ]);

  const knifeGroup = new THREE.Group();
  const armsFrame = frameScene(armsScene, 1.05, [0, -0.07, -0.18], [0, Math.PI * 0.5, 0]);
  // Oriente la lame vers l'avant-gauche, dans le même plan que la vue FPS.
  const knifeFrame = frameScene(knifeScene, 0.60, [0.5, 0, 0], [-0.8, 0, 1.2]);
  // Présente le plat de la lame à la caméra sans changer la direction de la pointe.
  knifeFrame.rotateY(Math.PI * 0.6);
  const handBone = getArmBone(armsScene, "Hand.R.001");
  const gripBone = getArmBone(armsScene, "DoubleFingersBeginning.001");
  knifeGroup.add(armsFrame, knifeFrame);
  knifeGroup.updateMatrixWorld(true);
  poseKnifeArms(armsScene, knifeGroup);
  // Le couteau est tenu à une main : masque toute la hiérarchie du bras gauche.
  const leftUpperArm = getArmBone(armsScene, "UpperArm.L");
  leftUpperArm?.scale.setScalar(0.001);
  knifeGroup.updateMatrixWorld(true);

  const armMesh = armsScene.getObjectByName("ArmModel") || null;

  if (handBone) {
    const handPosition = (gripBone || handBone).getWorldPosition(new THREE.Vector3());
    const bladeDirection = new THREE.Vector3(0, 1, 0).applyQuaternion(knifeFrame.quaternion).normalize();
    knifeFrame.position.copy(handPosition).addScaledVector(bladeDirection, 0.12);
    // Descend légèrement la poignée pour qu'elle repose au creux de la paume.
    knifeFrame.position.y -= 0.035;
    knifeGroup.updateMatrixWorld(true);
    handBone.attach(knifeFrame);
  }

  const knifeAttackBones = {
    upperArm: getArmBone(armsScene, "UpperArm.R.001"),
    lowerArm: getArmBone(armsScene, "LowerArm.R.001"),
    hand: getArmBone(armsScene, "Hand.R.001")
  };
  const attackBones = Object.values(knifeAttackBones).filter(Boolean);
  const knifeAttackState = {
    ...knifeAttackBones,
    bones: attackBones,
    baseQuaternions: new Map(attackBones.map((bone) => [bone, bone.quaternion.clone()]))
  };
  knifeGroup.userData.animateKnifeAttack = (progress) =>
    animateKnifeArmRig(knifeGroup, knifeAttackState, progress);

  knifeGroup.userData.armMesh = armMesh;
  return knifeGroup;
}

async function createGrenadeRig() {
  const [{ scene: armsScene }, { scene: grenadeScene }] = await Promise.all([
    instantiateAsset(ASSETS.armsRig),
    instantiateAsset(ASSETS.grenade)
  ]);

  const grenadeGroup = new THREE.Group();
  const armsFrame = frameScene(armsScene, 1.05, [0, -0.07, -0.18], [0, Math.PI * 0.5, 0]);
  const grenadeFrame = frameScene(grenadeScene, 0.27, [0, 0, 0], [0, 0, 0]);
  const handBone = getArmBone(armsScene, "Hand.R.001");
  const gripBone = getArmBone(armsScene, "DoubleFingersBeginning.001");
  const leftUpperArm = getArmBone(armsScene, "UpperArm.L");
  grenadeGroup.add(armsFrame, grenadeFrame);
  grenadeGroup.updateMatrixWorld(true);
  poseKnifeArms(armsScene, grenadeGroup);
  // Ferme franchement les doigts autour de la grenade pour obtenir un vrai poing.
  curlFinger(
    armsScene,
    ["DoubleFingersBeginning.001", "DoubleFingers.R.001", "DoubleFingersTip.R.001"],
    -0.58
  );
  curlFinger(armsScene, ["IndexBeginning.R.001", "Index.R.001", "IndexTip.R.001"], -0.66);
  curlFinger(armsScene, ["ThumbBeginning.R.001", "Thumb.R.001", "ThumbTip.R.001"], 0.52);
  // Les phalanges terminales se replient vers la paume sur l'axe Z.
  rotateFingerTips(
    armsScene,
    ["DoubleFingersTip.R.001", "IndexTip.R.001", "ThumbTip.R.001"],
    -0.4
  );
  grenadeGroup.updateMatrixWorld(true);
  grenadeGroup.position.set(-0.22, 0.02, 0);

  // Le lancer se lit mieux avec une seule main : le bras gauche du rig de couteau
  // traversait tout l'écran alors qu'il ne participe pas à la prise de la grenade.
  leftUpperArm?.scale.setScalar(0.001);
  grenadeGroup.updateMatrixWorld(true);

  const armMesh = armsScene.getObjectByName("ArmModel") || null;

  if (handBone) {
    const handPosition = (gripBone || handBone).getWorldPosition(new THREE.Vector3());
    grenadeFrame.position.copy(handPosition);
    grenadeFrame.position.x += 0.09;
    grenadeFrame.position.y -= 0.05;
    grenadeGroup.updateMatrixWorld(true);
    handBone.attach(grenadeFrame);
  }

  grenadeGroup.userData.armMesh = armMesh;
  return grenadeGroup;
}

export async function createWorldGrenadeModel(targetSize) {
  return createStandaloneWeapon(ASSETS.grenade, targetSize, [0, 0, 0], [0, 0, 0]);
}

export async function createViewModel() {
  const group = new THREE.Group();
  group.position.set(0.3, -0.31, -0.52);
  group.rotation.set(-0.14, -0.22, -0.1);

  const [ak47, shotgun, sniper, knife, grenade] = await Promise.all([
    createFirearm("ak47"),
    createFirearm("shotgun", ASSETS.shotgun),
    createFirearm("sniper", ASSETS.sniper),
    createKnifeRig(),
    createGrenadeRig()
  ]);

  group.add(ak47, shotgun, sniper, knife, grenade);

  const muzzles = {
    ak47: ak47.userData.muzzle,
    shotgun: shotgun.userData.muzzle,
    sniper: sniper.userData.muzzle,
    knife: new THREE.Object3D(),
    grenade: new THREE.Object3D()
  };
  muzzles.knife.position.set(0, -0.16, -0.56);
  muzzles.grenade.position.set(0, -0.12, -0.34);
  knife.add(muzzles.knife);
  grenade.add(muzzles.grenade);

  const weaponModels = { ak47, shotgun, sniper, knife, grenade };
  const animationStates = Object.values(weaponModels)
    .map((model) => model.userData.animationState)
    .filter(Boolean);
  const armMeshes = Object.fromEntries(
    Object.entries(weaponModels).map(([weapon, model]) => [weapon, model.userData.armMesh || null])
  );

  group.userData.weaponModels = weaponModels;
  group.userData.muzzles = muzzles;
  group.userData.armMeshes = armMeshes;
  group.userData.activeMuzzle = muzzles.ak47;
  group.userData.activeWeapon = "ak47";
  group.userData.updateAnimations = (delta) => {
    const activeState = animationStates.find((entry) => entry.weapon === group.userData.activeWeapon);
    activeState?.mixer.update(delta);
  };
  group.userData.playAnimation = (weapon, animation) => {
    const state = animationStates.find((entry) => entry.weapon === weapon);
    const action = state?.actions?.[animation];
    if (!action) return;
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.fadeIn(0.035);
    action.play();
  };

  group.traverse((object) => {
    if (!object.isMesh) return;
    object.frustumCulled = false;
    object.renderOrder = 4;
  });

  return group;
}
