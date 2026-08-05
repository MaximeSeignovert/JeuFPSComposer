import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { BASE_FOV } from "../config.js";
import { state } from "../state.js";

export function createSceneSetup(canvas, mapConfig = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  const atmosphere = mapConfig.atmosphere || {};
  scene.background = new THREE.Color(atmosphere.sky ?? 0x7ea7b5);
  scene.fog = new THREE.Fog(
    atmosphere.fog ?? 0x9dbbc0,
    atmosphere.fogNear ?? 55,
    atmosphere.fogFar ?? 180
  );

  const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, state.playerHeight, 0);
  scene.add(camera);

  const hemi = new THREE.HemisphereLight(
    atmosphere.hemisphereSky ?? 0xc0d5d5,
    atmosphere.hemisphereGround ?? 0x667052,
    atmosphere.hemisphereIntensity ?? 1.22
  );
  scene.add(hemi);
  if (mapConfig.kind === "desert") {
    const ambient = new THREE.AmbientLight(
      atmosphere.ambient ?? 0xd8ccb6,
      atmosphere.ambientIntensity ?? 0.52
    );
    scene.add(ambient);
  }
  const dir = new THREE.DirectionalLight(atmosphere.sun ?? 0xffefd5, atmosphere.sunIntensity ?? 1.12);
  dir.position.set(...(atmosphere.sunPosition || [18, 30, 14]));
  dir.castShadow = mapConfig.kind === "desert";
  if (dir.castShadow) {
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.left = -48;
    dir.shadow.camera.right = 48;
    dir.shadow.camera.top = 48;
    dir.shadow.camera.bottom = -48;
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 110;
    dir.shadow.bias = -0.00025;
    dir.shadow.normalBias = 0.025;
  }
  scene.add(dir);

  return { camera, renderer, scene };
}
