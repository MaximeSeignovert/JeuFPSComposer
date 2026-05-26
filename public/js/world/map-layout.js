export const MAP_LAYOUT = {
  platform: {
    x: 0,
    z: 0,
    width: 18,
    depth: 14,
    topY: 3.8,
    thickness: 1.2,
    material: { color: 0xe4d1a9, roughness: 0.72, metalness: 0.03 }
  },
  ramp: {
    width: 8.4,
    depth: 7.6,
    topY: 3.8,
    baseY: 0,
    thickness: 0.34,
    material: { color: 0xffc74d, roughness: 0.72, metalness: 0.02 }
  },
  coverMaterial: { color: 0x4f80d9, roughness: 0.8, metalness: 0.02 },
  pillarMaterial: { color: 0xff6a6a, roughness: 0.76, metalness: 0.03 },
  wallMaterial: { color: 0x8ec66b, roughness: 0.9 },
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
  boundaryWalls: [
    { x: -42, y: 2, z: 0, width: 2, height: 4, depth: 85 },
    { x: 42, y: 2, z: 0, width: 2, height: 4, depth: 85 },
    { x: 0, y: 2, z: -42, width: 85, height: 4, depth: 2 },
    { x: 0, y: 2, z: 42, width: 85, height: 4, depth: 2 }
  ],
  jumpPads: [
    { x: -26, z: 0, color: 0x68e6ff },
    { x: 26, z: 0, color: 0x7fff95 },
    { x: 0, z: -30, color: 0xff89cf },
    { x: 0, z: 30, color: 0xffd05a }
  ],
  spinnerProps: [
    { x: -14, z: -14, color: 0x74f7ff },
    { x: 14, z: 14, color: 0xff8ad7 },
    { x: -14, z: 14, color: 0xffd673 },
    { x: 14, z: -14, color: 0x8cff7b }
  ]
};
