import { Client, Room } from "colyseus";
import {
  ActiveGrenadeState,
  FpsState,
  GrenadePickupState,
  PlayerState,
  Vec3Like,
  Vec3State
} from "./schema";

const ROOM_SIZE = 10;
const MAX_HEALTH = 100;
const RESPAWN_DELAY_MS = 3200;
const RESPAWN_IMMUNITY_MS = 1800;
const ENABLE_DEV_BOT = process.env.DEV_BOT === "1" || process.env.NODE_ENV !== "production";
const DEV_BOT_MOVE_INTERVAL_MS = 60;
const DEV_BOT_BULLET_SPEED = 70;
const DEV_BOT_RANGE = 90;
const DEV_BOT_DAMAGE = 8;
const DEV_BOT_TRAJECTORY_RADIUS = 2.2;
const DEV_BOT_TRAJECTORY_SPEED = 1.1;
const SPAWN_MARGIN = 4;
const MAP_HALF_SIZE = 40;
const GRENADE_FUSE_MS = 1600;
const GRENADE_THROW_SPEED = 16;
const GRENADE_BLAST_RADIUS = 8.5;
const GRENADE_MAX_DAMAGE = 95;
const GRENADE_PICKUP_RESPAWN_MS = 12000;
const GRENADE_PICKUP_RADIUS = 2.2;
const KNIFE_HIT_RANGE = 3.35;
const PLAYER_UPDATE_MIN_INTERVAL_MS = 35;
const PLAYER_UPDATE_MIN_MOVE_SQ = 0.0004;
const PLAYER_UPDATE_MIN_ROTATION = 0.002;
const PLAYER_CENTER_HEIGHT = 1.05;
const ALLOWED_WEAPONS = new Set(["shotgun", "sniper", "ak47", "knife"]);
const WEAPON_DAMAGE_LIMITS: Record<string, number> = {
  shotgun: 12,
  sniper: 100,
  ak47: 20,
  knife: 100
};
const GRENADE_PICKUP_POINTS = [
  { id: "grenade-west", position: { x: -18, y: 0, z: 18 } },
  { id: "grenade-east", position: { x: 18, y: 0, z: -18 } }
];

type RuntimePlayer = {
  respawnTimer: NodeJS.Timeout | null;
  invulnerableUntil: number;
  lastPlayerUpdateAt: number;
};

type DevBot = {
  id: string;
  name: string;
  team: string;
  weapon: string;
  health: number;
  alive: boolean;
  kills: number;
  deaths: number;
  position: Vec3Like;
  direction: Vec3Like;
  center: Vec3Like;
  phase: number;
  rotationY: number;
  timer: NodeJS.Timeout | null;
  respawnTimer: NodeJS.Timeout | null;
};

export class FpsRoom extends Room<{ state: FpsState }> {
  static activeRoomId: string | null = null;
  static currentClientCount = 0;
  static maxClientsPerRoom = ROOM_SIZE;

  maxClients = ROOM_SIZE;
  autoDispose = false;

  private runtime = new Map<string, RuntimePlayer>();
  private pickupRespawnTimers = new Map<string, NodeJS.Timeout>();
  private devBot: DevBot | null = null;

  onCreate() {
    this.setState(new FpsState());
    FpsRoom.activeRoomId = this.roomId;
    this.devBot = this.createDevBot();

    GRENADE_PICKUP_POINTS.forEach((pickup) => {
      const entry = new GrenadePickupState();
      entry.id = pickup.id;
      entry.position = new Vec3State(pickup.position);
      entry.available = true;
      this.state.grenadePickups.set(entry.id, entry);
    });

    this.onMessage("player:setName", (client, msg) => this.setPlayerName(client, msg));
    this.onMessage("room:sync", (client) => this.sendInitialSync(client));
    this.onMessage("weapon:select", (client, msg) => this.selectWeapon(client, msg));
    this.onMessage("team:select", (client) => client.send("room:error", { message: "Mode chacun pour soi actif" }));
    this.onMessage("player:update", (client, msg) => this.updatePlayer(client, msg));
    this.onMessage("player:shoot", (client, msg) => this.broadcastPlayerShoot(client, msg));
    this.onMessage("grenade:pickup", (client, msg) => this.pickupGrenade(client, msg));
    this.onMessage("grenade:throw", (client, msg) => this.throwGrenade(client, msg));
    this.onMessage("grenade:explode", (client, msg) => this.explodeGrenade(client, msg));
    this.onMessage("player:hit", (client, msg) => this.hitPlayer(client, msg));
  }

