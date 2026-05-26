import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

export function createViewModel() {
  const group = new THREE.Group();
  group.position.set(0.3, -0.31, -0.52);
  group.rotation.set(-0.14, -0.22, -0.1);

  const armMaterial = new THREE.MeshStandardMaterial({ color: 0xd1a57b, roughness: 0.82 });
  const sleeveMaterial = new THREE.MeshStandardMaterial({ color: 0x2b3f66, roughness: 0.88 });
  const metalDark = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.45, metalness: 0.35 });
  const metalAccent = new THREE.MeshStandardMaterial({ color: 0x6f6f77, roughness: 0.35, metalness: 0.65 });
  const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x6f4a2a, roughness: 0.8, metalness: 0.05 });
  const scopeGlass = new THREE.MeshStandardMaterial({
    color: 0x4cb7ff,
    roughness: 0.15,
    metalness: 0.25,
    transparent: true,
    opacity: 0.78
  });

  const armGroup = new THREE.Group();
  group.add(armGroup);

  const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.36, 6, 12), armMaterial);
  forearm.rotation.z = 0.85;
  forearm.rotation.x = -0.16;
  forearm.position.set(-0.12, -0.16, 0.14);
  armGroup.add(forearm);

  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.22, 12), sleeveMaterial);
  sleeve.rotation.z = 0.9;
  sleeve.rotation.x = -0.2;
  sleeve.position.set(-0.18, -0.22, 0.2);
  armGroup.add(sleeve);

  const ak47 = new THREE.Group();
  const akReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.45), metalDark);
  akReceiver.position.set(-0.02, -0.19, -0.27);
  ak47.add(akReceiver);
  
  const akDustCover = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.35), metalAccent);
  akDustCover.position.set(-0.02, -0.11, -0.27);
  ak47.add(akDustCover);

  const akBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 8), metalAccent);
  akBarrel.rotation.x = Math.PI / 2;
  akBarrel.position.set(-0.02, -0.16, -0.75);
  ak47.add(akBarrel);

  const akGasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.35, 8), metalAccent);
  akGasTube.rotation.x = Math.PI / 2;
  akGasTube.position.set(-0.02, -0.12, -0.65);
  ak47.add(akGasTube);

  const akHandguard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.25), woodMaterial);
  akHandguard.position.set(-0.02, -0.15, -0.6);
  ak47.add(akHandguard);

  const akGrip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.05), woodMaterial);
  akGrip.position.set(-0.02, -0.3, -0.15);
  akGrip.rotation.x = -0.2;
  ak47.add(akGrip);

  const akMag = new THREE.Group();
  const magTop = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.15, 0.08), metalDark);
  magTop.position.set(0, -0.05, 0);
  const magBot = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.15, 0.08), metalDark);
  magBot.position.set(0, -0.18, 0.03);
  magBot.rotation.x = 0.25;
  akMag.add(magTop);
  akMag.add(magBot);
  akMag.position.set(-0.02, -0.25, -0.35);
  akMag.rotation.x = 0.1;
  ak47.add(akMag);

  const akStock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.11, 0.22), woodMaterial);
  akStock.position.set(-0.02, -0.22, 0.05);
  akStock.rotation.x = -0.15;
  ak47.add(akStock);

  const akFrontSight = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.05, 0.02), metalDark);
  akFrontSight.position.set(-0.02, -0.13, -0.98);
  ak47.add(akFrontSight);
  
  const akRearSight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.03), metalDark);
  akRearSight.position.set(-0.02, -0.08, -0.4);
  ak47.add(akRearSight);

  const shotgun = new THREE.Group();
  shotgun.position.set(-0.015, -0.005, 0.01);
  
  const sgBody = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.4), metalDark);
  sgBody.position.set(-0.02, -0.18, -0.25);
  shotgun.add(sgBody);

  const sgBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.7, 8), metalAccent);
  sgBarrel.rotation.x = Math.PI / 2;
  sgBarrel.position.set(-0.02, -0.14, -0.75);
  shotgun.add(sgBarrel);
  
  const sgTube = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.65, 8), metalDark);
  sgTube.rotation.x = Math.PI / 2;
  sgTube.position.set(-0.02, -0.18, -0.72);
  shotgun.add(sgTube);

  const sgPump = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.2), woodMaterial);
  sgPump.position.set(-0.02, -0.18, -0.65);
  shotgun.add(sgPump);

  const sgStock = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.25), woodMaterial);
  sgStock.position.set(-0.02, -0.22, 0.05);
  sgStock.rotation.x = -0.15;
  shotgun.add(sgStock);
  
  const sgGrip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.06), woodMaterial);
  sgGrip.position.set(-0.02, -0.26, -0.12);
  sgGrip.rotation.x = -0.3;
  shotgun.add(sgGrip);

  const sniper = new THREE.Group();
  sniper.position.set(0.005, -0.01, 0.015);
  
  const snBody = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.5), woodMaterial);
  snBody.position.set(-0.02, -0.18, -0.35);
  sniper.add(snBody);
  
  const snAction = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.3), metalDark);
  snAction.position.set(-0.02, -0.12, -0.35);
  sniper.add(snAction);

  const snBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.8, 8), metalAccent);
  snBarrel.rotation.x = Math.PI / 2;
  snBarrel.position.set(-0.02, -0.14, -0.85);
  sniper.add(snBarrel);
  
  const snMuzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 8), metalDark);
  snMuzzle.rotation.x = Math.PI / 2;
  snMuzzle.position.set(-0.02, -0.14, -1.25);
  sniper.add(snMuzzle);

  const snScope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 12), metalDark);
  snScope.rotation.x = Math.PI / 2;
  snScope.position.set(-0.02, -0.04, -0.35);
  sniper.add(snScope);
  
  const snScopeMount1 = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.04, 0.02), metalDark);
  snScopeMount1.position.set(-0.02, -0.07, -0.25);
  sniper.add(snScopeMount1);
  const snScopeMount2 = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.04, 0.02), metalDark);
  snScopeMount2.position.set(-0.02, -0.07, -0.45);
  sniper.add(snScopeMount2);

  const snScopeLens = new THREE.Mesh(new THREE.CircleGeometry(0.025, 12), scopeGlass);
  snScopeLens.position.set(-0.02, -0.04, -0.17);
  sniper.add(snScopeLens);

  const snStock = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.3), woodMaterial);
  snStock.position.set(-0.02, -0.2, -0.05);
  snStock.rotation.x = -0.1;
  sniper.add(snStock);
  
  const snCheek = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.12), metalDark);
  snCheek.position.set(-0.02, -0.13, -0.1);
  sniper.add(snCheek);

  group.add(ak47);
  group.add(shotgun);
  group.add(sniper);

  const muzzleAk = new THREE.Object3D();
  muzzleAk.position.set(-0.02, -0.16, -1.05);
  ak47.add(muzzleAk);

  const muzzleShotgun = new THREE.Object3D();
  muzzleShotgun.position.set(-0.03, -0.14, -1.1);
  shotgun.add(muzzleShotgun);

  const muzzleSniper = new THREE.Object3D();
  muzzleSniper.position.set(-0.015, -0.14, -1.3);
  sniper.add(muzzleSniper);

  group.userData.weaponModels = { ak47, shotgun, sniper };
  group.userData.muzzles = { ak47: muzzleAk, shotgun: muzzleShotgun, sniper: muzzleSniper };
  group.userData.armGroup = armGroup;
  group.userData.activeMuzzle = muzzleAk;
  group.userData.activeWeapon = "ak47";

  return group;
}

