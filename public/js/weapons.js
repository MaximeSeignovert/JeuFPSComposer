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

function addCapsuleBetween(parent, start, end, radius, material) {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const direction = b.clone().sub(a);
  const length = direction.length();
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, Math.max(0.02, length - radius * 2), 5, 10),
    material
  );
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  parent.add(mesh);
  return mesh;
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

function curlFinger(armsScene, boneNames, angle) {
  boneNames.forEach((name, index) => {
    const bone = armsScene.getObjectByName(name);
    if (bone) bone.rotateX(angle * (index === 0 ? 0.78 : 1));
  });
}

function poseKnifeArms(armsScene, knifeGroup) {
  const horizontalAxis = new THREE.Vector3(1, 0, 0);
  const verticalAxis = new THREE.Vector3(0, 1, 0);
  const screenDepthAxis = new THREE.Vector3(0, 0, 1);
  const leftUpperArm = armsScene.getObjectByName("UpperArmL");
  const leftLowerArm = armsScene.getObjectByName("LowerArmL");
  const rightUpperArm = armsScene.getObjectByName("UpperArmR001");
  const rightLowerArm = armsScene.getObjectByName("LowerArmR001");
  const rightHand = armsScene.getObjectByName("HandR001");

  rotateBoneAroundWorldAxis(leftUpperArm, screenDepthAxis, -0.1);
  rotateBoneAroundWorldAxis(leftUpperArm, verticalAxis, 0.25);
  rotateBoneAroundWorldAxis(leftUpperArm, horizontalAxis, -0.1);
  knifeGroup.updateMatrixWorld(true);
  rotateBoneAroundWorldAxis(leftLowerArm, screenDepthAxis, 0.3);
  rotateBoneAroundWorldAxis(leftLowerArm, verticalAxis, -0.35);
  rotateBoneAroundWorldAxis(leftLowerArm, horizontalAxis, 0.18);

  knifeGroup.updateMatrixWorld(true);
  rotateBoneAroundWorldAxis(rightUpperArm, screenDepthAxis, 0.12);
  rotateBoneAroundWorldAxis(rightUpperArm, verticalAxis, -0.25);
  rotateBoneAroundWorldAxis(rightUpperArm, horizontalAxis, -0.1);
  knifeGroup.updateMatrixWorld(true);
  rotateBoneAroundWorldAxis(rightLowerArm, screenDepthAxis, -0.4);
  rotateBoneAroundWorldAxis(rightLowerArm, verticalAxis, 0.35);
  rotateBoneAroundWorldAxis(rightLowerArm, horizontalAxis, 0.2);
  knifeGroup.updateMatrixWorld(true);
  rotateBoneAroundWorldAxis(rightHand, screenDepthAxis, 0.12);

  curlFinger(
    armsScene,
    ["DoubleFingersBeginning001", "DoubleFingersR001", "DoubleFingersTipR001"],
    -0.86
  );
  curlFinger(armsScene, ["IndexBeginningR001", "IndexR001", "IndexTipR001"], -0.76);
  curlFinger(armsScene, ["ThumbBeginningR001", "ThumbR001", "ThumbTipR001"], 0.38);

  curlFinger(armsScene, ["DoubleFingersBeginning", "DoubleFingersL", "DoubleFingersTipL"], 0.62);
  curlFinger(armsScene, ["IndexBeginningL", "IndexL", "IndexTipL"], 0.52);
  curlFinger(armsScene, ["ThumbBeginningL", "ThumbL", "ThumbTipL"], -0.2);
  knifeGroup.updateMatrixWorld(true);
}

function hideImportedSleeves(armRoot) {
  armRoot?.traverse((object) => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (!material || !/^shirt$/i.test(material.name || "")) return;
      material.visible = false;
    });
  });
}