  onJoin(client: Client, options: { name?: string } = {}) {
    const player = new PlayerState();
    const spawn = this.getSpawnPosition();
    player.id = client.sessionId;
    player.name = this.sanitizeName(options.name);
    player.team = "ffa";
    player.weapon = "ak47";
    player.health = MAX_HEALTH;
    player.alive = true;
    player.grenades = 0;
    player.setPosition(spawn);
    this.state.players.set(player.id, player);
    this.runtime.set(player.id, {
      respawnTimer: null,
      invulnerableUntil: Date.now() + RESPAWN_IMMUNITY_MS,
      lastPlayerUpdateAt: 0
    });
    FpsRoom.currentClientCount = this.clients.length;

    client.send("room:joined", {
      id: player.id,
      roomId: "fps_room",
      team: player.team,
      weapon: player.weapon,
      health: player.health,
      alive: player.alive,
      spawn,
      grenades: player.grenades
    });

    this.sendRoomPlayers();
    this.sendRoomGrenades();
    this.startDevBot();
  }

  onLeave(client: Client) {
    const player = this.getPlayer(client);
    const runtime = this.runtime.get(client.sessionId);
    if (runtime?.respawnTimer) clearTimeout(runtime.respawnTimer);
    this.runtime.delete(client.sessionId);
    this.state.players.delete(client.sessionId);

    this.state.activeGrenades.forEach((grenade, grenadeId) => {
      if (grenade.ownerId === client.sessionId) this.state.activeGrenades.delete(grenadeId);
    });

    FpsRoom.currentClientCount = Math.max(0, this.clients.length - 1);
    if (player && this.state.players.size === 0) this.stopDevBot();
    this.sendRoomPlayers();
  }

  onDispose() {
    this.stopDevBot();
    this.pickupRespawnTimers.forEach((timer) => clearTimeout(timer));
    this.runtime.forEach((entry) => {
      if (entry.respawnTimer) clearTimeout(entry.respawnTimer);
    });
    if (FpsRoom.activeRoomId === this.roomId) FpsRoom.activeRoomId = null;
    FpsRoom.currentClientCount = 0;
  }

