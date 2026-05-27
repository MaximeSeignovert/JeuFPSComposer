import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { REMOTE_INTERP_SPEED } from "../config.js";
import {
  applyRemoteTeamStyle,
  colorFromPlayerId,
  createPlayerMesh,
  setRemoteAliveVisual,
  updateNameTagSprite
} from "../players/appearance.js";

function lerpAngle(from, to, t) {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * t;
}

export function createRemotePlayersController(ctx) {
  const { scene, state } = ctx;
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
    applySnapshot(remotePlayer, msg, shouldSnap);
    setRemoteAliveVisual(remotePlayer.root, msg.alive !== false);
    remotePlayer.alive = msg.alive !== false;
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
      applySnapshot(remotePlayer, p, shouldSnap);
      const playerColor = colorFromPlayerId(p.id);
      updateNameTagSprite(remotePlayer.root.userData.nameTag, p.name || "Player", playerColor);
      applyRemoteTeamStyle(remotePlayer.root, p.team, p.id);
      setRemoteAliveVisual(remotePlayer.root, p.alive !== false);
      remotePlayer.alive = p.alive !== false;
    });
  }

  function setAlive(id, alive) {
    const remotePlayer = ctx.remoteMeshes.get(id);
    if (remotePlayer) setRemoteAliveVisual(remotePlayer.root, alive);
  }

  function update(delta, time) {
    const t = THREE.MathUtils.clamp(delta * REMOTE_INTERP_SPEED, 0, 1);
    ctx.remoteMeshes.forEach((remotePlayer) => {
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
      remotePlayer.root.rotation.y = lerpAngle(remotePlayer.root.rotation.y, remotePlayer.targetRotationY || 0, t);
    });
  }

  return { applyNetworkUpdate, ensure, setAlive, syncPlayers, update };
}
