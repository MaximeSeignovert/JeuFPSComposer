const express = require("express");
const http = require("http");
const net = require("net");
const path = require("path");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const DEFAULT_PORT = 3000;
const PORT = Number(process.env.PORT || DEFAULT_PORT);
const MAX_ROOMS = 1;
const ROOM_SIZE = 10;
const MAX_HEALTH = 100;
const RESPAWN_DELAY_MS = 3200;
const RESPAWN_IMMUNITY_MS = 1800;
const ENABLE_DEV_BOT = process.env.DEV_BOT === "1" || process.env.NODE_ENV !== "production";
const DEV_BOT_FIRE_INTERVAL_MS = 220;
const DEV_BOT_MOVE_INTERVAL_MS = 60;
const DEV_BOT_BULLET_SPEED = 70;
const DEV_BOT_RANGE = 90;
const DEV_BOT_DAMAGE = 8;
const DEV_BOT_TRAJECTORY_RADIUS = 2.2;
const DEV_BOT_TRAJECTORY_SPEED = 1.1;
const SPAWN_MARGIN = 4;
const MAP_HALF_SIZE = 40;
const rooms = new Map();

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_, res) => {
  res.json({ ok: true });
});

function createRoom(id) {
  rooms.set(id, {
    id,
    players: new Map(),
    devBot: {
      id: `${id}-dev-bot`,
      name: "DEV Bot",
      team: "ffa",
      weapon: "ak47",
      health: 100,
      alive: true,
      kills: 0,
      deaths: 0,
      position: { x: 0, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
      center: { x: 0, y: 0, z: 0 },
      phase: Math.random() * Math.PI * 2,
      rotationY: 0,
      timer: null
    }
  });
}

for (let i = 1; i <= MAX_ROOMS; i += 1) {
  createRoom(`Room-${i}`);
}

function getRoomSnapshot() {
  return Array.from(rooms.values()).map((room) => ({
    id: room.id,
    count: room.players.size,
    max: ROOM_SIZE
  }));
}

function broadcastRoomList() {
  const payload = JSON.stringify({
    type: "rooms:update",
    rooms: getRoomSnapshot()
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

function sendToRoom(roomId, data) {
  const room = rooms.get(roomId);
  if (!room) return;
  const payload = JSON.stringify(data);
  room.players.forEach((playerWs) => {
    if (playerWs.readyState === WebSocket.OPEN) {
      playerWs.send(payload);
    }
  });
}

function getSpawnPosition() {
  const half = MAP_HALF_SIZE - SPAWN_MARGIN;
  const x = (Math.random() - 0.5) * half * 2;
  const z = (Math.random() - 0.5) * half * 2;
  return { x, y: 0, z };
}

function roomPlayersPayload(room) {
  const players = Array.from(room.players.values()).map((pws) => ({
    id: pws.meta.id,
    name: pws.meta.name,
    team: pws.meta.team,
    weapon: pws.meta.weapon,
    position: pws.meta.lastPosition || null,
    rotationY: Number(pws.meta.rotationY) || 0,
    health: pws.meta.health,
    alive: pws.meta.alive,
    kills: pws.meta.kills,
    deaths: pws.meta.deaths
  }));
  if (ENABLE_DEV_BOT && room.devBot) {
    players.push({
      id: room.devBot.id,
      name: room.devBot.name,
      team: room.devBot.team,
      weapon: room.devBot.weapon,
      position: room.devBot.position,
      rotationY: 0,
      health: room.devBot.health,
      alive: room.devBot.alive,
      kills: room.devBot.kills,
      deaths: room.devBot.deaths
    });
  }
  return players;
}

function sendRoomPlayers(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  sendToRoom(roomId, {
    type: "room:players",
    players: roomPlayersPayload(room)
  });
}

function startDevBot(room) {
  if (!ENABLE_DEV_BOT || !room?.devBot) return;
  if (room.devBot.timer) return;
  if (room.players.size === 0) return;

  const origin = getSpawnPosition();
  room.devBot.position = { ...origin };
  room.devBot.center = { ...origin };
  room.devBot.phase = Math.random() * Math.PI * 2;
  room.devBot.rotationY = 0;
  sendToRoom(room.id, {
    type: "player:update",
    id: room.devBot.id,
    name: room.devBot.name,
    team: room.devBot.team,
    weapon: room.devBot.weapon,
    health: room.devBot.health,
    alive: room.devBot.alive,
    position: room.devBot.position,
    rotationY: room.devBot.rotationY
  });

  room.devBot.timer = setInterval(() => {
    if (room.players.size === 0) return;
    room.devBot.phase += DEV_BOT_TRAJECTORY_SPEED * (DEV_BOT_MOVE_INTERVAL_MS / 1000);
    const angle = room.devBot.phase;
    const x = room.devBot.center.x + Math.cos(angle) * DEV_BOT_TRAJECTORY_RADIUS;
    const z = room.devBot.center.z + Math.sin(angle) * DEV_BOT_TRAJECTORY_RADIUS;
    const tangentX = -Math.sin(angle);
    const tangentZ = Math.cos(angle);
    const dirLength = Math.hypot(tangentX, tangentZ) || 1;
    room.devBot.direction = { x: tangentX / dirLength, y: 0, z: tangentZ / dirLength };
    room.devBot.rotationY = Math.atan2(room.devBot.direction.x, room.devBot.direction.z);
    room.devBot.position = { x, y: room.devBot.center.y, z };

    sendToRoom(room.id, {
      type: "player:update",
      id: room.devBot.id,
      name: room.devBot.name,
      team: room.devBot.team,
      weapon: room.devBot.weapon,
      health: room.devBot.health,
      alive: room.devBot.alive,
      position: room.devBot.position,
      rotationY: room.devBot.rotationY
    });

    const shot = {
      direction: room.devBot.direction,
      damage: DEV_BOT_DAMAGE,
      range: DEV_BOT_RANGE,
      bulletSpeed: DEV_BOT_BULLET_SPEED
    };
    sendToRoom(room.id, {
      type: "player:shoot",
      id: room.devBot.id,
      origin: room.devBot.position,
      weapon: room.devBot.weapon,
      shots: [shot]
    });
  }, DEV_BOT_MOVE_INTERVAL_MS);
}

function stopDevBot(room) {
  if (!room?.devBot?.timer) return;
  clearInterval(room.devBot.timer);
  room.devBot.timer = null;
}

function killAndScheduleRespawn(victimWs, killerWs = null) {
  if (!victimWs?.meta?.roomId) return;
  const room = rooms.get(victimWs.meta.roomId);
  if (!room) return;
  if (!victimWs.meta.alive) return;

  victimWs.meta.health = 0;
  victimWs.meta.alive = false;
  victimWs.meta.deaths += 1;

  if (killerWs?.meta?.id && killerWs.meta.id !== victimWs.meta.id) {
    killerWs.meta.kills += 1;
  }

  sendToRoom(room.id, {
    type: "player:died",
    id: victimWs.meta.id,
    killerId: killerWs?.meta?.id || null,
    killerName: killerWs?.meta?.name || null
  });
  sendRoomPlayers(room.id);

  if (victimWs.meta.respawnTimer) {
    clearTimeout(victimWs.meta.respawnTimer);
  }
  victimWs.meta.respawnTimer = setTimeout(() => {
    if (victimWs.readyState !== WebSocket.OPEN) return;
    if (!victimWs.meta.roomId) return;
    const currentRoom = rooms.get(victimWs.meta.roomId);
    if (!currentRoom || !currentRoom.players.has(victimWs.meta.id)) return;

    victimWs.meta.health = MAX_HEALTH;
    victimWs.meta.alive = true;
    victimWs.meta.invulnerableUntil = Date.now() + RESPAWN_IMMUNITY_MS;
    const spawn = getSpawnPosition();
    victimWs.meta.lastPosition = spawn;

    victimWs.send(
      JSON.stringify({
        type: "player:respawn",
        health: victimWs.meta.health,
        alive: victimWs.meta.alive,
        spawn
      })
    );
    sendToRoom(currentRoom.id, {
      type: "player:update",
      id: victimWs.meta.id,
      name: victimWs.meta.name,
      team: victimWs.meta.team,
      weapon: victimWs.meta.weapon,
      health: victimWs.meta.health,
      alive: victimWs.meta.alive,
      position: spawn,
      rotationY: 0
    });
    sendRoomPlayers(currentRoom.id);
  }, RESPAWN_DELAY_MS);
}

wss.on("connection", (ws) => {
  ws.meta = {
    id: `${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    name: "Player",
    roomId: null,
    team: null,
    weapon: "ak47",
    health: MAX_HEALTH,
    alive: true,
    kills: 0,
    deaths: 0,
    respawnTimer: null,
    invulnerableUntil: 0
  };

  ws.send(
    JSON.stringify({
      type: "rooms:update",
      rooms: getRoomSnapshot()
    })
  );

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "player:setName") {
      ws.meta.name = String(msg.name || "Player").slice(0, 20);
      return;
    }

    if (msg.type === "weapon:select") {
      const allowed = new Set(["shotgun", "sniper", "ak47"]);
      if (allowed.has(msg.weapon)) ws.meta.weapon = msg.weapon;
      if (ws.meta.roomId) {
        sendRoomPlayers(ws.meta.roomId);
      }
      return;
    }

    if (msg.type === "team:select") {
      ws.send(JSON.stringify({ type: "room:error", message: "Mode chacun pour soi actif" }));
      return;
    }

    if (msg.type === "room:join") {
      const room = rooms.get(msg.roomId);
      if (!room) return;
      if (room.players.size >= ROOM_SIZE) {
        ws.send(JSON.stringify({ type: "room:error", message: "Room pleine" }));
        return;
      }
      if (ws.meta.roomId) {
        const prev = rooms.get(ws.meta.roomId);
        prev?.players.delete(ws.meta.id);
      }
      ws.meta.roomId = room.id;
      ws.meta.team = "ffa";
      ws.meta.health = MAX_HEALTH;
      ws.meta.alive = true;
      ws.meta.invulnerableUntil = Date.now() + RESPAWN_IMMUNITY_MS;
      const spawn = getSpawnPosition();
      ws.meta.lastPosition = spawn;
      room.players.set(ws.meta.id, ws);

      ws.send(
        JSON.stringify({
          type: "room:joined",
          id: ws.meta.id,
          roomId: room.id,
          team: "ffa",
          weapon: ws.meta.weapon,
          health: ws.meta.health,
          alive: ws.meta.alive,
          spawn
        })
      );

      sendRoomPlayers(room.id);
      startDevBot(room);

      broadcastRoomList();
      return;
    }

    if (msg.type === "player:update" && ws.meta.roomId) {
      if (!ws.meta.alive) return;
      ws.meta.lastPosition = msg.position;
      ws.meta.rotationY = Number(msg.rotationY) || 0;
      sendToRoom(ws.meta.roomId, {
        type: "player:update",
        id: ws.meta.id,
        name: ws.meta.name,
        team: ws.meta.team,
        weapon: ws.meta.weapon,
        health: ws.meta.health,
        alive: ws.meta.alive,
        position: msg.position,
        rotationY: msg.rotationY
      });
      return;
    }

    if (msg.type === "player:shoot" && ws.meta.roomId) {
      if (!msg.origin || !Array.isArray(msg.shots) || msg.shots.length === 0) return;
      sendToRoom(ws.meta.roomId, {
        type: "player:shoot",
        id: ws.meta.id,
        origin: msg.origin,
        weapon: ws.meta.weapon,
        shots: msg.shots
      });
      return;
    }

    if (msg.type === "player:hit" && ws.meta.roomId) {
      const room = rooms.get(ws.meta.roomId);
      if (!room || !ws.meta.alive) return;
      const targetId = String(msg.targetId || "");
      const rawDamage = Number(msg.damage);
      if (!targetId || !Number.isFinite(rawDamage)) return;
      const damage = Math.max(1, Math.min(200, rawDamage));
      const targetWs = room.players.get(targetId);
      if (!targetWs || !targetWs.meta.alive) return;
      if (Date.now() < (targetWs.meta.invulnerableUntil || 0)) return;

      targetWs.meta.health = Math.max(0, targetWs.meta.health - damage);
      if (targetWs.readyState === WebSocket.OPEN) {
        targetWs.send(
          JSON.stringify({
            type: "player:health",
            health: targetWs.meta.health
          })
        );
      }

      if (targetWs.meta.health > 0) {
        sendRoomPlayers(room.id);
        return;
      }
      killAndScheduleRespawn(targetWs, ws);
    }
  });

  ws.on("close", () => {
    if (ws.meta.respawnTimer) {
      clearTimeout(ws.meta.respawnTimer);
      ws.meta.respawnTimer = null;
    }
    if (ws.meta.roomId) {
      const room = rooms.get(ws.meta.roomId);
      room?.players.delete(ws.meta.id);
      if (room) {
        if (room.players.size === 0) stopDevBot(room);
        sendRoomPlayers(room.id);
      }
      broadcastRoomList();
    }
  });
});

wss.on("error", (err) => {
  if (err?.code === "EADDRINUSE") return;
  console.error("WebSocket server error:", err.message);
});

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", (err) => {
      if (err?.code === "EADDRINUSE") {
        resolve(false);
        return;
      }
      resolve(false);
    });
    probe.once("listening", () => {
      probe.close(() => resolve(true));
    });
    probe.listen(port);
  });
}

async function startServer(initialPort, retries = 15) {
  const hasFixedPort = Boolean(process.env.PORT);
  let portToTry = initialPort;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const free = await isPortFree(portToTry);
    if (free) {
      server.listen(portToTry, () => {
        console.log(`Server running on http://localhost:${portToTry}`);
      });
      return;
    }

    if (hasFixedPort) break;
    const nextPort = portToTry + 1;
    console.warn(`Port ${portToTry} is already in use. Retrying on port ${nextPort}...`);
    portToTry = nextPort;
  }

  console.error(`Failed to start server. No free port found from ${initialPort}.`);
  process.exit(1);
}

startServer(PORT);
