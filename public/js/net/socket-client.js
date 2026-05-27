import { GRENADE_CONFIG } from "../config.js";
import { loadPlayerName, sanitizePlayerName, savePlayerName } from "../player-name.js";
import { shouldUsePointerLock, syncTouchControls } from "../input/touch-controls.js";

export function createSocketClient(ctx) {
  const { state } = ctx;
  const { canvas, nameInput } = ctx.dom;

  function isOpen() {
    return state.ws && state.ws.readyState === WebSocket.OPEN;
  }

  function send(data) {
    if (!isOpen()) return false;
    state.ws.send(JSON.stringify(data));
    return true;
  }

  function connect() {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    state.ws = new WebSocket(`${protocol}://${location.host}`);

    state.ws.addEventListener("open", () => {
      savePlayerName(nameInput.value);
      send({ type: "player:setName", name: sanitizePlayerName(nameInput.value) });
    });

    state.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
    });
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
      state.weapon = msg.weapon;
      state.health = Number(msg.health) || 100;
      state.grenadesHeld = Math.max(0, Math.min(1, Number(msg.grenades) || 0));
      ctx.controllers.weapons.refillAllMagazines();
      ctx.controllers.hud.setLocalAlive(msg.alive !== false);
      if (msg.spawn) ctx.controllers.player.applySpawn(msg.spawn);
      ctx.controllers.weapons.setActiveWeaponModel(state.weapon);
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
      state.respawnUntil = 0;
      ctx.controllers.weapons.refillAllMagazines();
      ctx.controllers.hud.setLocalAlive(msg.alive !== false);
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
        ctx.controllers.effects.spawnKnifeSlash(msg.origin, slashDirection, false);
        return;
      }
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

  function joinRoom(roomId) {
    if (!isOpen()) return;
    savePlayerName(nameInput.value);
    send({ type: "player:setName", name: sanitizePlayerName(nameInput.value) });
    send({ type: "room:join", roomId });
  }

  function sendGrenadeExplode({ id, position }) {
    send({ type: "grenade:explode", id, position });
  }

  function sendGrenadePickup(pickupId) {
    send({ type: "grenade:pickup", pickupId });
  }

  function sendGrenadeThrow({ id, origin, direction }) {
    send({ type: "grenade:throw", id, origin, direction });
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
