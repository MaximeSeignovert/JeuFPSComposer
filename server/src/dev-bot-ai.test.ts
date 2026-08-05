import assert from "node:assert/strict";
import test from "node:test";
import { findWaypointRoute, hasLineOfSight, selectNearestVisibleTarget } from "./dev-bot-ai";

test("a wall blocks the bot line of sight", () => {
  const wall = [{ x: 0, z: 0, width: 2, depth: 8 }];
  assert.equal(hasLineOfSight({ x: -5, y: 1, z: 0 }, { x: 5, y: 1, z: 0 }, wall), false);
  assert.equal(hasLineOfSight({ x: -5, y: 1, z: 6 }, { x: 5, y: 1, z: 6 }, wall), true);
});

test("the route finder follows only unobstructed waypoint links", () => {
  const route = findWaypointRoute("nw", "north-east");
  assert.equal(route[0], "nw");
  assert.equal(route.at(-1), "north-east");
  assert.ok(route.length > 2);
});

test("only the closest visible living player is selected", () => {
  const target = selectNearestVisibleTarget({ x: -5, y: 1, z: 6 }, [
    { id: "dead", alive: false, position: { x: -4, y: 1, z: 6 } },
    { id: "blocked", alive: true, position: { x: 5, y: 1, z: 0 } },
    { id: "visible", alive: true, position: { x: -2, y: 1, z: 6 } }
  ]);
  assert.equal(target?.id, "visible");
});
