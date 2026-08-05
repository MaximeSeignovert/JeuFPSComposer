// "Qasr Al-Rih" is separate from map-layout.js so the original arena remains available.
// The layout is authored around an FFA flow: one outer loop, a dangerous central
// crossing, reconnecting side lanes, protected spawns and no single-exit rooms.
export const DESERT_MAP_LAYOUT = {
  id: "qasr-al-rih-ffa",
  kind: "desert",
  atmosphere: {
    sky: 0x9fc5d2,
    fog: 0xcbb88d,
    fogNear: 62,
    fogFar: 150,
    hemisphereSky: 0xdde8df,
    hemisphereGround: 0xb79b70,
    hemisphereIntensity: 1.32,
    ambient: 0xd8ccb6,
    ambientIntensity: 0.52,
    sun: 0xfff0d2,
    sunIntensity: 2.15,
    sunPosition: [28, 46, 18]
  },
  ground: { color: 0xb99462, size: 200 },

  // Gameplay volumes. Large zones are described clockwise from the north terrace.
  structures: [
    // Perimeter. The varying heights keep the desert-town silhouette asymmetric.
    { x: -39, y: 3.2, z: 0, width: 2, height: 6.4, depth: 80, material: "sandstone", crenels: true },
    { x: 39, y: 3.7, z: -10, width: 2, height: 7.4, depth: 60, material: "cleanPlaster" },
    { x: 39, y: 2.7, z: 30, width: 2, height: 5.4, depth: 20, material: "sandstone", crenels: true },
    { x: 0, y: 3.4, z: -39, width: 80, height: 6.8, depth: 2, material: "sandstone", crenels: true },
    { x: -18, y: 2.8, z: 39, width: 42, height: 5.6, depth: 2, material: "sandstone" },
    { x: 23, y: 3.5, z: 39, width: 40, height: 7, depth: 2, material: "cleanPlaster", crenels: true },

    // North watch terrace: power position with a ramp and a ladder, never a dead end.
    { x: 3, y: 3.7, z: -27, width: 16, height: 0.8, depth: 9, material: "stoneSlab" },
    { x: 3, y: 1.65, z: -31, width: 16, height: 3.3, depth: 1, material: "sandstone" },
    { x: 3, y: 4.55, z: -31, width: 16, height: 0.9, depth: 1, material: "sandstone", crenels: true },
    { x: -4.5, y: 1.65, z: -27, width: 1, height: 3.3, depth: 9, material: "wornPlaster" },
    { x: 10.5, y: 1.65, z: -27, width: 1, height: 3.3, depth: 9, material: "sandstone" },
    { x: 5.5, y: 5.15, z: -22.9, width: 5.5, height: 2.1, depth: 0.8, material: "cleanPlaster" },

    // North-west lane: two staggered corners break the longest sightline.
    { x: -25, y: 2.35, z: -25, width: 1.1, height: 4.7, depth: 13, material: "wornPlaster" },
    { x: -18.5, y: 2.1, z: -18.8, width: 14, height: 4.2, depth: 1.1, material: "sandstone" },
    { x: -31.5, y: 1.8, z: -13, width: 10, height: 3.6, depth: 1.1, material: "wornPlaster" },

    // West ruined residence: roofless fight space with north, east and south exits.
    { x: -31.5, y: 2.5, z: 5, width: 1.1, height: 5, depth: 14, material: "sandstone", crenels: true },
    { x: -25, y: 2.5, z: -2, width: 12, height: 5, depth: 1.1, material: "cleanPlaster" },
    { x: -20, y: 2.5, z: 2, width: 1.1, height: 5, depth: 7, material: "sandstone" },
    { x: -20, y: 2.5, z: 11, width: 1.1, height: 5, depth: 5, material: "sandstone" },
    { x: -28, y: 2.5, z: 12, width: 7, height: 5, depth: 1.1, material: "wornPlaster" },
    { x: -21.5, y: 2.5, z: 12, width: 2, height: 5, depth: 1.1, material: "wornPlaster" },
    { x: -24.7, y: 4.1, z: 12, width: 4.4, height: 1.8, depth: 1.1, material: "wornPlaster", visual: false },
    { x: -27, y: 1.05, z: 6, width: 4.5, height: 2.1, depth: 1.5, material: "sandstone" },

    // Central bazaar: compact cover creates a hot zone without sealing its four exits.
    { x: 0, y: 0.65, z: 1, width: 3.4, height: 1.3, depth: 3.4, material: "stoneSlab" },
    { x: -8.5, y: 1.65, z: -1.5, width: 1.1, height: 3.3, depth: 8, material: "wornPlaster" },
    { x: -5.5, y: 1.65, z: -5, width: 5, height: 3.3, depth: 1.1, material: "sandstone" },
    { x: 8, y: 1.55, z: -4.5, width: 7, height: 3.1, depth: 1.1, material: "cleanPlaster" },
    { x: 10.8, y: 1.55, z: -1.5, width: 1.1, height: 3.1, depth: 5, material: "wornPlaster" },
    { x: 6.5, y: 0.9, z: 6.8, width: 4.5, height: 1.8, depth: 1.7, material: "wood" },

    // East caravanserai: covered interior with west, north and south entrances.
    { x: 14, y: 2.8, z: 3, width: 1, height: 5.6, depth: 6, material: "cleanPlaster" },
    { x: 14, y: 2.8, z: 15, width: 1, height: 5.6, depth: 6, material: "cleanPlaster" },
    { x: 14, y: 4.65, z: 9, width: 1, height: 1.9, depth: 6, material: "sandstone", visual: false },
    { x: 17, y: 2.8, z: 0, width: 6, height: 5.6, depth: 1, material: "sandstone" },
    { x: 29.5, y: 2.8, z: 0, width: 9, height: 5.6, depth: 1, material: "sandstone" },
    { x: 23.2, y: 4.65, z: 0, width: 6.5, height: 1.9, depth: 1, material: "sandstone", visual: false },
    { x: 34, y: 2.8, z: 9, width: 1, height: 5.6, depth: 18, material: "wornPlaster", crenels: true },
    { x: 19.5, y: 2.8, z: 18, width: 11, height: 5.6, depth: 1, material: "wornPlaster" },
    { x: 32, y: 2.8, z: 18, width: 4, height: 5.6, depth: 1, material: "wornPlaster" },
    { x: 27, y: 4.65, z: 18, width: 4, height: 1.9, depth: 1, material: "sandstone", visual: false },
    { x: 24, y: 5.85, z: 9, width: 21, height: 0.5, depth: 19, material: "woodRoof" },
    { x: 27.5, y: 1.2, z: 7, width: 2.4, height: 2.4, depth: 2.4, material: "stoneSlab" },
    { x: 20, y: 0.75, z: 13.5, width: 4, height: 1.5, depth: 1.8, material: "wood" },

    // South garden: open rotations around two offset walls, no pocket or cul-de-sac.
    { x: -10, y: 2.2, z: 21, width: 13, height: 4.4, depth: 1.1, material: "cleanPlaster" },
    { x: -16, y: 2.2, z: 27, width: 1.1, height: 4.4, depth: 12, material: "sandstone" },
    { x: -7.5, y: 1.9, z: 31, width: 10, height: 3.8, depth: 1.1, material: "wornPlaster" },
    { x: 5, y: 1.05, z: 25.5, width: 5, height: 2.1, depth: 2, material: "sandstone" },
    { x: 9.5, y: 1.55, z: 32, width: 1.1, height: 3.1, depth: 8, material: "wornPlaster" },

    // Small east-north divider prevents a perimeter-to-perimeter sniper lane.
    { x: 24, y: 2.25, z: -17, width: 1.1, height: 4.5, depth: 13, material: "sandstone" },
    { x: 30, y: 2, z: -11, width: 12, height: 4, depth: 1.1, material: "wornPlaster" }
  ],

  ramps: [
    { x: -1, z: -18.5, width: 4.2, run: 8, topY: 4.1, thickness: 0.34, direction: "north", material: "stoneSlab" }
  ],
  ladders: [
    { x: 11.05, z: -27, normalX: 1, normalZ: 0, width: 1.5, height: 4.2 }
  ],
  arches: [
    { x: -24.7, y: 0, z: 11.4, width: 4.4, height: 4.9, depth: 0.3, rotationY: 0 },
    { x: 13.44, y: 0, z: 9, width: 6, height: 5.5, depth: 0.3, rotationY: Math.PI / 2 },
    { x: 23.2, y: 0, z: 0.56, width: 6.5, height: 5.5, depth: 0.3, rotationY: 0 },
    { x: 27, y: 0, z: 17.44, width: 4, height: 5.5, depth: 0.3, rotationY: 0 }
  ],
  crates: [
    { x: -31, z: -29, rotationY: 0.12, stack: 1 },
    { x: -15, z: -27, rotationY: -0.1, stack: 2 },
    { x: -25, z: 16, rotationY: 0.08, stack: 1 },
    { x: -12, z: 10, rotationY: -0.16, stack: 2 },
    { x: 12, z: -13, rotationY: 0.12, stack: 1 },
    { x: 29, z: -25, rotationY: -0.08, stack: 2 },
    { x: 28, z: 27, rotationY: 0.14, stack: 1 },
    { x: -27, z: 30, rotationY: -0.1, stack: 2 }
  ],
  awnings: [
    { x: -4, y: 3.45, z: 5, width: 8, depth: 5, rotationY: -0.08, color: 0x8f3e2d },
    { x: 5, y: 3.25, z: 1, width: 7, depth: 4.5, rotationY: 0.06, color: 0x405d68 }
  ],
  palms: [
    { x: -29, z: 26, scale: 1.05 },
    { x: -9, z: 27, scale: 0.82 },
    { x: 33, z: 32, scale: 1.1 }
  ],
  pottery: [
    { x: -29.5, z: 8.8, scale: 0.9 }, { x: -28.4, z: 9.1, scale: 0.68 },
    { x: -12, z: 22.8, scale: 1.08 }, { x: 16.2, z: 16.1, scale: 0.82 },
    { x: 32, z: -8.5, scale: 1 }
  ],
  interior: {
    beamXs: [15.5, 18.5, 21.5, 24.5, 27.5, 30.5, 33],
    beamY: 5.45,
    z: 9,
    depth: 16.8,
    lights: [{ x: 19, z: 9 }, { x: 29, z: 9 }]
  }
};
