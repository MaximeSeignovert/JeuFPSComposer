import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { REMOTE_INTERP_SPEED } from "../config.js";
import {
  applyRemoteTeamStyle,
  colorFromPlayerId,
  createPlayerMesh,
  resetRemoteDeathVisual,
  resolvePlayerAppearanceAssets,
  setRemoteWeapon,
  setRemoteDeathOpacity,
  updateRemoteCombatPose,
  updateRemoteLocomotion,
  updateNameTagSprite
} from "../players/appearance.js";

const REMOTE_DEATH_FALL_MS = 450;
const REMOTE_DEATH_FADE_MS = 2000;

const RAGDOLL_BONE_OFFSETS = [
  ["mixamorig:Hips", 0.16, 0.06, 0.12, 0],
  ["mixamorig:Spine", 0.22, 0.04, 0.16, 24],
  ["mixamorig:Spine1", 0.16, -0.06, 0.12, 42],
  ["mixamorig:Spine2", 0.1, 0.04, 0.08, 58],
  ["mixamorig:Neck", -0.16, 0.08, -0.16, 76],
  ["mixamorig:Head", 0.2, -0.12, 0.1, 92],
  ["mixamorig:LeftShoulder", 0.16, 0.18, -0.62, 34],
  ["mixamorig:LeftArm", 0.96, 0.12, -0.72, 52],
  ["mixamorig:LeftForeArm", 1.08, 0.1, -0.72, 78],
  ["mixamorig:LeftHand", 0.3, 0.08, -0.28, 102],
  ["mixamorig:RightShoulder", 0.12, -0.14, 0.5, 38],
  ["mixamorig:RightArm", 1.1, -0.1, 0.34, 58],
  ["mixamorig:RightForeArm", 0.78, 0.12, 0.68, 86],
  ["mixamorig:RightHand", 0.16, -0.08, 0.22, 108],
  ["mixamorig:LeftUpLeg", -0.14, 0.06, 0.14, 34],
  ["mixamorig:LeftLeg", 0.54, 0.04, -0.1, 78],
  ["mixamorig:LeftFoot", -0.24, 0, 0.16, 108],
  ["mixamorig:RightUpLeg", 0.22, -0.05, -0.12, 38],
  ["mixamorig:RightLeg", -0.44, -0.1, 0.18, 84],
  ["mixamorig:RightFoot", -0.18, 0, -0.12, 114]
];

function lerpAngle(from, to, t) {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * t;
}

