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

// Ground-level obstacles that matter for bot visibility. These mirror the
// solid building/wall assets of DESERT_MAP_LAYOUT; low decoration is omitted.
export const DESERT_BLOCKING_VOLUMES: BlockingVolume[] = [
  { x: -39, z: 0, width: 2, depth: 80 }, { x: 39, z: 0, width: 2, depth: 80 },
  { x: 0, z: -39, width: 80, depth: 2 }, { x: 0, z: 39, width: 80, depth: 2 },
  { x: -26, z: 5, width: 11, depth: 13 }, { x: 24, z: 9, width: 18, depth: 20 },
  { x: 3, z: -27, width: 15, depth: 9 }, { x: 29, z: -14, width: 13, depth: 12 },
  { x: -10, z: 28, width: 12, depth: 10 }, { x: 23, z: 26, width: 10, depth: 10 },
  { x: -29, z: -25, width: 7, depth: 7 }, { x: 31, z: -32, width: 7, depth: 7 },
  { x: -34, z: 34, width: 7, depth: 7 },
  { x: -8, z: -2, width: 0.9, depth: 5 }, { x: 8, z: -5, width: 7, depth: 0.9 },
  { x: -24, z: -8, width: 7, depth: 0.9 }, { x: -14, z: -22, width: 0.9, depth: 5 },
  { x: 10, z: 16, width: 0.9, depth: 5 }, { x: -7, z: 20, width: 7, depth: 0.9 },
  { x: 30, z: 33, width: 5, depth: 0.9 }, { x: 14, z: -22, width: 7, depth: 0.9 }
];

// Waypoints stay on open ground. Links are derived from line of sight so the
// graph follows map edits instead of hand-authored data drifting out of sync.
const NAV_LINK_DISTANCE = 26;
const NAV_POINTS: Array<{ id: string; position: Vec3Like }> = [
  { id: "nw", position: { x: -35, y: 0, z: -35 } },
  { id: "north-west", position: { x: -16, y: 0, z: -36 } },
  { id: "north-center", position: { x: 0, y: 0, z: -36 } },
  { id: "north-east", position: { x: 16, y: 0, z: -36 } },
  { id: "east-north", position: { x: 36, y: 0, z: -30 } },
  { id: "east-upper", position: { x: 37, y: 0, z: -14 } },
  { id: "east-mid", position: { x: 37, y: 0, z: 4 } },
  { id: "east-lower", position: { x: 37, y: 0, z: 20 } },
  { id: "south-east", position: { x: 36, y: 0, z: 36 } },
  { id: "south-center", position: { x: 16, y: 0, z: 36 } },
  { id: "south-mid", position: { x: -4, y: 0, z: 36 } },
  { id: "south-west", position: { x: -24, y: 0, z: 36 } },
  { id: "west-south", position: { x: -36, y: 0, z: 24 } },
  { id: "west-lower", position: { x: -37, y: 0, z: 10 } },
  { id: "west-mid", position: { x: -37, y: 0, z: -8 } },
  { id: "west-north", position: { x: -36, y: 0, z: -24 } },
  { id: "center-north", position: { x: 0, y: 0, z: -16 } },
  { id: "bazaar-west", position: { x: -16, y: 0, z: -2 } },
  { id: "bazaar", position: { x: 0, y: 0, z: -5 } },
  { id: "bazaar-east", position: { x: 12, y: 0, z: -3 } },
  { id: "plaza", position: { x: 0, y: 0, z: 10 } },
  { id: "residence-south", position: { x: -16, y: 0, z: 15 } },
  { id: "garden-east", position: { x: 13, y: 0, z: 10 } },
  { id: "caravan-north", position: { x: 18, y: 0, z: -14 } },
  { id: "caravan-south", position: { x: 14, y: 0, z: 25 } },
  { id: "garden-west", position: { x: -18, y: 0, z: 26 } },
  { id: "garden", position: { x: 0, y: 0, z: 27 } },
  { id: "north-pass", position: { x: 20, y: 0, z: -22 } },
  { id: "north-east-inner", position: { x: 17, y: 0, z: -28 } }
];

export const DESERT_NAVIGATION: NavWaypoint[] = NAV_POINTS.map((point) => ({
  id: point.id,
  position: point.position,
  links: NAV_POINTS
    .filter((other) => other.id !== point.id && distance2D(point.position, other.position) <= NAV_LINK_DISTANCE)
    .filter((other) => hasLineOfSight(point.position, other.position))
    .map((other) => other.id)
}));

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