  private createDevBot(): DevBot {
    return {
      id: "fps_room-dev-bot",
      name: "DEV Bot",
      team: "ffa",
      weapon: "ak47",
      health: MAX_HEALTH,
      alive: true,
      kills: 0,
      deaths: 0,
      position: { x: 0, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
      center: { x: 0, y: 0, z: 0 },
      phase: Math.random() * Math.PI * 2,
      rotationY: 0,
      timer: null,
      respawnTimer: null
    };
  }

  private sanitizeName(name: unknown) {
    return String(name || "Player").slice(0, 20);
  }

  private getPlayer(client: Client) {
    return this.state.players.get(client.sessionId);
  }

  private getClientById(id: string) {
    return this.clients.find((client) => client.sessionId === id) || null;
  }

  private getRuntime(id: string) {
    return this.runtime.get(id);
  }

  private getSpawnPosition(): Vec3Like {
    const half = MAP_HALF_SIZE - SPAWN_MARGIN;
    return {
      x: (Math.random() - 0.5) * half * 2,
      y: 0,
      z: (Math.random() - 0.5) * half * 2
    };
  }

  private sanitizePosition(position: any): Vec3Like | null {
    if (
      !position ||
      !Number.isFinite(Number(position.x)) ||
      !Number.isFinite(Number(position.y)) ||
      !Number.isFinite(Number(position.z))
    ) {
      return null;
    }
    return { x: Number(position.x), y: Number(position.y), z: Number(position.z) };
  }

  private hasMeaningfulPlayerUpdate(player: PlayerState, runtime: RuntimePlayer, position: Vec3Like, rotationY: number, now: number) {
    if (runtime.lastPlayerUpdateAt && now - runtime.lastPlayerUpdateAt < PLAYER_UPDATE_MIN_INTERVAL_MS) return false;

    const dx = position.x - player.x;
    const dy = position.y - player.y;
    const dz = position.z - player.z;
    const moveSq = dx * dx + dy * dy + dz * dz;
    const rotationDelta = Math.abs(Math.atan2(Math.sin(rotationY - player.rotationY), Math.cos(rotationY - player.rotationY)));
    return moveSq >= PLAYER_UPDATE_MIN_MOVE_SQ || rotationDelta >= PLAYER_UPDATE_MIN_ROTATION;
  }

  private setPlayerName(client: Client, msg: any) {
    const player = this.getPlayer(client);
    if (!player) return;
    player.name = this.sanitizeName(msg?.name);
    this.sendRoomPlayers();
  }

  private sendInitialSync(client: Client) {
    const player = this.getPlayer(client);
    if (!player) return;
    client.send("room:joined", {
      id: player.id,
      roomId: "fps_room",
      team: player.team,
      weapon: player.weapon,
      health: player.health,
      alive: player.alive,
      spawn: player.position,
      grenades: player.grenades
    });
    client.send("room:players", { players: this.roomPlayersPayload() });
    client.send("room:grenades", {
      pickups: Array.from(this.state.grenadePickups.values()).map((pickup) => ({
        id: pickup.id,
        position: pickup.position.asPlain(),
        available: pickup.available
      }))
    });
  }

  private selectWeapon(client: Client, msg: any) {
    const player = this.getPlayer(client);
    if (!player) return;
    if (ALLOWED_WEAPONS.has(msg?.weapon)) player.weapon = msg.weapon;
    this.sendRoomPlayers();
  }

  private updatePlayer(client: Client, msg: any) {
    const player = this.getPlayer(client);
    const runtime = this.getRuntime(client.sessionId);
    if (!player?.alive || !runtime) return;
    const position = this.sanitizePosition(msg?.position);
    if (!position) return;
    const rotationY = Number(msg?.rotationY) || 0;
    const now = Date.now();
    if (!this.hasMeaningfulPlayerUpdate(player, runtime, position, rotationY, now)) return;

    player.setPosition(position);
    player.rotationY = rotationY;
    runtime.lastPlayerUpdateAt = now;
    this.broadcast(
      "player:update",
      this.playerUpdatePayload(player),
      { except: client }
    );
  }

  private broadcastPlayerShoot(client: Client, msg: any) {
    const player = this.getPlayer(client);
    if (!player || !msg?.origin || !Array.isArray(msg.shots) || msg.shots.length === 0) return;
    this.broadcast("player:shoot", {
      type: "player:shoot",
      id: player.id,
      origin: msg.origin,
      weapon: player.weapon,
      shots: msg.shots
    });
  }

  private pickupGrenade(client: Client, msg: any) {
    const player = this.getPlayer(client);
    if (!player?.alive) return;
    if (player.grenades >= 1) {
      this.sendGrenadeInventory(client, player);
      return;
    }

    const pickupId = String(msg?.pickupId || "");
    const pickup = this.state.grenadePickups.get(pickupId);
    if (!pickup?.available) return;
    if (this.distance2DSquared(player.position, pickup.position.asPlain()) > GRENADE_PICKUP_RADIUS * GRENADE_PICKUP_RADIUS) return;

    pickup.available = false;
    player.grenades = 1;
    this.sendGrenadeInventory(client, player);
    this.sendRoomGrenades();
    this.scheduleGrenadeRespawn(pickup);
  }

  private throwGrenade(client: Client, msg: any) {
    const player = this.getPlayer(client);
    if (!player?.alive || player.grenades < 1) return;

    const grenadeId = String(msg?.id || "").slice(0, 80);
    const origin = this.sanitizePosition(msg?.origin);
    const direction = this.sanitizePosition(msg?.direction);
    if (!grenadeId || this.state.activeGrenades.has(grenadeId) || !origin || !direction) return;

    player.grenades = 0;
    const grenade = new ActiveGrenadeState();
    grenade.id = grenadeId;
    grenade.ownerId = player.id;
    grenade.thrownAt = Date.now();
    this.state.activeGrenades.set(grenadeId, grenade);
    this.sendGrenadeInventory(client, player);
    this.broadcast("grenade:thrown", {
      grenade: {
        id: grenadeId,
        ownerId: player.id,
        origin,
        direction,
        speed: GRENADE_THROW_SPEED,
        fuseMs: GRENADE_FUSE_MS
      }
    });
  }

  private explodeGrenade(client: Client, msg: any) {
    const grenadeId = String(msg?.id || "");
    const grenade = this.state.activeGrenades.get(grenadeId);
    const position = this.sanitizePosition(msg?.position);
    if (!grenade || grenade.ownerId !== client.sessionId || !position) return;

    this.state.activeGrenades.delete(grenadeId);
    this.applyGrenadeExplosion(grenade, position);
    this.broadcast("grenade:explode", {
      id: grenadeId,
      position,
      radius: GRENADE_BLAST_RADIUS
    });
  }

  private hitPlayer(client: Client, msg: any) {
    const attacker = this.getPlayer(client);
    if (!attacker?.alive) return;
    const targetId = String(msg?.targetId || "");
    const rawDamage = Number(msg?.damage);
    if (!targetId || !Number.isFinite(rawDamage)) return;

    const maxWeaponDamage = WEAPON_DAMAGE_LIMITS[attacker.weapon] || WEAPON_DAMAGE_LIMITS.ak47;
    const damage = Math.max(1, Math.min(maxWeaponDamage, rawDamage));
    const target = this.state.players.get(targetId);
    const isKnifeHit = attacker.weapon === "knife";

    if (target?.alive) {
      const targetRuntime = this.getRuntime(target.id);
      if (Date.now() < (targetRuntime?.invulnerableUntil || 0)) return;
      if (isKnifeHit && this.distance2DSquared(attacker.position, target.position) > KNIFE_HIT_RANGE * KNIFE_HIT_RANGE) return;

      target.health = Math.max(0, target.health - damage);
      this.sendHealth(target);
      if (target.health > 0) {
        this.sendRoomPlayers();
        return;
      }
      this.killAndScheduleRespawn(target, attacker);
      return;
    }

    if (ENABLE_DEV_BOT && this.devBot && targetId === this.devBot.id && this.devBot.alive) {
      if (isKnifeHit && this.distance2DSquared(attacker.position, this.devBot.position) > KNIFE_HIT_RANGE * KNIFE_HIT_RANGE) return;
      this.devBot.health = Math.max(0, this.devBot.health - damage);
      if (this.devBot.health > 0) {
        this.sendRoomPlayers();
        return;
      }
      this.killDevBotAndScheduleRespawn(attacker);
    }
  }

  private scheduleGrenadeRespawn(pickup: GrenadePickupState) {
    const existing = this.pickupRespawnTimers.get(pickup.id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      pickup.available = true;
      this.pickupRespawnTimers.delete(pickup.id);
      this.sendRoomGrenades();
    }, GRENADE_PICKUP_RESPAWN_MS);
    this.pickupRespawnTimers.set(pickup.id, timer);
  }

