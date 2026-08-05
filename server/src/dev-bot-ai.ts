import { Vec3Like } from "./schema";

export type NavWaypoint = {
  id: string;
  position: Vec3Like;
  links: string[];
};

type BlockingVolume = {
  x: number;
  z: number;
  width: number;
  depth: number;
};

export type BotTarget = {
  id: string;
  position: Vec3Like;
  alive: boolean;
};

// These points deliberately stay on the ground-level routes of Qasr Al-Rih.
// They are server-side gameplay data: visual map changes must update this graph too.
export const DESERT_NAVIGATION: NavWaypoint[] = [
  { id: "nw", position: { x: -33, y: 0, z: -30 }, links: ["north-west", "west-north"] },
  { id: "north-west", position: { x: -15, y: 0, z: -34 }, links: ["nw", "north-center", "west-north"] },
  { id: "north-center", position: { x: 0, y: 0, z: -35 }, links: ["north-west", "north-east", "center-north"] },
  { id: "north-east", position: { x: 16, y: 0, z: -35 }, links: ["north-center", "east-north"] },
  { id: "east-north", position: { x: 33, y: 0, z: -24 }, links: ["north-east", "east-mid"] },
  { id: "east-mid", position: { x: 35, y: 0, z: -5 }, links: ["east-north", "east-south", "caravan-north"] },
  { id: "east-south", position: { x: 32, y: 0, z: 27 }, links: ["east-mid", "south-east", "caravan-south"] },
  { id: "south-east", position: { x: 17, y: 0, z: 34 }, links: ["east-south", "south-center"] },
  { id: "south-center", position: { x: -5, y: 0, z: 34 }, links: ["south-east", "south-west", "garden-east"] },
  { id: "south-west", position: { x: -34, y: 0, z: 26 }, links: ["south-center", "west-south"] },
  { id: "west-south", position: { x: -34, y: 0, z: 18 }, links: ["south-west", "west-mid"] },
  { id: "west-mid", position: { x: -34, y: 0, z: -6 }, links: ["west-south", "west-north", "residence-south"] },
  { id: "west-north", position: { x: -33, y: 0, z: -20 }, links: ["west-mid", "nw", "north-west"] },
  { id: "center-north", position: { x: 0, y: 0, z: -12 }, links: ["north-center", "bazaar-west", "bazaar-east"] },
  { id: "bazaar-west", position: { x: -12, y: 0, z: 4 }, links: ["center-north", "garden-west", "residence-south"] },
  { id: "bazaar-east", position: { x: 12, y: 0, z: 5 }, links: ["center-north", "caravan-north", "garden-east"] },
  { id: "residence-south", position: { x: -18, y: 0, z: 15 }, links: ["bazaar-west", "west-mid", "garden-west"] },
  { id: "caravan-north", position: { x: 18, y: 0, z: -8 }, links: ["bazaar-east", "east-mid", "caravan-south"] },
  { id: "caravan-south", position: { x: 18, y: 0, z: 22 }, links: ["caravan-north", "east-south", "garden-east"] },
  { id: "garden-west", position: { x: -20, y: 0, z: 20 }, links: ["residence-south", "bazaar-west", "south-center"] },
  { id: "garden-east", position: { x: 4, y: 0, z: 22 }, links: ["garden-west", "bazaar-east", "caravan-south", "south-center"] }
];

// Ground-level walls that matter for bot visibility. Roofs and low decoration are omitted.
export const DESERT_BLOCKING_VOLUMES: BlockingVolume[] = [
  { x: -39, z: 0, width: 2, depth: 80 }, { x: 39, z: -10, width: 2, depth: 60 },
  { x: 0, z: -39, width: 80, depth: 2 }, { x: -18, z: 39, width: 42, depth: 2 }, { x: 23, z: 39, width: 40, depth: 2 },
  { x: -25, z: -25, width: 1.1, depth: 13 }, { x: -18.5, z: -18.8, width: 14, depth: 1.1 }, { x: -31.5, z: -13, width: 10, depth: 1.1 },
  { x: -31.5, z: 5, width: 1.1, depth: 14 }, { x: -25, z: -2, width: 12, depth: 1.1 }, { x: -20, z: 2, width: 1.1, depth: 7 }, { x: -20, z: 11, width: 1.1, depth: 5 }, { x: -28, z: 12, width: 7, depth: 1.1 },
  { x: -8.5, z: -1.5, width: 1.1, depth: 8 }, { x: -5.5, z: -5, width: 5, depth: 1.1 }, { x: 8, z: -4.5, width: 7, depth: 1.1 }, { x: 10.8, z: -1.5, width: 1.1, depth: 5 },
  { x: 14, z: 3, width: 1, depth: 6 }, { x: 14, z: 15, width: 1, depth: 6 }, { x: 17, z: 0, width: 6, depth: 1 }, { x: 29.5, z: 0, width: 9, depth: 1 }, { x: 34, z: 9, width: 1, depth: 18 }, { x: 19.5, z: 18, width: 11, depth: 1 },
  { x: -10, z: 21, width: 13, depth: 1.1 }, { x: -16, z: 27, width: 1.1, depth: 12 }, { x: -7.5, z: 31, width: 10, depth: 1.1 }, { x: 9.5, z: 32, width: 1.1, depth: 8 },
  { x: 24, z: -17, width: 1.1, depth: 13 }, { x: 30, z: -11, width: 12, depth: 1.1 }
];

