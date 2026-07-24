import { GRENADE_CONFIG } from "../config.js";
import { loadPlayerName, sanitizePlayerName, savePlayerName } from "../player-name.js";
import { shouldUsePointerLock, syncTouchControls } from "../input/touch-controls.js";

export function createSocketClient(ctx) {
  const { state } = ctx;
  const { canvas, nameInput } = ctx.dom;
  const roomName = "fps_room";
  let client = null;
  let room = null;

  function isOpen() {
    return Boolean(room);
  }

  function send(data) {
    if (!isOpen()) return false;
    room.send(data.type, data);
    return true;
  }

  async function refreshRooms() {
    try {
      const response = await fetch("/api/rooms", { cache: "no-store" });
      const payload = await response.json();
      ctx.controllers.hud.renderRooms(Array.isArray(payload.rooms) ? payload.rooms : []);
    } catch {
      ctx.controllers.hud.showRoomError("Impossible de charger les rooms");
    }
  }

  function attachRoomHandlers(nextRoom) {
    nextRoom.onMessage("rooms:update", (msg) => handleMessage({ type: "rooms:update", ...msg }));
    nextRoom.onMessage("room:joined", (msg) => handleMessage({ type: "room:joined", ...msg }));
    nextRoom.onMessage("room:players", (msg) => handleMessage({ type: "room:players", ...msg }));
    nextRoom.onMessage("room:error", (msg) => handleMessage({ type: "room:error", ...msg }));
    nextRoom.onMessage("room:grenades", (msg) => handleMessage({ type: "room:grenades", ...msg }));
    nextRoom.onMessage("player:update", (msg) => handleMessage({ type: "player:update", ...msg }));
    nextRoom.onMessage("player:health", (msg) => handleMessage({ type: "player:health", ...msg }));
    nextRoom.onMessage("player:grenadeInventory", (msg) => handleMessage({ type: "player:grenadeInventory", ...msg }));
    nextRoom.onMessage("player:died", (msg) => handleMessage({ type: "player:died", ...msg }));
    nextRoom.onMessage("player:respawn", (msg) => handleMessage({ type: "player:respawn", ...msg }));
    nextRoom.onMessage("player:shoot", (msg) => handleMessage({ type: "player:shoot", ...msg }));
    nextRoom.onMessage("grenade:thrown", (msg) => handleMessage({ type: "grenade:thrown", ...msg }));
    nextRoom.onMessage("grenade:explode", (msg) => handleMessage({ type: "grenade:explode", ...msg }));
    nextRoom.onLeave(() => {
      room = null;
      state.joined = false;
      ctx.controllers.hud.showRoomError("Connexion perdue");
      refreshRooms();
    });
  }

  function connect() {
    nameInput.value = loadPlayerName();
    if (!window.Colyseus?.Client) {
      ctx.controllers.hud.showRoomError("SDK Colyseus indisponible");
      return;
    }
    client = new window.Colyseus.Client(location.origin);
    refreshRooms();
  }

  function handleMessage(msg) {
    if (msg.type === "rooms:update") {
      ctx.controllers.hud.renderRooms(msg.rooms);
      return;
    }

    if (msg.type === "room:joined") {
      state.joined = true;
      state.playerId = msg.id;
      state.roomId = msg.roomId;
      state.team = msg.team;
      ctx.controllers.weapons.initializeWeaponSlots(msg.weapon);
      state.health = Number(msg.health) || 100;
      state.grenadesHeld = Math.max(0, Math.min(1, Number(msg.grenades) || 0));
      ctx.controllers.weapons.setGrenadeSlotAvailable(state.grenadesHeld >= 1);
      ctx.controllers.weapons.refillAllMagazines();
      ctx.controllers.hud.setLocalAlive(msg.alive !== false);
      if (msg.spawn) ctx.controllers.player.applySpawn(msg.spawn);
      ctx.controllers.hud.syncWeaponChoice();
      ctx.controllers.hud.updateGrenade();
      ctx.controllers.hud.updateAmmo();
      ctx.controllers.hud.enterGame();
      return;
    }

    if (msg.type === "room:players") {
      const players = Array.isArray(msg.players) ? msg.players : [];
      ctx.controllers.hud.updateFromPlayers(players);
      ctx.controllers.remotePlayers.syncPlayers(players);
      return;
    }

    if (msg.type === "room:error") {
      ctx.controllers.hud.showRoomError(msg.message);
      return;
    }

    if (msg.type === "room:grenades") {
      ctx.controllers.grenades.syncPickups(Array.isArray(msg.pickups) ? msg.pickups : []);
      return;
    }

    if (msg.type === "player:update") {
      ctx.controllers.remotePlayers.applyNetworkUpdate(msg);
      return;
    }

    if (msg.type === "player:health") {
      const previousHealth = state.health;
      state.health = Number(msg.health) || 0;
      const damageTaken = Math.max(0, previousHealth - state.health);
      if (damageTaken > 0) ctx.controllers.effects.triggerDamageOverlay(damageTaken);
      ctx.controllers.hud.updateHealth();
      return;
    }

    if (msg.type === "player:grenadeInventory") {
      state.grenadesHeld = Math.max(0, Math.min(1, Number(msg.count) || 0));
      ctx.controllers.weapons.setGrenadeSlotAvailable(state.grenadesHeld >= 1);
      ctx.controllers.hud.updateGrenade();
      return;
    }

    if (msg.type === "player:died") {
      if (msg.killerId) {
        ctx.controllers.hud.addKillFeedEntry({
          killerName: String(msg.killerName || "Inconnu"),
          victimName: String(msg.victimName || "Inconnu"),
          weapon: String(msg.killerWeapon || "")
        });
      }
      if (msg.id === state.playerId) {
        state.deathKillerId = msg.killerId || null;
        state.deathKillerName = String(msg.killerName || "Inconnu");
        state.deathKillerWeapon = String(msg.killerWeapon || "");
        ctx.controllers.hud.setLocalAlive(false);
        state.respawnUntil = performance.now() + state.respawnDelayMs;
      } else {
        ctx.controllers.remotePlayers.setAlive(msg.id, false);
      }
      return;
    }

    if (msg.type === "player:respawn") {
      if (msg.spawn) ctx.controllers.player.applySpawn(msg.spawn);
      state.health = Number(msg.health) || 100;
      state.grenadesHeld = Math.max(0, Math.min(1, Number(msg.grenades) || 0));
      ctx.controllers.weapons.setGrenadeSlotAvailable(state.grenadesHeld >= 1);
      state.respawnUntil = 0;
      ctx.controllers.weapons.refillAllMagazines();
      ctx.controllers.hud.setLocalAlive(msg.alive !== false);
      ctx.controllers.weapons.equipPrimaryWeapon();
      ctx.controllers.hud.setPauseMenu(false);
      if (shouldUsePointerLock() && document.pointerLockElement !== canvas) canvas.requestPointerLock();
      ctx.controllers.hud.updateHealth();
      ctx.controllers.hud.updateGrenade();
      ctx.controllers.hud.updateAmmo();
      syncTouchControls();
      return;
    }

    if (msg.type === "player:shoot") {
      if (!msg.id || msg.id === state.playerId) return;
      if (!msg.origin || !Array.isArray(msg.shots)) return;
      if (msg.weapon === "knife") {
        const slashDirection = msg.shots.find((shot) => shot?.direction)?.direction;
        ctx.controllers.sound?.playShot(msg.weapon, msg.origin, true);
        ctx.controllers.effects.spawnKnifeSlash(msg.origin, slashDirection, false);
        return;
      }
      ctx.controllers.sound?.playShot(msg.weapon, msg.origin, true);
      ctx.controllers.effects.spawnMuzzleFlash(msg.origin);
      msg.shots.forEach((shot) => {
        if (!shot?.direction) return;
        if (shot.melee) {
          ctx.controllers.effects.spawnKnifeSlash(msg.origin, shot.direction, false);
          return;
        }
        const range = Number(shot.range) || 80;
        const bulletSpeed = Number(shot.bulletSpeed) || 68;
        const impact = ctx.controllers.effects.traceImpact(msg.origin, shot.direction, range, false, 0);
        ctx.controllers.effects.spawnBulletVisual(msg.origin, shot.direction, false, bulletSpeed, impact?.distance || range);
      });
      return;
    }

    if (msg.type === "grenade:thrown") {
      ctx.controllers.grenades.spawnThrown(msg.grenade);
      return;
    }

    if (msg.type === "grenade:explode") {
      ctx.controllers.grenades.explode(msg.id, msg.position, Number(msg.radius) || GRENADE_CONFIG.blastRadius, false);
    }
  }

  async function joinRoom() {
    if (!client) return;
    savePlayerName(nameInput.value);
    const name = sanitizePlayerName(nameInput.value);
    try {
      const roomListResponse = await fetch("/api/rooms", { cache: "no-store" });
      const roomListPayload = await roomListResponse.json();
      const roomInfo = Array.isArray(roomListPayload.rooms) ? roomListPayload.rooms[0] : null;
      room = roomInfo?.roomId
        ? await client.joinById(roomInfo.roomId, { name })
        : await client.create(roomName, { name });
      state.room = room;
      attachRoomHandlers(room);
      room.send("player:setName", { name });
      room.send("room:sync", {});
    } catch {
      ctx.controllers.hud.showRoomError("Room pleine ou indisponible");
      refreshRooms();
    }
  }

  function sendGrenadeExplode({ id, position }) {
    send({ type: "grenade:explode", id, position });
  }

  function sendGrenadePickup(pickupId) {
    send({ type: "grenade:pickup", pickupId });
  }

  function sendGrenadeThrow({ id, origin, direction, speed }) {
    send({ type: "grenade:throw", id, origin, direction, speed });
  }

  function sendHit({ targetId, damage }) {
    send({ type: "player:hit", targetId, damage });
  }

  function sendPlayerUpdate({ position, rotationY }) {
    send({ type: "player:update", position, rotationY });
  }

  function sendShoot({ origin, weapon, shots }) {
    send({ type: "player:shoot", origin, weapon, shots });
  }

  function sendWeaponSelect(weapon) {
    send({ type: "weapon:select", weapon });
  }

  nameInput.value = loadPlayerName();
  nameInput.addEventListener("input", () => savePlayerName(nameInput.value));

  return {
    connect,
    isOpen,
    joinRoom,
    sendGrenadeExplode,
    sendGrenadePickup,
    sendGrenadeThrow,
    sendHit,
    sendPlayerUpdate,
    sendShoot,
    sendWeaponSelect
  };
}
