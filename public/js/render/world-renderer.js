import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

export function createWorldRenderer(ctx) {
  const { scene, mapConfig } = ctx;

  function addStaticWorldMesh(mesh) {
    scene.add(mesh);
    ctx.worldColliders.push(mesh);
  }

  function addCoverBlock(x, z, width, height, depth, colorOffset = 0, coverMaterial) {
    const mat = coverMaterial.clone();
    mat.color.offsetHSL(colorOffset, 0.05, 0.05);
    const block = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
    block.position.set(x, height / 2, z);
    addStaticWorldMesh(block);
  }

  function addTallPillar(x, z) {
    const pillar = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 5.2, 2.2),
      new THREE.MeshStandardMaterial(mapConfig.pillarMaterial)
    );
    pillar.position.set(x, 2.6, z);
    addStaticWorldMesh(pillar);
  }

  function addStackedCrates(x, z, side, colorOffset, coverMaterial) {
    addCoverBlock(x, z, 3.2, 1.2, 3.2, colorOffset, coverMaterial);
    addCoverBlock(x + side * 0.55, z - side * 0.35, 1.8, 3.1, 1.8, colorOffset + 0.08, coverMaterial);
  }

  function addJumpPad(x, z, color = 0x5fe1ff) {
    const pad = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.7, 1.9, 0.3, 24),
      new THREE.MeshStandardMaterial({ color: 0x2b3550, roughness: 0.55, metalness: 0.45 })
    );
    base.position.y = 0.16;
    pad.add(base);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.12, 10, 28),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.4,
        roughness: 0.2,
        metalness: 0.7
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.32;
    pad.add(ring);

    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.65, 0.08, 16),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 1.15 })
    );
    core.position.y = 0.35;
    pad.add(core);

    pad.position.set(x, 0, z);
    scene.add(pad);
    ctx.jumpPads.push({ x, z, radius: 1.8, boost: 17.2, ring, core });
    ctx.mapAnimators.push((time) => {
      const pulse = 0.6 + (Math.sin(time * 4 + x * 0.1 + z * 0.08) + 1) * 0.45;
      ring.material.emissiveIntensity = 0.8 + pulse;
      core.material.emissiveIntensity = 0.7 + pulse * 0.8;
    });
  }

  function addSpinnerProp(x, z, color = 0xffa64d) {
    const root = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.45, 4.2, 14),
      new THREE.MeshStandardMaterial({ color: 0x3f4666, roughness: 0.65, metalness: 0.35 })
    );
    pillar.position.y = 2.1;
    root.add(pillar);

    const rotor = new THREE.Group();
    rotor.position.y = 3.5;
    for (let i = 0; i < 3; i += 1) {
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.24, 2.8),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45, metalness: 0.45 })
      );
      blade.rotation.y = (Math.PI * 2 * i) / 3;
      blade.position.set(Math.sin(blade.rotation.y) * 1.2, 0, Math.cos(blade.rotation.y) * 1.2);
      rotor.add(blade);
    }
    root.add(rotor);
    root.position.set(x, 0, z);
    scene.add(root);
    ctx.mapAnimators.push((time, delta) => {
      rotor.rotation.y += delta * 2.6;
      root.position.y = Math.sin(time * 1.4 + x * 0.05) * 0.12;
    });
  }

  function build() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x7fbf65, roughness: 0.95 })
    );
    floor.rotation.x = -Math.PI / 2;
    addStaticWorldMesh(floor);

    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(mapConfig.platform.width, mapConfig.platform.thickness, mapConfig.platform.depth),
      new THREE.MeshStandardMaterial(mapConfig.platform.material)
    );
    platform.position.set(
      mapConfig.platform.x,
      mapConfig.platform.topY - mapConfig.platform.thickness * 0.5,
      mapConfig.platform.z
    );
    addStaticWorldMesh(platform);

    const rampRise = mapConfig.ramp.topY - mapConfig.ramp.baseY;
    const rampAngle = Math.atan2(rampRise, mapConfig.ramp.width);
    const rampLength = Math.hypot(mapConfig.ramp.width, rampRise);
    const rampGeometry = new THREE.BoxGeometry(rampLength, mapConfig.ramp.thickness, mapConfig.ramp.depth);
    const leftRamp = new THREE.Mesh(rampGeometry, new THREE.MeshStandardMaterial(mapConfig.ramp.material));
    leftRamp.position.set(
      -(mapConfig.platform.width / 2 + mapConfig.ramp.width / 2),
      (mapConfig.ramp.topY + mapConfig.ramp.baseY) / 2 + mapConfig.ramp.thickness * 0.25,
      0
    );
    leftRamp.rotation.z = rampAngle;
    addStaticWorldMesh(leftRamp);

    const rightRamp = leftRamp.clone();
    rightRamp.position.x = mapConfig.platform.width / 2 + mapConfig.ramp.width / 2;
    rightRamp.rotation.z = -leftRamp.rotation.z;
    addStaticWorldMesh(rightRamp);

    const coverMaterial = new THREE.MeshStandardMaterial({
      color: mapConfig.coverMaterial.color,
      roughness: mapConfig.coverMaterial.roughness,
      metalness: mapConfig.coverMaterial.metalness
    });
    mapConfig.coverBlocks.forEach((block) => {
      addCoverBlock(block.x, block.z, block.width, block.height, block.depth, block.colorOffset, coverMaterial);
    });
    mapConfig.stackedCrates.forEach((crateStack) => {
      addStackedCrates(crateStack.x, crateStack.z, crateStack.side, crateStack.colorOffset, coverMaterial);
    });
    mapConfig.tallPillars.forEach((pillar) => addTallPillar(pillar.x, pillar.z));

    const sideWallMaterial = new THREE.MeshStandardMaterial(mapConfig.wallMaterial);
    mapConfig.boundaryWalls.forEach((wall) => {
      const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(wall.width, wall.height, wall.depth), sideWallMaterial);
      wallMesh.position.set(wall.x, wall.y, wall.z);
      addStaticWorldMesh(wallMesh);
    });

    mapConfig.jumpPads.forEach((pad) => addJumpPad(pad.x, pad.z, pad.color));
    mapConfig.spinnerProps.forEach((prop) => addSpinnerProp(prop.x, prop.z, prop.color));
  }

  function update(time, delta) {
    for (const animateMapPart of ctx.mapAnimators) {
      animateMapPart(time, delta);
    }
  }

  return { build, update };
}
