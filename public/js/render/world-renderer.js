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

  function addWallPlatform({ x, z, width, depth, axis }) {
    const topY = mapConfig.platform.topY;
    const thickness = 0.65;
    const rampRun = 5.4;
    const rampThickness = 0.34;
    const rampRise = topY;
    const rampAngle = Math.atan2(rampRise, rampRun);
    const rampLength = Math.hypot(rampRun, rampRise);
    const alongX = axis === "x";
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(alongX ? width : depth, thickness, alongX ? depth : width),
      new THREE.MeshStandardMaterial(mapConfig.platform.material)
    );
    platform.position.set(x, topY - thickness * 0.5, z);
    addStaticWorldMesh(platform);

    const ramp = new THREE.Mesh(
      new THREE.BoxGeometry(alongX ? rampLength : width, rampThickness, alongX ? depth : rampLength),
      new THREE.MeshStandardMaterial(mapConfig.ramp.material)
    );
    const offset = width * 0.5 + rampRun * 0.5;
    const rampY = (topY + rampThickness * 0.5) * 0.5;
    const leftRamp = ramp.clone();
    leftRamp.position.set(x, rampY, z);
    leftRamp.rotation.z = rampAngle;
    const rightRamp = ramp.clone();
    rightRamp.position.set(x, rampY, z);
    rightRamp.rotation.z = -rampAngle;

    if (alongX) {
      leftRamp.position.x -= offset;
      rightRamp.position.x += offset;
    } else {
      leftRamp.rotation.x = -rampAngle;
      rightRamp.rotation.x = rampAngle;
      leftRamp.position.z -= offset;
      rightRamp.position.z += offset;
    }
    addStaticWorldMesh(leftRamp);
    addStaticWorldMesh(rightRamp);
  }

  function addCentralPlatformRailings() {
    const { platform } = mapConfig;
    const railHeight = 0.72;
    const railThickness = 0.12;
    const railInset = 0.24;
    const material = new THREE.MeshStandardMaterial({ color: 0x303a4c, roughness: 0.42, metalness: 0.72 });
    const postGeometry = new THREE.BoxGeometry(railThickness, railHeight, railThickness);
    const railGeometry = new THREE.BoxGeometry(platform.width - railInset * 2, railThickness, railThickness);

    for (const side of [-1, 1]) {
      const z = platform.z + side * (platform.depth * 0.5 - railInset);
      const rail = new THREE.Mesh(railGeometry, material);
      rail.position.set(platform.x, platform.topY + railHeight, z);
      addStaticWorldMesh(rail);

      for (let x = -platform.width * 0.5 + 0.6; x < platform.width * 0.5; x += 3.2) {
        const post = new THREE.Mesh(postGeometry, material);
        post.position.set(platform.x + x, platform.topY + railHeight * 0.5, z);
        addStaticWorldMesh(post);
      }
    }
  }

  function addLadder({ x, z, normalX, normalZ, width, height }) {
    const ladder = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0x283247, roughness: 0.48, metalness: 0.68 });
    const railGeometry = new THREE.BoxGeometry(0.1, height, 0.1);
    const tangentX = -normalZ;
    const tangentZ = normalX;

    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(railGeometry, material);
      rail.position.set(tangentX * width * 0.5 * side, height * 0.5, tangentZ * width * 0.5 * side);
      ladder.add(rail);
    }

    const rungGeometry = new THREE.BoxGeometry(width + 0.1, 0.09, 0.11);
    for (let y = 0.35; y < height; y += 0.48) {
      const rung = new THREE.Mesh(rungGeometry, material);
      rung.position.set(0, y, 0);
      rung.rotation.y = Math.atan2(-normalX, -normalZ);
      ladder.add(rung);
    }

    ladder.position.set(x, 0, z);
    scene.add(ladder);
  }

  function addStackedCrates(x, z, side, colorOffset, coverMaterial) {
    addCoverBlock(x, z, 3.2, 1.2, 3.2, colorOffset, coverMaterial);
    addCoverBlock(x + side * 0.55, z - side * 0.35, 1.8, 3.1, 1.8, colorOffset + 0.08, coverMaterial);
  }

  function build() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x68705a, roughness: 0.98 })
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

    addCentralPlatformRailings();

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
    mapConfig.wallPlatforms.forEach((platformConfig) => addWallPlatform(platformConfig));
    mapConfig.ladders.forEach((ladder) => addLadder(ladder));

    const sideWallMaterial = new THREE.MeshStandardMaterial(mapConfig.wallMaterial);
    mapConfig.boundaryWalls.forEach((wall) => {
      const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(wall.width, wall.height, wall.depth), sideWallMaterial);
      wallMesh.position.set(wall.x, wall.y, wall.z);
      addStaticWorldMesh(wallMesh);
    });

  }

  function update(time, delta) {
    for (const animateMapPart of ctx.mapAnimators) {
      animateMapPart(time, delta);
    }
  }

  return { build, update };
}
