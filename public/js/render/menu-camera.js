import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

const ORBIT_RADIUS = 64;
const ORBIT_HEIGHT = 25;
const ORBIT_SPEED = 0.09;

export function createMenuCameraController() {
  const camera = new THREE.PerspectiveCamera(
    42,
    window.innerWidth / window.innerHeight,
    0.1,
    260
  );
  const target = new THREE.Vector3(0, 2.5, 0);
  const desiredPosition = new THREE.Vector3();

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  function update(time) {
    const angle = time * ORBIT_SPEED + 0.5;
    const heightWave = Math.sin(time * 0.22) * 2.2;

    desiredPosition.set(
      Math.cos(angle) * ORBIT_RADIUS,
      ORBIT_HEIGHT + heightWave,
      Math.sin(angle) * ORBIT_RADIUS
    );
    camera.position.lerp(desiredPosition, 0.045);
    camera.lookAt(target.x, target.y + Math.sin(time * 0.18) * 0.16, target.z);
  }

  resize();
  camera.position.set(ORBIT_RADIUS, ORBIT_HEIGHT, 0);
  camera.lookAt(target);

  return { camera, resize, update };
}
