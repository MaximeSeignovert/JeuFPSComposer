import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const TEXTURE_ROOT = "/assets/textures/desert";

async function createMaterials(renderer) {
  const loader = new THREE.TextureLoader();
  const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const sourceTextures = new Map();

  async function sourceTexture(path, color = false) {
    const cacheKey = `${path}:${color ? "srgb" : "linear"}`;
    if (!sourceTextures.has(cacheKey)) {
      sourceTextures.set(cacheKey, loader.loadAsync(`${TEXTURE_ROOT}/${path}`).then((loaded) => {
        loaded.wrapS = THREE.RepeatWrapping;
        loaded.wrapT = THREE.RepeatWrapping;
        loaded.anisotropy = anisotropy;
        if (color) loaded.colorSpace = THREE.SRGBColorSpace;
        return loaded;
      }));
    }
    return sourceTextures.get(cacheKey);
  }

  async function texture(path, { color = false, repeat = [2, 2] } = {}) {
    const loaded = (await sourceTexture(path, color)).clone();
    loaded.repeat.set(repeat[0], repeat[1]);
    loaded.needsUpdate = true;
    return loaded;
  }

  async function pbrMaterial({ base, normal, roughness, metalness, color = 0xffffff, repeat = [1, 1], normalStrength = 0.35, options = {} }) {
    const [map, normalMap, roughnessMap, metalnessMap] = await Promise.all([
      texture(base, { color: true, repeat }),
      texture(normal, { repeat }),
      texture(roughness, { repeat }),
      metalness ? texture(metalness, { repeat }) : Promise.resolve(null)
    ]);
    return new THREE.MeshStandardMaterial({
      map,
      normalMap,
      roughnessMap,
      metalnessMap,
      normalScale: new THREE.Vector2(normalStrength, normalStrength),
      color,
      roughness: options.roughness ?? 1,
      metalness: options.metalness ?? 0,
      ...options
    });
  }

  const damagedPlaster = {
    base: "plaster-damaged/preconcrete_wall_warm_diff_1k.jpg",
    normal: "plaster-damaged/preconcrete_wall_001_nor_gl_1k.webp",
    roughness: "plaster-damaged/preconcrete_wall_001_rough_1k.jpg"
  };
  const wood = {
    base: "wood/weathered_planks_warm_diff_1k.jpg",
    normal: "wood/weathered_planks_nor_gl_1k.webp",
    roughness: "wood/weathered_planks_rough_1k.webp"
  };

  const materialPromises = {
    ground: pbrMaterial({
      base: "sand/aerial_sand_neutral_diff_1k.jpg",
      normal: "sand/aerial_sand_nor_gl_1k.webp",
      roughness: "sand/aerial_sand_rough_1k.jpg",
      repeat: [10, 10],
      normalStrength: 0.1,
      options: { roughness: 1, color: 0xe2ded6 }
    }),
    sandstone: pbrMaterial({
      base: "sandstone/large_sandstone_blocks_warm_diff_1k.jpg",
      normal: "sandstone/large_sandstone_blocks_01_nor_gl_1k.webp",
      roughness: "sandstone/large_sandstone_blocks_01_rough_1k.jpg",
      normalStrength: 0.3
    }),
    cleanPlaster: pbrMaterial({
      base: "plaster-clean/beige_wall_001_diff_1k.jpg",
      normal: "plaster-clean/beige_wall_001_nor_gl_1k.webp",
      roughness: "plaster-clean/beige_wall_001_rough_1k.jpg",
      color: 0xfff4dc,
      normalStrength: 0.22
    }),
    wornPlaster: pbrMaterial({ ...damagedPlaster, color: 0xf2e9dd, normalStrength: 0.3 }),
    stoneSlab: pbrMaterial({
      base: "sandstone/large_sandstone_blocks_warm_diff_1k.jpg",
      normal: "sandstone/large_sandstone_blocks_01_nor_gl_1k.webp",
      roughness: "sandstone/large_sandstone_blocks_01_rough_1k.jpg",
      color: 0xd5c199,
      normalStrength: 0.18
    }),
    wood: pbrMaterial({ ...wood, normalStrength: 0.28, options: { roughness: 0.96 } }),
    woodRoof: pbrMaterial({ ...wood, color: 0xdcc39b, normalStrength: 0.2, options: { roughness: 0.96, side: THREE.DoubleSide } }),
    darkWood: pbrMaterial({ ...wood, color: 0xc0a27c, normalStrength: 0.22, options: { roughness: 0.94 } }),
    iron: pbrMaterial({
      base: "metal/Metal056B_1K-JPG_Color.jpg",
      normal: "metal/Metal056B_1K-JPG_NormalGL.jpg",
      roughness: "metal/Metal056B_1K-JPG_Roughness.jpg",
      metalness: "metal/Metal056B_1K-JPG_Metalness.jpg",
      repeat: [2, 3],
      normalStrength: 0.24,
      options: { roughness: 0.88, metalness: 0.72, color: 0x8c7d68 }
    }),
    fabric: pbrMaterial({
      base: "fabric/Fabric010_1K-JPG_Color.jpg",
      normal: "fabric/Fabric010_1K-JPG_NormalGL.jpg",
      roughness: "fabric/Fabric010_1K-JPG_Roughness.jpg",
      repeat: [5, 3],
      normalStrength: 0.18,
      options: { roughness: 1, side: THREE.DoubleSide }
    }),
    rope: pbrMaterial({
      base: "rope/Rope002_1K-JPG_Color.jpg",
      normal: "rope/Rope002_1K-JPG_NormalGL.jpg",
      roughness: "rope/Rope002_1K-JPG_Roughness.jpg",
      repeat: [2, 5],
      options: { roughness: 1 }
    }),
    palmBark: pbrMaterial({
      base: "palm-bark/palm_bark_diff_1k.jpg",
      normal: "palm-bark/palm_bark_nor_gl_1k.webp",
      roughness: "palm-bark/palm_bark_rough_1k.webp",
      repeat: [2, 4],
      options: { roughness: 1 }
    }),
    clay: pbrMaterial({ ...damagedPlaster, color: 0xa96843, repeat: [3, 2], normalStrength: 0.2 }),
    paleClay: pbrMaterial({ ...damagedPlaster, color: 0xc88b5c, repeat: [3, 2], normalStrength: 0.2 }),
    potInterior: Promise.resolve(new THREE.MeshStandardMaterial({ color: 0x2e160e, roughness: 1, side: THREE.BackSide })),
    foliage: Promise.resolve(new THREE.MeshStandardMaterial({ color: 0x607344, roughness: 0.92, side: THREE.DoubleSide })),
    foundation: Promise.resolve(new THREE.MeshStandardMaterial({ color: 0xb18f65, roughness: 1 })),
    coping: Promise.resolve(new THREE.MeshStandardMaterial({ color: 0xc7aa78, roughness: 0.96 }))
  };
  const entries = await Promise.all(Object.entries(materialPromises).map(async ([name, promise]) => [name, await promise]));
  return Object.fromEntries(entries);
}

