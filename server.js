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
const MAX_ROOMS = 6;
const ROOM_SIZE = 10;
const TEAM_SIZE = 5;
const MAX_HEALTH = 100;
const RESPAWN_DELAY_MS = 3200;
const rooms = new Map();

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_, res) => {
  res.json({ ok: true });
});

function createRoom(id) {
  rooms.set(id, {
    id,
    players: new Map()
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

function pickTeam(room) {
  let alpha = 0;
  let bravo = 0;
  room.players.forEach((playerWs) => {
    if (playerWs.meta?.team === "alpha") alpha += 1;
    else if (playerWs.meta?.team === "bravo") bravo += 1;
  });
  if (alpha < TEAM_SIZE) return "alpha";
  if (bravo < TEAM_SIZE) return "bravo";
  return null;
}

function getSpawnPosition(team) {
  const z = (Math.random() - 0.5) * 28;
  const xBase = team === "alpha" ? -22 : 22;
  const x = xBase + (Math.random() - 0.5) * 6;
  return { x, y: 0, z };
}

function roomPlayersPayload(room) {
  return Array.from(room.players.values()).map((pws) => ({
    id: pws.meta.id,
    name: pws.meta.name,
    team: pws.meta.team,
    weapon: pws.meta.weapon,
    health: pws.meta.health,
    alive: pws.meta.alive,
    kills: pws.meta.kills,
    deaths: pws.meta.deaths
  }));
}

function sendRoomPlayers(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  sendToRoom(roomId, {
    type: "room:players",
    players: roomPlayersPayload(room)
  });
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
    const spawn = getSpawnPosition(victimWs.meta.team);
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
    respawnTimer: null
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
        if (ws.meta.alive) {
          killAndScheduleRespawn(ws, null);
        } else {
          sendRoomPlayers(ws.meta.roomId);
        }
      }
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
      const team = pickTeam(room);
      if (!team) {
        ws.send(JSON.stringify({ type: "room:error", message: "Teams complètes" }));
        return;
      }

      ws.meta.roomId = room.id;
      ws.meta.team = team;
      ws.meta.health = MAX_HEALTH;
      ws.meta.alive = true;
      const spawn = getSpawnPosition(team);
      ws.meta.lastPosition = spawn;
      room.players.set(ws.meta.id, ws);

      ws.send(
        JSON.stringify({
          type: "room:joined",
          id: ws.meta.id,
          roomId: room.id,
          team,
          weapon: ws.meta.weapon,
          health: ws.meta.health,
          alive: ws.meta.alive,
          spawn
        })
      );

      sendRoomPlayers(room.id);

      broadcastRoomList();
      return;
    }

    if (msg.type === "player:update" && ws.meta.roomId) {
      if (!ws.meta.alive) return;
      ws.meta.lastPosition = msg.position;
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
      if (targetWs.meta.team === ws.meta.team) return;

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