  private applyGrenadeExplosion(grenade: ActiveGrenadeState, position: Vec3Like) {
    const victimsToKill: PlayerState[] = [];
    let damagedSomeone = false;

    this.state.players.forEach((target) => {
      if (!target.alive) return;
      const runtime = this.getRuntime(target.id);
      if (Date.now() < (runtime?.invulnerableUntil || 0)) return;

      const dx = target.x - position.x;
      const dy = target.y + PLAYER_CENTER_HEIGHT - position.y;
      const dz = target.z - position.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance > GRENADE_BLAST_RADIUS) return;

      const proximity = 1 - distance / GRENADE_BLAST_RADIUS;
      const damage = Math.max(18, Math.round(GRENADE_MAX_DAMAGE * proximity));
      if (damage <= 0) return;

      target.health = Math.max(0, target.health - damage);
      damagedSomeone = true;
      this.sendHealth(target);
      if (target.health <= 0) victimsToKill.push(target);
    });

    if (ENABLE_DEV_BOT && this.devBot?.alive) {
      const dx = this.devBot.position.x - position.x;
      const dy = this.devBot.position.y + PLAYER_CENTER_HEIGHT - position.y;
      const dz = this.devBot.position.z - position.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance <= GRENADE_BLAST_RADIUS) {
        const proximity = 1 - distance / GRENADE_BLAST_RADIUS;
        const damage = Math.max(18, Math.round(GRENADE_MAX_DAMAGE * proximity));
        if (damage > 0) {
          this.devBot.health = Math.max(0, this.devBot.health - damage);
          damagedSomeone = true;
        }
      }
    }

    const killer = this.state.players.get(grenade.ownerId) || null;
    victimsToKill.forEach((victim) => this.killAndScheduleRespawn(victim, killer, "grenade"));

    if (ENABLE_DEV_BOT && this.devBot?.alive && this.devBot.health <= 0) {
      this.killDevBotAndScheduleRespawn(killer, "grenade");
    } else if (victimsToKill.length === 0 && damagedSomeone) {
      this.sendRoomPlayers();
    }
  }

  private killAndScheduleRespawn(victim: PlayerState, killer: PlayerState | null = null, killerWeapon: string | null = null) {
    if (!victim.alive) return;

    victim.health = 0;
    victim.alive = false;
    victim.deaths += 1;
    victim.grenades = 0;
    this.sendGrenadeInventory(this.getClientById(victim.id), victim);

    if (killer?.id && killer.id !== victim.id) killer.kills += 1;

    this.broadcast("player:died", {
      id: victim.id,
      victimName: victim.name,
      killerId: killer?.id || null,
      killerName: killer?.name || null,
      killerWeapon: killerWeapon || killer?.weapon || null
    });
    this.sendRoomPlayers();

    const runtime = this.getRuntime(victim.id);
    if (!runtime) return;
    if (runtime.respawnTimer) clearTimeout(runtime.respawnTimer);
    runtime.respawnTimer = setTimeout(() => {
      const client = this.getClientById(victim.id);
      if (!client || !this.state.players.has(victim.id)) return;

      victim.health = MAX_HEALTH;
      victim.alive = true;
      runtime.invulnerableUntil = Date.now() + RESPAWN_IMMUNITY_MS;
      const spawn = this.getSpawnPosition();
      victim.setPosition(spawn);
      victim.rotationY = 0;

      client.send("player:respawn", {
        health: victim.health,
        alive: victim.alive,
        spawn,
        grenades: victim.grenades
      });
      this.broadcast("player:update", this.playerUpdatePayload(victim));
      this.sendRoomPlayers();
    }, RESPAWN_DELAY_MS);
  }

  private startDevBot() {
    if (!ENABLE_DEV_BOT || !this.devBot || this.devBot.timer || this.state.players.size === 0) return;

    const origin = this.getSpawnPosition();
    this.devBot.position = { ...origin };
    this.devBot.center = { ...origin };
    this.devBot.phase = Math.random() * Math.PI * 2;
    this.devBot.rotationY = 0;
    this.broadcast("player:update", this.devBotUpdatePayload());

    this.devBot.timer = setInterval(() => {
      if (!this.devBot || this.state.players.size === 0 || !this.devBot.alive) return;
      this.devBot.phase += DEV_BOT_TRAJECTORY_SPEED * (DEV_BOT_MOVE_INTERVAL_MS / 1000);
      const angle = this.devBot.phase;
      const x = this.devBot.center.x + Math.cos(angle) * DEV_BOT_TRAJECTORY_RADIUS;
      const z = this.devBot.center.z + Math.sin(angle) * DEV_BOT_TRAJECTORY_RADIUS;
      const tangentX = -Math.sin(angle);
      const tangentZ = Math.cos(angle);
      const dirLength = Math.hypot(tangentX, tangentZ) || 1;
      this.devBot.direction = { x: tangentX / dirLength, y: 0, z: tangentZ / dirLength };
      this.devBot.rotationY = Math.atan2(-this.devBot.direction.x, -this.devBot.direction.z);
      this.devBot.position = { x, y: this.devBot.center.y, z };

      this.broadcast("player:update", this.devBotUpdatePayload());
      this.broadcast("player:shoot", {
        id: this.devBot.id,
        origin: this.devBot.position,
        weapon: this.devBot.weapon,
        shots: [{
          direction: this.devBot.direction,
          damage: DEV_BOT_DAMAGE,
          range: DEV_BOT_RANGE,
          bulletSpeed: DEV_BOT_BULLET_SPEED
        }]
      });
    }, DEV_BOT_MOVE_INTERVAL_MS);
  }

  private stopDevBot() {
    if (this.devBot?.respawnTimer) {
      clearTimeout(this.devBot.respawnTimer);
      this.devBot.respawnTimer = null;
    }
    if (!this.devBot?.timer) return;
    clearInterval(this.devBot.timer);
    this.devBot.timer = null;
  }

  private killDevBotAndScheduleRespawn(killer: PlayerState | null = null, killerWeapon: string | null = null) {
    if (!ENABLE_DEV_BOT || !this.devBot?.alive) return;

    this.devBot.health = 0;
    this.devBot.alive = false;
    this.devBot.deaths += 1;
    if (killer?.id) killer.kills += 1;

    this.broadcast("player:died", {
      id: this.devBot.id,
      victimName: this.devBot.name,
      killerId: killer?.id || null,
      killerName: killer?.name || null,
      killerWeapon: killerWeapon || killer?.weapon || null
    });
    this.sendRoomPlayers();

    if (this.devBot.respawnTimer) clearTimeout(this.devBot.respawnTimer);
    this.devBot.respawnTimer = setTimeout(() => {
      if (!this.devBot || this.state.players.size === 0) return;
      const spawn = this.getSpawnPosition();
      this.devBot.health = MAX_HEALTH;
      this.devBot.alive = true;
      this.devBot.position = { ...spawn };
      this.devBot.center = { ...spawn };
      this.devBot.phase = Math.random() * Math.PI * 2;
      this.devBot.rotationY = 0;
      this.broadcast("player:update", this.devBotUpdatePayload());
      this.sendRoomPlayers();
    }, RESPAWN_DELAY_MS);
  }

  private sendHealth(player: PlayerState) {
    this.getClientById(player.id)?.send("player:health", { health: player.health });
  }

  private sendGrenadeInventory(client: Client | null, player: PlayerState) {
    client?.send("player:grenadeInventory", { count: Math.max(0, Number(player.grenades) || 0) });
  }

  private sendRoomGrenades() {
    this.broadcast("room:grenades", {
      pickups: Array.from(this.state.grenadePickups.values()).map((pickup) => ({
        id: pickup.id,
        position: pickup.position.asPlain(),
        available: pickup.available
      }))
    });
  }

  private sendRoomPlayers() {
    this.broadcast("room:players", { players: this.roomPlayersPayload() });
  }

  private roomPlayersPayload() {
    const players = Array.from(this.state.players.values()).map((player) => ({
      id: player.id,
      name: player.name,
      team: player.team,
      weapon: player.weapon,
      position: player.position,
      rotationY: player.rotationY,
      health: player.health,
      alive: player.alive,
      kills: player.kills,
      deaths: player.deaths
    }));

    if (ENABLE_DEV_BOT && this.devBot) {
      players.push({
        id: this.devBot.id,
        name: this.devBot.name,
        team: this.devBot.team,
        weapon: this.devBot.weapon,
        position: this.devBot.position,
        rotationY: this.devBot.rotationY,
        health: this.devBot.health,
        alive: this.devBot.alive,
        kills: this.devBot.kills,
        deaths: this.devBot.deaths
      });
    }

    return players;
  }

  private playerUpdatePayload(player: PlayerState) {
    return {
      id: player.id,
      name: player.name,
      team: player.team,
      weapon: player.weapon,
      health: player.health,
      alive: player.alive,
      position: player.position,
      rotationY: player.rotationY
    };
  }

  private devBotUpdatePayload() {
    if (!this.devBot) return {};
    return {
      id: this.devBot.id,
      name: this.devBot.name,
      team: this.devBot.team,
      weapon: this.devBot.weapon,
      health: this.devBot.health,
      alive: this.devBot.alive,
      position: this.devBot.position,
      rotationY: this.devBot.rotationY
    };
  }

  private distance2DSquared(a: Vec3Like, b: Vec3Like) {
    const dx = (Number(a?.x) || 0) - (Number(b?.x) || 0);
    const dz = (Number(a?.z) || 0) - (Number(b?.z) || 0);
    return dx * dx + dz * dz;
  }
}