export async function createDesertWorldRenderer(ctx) {
  const { scene, mapConfig, renderer } = ctx;
  const materials = await createMaterials(renderer);
  const up = new THREE.Vector3(0, 1, 0);

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;

  function addStatic(mesh, receiveShadow = true, castShadow = true) {
    mesh.receiveShadow = receiveShadow;
    mesh.castShadow = castShadow;
    scene.add(mesh);
    ctx.worldColliders.push(mesh);
    return mesh;
  }

  function addDecor(mesh, castShadow = false) {
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  const materialScale = {
    sandstone: [3.8, 3.2],
    cleanPlaster: [4.5, 4.5],
    wornPlaster: [4.2, 3.5],
    stoneSlab: [4.2, 3.6],
    wood: [1.9, 1.9],
    woodRoof: [2.4, 2.4],
    darkWood: [1.8, 1.8],
    iron: [1.5, 1.5],
    fabric: [1.1, 1.1],
    rope: [0.35, 0.8],
    palmBark: [0.7, 1.8],
    clay: [1.1, 1.1],
    paleClay: [1.1, 1.1]
  };

  function scaleUvGroup(geometry, group, surfaceWidth, surfaceHeight, offsetU, offsetV, metersU, metersV) {
    const uvs = geometry.attributes.uv;
    const index = geometry.index;
    const processed = new Set();
    for (let cursor = group.start; cursor < group.start + group.count; cursor += 1) {
      const vertex = index ? index.getX(cursor) : cursor;
      if (processed.has(vertex)) continue;
      processed.add(vertex);
      uvs.setXY(
        vertex,
        (uvs.getX(vertex) * surfaceWidth + offsetU) / metersU,
        (uvs.getY(vertex) * surfaceHeight + offsetV) / metersV
      );
    }
  }

  function applyBoxUvs(geometry, name, width, height, depth, x = 0, y = 0, z = 0) {
    const [metersU, metersV] = materialScale[name] || [3.5, 3.5];
    const faces = [
      [depth, height, z, y],
      [depth, height, -z, y],
      [width, depth, x, z],
      [width, depth, x, -z],
      [width, height, x, y],
      [width, height, -x, y]
    ];
    for (const group of geometry.groups) {
      const face = faces[group.materialIndex] || faces[0];
      scaleUvGroup(geometry, group, face[0], face[1], face[2], face[3], metersU, metersV);
    }
    geometry.attributes.uv.needsUpdate = true;
    return geometry;
  }

  function roundedBox(name, width, height, depth, x = 0, y = 0, z = 0, radius = 0.055) {
    const safeRadius = Math.min(radius, width * 0.12, height * 0.12, depth * 0.12);
    const geometry = new RoundedBoxGeometry(width, height, depth, 2, Math.max(0.012, safeRadius));
    return applyBoxUvs(geometry, name, width, height, depth, x, y, z);
  }

  function applyPhysicalUvs(geometry, name, offsetU = 0, offsetV = 0) {
    const uvs = geometry.attributes.uv;
    const [metersU, metersV] = materialScale[name] || [3.5, 3.5];
    for (let vertex = 0; vertex < uvs.count; vertex += 1) {
      uvs.setXY(
        vertex,
        (uvs.getX(vertex) + offsetU) / metersU,
        (uvs.getY(vertex) + offsetV) / metersV
      );
    }
    uvs.needsUpdate = true;
    return geometry;
  }

  const instanceQueues = {
    crenels: [],
    foundations: [],
    copings: [],
    crateDetails: []
  };

  function queueInstance(queue, { x, y, z, width, height, depth, rotationY = 0 }) {
    queue.push({ x, y, z, width, height, depth, rotationY });
  }

  function flushInstances(queue, material) {
    if (!queue.length) return;
    const instances = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, queue.length);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    queue.forEach((item, index) => {
      position.set(item.x, item.y, item.z);
      euler.set(item.rotationX || 0, item.rotationY || 0, item.rotationZ || 0, "YXZ");
      rotation.setFromEuler(euler);
      scale.set(item.width, item.height, item.depth);
      matrix.compose(position, rotation, scale);
      instances.setMatrixAt(index, matrix);
    });
    instances.instanceMatrix.needsUpdate = true;
    instances.receiveShadow = true;
    instances.castShadow = false;
    instances.computeBoundingSphere();
    scene.add(instances);
  }

  function addCrenels(structure) {
    const alongX = structure.width >= structure.depth;
    const length = alongX ? structure.width : structure.depth;
    const count = Math.max(2, Math.floor(length / 2.1));
    for (let index = 0; index < count; index += 1) {
      const offset = -length * 0.5 + 0.75 + index * ((length - 1.5) / Math.max(1, count - 1));
      const capWidth = alongX ? 0.85 : structure.width + 0.12;
      const capDepth = alongX ? structure.depth + 0.12 : 0.85;
      queueInstance(instanceQueues.crenels, {
        x: structure.x + (alongX ? offset : 0),
        y: structure.y + structure.height * 0.5 + 0.31,
        z: structure.z + (alongX ? 0 : offset),
        width: capWidth,
        height: 0.62,
        depth: capDepth,
        rotationY: structure.rotationY || 0
      });
    }
  }

  function addStructure(structure) {
    const geometry = roundedBox(
      structure.material,
      structure.width,
      structure.height,
      structure.depth,
      structure.x,
      structure.y,
      structure.z
    );
    const mesh = new THREE.Mesh(geometry, materials[structure.material] || materials.sandstone);
    mesh.position.set(structure.x, structure.y, structure.z);
    mesh.rotation.y = structure.rotationY || 0;
    if (structure.visual === false) {
      mesh.material = new THREE.MeshBasicMaterial({ visible: false });
      mesh.visible = false;
      scene.add(mesh);
      ctx.worldColliders.push(mesh);
      return;
    }
    addStatic(mesh);

    const isWall = structure.height >= 2.8 && structure.material !== "woodRoof";
    if (isWall && structure.y - structure.height * 0.5 < 0.08) {
      const foundationHeight = 0.16;
      queueInstance(instanceQueues.foundations, {
        x: structure.x,
        y: foundationHeight * 0.5 + 0.012,
        z: structure.z,
        width: structure.width + 0.035,
        height: foundationHeight,
        depth: structure.depth + 0.035,
        rotationY: structure.rotationY || 0
      });
    }

    const needsCoping = isWall && ["cleanPlaster", "wornPlaster"].includes(structure.material) && !structure.crenels;
    if (needsCoping) {
      queueInstance(instanceQueues.copings, {
        x: structure.x,
        y: structure.y + structure.height * 0.5 + 0.045,
        z: structure.z,
        width: structure.width + 0.09,
        height: 0.13,
        depth: structure.depth + 0.09,
        rotationY: structure.rotationY || 0
      });
    }

    // Trim is opt-in so perpendicular walls never produce intersecting black bars.
    if (structure.trim) {
      const alongX = structure.width >= structure.depth;
      const ledge = new THREE.Mesh(
        new THREE.BoxGeometry(alongX ? structure.width + 0.18 : structure.width + 0.12, 0.12, alongX ? structure.depth + 0.18 : structure.depth + 0.12),
        materials.coping
      );
      ledge.position.set(structure.x, structure.y + structure.height * 0.5 - 0.34, structure.z);
      ledge.rotation.y = structure.rotationY || 0;
      addDecor(ledge);
    }
    if (structure.crenels) addCrenels(structure);
  }

  function addLadder({ x, z, normalX, normalZ, width, height }) {
    const group = new THREE.Group();
    const tangentX = -normalZ;
    const tangentZ = normalX;
    const railGeometry = new THREE.CylinderGeometry(0.065, 0.065, height, 8);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(railGeometry, materials.iron);
      rail.position.set(tangentX * width * 0.5 * side, height * 0.5, tangentZ * width * 0.5 * side);
      group.add(rail);
    }
    for (let y = 0.35; y < height; y += 0.46) {
      const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, width + 0.08, 8), materials.iron);
      rung.position.y = y;
      rung.quaternion.setFromUnitVectors(up, new THREE.Vector3(tangentX, 0, tangentZ));
      group.add(rung);
    }
    group.position.set(x, 0, z);
    scene.add(group);
  }

  function addRamp({ x, z, width, run, topY, thickness = 0.34, direction = "north", material = "stoneSlab" }) {
    const angle = Math.atan2(topY, run);
    const length = Math.hypot(run, topY);
    const alongZ = direction === "north" || direction === "south";
    const rampWidth = alongZ ? width : length;
    const rampDepth = alongZ ? length : width;
    const geometry = applyBoxUvs(
      new THREE.BoxGeometry(rampWidth, thickness, rampDepth),
      material,
      rampWidth,
      thickness,
      rampDepth,
      x,
      topY * 0.5,
      z
    );
    const ramp = new THREE.Mesh(geometry, materials[material] || materials.stoneSlab);
    ramp.position.set(x, topY * 0.5 + thickness * 0.25, z);
    if (direction === "north") ramp.rotation.x = angle;
    if (direction === "south") ramp.rotation.x = -angle;
    if (direction === "east") ramp.rotation.z = -angle;
    if (direction === "west") ramp.rotation.z = angle;
    addStatic(ramp);

    // Low stone lips communicate the playable edge without blocking shots.
    for (const side of [-1, 1]) {
      const lipWidth = alongZ ? 0.16 : length;
      const lipDepth = alongZ ? length : 0.16;
      const lip = new THREE.Mesh(
        applyBoxUvs(new THREE.BoxGeometry(lipWidth, 0.18, lipDepth), "sandstone", lipWidth, 0.18, lipDepth, x, topY * 0.5, z),
        materials.sandstone
      );
      lip.position.copy(ramp.position);
      lip.rotation.copy(ramp.rotation);
      if (alongZ) lip.position.x += side * (width * 0.5 - 0.08);
      else lip.position.z += side * (width * 0.5 - 0.08);
      addDecor(lip);
    }
  }

  function addArch({ x, y, z, width, height, depth, rotationY = 0 }) {
    const radius = width * 0.5;
    const spring = height - radius;
    const inset = Math.min(0.34, width * 0.11);
    const shape = new THREE.Shape();
    shape.moveTo(-radius, 0);
    shape.lineTo(-radius, spring);
    shape.absarc(0, spring, radius, Math.PI, 0, true);
    shape.lineTo(radius, 0);
    shape.lineTo(radius - inset, 0);
    shape.lineTo(radius - inset, spring);
    shape.absarc(0, spring, radius - inset, 0, Math.PI, false);
    shape.lineTo(-radius + inset, 0);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      curveSegments: 24,
      bevelEnabled: true,
      bevelSize: 0.055,
      bevelThickness: 0.05,
      bevelSegments: 4
    });
    geometry.translate(0, 0, -depth * 0.5);
    applyPhysicalUvs(geometry, "stoneSlab", x, y);
    const arch = new THREE.Mesh(geometry, materials.stoneSlab);
    arch.position.set(x, y, z);
    arch.rotation.y = rotationY;
    addDecor(arch);
  }

  function addCrate({ x, z, rotationY = 0, stack = 1 }) {
    for (let level = 0; level < stack; level += 1) {
      const size = level === 0 ? 1.65 : 1.4;
      const crate = new THREE.Group();
      const bodyX = x + level * 0.22;
      const bodyY = size * 0.5 + level * 1.5;
      const bodyZ = z - level * 0.18;
      const body = new THREE.Mesh(
        roundedBox("wood", size, size, size, bodyX, bodyY, bodyZ, 0.045),
        materials.wood
      );
      body.castShadow = true;
      body.receiveShadow = true;
      crate.add(body);
      const crateYaw = rotationY + level * 0.08;
      const worldDetailPosition = (localY, localZ) => ({
        x: bodyX + Math.sin(crateYaw) * localZ,
        y: bodyY + localY,
        z: bodyZ + Math.cos(crateYaw) * localZ
      });
      for (const side of [-1, 1]) {
        for (const offset of [-0.55, 0.55]) {
          const position = worldDetailPosition(offset * size * 0.5, side * (size * 0.5 + 0.035));
          queueInstance(instanceQueues.crateDetails, {
            ...position,
            width: size + 0.05,
            height: 0.13,
            depth: 0.12,
            rotationY: crateYaw
          });
        }
        const position = worldDetailPosition(0, side * (size * 0.5 + 0.042));
        queueInstance(instanceQueues.crateDetails, {
          ...position,
          width: size * 1.16,
          height: 0.11,
          depth: 0.1,
          rotationY: crateYaw,
          rotationZ: side * 0.7
        });
      }
      crate.position.set(bodyX, bodyY, bodyZ);
      crate.rotation.y = crateYaw;
      scene.add(crate);
      ctx.worldColliders.push(body);
    }
  }

  function addAwning({ x, y, z, width, depth, rotationY = 0, color }) {
    const group = new THREE.Group();
    const fabricGeometry = new THREE.PlaneGeometry(width, depth, 18, 10);
    const positions = fabricGeometry.attributes.position;
    const baseHeights = new Float32Array(positions.count);
    for (let index = 0; index < positions.count; index += 1) {
      const localX = positions.getX(index);
      const localY = positions.getY(index);
      const normalizedX = localX / (width * 0.5);
      const normalizedY = localY / (depth * 0.5);
      const sag = -0.34 * (1 - normalizedX * normalizedX) - 0.08 * Math.cos(normalizedY * Math.PI * 2);
      positions.setZ(index, sag);
      baseHeights[index] = sag;
    }
    fabricGeometry.computeVertexNormals();
    const fabricMaterial = materials.fabric.clone();
    fabricMaterial.color.setHex(color);
    const fabric = new THREE.Mesh(fabricGeometry, fabricMaterial);
    fabric.rotation.x = -Math.PI / 2;
    fabric.receiveShadow = true;
    fabric.castShadow = true;
    group.add(fabric);
    const postGeometry = new THREE.CylinderGeometry(0.065, 0.09, y, 12);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(postGeometry, materials.darkWood);
        post.position.set(sx * (width * 0.5 - 0.2), -y * 0.5, sz * (depth * 0.5 - 0.2));
        group.add(post);
      }
    }
    const ropeMaterial = materials.rope;
    for (const side of [-1, 1]) {
      const edgeRope = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, width, 8), ropeMaterial);
      edgeRope.rotation.z = Math.PI / 2;
      edgeRope.position.set(0, -0.02, side * depth * 0.5);
      group.add(edgeRope);
      for (let tx = -width * 0.42; tx <= width * 0.42; tx += width / 6) {
        const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.035, 0.28, 7), ropeMaterial);
        tassel.position.set(tx, -0.17, side * depth * 0.5);
        group.add(tassel);
      }
    }
    group.position.set(x, y, z);
    group.rotation.y = rotationY;
    scene.add(group);
    const windPhase = x * 0.31 + z * 0.17;
    ctx.mapAnimators.push((time) => {
      for (let index = 0; index < positions.count; index += 1) {
        const localX = positions.getX(index);
        const localY = positions.getY(index);
        const edgeFade = 1 - Math.min(1, Math.abs(localX) / (width * 0.5));
        const flutter = Math.sin(time * 1.35 + localX * 0.8 + localY * 0.42 + windPhase) * 0.035 * edgeFade;
        positions.setZ(index, baseHeights[index] + flutter);
      }
      positions.needsUpdate = true;
    });
  }

  function addPalm({ x, z, scale = 1 }) {
    const group = new THREE.Group();
    const trunkHeight = 5.3 * scale;
    const radialSegments = 16;
    const heightSegments = 12;
    const vertices = [];
    const uvs = [];
    const indices = [];
    for (let ring = 0; ring <= heightSegments; ring += 1) {
      const t = ring / heightSegments;
      const centerX = Math.sin(t * Math.PI * 0.92) * 0.16 * scale;
      const centerZ = Math.sin(t * Math.PI * 1.35) * 0.045 * scale;
      const radius = THREE.MathUtils.lerp(0.34, 0.205, t) * scale * (1 + Math.sin(t * Math.PI * 9) * 0.018);
      for (let side = 0; side <= radialSegments; side += 1) {
        const angle = (side / radialSegments) * Math.PI * 2;
        vertices.push(
          centerX + Math.cos(angle) * radius,
          t * trunkHeight,
          centerZ + Math.sin(angle) * radius
        );
        uvs.push(side / radialSegments * 2, t * 4.5);
      }
    }
    for (let ring = 0; ring < heightSegments; ring += 1) {
      for (let side = 0; side < radialSegments; side += 1) {
        const a = ring * (radialSegments + 1) + side;
        const b = a + radialSegments + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const trunkGeometry = new THREE.BufferGeometry();
    trunkGeometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    trunkGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    trunkGeometry.setIndex(indices);
    trunkGeometry.computeVertexNormals();
    const trunk = new THREE.Mesh(trunkGeometry, materials.palmBark);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);
    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, 0);
    leafShape.bezierCurveTo(0.8 * scale, 0.44 * scale, 2.5 * scale, 0.36 * scale, 3.5 * scale, 0);
    leafShape.bezierCurveTo(2.5 * scale, -0.36 * scale, 0.8 * scale, -0.44 * scale, 0, 0);
    const leafGeometry = new THREE.ShapeGeometry(leafShape, 12);
    for (let index = 0; index < 12; index += 1) {
      const leaf = new THREE.Mesh(leafGeometry, materials.foliage);
      leaf.position.y = trunkHeight;
      leaf.rotation.y = (index / 12) * Math.PI * 2;
      leaf.rotation.z = -0.2 - (index % 2) * 0.13;
      group.add(leaf);
    }
    group.position.set(x, 0, z);
    scene.add(group);
  }

  function addPottery({ x, z, scale = 1 }, index) {
    const group = new THREE.Group();
    const outerMaterial = index % 2 ? materials.paleClay : materials.clay;
    const outer = new THREE.Mesh(
      new THREE.LatheGeometry([
        new THREE.Vector2(0.05, 0), new THREE.Vector2(0.34, 0.06), new THREE.Vector2(0.47, 0.36),
        new THREE.Vector2(0.48, 0.56), new THREE.Vector2(0.39, 0.77), new THREE.Vector2(0.26, 0.86),
        new THREE.Vector2(0.25, 0.93)
      ], 32),
      outerMaterial
    );
    outer.receiveShadow = true;
    group.add(outer);
    const inner = new THREE.Mesh(
      new THREE.LatheGeometry([
        new THREE.Vector2(0.205, 0.91), new THREE.Vector2(0.33, 0.8), new THREE.Vector2(0.4, 0.58),
        new THREE.Vector2(0.32, 0.22), new THREE.Vector2(0.08, 0.08)
      ], 32),
      materials.potInterior
    );
    group.add(inner);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.045, 12, 32), outerMaterial);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.92;
    group.add(rim);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.018, 8, 32), materials.darkWood);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.58;
    group.add(band);
    group.position.set(x, 0, z);
    group.scale.setScalar(scale);
    scene.add(group);
    ctx.worldColliders.push(outer);
  }

  function addDust() {
    const count = 650;
    const positions = new Float32Array(count * 3);
    const random = seededRandom(91);
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = (random() - 0.5) * 88;
      positions[index * 3 + 1] = 0.4 + random() * 10;
      positions[index * 3 + 2] = (random() - 0.5) * 88;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const dust = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xe7c98c, size: 0.045, transparent: true, opacity: 0.34, depthWrite: false }));
    scene.add(dust);
    ctx.mapAnimators.push((time) => {
      dust.rotation.y = time * 0.006;
      dust.position.x = Math.sin(time * 0.08) * 0.8;
    });
  }

  function build() {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(mapConfig.ground.size, mapConfig.ground.size), materials.ground);
    floor.rotation.x = -Math.PI / 2;
    addStatic(floor, true, false);

    mapConfig.structures.forEach(addStructure);
    flushInstances(instanceQueues.crenels, materials.coping);
    flushInstances(instanceQueues.foundations, materials.foundation);
    flushInstances(instanceQueues.copings, materials.coping);
    mapConfig.arches.forEach(addArch);
    (mapConfig.ramps || []).forEach(addRamp);
    mapConfig.ladders.forEach(addLadder);
    mapConfig.crates.forEach(addCrate);
    flushInstances(instanceQueues.crateDetails, materials.darkWood);
    mapConfig.awnings.forEach(addAwning);
    mapConfig.palms.forEach(addPalm);
    mapConfig.pottery.forEach(addPottery);
    addDust();

    // Exposed roof beams make the caravanserai read as a built interior, not a box.
    for (const x of mapConfig.interior?.beamXs || []) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, mapConfig.interior.depth), materials.darkWood);
      beam.position.set(x, mapConfig.interior.beamY, mapConfig.interior.z);
      addDecor(beam);
    }

    // Warm pools inside the caravanserai make the covered route readable.
    for (const lightPosition of mapConfig.interior?.lights || []) {
      const light = new THREE.PointLight(0xffb868, 1.35, 11, 2);
      light.position.set(lightPosition.x, 3.8, lightPosition.z);
      scene.add(light);
    }
  }

  function update(time, delta) {
    for (const animateMapPart of ctx.mapAnimators) animateMapPart(time, delta);
  }

  return { build, update };
}
