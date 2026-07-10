export const MAP_LAYOUT = {
  platform: {
    x: 0,
    z: 0,
    width: 18,
    depth: 14,
    topY: 3.8,
    thickness: 1.2,
    material: { color: 0x747873, roughness: 0.82, metalness: 0.1 }
  },
  ramp: {
    width: 8.4,
    depth: 7.6,
    topY: 3.8,
    baseY: 0,
    thickness: 0.34,
    material: { color: 0x7a8569, roughness: 0.78, metalness: 0.12 }
  },
  coverMaterial: { color: 0x526d7c, roughness: 0.86, metalness: 0.08 },
  pillarMaterial: { color: 0x8a735d, roughness: 0.8, metalness: 0.12 },
  wallMaterial: { color: 0x596957, roughness: 0.92, metalness: 0.04 },
  coverBlocks: [
    { x: -30, z: -24, width: 5.4, height: 2.6, depth: 3.4, colorOffset: 0.02 },
    { x: -30, z: -8, width: 3.8, height: 2.2, depth: 3.2, colorOffset: -0.08 },
    { x: -30, z: 8, width: 3.8, height: 2.2, depth: 3.2, colorOffset: 0.1 },
    { x: -30, z: 24, width: 5.4, height: 2.6, depth: 3.4, colorOffset: -0.12 },
    { x: -22, z: -16, width: 3.2, height: 1.6, depth: 2.8, colorOffset: 0.16 },
    { x: -22, z: 16, width: 3.2, height: 1.6, depth: 2.8, colorOffset: -0.18 },
    { x: 30, z: -24, width: 5.4, height: 2.6, depth: 3.4, colorOffset: 0.02 },
    { x: 30, z: -8, width: 3.8, height: 2.2, depth: 3.2, colorOffset: -0.08 },
    { x: 30, z: 8, width: 3.8, height: 2.2, depth: 3.2, colorOffset: 0.1 },
    { x: 30, z: 24, width: 5.4, height: 2.6, depth: 3.4, colorOffset: -0.12 },
    { x: 22, z: -16, width: 3.2, height: 1.6, depth: 2.8, colorOffset: 0.16 },
    { x: 22, z: 16, width: 3.2, height: 1.6, depth: 2.8, colorOffset: -0.18 },
    { x: 0, z: -13, width: 8.2, height: 3.6, depth: 1.7, colorOffset: -0.08 },
    { x: -8.8, z: -19, width: 5.2, height: 3.2, depth: 1.7, colorOffset: -0.14 },
    { x: 8.8, z: -19, width: 5.2, height: 3.2, depth: 1.7, colorOffset: 0.14 },
    { x: 0, z: 13, width: 8.2, height: 3.6, depth: 1.7, colorOffset: 0.08 },
    { x: -8.8, z: 19, width: 5.2, height: 3.2, depth: 1.7, colorOffset: 0.14 },
    { x: 8.8, z: 19, width: 5.2, height: 3.2, depth: 1.7, colorOffset: -0.14 },
    { x: -16, z: -27, width: 1.7, height: 4.2, depth: 6.2, colorOffset: 0.04 },
    { x: -16, z: 27, width: 1.7, height: 4.2, depth: 6.2, colorOffset: -0.04 },
    { x: -34, z: -32, width: 6.5, height: 3.25, depth: 1.8, colorOffset: 0.12 },
    { x: -34, z: 32, width: 6.5, height: 3.25, depth: 1.8, colorOffset: -0.12 },
    { x: -34, z: -18, width: 1.8, height: 3.8, depth: 5.6, colorOffset: -0.02 },
    { x: -34, z: 18, width: 1.8, height: 3.8, depth: 5.6, colorOffset: 0.02 },
    { x: -23.5, z: -5, width: 1.6, height: 3.7, depth: 7.8, colorOffset: 0.06 },
    { x: -23.5, z: 5, width: 1.6, height: 3.7, depth: 7.8, colorOffset: -0.06 },
    { x: 16, z: -27, width: 1.7, height: 4.2, depth: 6.2, colorOffset: 0.04 },
    { x: 16, z: 27, width: 1.7, height: 4.2, depth: 6.2, colorOffset: -0.04 },
    { x: 34, z: -32, width: 6.5, height: 3.25, depth: 1.8, colorOffset: 0.12 },
    { x: 34, z: 32, width: 6.5, height: 3.25, depth: 1.8, colorOffset: -0.12 },
    { x: 34, z: -18, width: 1.8, height: 3.8, depth: 5.6, colorOffset: -0.02 },
    { x: 34, z: 18, width: 1.8, height: 3.8, depth: 5.6, colorOffset: 0.02 },
    { x: 23.5, z: -5, width: 1.6, height: 3.7, depth: 7.8, colorOffset: 0.06 },
    { x: 23.5, z: 5, width: 1.6, height: 3.7, depth: 7.8, colorOffset: -0.06 }
  ],
  stackedCrates: [
    { x: -20, z: -28, side: -1, colorOffset: 0.18 },
    { x: -20, z: 28, side: 1, colorOffset: -0.18 },
    { x: -12, z: -12, side: -1, colorOffset: 0.1 },
    { x: -12, z: 12, side: 1, colorOffset: -0.1 },
    { x: 20, z: -28, side: 1, colorOffset: 0.18 },
    { x: 20, z: 28, side: -1, colorOffset: -0.18 },
    { x: 12, z: 12, side: 1, colorOffset: 0.1 },
    { x: 12, z: -12, side: -1, colorOffset: -0.1 }
  ],
  tallPillars: [
    { x: 0, z: -24 },
    { x: 0, z: 24 },
    { x: -18, z: 0 },
    { x: 18, z: 0 }
  ],
  wallPlatforms: [
    { x: 0, z: -39, width: 15, depth: 4, axis: "x" },
    { x: 0, z: 39, width: 15, depth: 4, axis: "x" }
  ],
  ladders: [
    { x: 0, z: -25.16, normalX: 0, normalZ: -1, width: 1.4, height: 5.15 },
    { x: 0, z: 25.16, normalX: 0, normalZ: 1, width: 1.4, height: 5.15 },
    { x: -19.16, z: 0, normalX: -1, normalZ: 0, width: 1.4, height: 5.15 },
    { x: 19.16, z: 0, normalX: 1, normalZ: 0, width: 1.4, height: 5.15 }
  ],
  boundaryWalls: [
    { x: -42, y: 2, z: 0, width: 2, height: 4, depth: 85 },
    { x: 42, y: 2, z: 0, width: 2, height: 4, depth: 85 },
    { x: 0, y: 2, z: -42, width: 85, height: 4, depth: 2 },
    { x: 0, y: 2, z: 42, width: 85, height: 4, depth: 2 }
  ]
};
