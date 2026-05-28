import { GRENADE_CONFIG, MAP_HALF_SIZE } from "./js/config.js";
import * as dom from "./js/dom.js";
import { createGameContext } from "./js/game/context.js";
import { createGrenadesController } from "./js/game/grenades-controller.js";
import { createPlayerController } from "./js/game/player-controller.js";
import { createRemotePlayersController } from "./js/game/remote-players.js";
import { createWeaponsController } from "./js/game/weapons-controller.js";
import { bindKeyboardMouseControls } from "./js/input/keyboard-mouse.js";
import { initializeCameraSensitivityUi } from "./js/input/camera-sensitivity.js";
import { initializeKeyBindingUi, updateHudKeyHints } from "./js/input/keybinding-ui.js";
import { syncFullscreenButton } from "./js/input/fullscreen.js";
import { bindTouchControls, syncTouchControls } from "./js/input/touch-controls.js";
import { createSocketClient } from "./js/net/socket-client.js";
import { initPhysics } from "./js/physics/rapier-physics.js";
import { createEffectsController } from "./js/render/effects.js";
import { createWorldRenderer } from "./js/render/world-renderer.js";
import { createHudController } from "./js/ui/hud.js";
import { createViewModel } from "./js/weapons.js";
import { MAP_LAYOUT } from "./js/world/map-layout.js";
import { createSceneSetup } from "./js/world/scene.js";
import { state } from "./js/state.js";

const sceneSetup = createSceneSetup(dom.canvas);
const viewModel = createViewModel();
sceneSetup.camera.add(viewModel);

const ctx = createGameContext({
  dom,
  state,
  sceneSetup,
  viewModel,
  mapConfig: MAP_LAYOUT
});

function resizeRendererToViewport() {
  ctx.camera.aspect = window.innerWidth / window.innerHeight;
  ctx.camera.updateProjectionMatrix();
  ctx.renderer.setSize(window.innerWidth, window.innerHeight);
}

ctx.controllers.world = createWorldRenderer(ctx);
ctx.controllers.effects = createEffectsController(ctx);
ctx.controllers.remotePlayers = createRemotePlayersController(ctx);
ctx.controllers.weapons = createWeaponsController(ctx);
ctx.controllers.hud = createHudController(ctx);
ctx.controllers.player = createPlayerController(ctx);
ctx.controllers.grenades = createGrenadesController(ctx);
ctx.controllers.socket = createSocketClient(ctx);

ctx.controllers.world.build();
ctx.controllers.weapons.setActiveWeaponModel(state.weapon);

dom.weaponChoice.addEventListener("click", (event) => {
  const target = event.target.closest("button[data-weapon]");
  if (!target) return;
  ctx.controllers.weapons.selectWeapon(target.getAttribute("data-weapon"));
});

window.addEventListener("resize", () => {
  resizeRendererToViewport();
  syncTouchControls();
});

document.addEventListener("fullscreenchange", syncFullscreenButton);
document.addEventListener("webkitfullscreenchange", syncFullscreenButton);

if (dom.mobileControlsQuery.addEventListener) {
  dom.mobileControlsQuery.addEventListener("change", syncTouchControls);
} else if (dom.mobileControlsQuery.addListener) {
  dom.mobileControlsQuery.addListener(syncTouchControls);
}

initializeKeyBindingUi({
  onBindingsChanged: () => {
    ctx.controllers.hud.updateGrenade();
    ctx.controllers.hud.updateAmmo();
  }
});
initializeCameraSensitivityUi();

bindTouchControls({
  beginPrimaryFire: ctx.controllers.weapons.beginPrimaryFire,
  endPrimaryFire: ctx.controllers.weapons.endPrimaryFire,
  getWeaponStats: ctx.controllers.weapons.getWeaponStats,
  jump: ctx.controllers.player.jump,
  reloadWeapon: ctx.controllers.weapons.reloadWeapon,
  resizeRendererToViewport,
  throwGrenade: ctx.controllers.grenades.throwGrenade,
  togglePauseMenu: ctx.controllers.hud.togglePauseMenu,
  updateHudKeyHints
});

bindKeyboardMouseControls({
  beginPrimaryFire: ctx.controllers.weapons.beginPrimaryFire,
  endPrimaryFire: ctx.controllers.weapons.endPrimaryFire,
  endPrimaryFireFromMouseEvent: ctx.controllers.weapons.endPrimaryFireFromMouseEvent,
  jump: ctx.controllers.player.jump,
  reloadWeapon: ctx.controllers.weapons.reloadWeapon,
  setPauseMenu: ctx.controllers.hud.setPauseMenu,
  throwGrenade: ctx.controllers.grenades.throwGrenade,
  togglePauseMenu: ctx.controllers.hud.togglePauseMenu
});

function animate() {
  requestAnimationFrame(animate);
  const delta = ctx.clock.getDelta();
  const time = performance.now() * 0.001;

  ctx.controllers.hud.updateFrame();
  ctx.camera.rotation.set(state.pitch, state.yaw, 0, "YXZ");
  ctx.controllers.player.update(delta);
  ctx.controllers.weapons.update(delta);
  ctx.controllers.remotePlayers.update(delta, time);
  ctx.controllers.effects.update(delta);
  ctx.controllers.grenades.update(delta, time);
  ctx.controllers.world.update(time, delta);
  ctx.renderer.render(ctx.scene, ctx.camera);
}

ctx.controllers.socket.connect();
ctx.physics = await initPhysics({
  mapConfig: MAP_LAYOUT,
  mapHalfSize: MAP_HALF_SIZE,
  playerHeight: state.playerHeight,
  gravity: GRENADE_CONFIG.gravity,
  grenadeConfig: GRENADE_CONFIG
});

const initialCameraPosition = ctx.physics.getPlayerCameraPosition();
ctx.camera.position.set(initialCameraPosition.x, initialCameraPosition.y, initialCameraPosition.z);
animate();