function addBentSleeve(knifeGroup, shoulderBone, elbowBone, wristBone, material) {
  if (!shoulderBone || !elbowBone || !wristBone) return;
  knifeGroup.updateMatrixWorld(true);
  const shoulder = knifeGroup.worldToLocal(shoulderBone.getWorldPosition(new THREE.Vector3()));
  const elbow = knifeGroup.worldToLocal(elbowBone.getWorldPosition(new THREE.Vector3()));
  const wrist = knifeGroup.worldToLocal(wristBone.getWorldPosition(new THREE.Vector3()));
  addCapsuleBetween(knifeGroup, shoulder.toArray(), elbow.toArray(), 0.078, material);
  addCapsuleBetween(knifeGroup, elbow.toArray(), wrist.toArray(), 0.068, material);
  const elbowJoint = new THREE.Mesh(new THREE.SphereGeometry(0.078, 10, 8), material);
  elbowJoint.position.copy(elbow);
  knifeGroup.add(elbowJoint);
}

async function createKnifeRig() {
  const [{ scene: armsScene }, { scene: knifeScene }] = await Promise.all([
    instantiateAsset(ASSETS.armsRig),
    instantiateAsset(ASSETS.knife)
  ]);

  const knifeGroup = new THREE.Group();
  const armsFrame = frameScene(armsScene, 1.05, [0, -0.07, -0.18], [0, Math.PI * 0.5, 0]);
  const knifeFrame = frameScene(knifeScene, 0.42, [0, 0, 0], [-0.8, 0, 0.48]);
  const handBone = armsScene.getObjectByName("HandR001");
  const gripBone = armsScene.getObjectByName("DoubleFingersBeginning001");
  knifeGroup.add(armsFrame, knifeFrame);
  knifeGroup.updateMatrixWorld(true);
  poseKnifeArms(armsScene, knifeGroup);

  const armMesh = armsScene.getObjectByName("ArmModel") || null;
  hideImportedSleeves(armMesh);
  const sleeveMaterial = new THREE.MeshStandardMaterial({
    color: 0x34442f,
    roughness: 0.92,
    metalness: 0,
    flatShading: true
  });
  addBentSleeve(
    knifeGroup,
    armsScene.getObjectByName("UpperArmL"),
    armsScene.getObjectByName("LowerArmL"),
    armsScene.getObjectByName("HandL"),
    sleeveMaterial
  );
  addBentSleeve(
    knifeGroup,
    armsScene.getObjectByName("UpperArmR001"),
    armsScene.getObjectByName("LowerArmR001"),
    armsScene.getObjectByName("HandR001"),
    sleeveMaterial
  );

  if (handBone) {
    const handPosition = (gripBone || handBone).getWorldPosition(new THREE.Vector3());
    const bladeDirection = new THREE.Vector3(0, 1, 0).applyQuaternion(knifeFrame.quaternion).normalize();
    knifeFrame.position.copy(handPosition).addScaledVector(bladeDirection, 0.12);
    knifeGroup.updateMatrixWorld(true);
    handBone.attach(knifeFrame);
  }

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
  const handBone = armsScene.getObjectByName("HandR001");
  const gripBone = armsScene.getObjectByName("DoubleFingersBeginning001");
  const leftUpperArm = armsScene.getObjectByName("UpperArmL");
  grenadeGroup.add(armsFrame, grenadeFrame);
  grenadeGroup.updateMatrixWorld(true);
  poseKnifeArms(armsScene, grenadeGroup);
  grenadeGroup.position.set(-0.22, 0.02, 0);

  // Le lancer se lit mieux avec une seule main : le bras gauche du rig de couteau
  // traversait tout l'écran alors qu'il ne participe pas à la prise de la grenade.
  leftUpperArm?.scale.setScalar(0.001);
  grenadeGroup.updateMatrixWorld(true);

  const armMesh = armsScene.getObjectByName("ArmModel") || null;
  hideImportedSleeves(armMesh);
  const sleeveMaterial = new THREE.MeshStandardMaterial({
    color: 0x34442f,
    roughness: 0.92,
    metalness: 0,
    flatShading: true
  });
  addBentSleeve(
    grenadeGroup,
    armsScene.getObjectByName("UpperArmR001"),
    armsScene.getObjectByName("LowerArmR001"),
    armsScene.getObjectByName("HandR001"),
    sleeveMaterial
  );

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
