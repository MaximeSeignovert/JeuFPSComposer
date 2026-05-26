import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

const localMaterial = new THREE.MeshStandardMaterial({ color: 0x45e0a8 });

export function createPlayerMesh(isLocal = false) {
  if (isLocal) {
    const localMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 6, 10), localMaterial);
    localMesh.position.y = 1.2;
    return localMesh;
  }

  const root = new THREE.Group();
  root.position.y = 0;
  const bodyGroup = new THREE.Group();
  bodyGroup.rotation.y = Math.PI;
  root.add(bodyGroup);

  const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xd9ad84, roughness: 0.78, flatShading: true });
  const shirtMaterial = new THREE.MeshStandardMaterial({ color: 0x4f8cf6, roughness: 0.75, flatShading: true });
  const pantMaterial = new THREE.MeshStandardMaterial({ color: 0x1e2f4f, roughness: 0.88, flatShading: true });
  const shoeMaterial = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.95, flatShading: true });
  const accMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8, flatShading: true });
  const visorMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.8, flatShading: true });

  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 1.44, 0);

  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.3), shirtMaterial);
  chest.position.y = 0.1;
  torsoGroup.add(chest);

  const abdomen = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.25), shirtMaterial);
  abdomen.position.y = -0.25;
  torsoGroup.add(abdomen);

  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.1, 0.28), accMaterial);
  belt.position.y = -0.35;
  torsoGroup.add(belt);

  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.2), accMaterial);
  backpack.position.set(0, 0, -0.2);
  torsoGroup.add(backpack);
  bodyGroup.add(torsoGroup);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.95, 0);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skinMaterial);
  headGroup.add(head);

  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.15, 0.32), accMaterial);
  helmet.position.y = 0.12;
  headGroup.add(helmet);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.1), visorMaterial);
  visor.position.set(0, 0, 0.15);
  headGroup.add(visor);
  bodyGroup.add(headGroup);

  const armGeo = new THREE.BoxGeometry(0.15, 0.45, 0.15);
  const handGeo = new THREE.BoxGeometry(0.12, 0.15, 0.12);

  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(-0.35, 1.65, 0);
  const leftArm = new THREE.Mesh(armGeo, shirtMaterial);
  leftArm.position.y = -0.225;
  leftArmGroup.add(leftArm);
  const leftHand = new THREE.Mesh(handGeo, skinMaterial);
  leftHand.position.y = -0.525;
  leftArmGroup.add(leftHand);
  leftArmGroup.rotation.z = 0.1;
  bodyGroup.add(leftArmGroup);

  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(0.35, 1.65, 0);
  const rightArm = new THREE.Mesh(armGeo, shirtMaterial);
  rightArm.position.y = -0.225;
  rightArmGroup.add(rightArm);
  const rightHand = new THREE.Mesh(handGeo, skinMaterial);
  rightHand.position.y = -0.525;
  rightArmGroup.add(rightHand);

  const gunMaterial = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7, flatShading: true });
  const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.45), gunMaterial);
  gunBody.position.set(0, -0.525, 0.15);
  rightArmGroup.add(gunBody);
  const gunBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), gunMaterial);
  gunBarrel.position.set(0, -0.48, 0.45);
  rightArmGroup.add(gunBarrel);

  rightArmGroup.rotation.z = -0.1;
  bodyGroup.add(rightArmGroup);

  const legGeo = new THREE.BoxGeometry(0.18, 0.5, 0.18);
  const leftLegGroup = new THREE.Group();
  leftLegGroup.position.set(-0.15, 0.9, 0);
  const leftLeg = new THREE.Mesh(legGeo, pantMaterial);
  leftLeg.position.y = -0.25;
  leftLegGroup.add(leftLeg);
  const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.25), shoeMaterial);
  leftShoe.position.set(0, -0.575, 0.03);
  leftLegGroup.add(leftShoe);
  bodyGroup.add(leftLegGroup);

  const rightLegGroup = new THREE.Group();
  rightLegGroup.position.set(0.15, 0.9, 0);
  const rightLeg = new THREE.Mesh(legGeo, pantMaterial);
  rightLeg.position.y = -0.25;
  rightLegGroup.add(rightLeg);
  const rightShoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.25), shoeMaterial);
  rightShoe.position.set(0, -0.575, 0.03);
  rightLegGroup.add(rightShoe);
  bodyGroup.add(rightLegGroup);

  const hitbox = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 1.1, 6, 10),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false
    })
  );
  hitbox.position.y = 1.2;
  root.add(hitbox);

  const nameTag = createNameTagSprite("Player");
  nameTag.position.set(0, 2.45, 0);
  root.add(nameTag);

  root.userData.hitbox = hitbox;
  root.userData.nameTag = nameTag;
  root.userData.materials = { shirtMaterial };
  root.userData.groundOffset = 0.48;
  root.userData.parts = {
    torso: torsoGroup,
    head: headGroup,
    leftArm: leftArmGroup,
    rightArm: rightArmGroup,
    leftLeg: leftLegGroup,
    rightLeg: rightLegGroup
  };

  return root;
}

export function createNameTagSprite(name) {
  const canvasTag = document.createElement("canvas");
  canvasTag.width = 512;
  canvasTag.height = 128;
  const ctx = canvasTag.getContext("2d");
  const texture = new THREE.CanvasTexture(canvasTag);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(1.9, 0.46, 1);
  sprite.renderOrder = 9;
  sprite.userData = { canvas: canvasTag, ctx, texture, currentName: "", currentColor: "" };
  updateNameTagSprite(sprite, name, null);
  return sprite;
}

export function colorFromPlayerId(playerId) {
  const key = String(playerId || "default");
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  const color = new THREE.Color();
  color.setHSL(hue / 360, 0.62, 0.56);
  return color;
}

function toRgbaString(color, alpha = 1) {
  const r = Math.round(THREE.MathUtils.clamp(color.r, 0, 1) * 255);
  const g = Math.round(THREE.MathUtils.clamp(color.g, 0, 1) * 255);
  const b = Math.round(THREE.MathUtils.clamp(color.b, 0, 1) * 255);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function updateNameTagSprite(sprite, name, playerColor) {
  if (!sprite?.userData?.ctx) return;
  const safeName = String(name || "Player").slice(0, 20);
  const bgColor = playerColor || new THREE.Color(0x3d5a85);
  const bgColorKey = bgColor.getHexString();
  if (sprite.userData.currentName === safeName && sprite.userData.currentColor === bgColorKey) return;

  sprite.userData.currentName = safeName;
  sprite.userData.currentColor = bgColorKey;

  const { canvas: canvasTag, ctx, texture } = sprite.userData;
  ctx.clearRect(0, 0, canvasTag.width, canvasTag.height);

  ctx.fillStyle = toRgbaString(bgColor, 0.88);
  roundRect(ctx, 10, 18, canvasTag.width - 20, 94, 26);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 4;
  roundRect(ctx, 10, 18, canvasTag.width - 20, 94, 26);
  ctx.stroke();

  ctx.font = "700 46px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(safeName, canvasTag.width / 2, canvasTag.height / 2 + 1);

  texture.needsUpdate = true;
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width * 0.5, height * 0.5));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function applyRemoteTeamStyle(root, team, playerId) {
  const shirtMaterial = root?.userData?.materials?.shirtMaterial;
  if (!shirtMaterial) return;
  const playerColor = colorFromPlayerId(playerId);
  shirtMaterial.color.copy(playerColor);
}

export function setRemoteAliveVisual(root, alive) {
  if (!root) return;
  root.visible = alive !== false;
}