export async function createRemotePlayersController(ctx) {
  const { scene, state } = ctx;
  await resolvePlayerAppearanceAssets();

  const localBody = createPlayerMesh(true);
  localBody.visible = false;
  scene.add(localBody);

  function ensure(id) {
    let remotePlayer = ctx.remoteMeshes.get(id);
    if (!remotePlayer) {
      const root = createPlayerMesh(false);
      scene.add(root);
      remotePlayer = { root, targetPosition: null, targetRotationY: 0 };
      ctx.remoteMeshes.set(id, remotePlayer);
    }
    remotePlayer.id = id;
    remotePlayer.root.userData.playerId = id;
    if (remotePlayer.root.userData.hitbox) {
      remotePlayer.root.userData.hitbox.userData.playerId = id;
    }
    return remotePlayer;
  }

  function getDeathFallRotation(id) {
    let hash = 0;
    const key = String(id || "remote-player");
    for (let index = 0; index < key.length; index += 1) {
      hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
    }
    return hash % 2 === 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
  }

  function createRagdollPose(root, id) {
    const bones = root.userData.bones || {};
    let hash = 0;
    const key = String(id || "remote-player");
    for (let index = 0; index < key.length; index += 1) {
      hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
    }
    const variation = (hash % 5 - 2) * 0.035;
    const side = hash % 2 === 0 ? 1 : -1;

    return RAGDOLL_BONE_OFFSETS.map(([name, x, y, z, delayMs]) => {
      const bone = bones[name] || root.userData.model?.getObjectByName(name);
      if (!bone) return null;

      const startQuaternion = bone.quaternion.clone();
      const offset = new THREE.Euler(
        x + variation * 0.4,
        y + variation + side * (name.includes("Right") ? -0.025 : 0.025),
        z + variation * 0.5
      );
      const targetQuaternion = startQuaternion
        .clone()
        .multiply(new THREE.Quaternion().setFromEuler(offset));
      return { bone, delayMs, startQuaternion, targetQuaternion };
    }).filter(Boolean);
  }

  function startDeath(remotePlayer) {
    if (!remotePlayer?.root || remotePlayer.deathAnimation) return;

    const { root } = remotePlayer;
    const modelPivot = root.userData.modelPivot;
    const ragdollBones = createRagdollPose(root, remotePlayer.id);
    if (modelPivot) modelPivot.rotation.set(0, Math.PI, 0);
    if (root.userData.nameTag) root.userData.nameTag.visible = false;
    if (root.userData.hitbox) root.userData.hitbox.visible = false;
    if (root.userData.idleAction) root.userData.idleAction.paused = true;
    ragdollBones.forEach(({ bone, startQuaternion }) => bone.quaternion.copy(startQuaternion));
    root.visible = true;
    setRemoteDeathOpacity(root, 1);

    remotePlayer.deathAnimation = {
      elapsedMs: 0,
      fallRotation: getDeathFallRotation(remotePlayer.id),
      ragdollBones
    };
  }

  function revive(remotePlayer) {
    if (!remotePlayer?.root) return;
    remotePlayer.deathAnimation = null;
    resetRemoteDeathVisual(remotePlayer.root);
  }

  function updateDeathAnimation(remotePlayer, delta) {
    const animation = remotePlayer.deathAnimation;
    if (!animation) return;

    animation.elapsedMs += Math.max(0, delta) * 1000;
    const fallProgress = THREE.MathUtils.clamp(animation.elapsedMs / REMOTE_DEATH_FALL_MS, 0, 1);
    const fallEased = 1 - Math.pow(1 - fallProgress, 3);
    const modelPivot = remotePlayer.root.userData.modelPivot;
    if (modelPivot) modelPivot.rotation.x = animation.fallRotation * fallEased;

    animation.ragdollBones.forEach(({ bone, delayMs, startQuaternion, targetQuaternion }) => {
      const boneProgress = THREE.MathUtils.clamp(
        (animation.elapsedMs - delayMs) / Math.max(180, REMOTE_DEATH_FALL_MS - delayMs * 0.45),
        0,
        1
      );
      const boneEased = boneProgress * boneProgress * (3 - 2 * boneProgress);
      bone.quaternion.slerpQuaternions(startQuaternion, targetQuaternion, boneEased);
    });

    const fadeProgress = THREE.MathUtils.clamp(
      (animation.elapsedMs - REMOTE_DEATH_FALL_MS) / REMOTE_DEATH_FADE_MS,
      0,
      1
    );
    setRemoteDeathOpacity(remotePlayer.root, 1 - fadeProgress);
    if (fadeProgress >= 1) remotePlayer.root.visible = false;
  }

  function applySnapshot(remotePlayer, payload, snap = false) {
    if (!payload?.position) return;
    const groundOffset = Number(remotePlayer.root.userData.groundOffset) || 0;
    const targetPos = new THREE.Vector3(payload.position.x, payload.position.y - groundOffset, payload.position.z);
    const targetRot = Number(payload.rotationY) || 0;

    if (snap || !remotePlayer.targetPosition) {
      remotePlayer.root.position.copy(targetPos);
      remotePlayer.root.rotation.y = targetRot;
    }
    remotePlayer.targetPosition = targetPos;
    remotePlayer.targetRotationY = targetRot;
  }

  function applyNetworkUpdate(msg) {
    if (!msg.id || msg.id === state.playerId) return;
    const remotePlayer = ensure(msg.id);
    const shouldSnap = remotePlayer.alive === false && msg.alive !== false;
    remotePlayer.team = msg.team || remotePlayer.team || null;
    setRemoteWeapon(remotePlayer.root, msg.weapon || remotePlayer.weapon || "ak47");
    remotePlayer.weapon = msg.weapon || remotePlayer.weapon || "ak47";
    applySnapshot(remotePlayer, msg, shouldSnap);
    const isAlive = msg.alive !== false;
    if (isAlive && remotePlayer.alive === false) revive(remotePlayer);
    if (!isAlive && remotePlayer.alive !== false) startDeath(remotePlayer);
    remotePlayer.alive = isAlive;
    if (msg.name || msg.team) {
      const playerColor = colorFromPlayerId(msg.id);
      updateNameTagSprite(remotePlayer.root.userData.nameTag, msg.name || "Player", playerColor);
      applyRemoteTeamStyle(remotePlayer.root, msg.team, msg.id);
    }
  }

  function syncPlayers(players) {
    const remoteIds = new Set(players.filter((p) => p.id !== state.playerId).map((p) => p.id));
    ctx.remoteMeshes.forEach((remotePlayer, id) => {
      if (remoteIds.has(id)) return;
      remotePlayer.root.userData.mixer?.stopAllAction();
      scene.remove(remotePlayer.root);
      ctx.remoteMeshes.delete(id);
    });

    players.forEach((p) => {
      if (!p.id || p.id === state.playerId) return;
      const existingRemotePlayer = ctx.remoteMeshes.get(p.id);
      const remotePlayer = ensure(p.id);
      const shouldSnap =
        !existingRemotePlayer ||
        !remotePlayer.targetPosition ||
        (remotePlayer.alive === false && p.alive !== false);
      remotePlayer.team = p.team || remotePlayer.team || null;
      setRemoteWeapon(remotePlayer.root, p.weapon || remotePlayer.weapon || "ak47");
      remotePlayer.weapon = p.weapon || remotePlayer.weapon || "ak47";
      applySnapshot(remotePlayer, p, shouldSnap);
      const playerColor = colorFromPlayerId(p.id);
      updateNameTagSprite(remotePlayer.root.userData.nameTag, p.name || "Player", playerColor);
      applyRemoteTeamStyle(remotePlayer.root, p.team, p.id);
      const isAlive = p.alive !== false;
      if (isAlive && remotePlayer.alive === false) revive(remotePlayer);
      if (!isAlive && remotePlayer.alive !== false) startDeath(remotePlayer);
      remotePlayer.alive = isAlive;
    });
  }

  function setAlive(id, alive) {
    const remotePlayer = ensure(id);
    if (alive) {
      if (remotePlayer.alive === false) revive(remotePlayer);
    } else if (remotePlayer.alive !== false) {
      startDeath(remotePlayer);
    }
    remotePlayer.alive = alive !== false;
  }

  function update(delta, time) {
    const t = THREE.MathUtils.clamp(delta * REMOTE_INTERP_SPEED, 0, 1);
    ctx.remoteMeshes.forEach((remotePlayer) => {
      if (!remotePlayer) return;

      if (remotePlayer.deathAnimation) {
        updateDeathAnimation(remotePlayer, delta);
      }

      if (!remotePlayer.targetPosition) return;

      let movementSpeed = 0;
      if (!remotePlayer.deathAnimation) {
        const previousX = remotePlayer.root.position.x;
        const previousY = remotePlayer.root.position.y;
        const previousZ = remotePlayer.root.position.z;
        remotePlayer.root.position.lerp(remotePlayer.targetPosition, t);
        remotePlayer.root.rotation.y = lerpAngle(remotePlayer.root.rotation.y, remotePlayer.targetRotationY || 0, t);
        movementSpeed = Math.hypot(
          remotePlayer.root.position.x - previousX,
          remotePlayer.root.position.y - previousY,
          remotePlayer.root.position.z - previousZ
        ) / Math.max(delta, 0.001);
      }

      if (!remotePlayer.deathAnimation && remotePlayer.root.userData.mixer) {
        remotePlayer.root.userData.mixer.update(delta);
        remotePlayer.root.updateMatrixWorld(true);
        updateRemoteCombatPose(remotePlayer.root);
        updateRemoteLocomotion(remotePlayer.root, delta, Math.min(movementSpeed, 6));
      } else if (!remotePlayer.deathAnimation && remotePlayer.root.userData.parts && time !== undefined) {
        const parts = remotePlayer.root.userData.parts;
        const baseTorsoY = Number(parts.baseTorsoY) || 1.43;
        const dist = remotePlayer.root.position.distanceTo(remotePlayer.targetPosition);
        const speed = Math.min(dist / delta, 5);

        if (speed > 0.5) {
          const walkCycle = time * 12;
          parts.leftLeg.rotation.x = Math.sin(walkCycle) * 0.5;
          parts.rightLeg.rotation.x = Math.sin(walkCycle + Math.PI) * 0.5;
          parts.leftArm.rotation.x = Math.sin(walkCycle + Math.PI) * 0.1;
          parts.rightArm.rotation.x = Math.sin(walkCycle) * 0.08;
          parts.torso.rotation.y = Math.sin(walkCycle) * 0.045;
          parts.torso.position.y = baseTorsoY;
        } else {
          parts.leftLeg.rotation.x = THREE.MathUtils.lerp(parts.leftLeg.rotation.x, 0, 0.1);
          parts.rightLeg.rotation.x = THREE.MathUtils.lerp(parts.rightLeg.rotation.x, 0, 0.1);
          parts.leftArm.rotation.x = THREE.MathUtils.lerp(parts.leftArm.rotation.x, 0, 0.1);
          parts.rightArm.rotation.x = THREE.MathUtils.lerp(parts.rightArm.rotation.x, 0, 0.1);
          parts.torso.rotation.y = THREE.MathUtils.lerp(parts.torso.rotation.y, 0, 0.1);
          parts.torso.position.y = baseTorsoY;
        }
      }
    });
  }

  return { applyNetworkUpdate, ensure, setAlive, syncPlayers, update };
}
