import { canvas, pauseMenuOverlay, resumeBtn } from "../dom.js";
import { getKeyBindingFromEvent } from "../key-bindings.js";
import { state } from "../state.js";
import { keyBindings } from "./keybinding-ui.js";
import { resetTouchInput, shouldUsePointerLock } from "./touch-controls.js";

const PAUSE_OVERLAY_CLOSE_COOLDOWN_MS = 300;
const WEAPON_WHEEL_COOLDOWN_MS = 120;

export function bindKeyboardMouseControls(options) {
  let lastWeaponWheelAt = 0;

  document.addEventListener("keydown", (e) => {
    const pressedKey = getKeyBindingFromEvent(e);
    if (pressedKey === keyBindings.pause && state.joined) {
      e.preventDefault();
      options.togglePauseMenu();
      return;
    }
    if (pressedKey === keyBindings.grenade) {
      if (state.joined && !state.pauseOpen && state.isAlive) {
        e.preventDefault();
        options.equipGrenade();
      }
      return;
    }
    if (pressedKey === keyBindings.reload) {
      if (state.joined && !state.pauseOpen && state.isAlive) {
        e.preventDefault();
        options.reloadWeapon();
      }
      return;
    }
    state.keys.add(pressedKey);
    if (pressedKey === keyBindings.jump && state.joined && !state.pauseOpen && state.onGround) {
      options.jump();
    }
  });

  document.addEventListener("keyup", (e) => state.keys.delete(getKeyBindingFromEvent(e)));
  document.addEventListener("contextmenu", (e) => {
    if (state.joined) e.preventDefault();
  });
  document.addEventListener("mousemove", (e) => {
    if (!state.joined || document.pointerLockElement !== canvas) return;
    state.yaw -= e.movementX * 0.0025 * state.cameraSensitivity;
    state.pitch -= e.movementY * 0.002 * state.cameraSensitivity;
    state.pitch = Math.max(-1.4, Math.min(1.4, state.pitch));
  });
  document.addEventListener("pointerlockchange", () => {
    if (!state.joined || !shouldUsePointerLock()) return;
    const lockedOnCanvas = document.pointerLockElement === canvas;
    if (!lockedOnCanvas && !state.pauseOpen && state.isAlive && !state.primaryFireHeld) {
      options.setPauseMenu(true);
    }
  });

  canvas.addEventListener("click", () => {
    if (shouldUsePointerLock() && state.joined && !state.pauseOpen && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock();
    }
  });
  canvas.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    options.beginPrimaryFire();
  });
  canvas.addEventListener("mousedown", (event) => {
    if (event.button !== 2) return;
    if (!state.joined || state.pauseOpen || !state.isAlive) return;
    state.isAiming = true;
  });
  canvas.addEventListener(
    "wheel",
    (event) => {
      if (!state.joined || state.pauseOpen || !state.isAlive || event.deltaY === 0) return;
      event.preventDefault();
      const now = performance.now();
      if (now - lastWeaponWheelAt < WEAPON_WHEEL_COOLDOWN_MS) return;
      lastWeaponWheelAt = now;
      options.cycleWeaponSlot(event.deltaY > 0 ? 1 : -1);
    },
    { passive: false }
  );
  canvas.addEventListener("mouseup", (event) => {
    if (event.button === 0) options.endPrimaryFireFromMouseEvent(event);
    if (event.button === 2) state.isAiming = false;
  });
  document.addEventListener("mouseup", (event) => {
    if (event.button === 0) options.endPrimaryFireFromMouseEvent(event);
  });
  window.addEventListener("blur", () => {
    options.cancelPrimaryFire();
    state.isAiming = false;
    resetTouchInput();
  });

  resumeBtn.addEventListener("click", () => {
    options.setPauseMenu(false);
    if (shouldUsePointerLock()) canvas.requestPointerLock();
  });

  pauseMenuOverlay.addEventListener("click", (e) => {
    if (e.target !== pauseMenuOverlay) return;
    if (performance.now() - state.pauseOpenedAt < PAUSE_OVERLAY_CLOSE_COOLDOWN_MS) return;
    options.setPauseMenu(false);
    if (shouldUsePointerLock()) canvas.requestPointerLock();
  });
}
