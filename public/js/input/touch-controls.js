import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import {
  canvas,
  mobileControlsQuery,
  touchAimBtn,
  touchControls,
  touchFireBtn,
  touchFullscreenBtn,
  touchGrenadeBtn,
  touchInput,
  touchJumpBtn,
  touchMoveStick,
  touchPauseBtn,
  touchReloadBtn
} from "../dom.js";
import { state } from "../state.js";
import { syncFullscreenButton, toggleFullscreenMode } from "./fullscreen.js";

let updateHudKeyHints = () => {};

export function shouldUsePointerLock() {
  return !mobileControlsQuery.matches;
}

export function isTouchControlsActive() {
  return Boolean(touchControls && !touchControls.classList.contains("hidden"));
}

export function hasGameLookInput() {
  return document.pointerLockElement === canvas || isTouchControlsActive();
}

function resetTouchStick(stick, data) {
  data.pointerId = null;
  data.x = 0;
  data.y = 0;
  data.strength = 0;
  const knob = stick?.querySelector(".touch-stick__knob");
  if (knob) knob.style.transform = "translate(-50%, -50%)";
}

export function resetTouchInput() {
  resetTouchStick(touchMoveStick, touchInput.move);
  touchInput.look.pointerId = null;
  touchInput.look.lastX = 0;
  touchInput.look.lastY = 0;
  state.isFiring = false;
  state.primaryFireHeld = false;
  touchFireBtn?.classList.remove("is-active");
  touchAimBtn?.classList.toggle("is-active", state.isAiming);
}

export function syncTouchControls() {
  if (!touchControls) return;
  const wasTouchControlsActive = isTouchControlsActive();
  const show = state.joined && state.isAlive && !state.pauseOpen && mobileControlsQuery.matches;
  touchControls.classList.toggle("hidden", !show);
  if (!show && wasTouchControlsActive) resetTouchInput();
  updateHudKeyHints();
  syncFullscreenButton();
}

function updateTouchStickFromEvent(stick, data, event) {
  const rect = stick.getBoundingClientRect();
  const radius = rect.width * 0.5;
  const maxKnobTravel = radius - 28;
  const rawX = event.clientX - rect.left - radius;
  const rawY = event.clientY - rect.top - radius;
  const distance = Math.hypot(rawX, rawY);
  const scale = distance > maxKnobTravel ? maxKnobTravel / distance : 1;
  const knobX = rawX * scale;
  const knobY = rawY * scale;
  data.x = THREE.MathUtils.clamp(knobX / maxKnobTravel, -1, 1);
  data.y = THREE.MathUtils.clamp(knobY / maxKnobTravel, -1, 1);
  data.strength = Math.min(1, distance / maxKnobTravel);

  const knob = stick.querySelector(".touch-stick__knob");
  if (knob) {
    knob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
  }
}

function bindTouchStick(stick, data) {
  if (!stick) return;
  stick.addEventListener("pointerdown", (event) => {
    if (!isTouchControlsActive() || data.pointerId !== null) return;
    event.preventDefault();
    data.pointerId = event.pointerId;
    stick.setPointerCapture(event.pointerId);
    updateTouchStickFromEvent(stick, data, event);
  });
  stick.addEventListener("pointermove", (event) => {
    if (data.pointerId !== event.pointerId) return;
    event.preventDefault();
    updateTouchStickFromEvent(stick, data, event);
  });
  const release = (event) => {
    if (data.pointerId !== event.pointerId) return;
    event.preventDefault();
    resetTouchStick(stick, data);
  };
  stick.addEventListener("pointerup", release);
  stick.addEventListener("pointercancel", release);
}

function bindTouchLookSurface() {
  if (!touchControls) return;
  const isReservedControl = (target) => Boolean(target.closest(".touch-stick, .touch-actions"));
  touchControls.addEventListener("pointerdown", (event) => {
    if (!isTouchControlsActive() || touchInput.look.pointerId !== null || isReservedControl(event.target)) return;
    event.preventDefault();
    touchInput.look.pointerId = event.pointerId;
    touchInput.look.lastX = event.clientX;
    touchInput.look.lastY = event.clientY;
    touchControls.setPointerCapture(event.pointerId);
  });
  touchControls.addEventListener("pointermove", (event) => {
    if (touchInput.look.pointerId !== event.pointerId) return;
    event.preventDefault();
    const dx = event.clientX - touchInput.look.lastX;
    const dy = event.clientY - touchInput.look.lastY;
    touchInput.look.lastX = event.clientX;
    touchInput.look.lastY = event.clientY;
    state.yaw -= dx * 0.004;
    state.pitch -= dy * 0.0032;
    state.pitch = Math.max(-1.4, Math.min(1.4, state.pitch));
  });
  const release = (event) => {
    if (touchInput.look.pointerId !== event.pointerId) return;
    event.preventDefault();
    touchInput.look.pointerId = null;
  };
  touchControls.addEventListener("pointerup", release);
  touchControls.addEventListener("pointercancel", release);
}

function bindTouchButton(button, onDown, onUp) {
  if (!button) return;
  button.addEventListener("pointerdown", (event) => {
    if (!isTouchControlsActive()) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    onDown?.(event);
  });
  const release = (event) => {
    event.preventDefault();
    onUp?.(event);
  };
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
}

export function bindTouchControls(options) {
  updateHudKeyHints = options.updateHudKeyHints;
  bindTouchStick(touchMoveStick, touchInput.move);
  bindTouchLookSurface();
  bindTouchButton(
    touchFireBtn,
    () => {
      if (!options.beginPrimaryFire()) return;
      touchFireBtn?.classList.add("is-active");
      if (!options.getWeaponStats().auto) {
        touchFireBtn?.classList.remove("is-active");
      }
    },
    () => {
      options.endPrimaryFire();
      touchFireBtn?.classList.remove("is-active");
    }
  );
  bindTouchButton(touchAimBtn, () => {
    if (!state.joined || state.pauseOpen || !state.isAlive) return;
    state.isAiming = !state.isAiming;
    touchAimBtn?.classList.toggle("is-active", state.isAiming);
  });
  bindTouchButton(touchJumpBtn, options.jump);
  bindTouchButton(touchGrenadeBtn, options.throwGrenade);
  bindTouchButton(touchReloadBtn, options.reloadWeapon);
  bindTouchButton(touchPauseBtn, () => {
    if (state.joined) options.togglePauseMenu();
  });
  bindTouchButton(touchFullscreenBtn, () => toggleFullscreenMode({ resizeRendererToViewport: options.resizeRendererToViewport }));
}
