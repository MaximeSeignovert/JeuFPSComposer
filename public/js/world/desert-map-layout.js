// Asset-first desert arena. Every solid map obstacle below comes from the FBX kit.
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
    hemisphereIntensity: 1.1,
    ambient: 0xffffff,
    ambientIntensity: 0.42,
    sun: 0xffffff,
    sunIntensity: 1.25,
    sunPosition: [28, 46, 18]
  },
  ground: { color: 0xb99462, size: 200 },
  // Adjust this single value to calibrate every building against the player height.
  buildingScale: 1.2,
  // Tiled against the playable map boundary. `size` is [length, height, thickness].
  boundaryWall: { file: "Walls/Wall B.fbx", size: [7, 3.1, 0.9], limit: 40 },

  // `solid` uses the visible FBX triangles for Rapier and hitscan collisions.
  assets: [
    { file: "Buildlings/Large Building A.fbx", x: -26, z: 5, size: [11, 5, 13], rotationY: Math.PI, solid: true, building: true },
    { file: "Buildlings/Large Building C.fbx", x: 24, z: 9, size: [20, 5.6, 18], rotationY: Math.PI / 2, solid: true, building: true },
    { file: "Buildlings/Large Building D.fbx", x: 3, z: -27, size: [15, 5, 9], rotationY: Math.PI, solid: true, building: true },
    { file: "Buildlings/Large Building B.fbx", x: 29, z: -14, size: [12, 4.8, 13], rotationY: Math.PI / 2, solid: true, building: true },
    { file: "Buildlings/Medium Building A.fbx", x: -10, z: 28, size: [12, 4.4, 10], rotationY: Math.PI, solid: true, building: true },
    { file: "Buildlings/Medium Building B.fbx", x: 23, z: 26, size: [10, 4.2, 10], rotationY: -Math.PI / 2, solid: true, building: true },
    { file: "Buildlings/Small Building A.fbx", x: -29, z: -25, size: [7, 3.6, 7], rotationY: Math.PI / 2, solid: true, building: true },
    { file: "Walls/Wall A.fbx", x: -8, z: -2, size: [5, 3.3, 0.9], rotationY: Math.PI / 2, solid: true },
    { file: "Walls/Wall B.fbx", x: 8, z: -5, size: [7, 3.1, 0.9], solid: true },

    { file: "Miscellaneous/Well.fbx", x: 0, z: 5, size: [2.6, 2, 2.6], solid: true },
    { file: "Miscellaneous/Crate.fbx", x: -12, z: 10, size: [1.7, 1.7, 1.7], rotationY: -0.16, solid: true },
    { file: "Miscellaneous/Crate.fbx", x: 29, z: -25, size: [1.7, 1.7, 1.7], rotationY: -0.08, solid: true },
    { file: "Miscellaneous/Barrel.fbx", x: -29.5, z: 8.8, size: [0.9, 1.2, 0.9], solid: true },
    { file: "Miscellaneous/Barrel.fbx", x: 16.2, z: 16.1, size: [0.9, 1.2, 0.9], solid: true },
    { file: "Miscellaneous/Awning A.fbx", x: -4, z: 5, size: [8, 3.5, 5], rotationY: -0.08 },
    { file: "Miscellaneous/Awning B.fbx", x: 5, z: 1, size: [7, 3.3, 4.5], rotationY: 0.06 },
    { file: "Miscellaneous/Ladder A.fbx", x: 11.05, z: -27, size: [1.5, 4.2, 0.3], rotationY: Math.PI / 2 }
  ],

  structures: [],
  ramps: [],
  ladders: [],
  arches: [],
  crates: [],
  awnings: [],
  palms: [],
  pottery: [],
  interior: {}
};
