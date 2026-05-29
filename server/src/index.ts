import express from "express";
import net from "net";
import path from "path";
import { matchMaker, Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { FpsRoom } from "./FpsRoom";

const DEFAULT_PORT = 3000;
const PORT = Number(process.env.PORT || DEFAULT_PORT);
const rootDir = path.resolve(__dirname, "..", "..", "..");

const gameServer = new Server({
  transport: new WebSocketTransport(),
  express: (app) => {
    app.use(express.static(path.join(rootDir, "public")));

    app.get("/vendor/rapier/rapier.mjs", (_, res) => {
      res.type("application/javascript");
      res.sendFile(path.join(rootDir, "node_modules", "@dimforge", "rapier3d-compat", "rapier.mjs"));
    });

    app.get("/vendor/game-net.js", (_, res) => {
      res.type("application/javascript");
      res.sendFile(path.join(rootDir, "node_modules", "@colyseus", "sdk", "dist", "colyseus.js"));
    });

    app.get("/api/rooms", (_, res) => {
      res.json({
        rooms: [{
          id: "fps_room",
          count: FpsRoom.currentClientCount,
          max: FpsRoom.maxClientsPerRoom,
          roomId: FpsRoom.activeRoomId
        }]
      });
    });

    app.get("/health", (_, res) => {
      res.json({ ok: true });
    });
  }
});

gameServer.define("fps_room", FpsRoom);

function isPortFree(port: number) {
  return new Promise<boolean>((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => {
      probe.close(() => resolve(true));
    });
    probe.listen(port);
  });
}

async function startServer(initialPort: number, retries = 15) {
  const hasFixedPort = Boolean(process.env.PORT);
  let portToTry = initialPort;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const free = await isPortFree(portToTry);
    if (free) {
      await gameServer.listen(portToTry);
      const room = await matchMaker.createRoom("fps_room", {});
      FpsRoom.activeRoomId = room.roomId;
      console.log(`Server running on http://localhost:${portToTry}`);
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

startServer(PORT).catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