export function distance2D(a: Vec3Like, b: Vec3Like) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function segmentIntersectsRect(a: Vec3Like, b: Vec3Like, volume: BlockingVolume, padding = 0) {
  const minX = volume.x - volume.width * 0.5 - padding;
  const maxX = volume.x + volume.width * 0.5 + padding;
  const minZ = volume.z - volume.depth * 0.5 - padding;
  const maxZ = volume.z + volume.depth * 0.5 + padding;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  let enter = 0;
  let exit = 1;

  for (const [origin, delta, min, max] of [[a.x, dx, minX, maxX], [a.z, dz, minZ, maxZ]] as const) {
    if (Math.abs(delta) < 0.000001) {
      if (origin < min || origin > max) return false;
      continue;
    }
    const t1 = (min - origin) / delta;
    const t2 = (max - origin) / delta;
    enter = Math.max(enter, Math.min(t1, t2));
    exit = Math.min(exit, Math.max(t1, t2));
    if (enter > exit) return false;
  }
  return true;
}

export function hasLineOfSight(a: Vec3Like, b: Vec3Like, volumes = DESERT_BLOCKING_VOLUMES) {
  return !volumes.some((volume) => segmentIntersectsRect(a, b, volume, 0.08));
}

export function nearestWaypoint(position: Vec3Like, waypoints = DESERT_NAVIGATION) {
  return waypoints.reduce((closest, waypoint) =>
    !closest || distance2D(position, waypoint.position) < distance2D(position, closest.position) ? waypoint : closest, null as NavWaypoint | null);
}

export function findWaypointRoute(fromId: string, toId: string, waypoints = DESERT_NAVIGATION) {
  if (fromId === toId) return [fromId];
  const byId = new Map(waypoints.map((waypoint) => [waypoint.id, waypoint]));
  if (!byId.has(fromId) || !byId.has(toId)) return [];
  const previous = new Map<string, string | null>([[fromId, null]]);
  const queue = [fromId];
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    if (id === toId) break;
    const waypoint = byId.get(id);
    for (const next of waypoint?.links || []) {
      const nextWaypoint = byId.get(next);
      if (!nextWaypoint || previous.has(next)) continue;
      // A hand-authored link is never trusted blindly: it must remain clear if
      // the server map data is changed later.
      if (!hasLineOfSight(waypoint!.position, nextWaypoint.position)) continue;
      previous.set(next, id);
      queue.push(next);
    }
  }
  if (!previous.has(toId)) return [];
  const route: string[] = [];
  for (let id: string | null = toId; id; id = previous.get(id) || null) route.unshift(id);
  return route;
}

export function selectNearestVisibleTarget(botPosition: Vec3Like, targets: BotTarget[]) {
  return targets
    .filter((target) => target.alive && hasLineOfSight(botPosition, target.position))
    .sort((a, b) => distance2D(botPosition, a.position) - distance2D(botPosition, b.position))[0] || null;
}

export function aimDirection(origin: Vec3Like, target: Vec3Like, spreadRadians = 0) {
  const baseAngle = Math.atan2(target.x - origin.x, target.z - origin.z);
  const angle = baseAngle + (Math.random() * 2 - 1) * spreadRadians;
  const horizontalDistance = Math.max(0.001, distance2D(origin, target));
  const vertical = (target.y - origin.y) / horizontalDistance;
  const length = Math.hypot(1, vertical);
  return { x: Math.sin(angle) / length, y: vertical / length, z: Math.cos(angle) / length };
}
