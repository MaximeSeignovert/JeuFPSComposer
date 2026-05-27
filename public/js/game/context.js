import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

export function createGameContext({ dom, state, sceneSetup, viewModel, mapConfig }) {
  const { camera, renderer, scene } = sceneSetup;

  return {
    dom,
    state,
    camera,
    renderer,
    scene,
    viewModel,
    mapConfig,
    physics: null,
    controllers: {},
    worldColliders: [],
    mapAnimators: [],
    jumpPads: [],
    grenadePickups: new Map(),
    grenadePickupMeshes: new Map(),
    remoteMeshes: new Map(),
    bullets: [],
    flashes: [],
    impacts: [],
    activeGrenades: new Map(),
    explosionEffects: [],
    explodedGrenadeIds: new Set(),
    raycaster: new THREE.Raycaster(),
    clock: new THREE.Clock(),
    smoothedMoveVelocity: new THREE.Vector3(),
    lastNetworkSend: 0,
    hitmarkerTimer: null,
    damageOverlayTimer: null
  };
}
