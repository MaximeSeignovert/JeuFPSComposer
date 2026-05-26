import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { BASE_FOV } from "../config.js";
import { state } from "../state.js";

export function createSceneSetup(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fd3ff);
  scene.fog = new THREE.Fog(0xaedfff, 55, 180);

  const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, state.playerHeight, 0);
  scene.add(camera);

  const hemi = new THREE.HemisphereLight(0xc7ebff, 0x6a8f4c, 1.25);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xfff3d1, 1.15);
  dir.position.set(18, 30, 14);
  scene.add(dir);

  return { camera, renderer, scene };
}
