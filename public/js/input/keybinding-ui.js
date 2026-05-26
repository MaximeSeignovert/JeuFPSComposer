import { DEFAULT_KEY_BINDINGS, KEY_BINDING_ROWS } from "../config.js";
import { hudGrenadeKey, keyBindingsList, keyBindingsReset } from "../dom.js";
import {
  formatKeyLabel,
  getKeyBindingFromEvent,
  loadKeyBindings,
  normalizeKeyBindingValue,
  saveKeyBindings
} from "../key-bindings.js";
import { state } from "../state.js";

export const keyBindings = loadKeyBindings();

let rebindTarget = null;
let onBindingsChanged = () => {};

function assignKeyBinding(action, newCode) {
  newCode = normalizeKeyBindingValue(newCode);
  const old = keyBindings[action];
  if (old === newCode) return;
  const conflict = Object.entries(keyBindings).find(([k, v]) => k !== action && v === newCode);
  if (conflict) keyBindings[conflict[0]] = old;
  keyBindings[action] = newCode;
  saveKeyBindings(keyBindings);
}

function syncKeyBindListeningClass() {
  if (!keyBindingsList) return;
  keyBindingsList.querySelectorAll(".key-bind-row__btn").forEach((btn) => {
    btn.classList.toggle("is-listening", btn.dataset.action === rebindTarget);
  });
}

function refreshKeyBindingButtons() {
  if (!keyBindingsList) return;
  keyBindingsList.querySelectorAll(".key-bind-row__btn").forEach((btn) => {
    const id = btn.dataset.action;
    if (id && keyBindings[id]) btn.textContent = formatKeyLabel(keyBindings[id]);
  });
}

function buildKeyBindingsUi() {
  if (!keyBindingsList) return;
  keyBindingsList.innerHTML = "";
  for (const row of KEY_BINDING_ROWS) {
    const wrap = document.createElement("div");
    wrap.className = "key-bind-row";
    const lab = document.createElement("span");
    lab.className = "key-bind-row__label";
    lab.textContent = row.label;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "key-bind-row__btn";
    btn.dataset.action = row.id;
    btn.textContent = formatKeyLabel(keyBindings[row.id]);
    btn.addEventListener("click", () => {
      rebindTarget = rebindTarget === row.id ? null : row.id;
      syncKeyBindListeningClass();
    });
    wrap.appendChild(lab);
    wrap.appendChild(btn);
    keyBindingsList.appendChild(wrap);
  }
}

export function updateHudKeyHints() {
  if (hudGrenadeKey) hudGrenadeKey.textContent = formatKeyLabel(keyBindings.grenade);
  onBindingsChanged();
}

export function cancelKeyRebind() {
  rebindTarget = null;
  syncKeyBindListeningClass();
}

function onKeydownCaptureForRebind(e) {
  if (!rebindTarget || !state.pauseOpen) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (e.repeat) return;
  const pressedKey = getKeyBindingFromEvent(e);
  if (pressedKey === "Escape") {
    rebindTarget = null;
    syncKeyBindListeningClass();
    return;
  }
  assignKeyBinding(rebindTarget, pressedKey);
  rebindTarget = null;
  syncKeyBindListeningClass();
  refreshKeyBindingButtons();
  updateHudKeyHints();
}

export function initializeKeyBindingUi(options = {}) {
  onBindingsChanged = options.onBindingsChanged || (() => {});
  buildKeyBindingsUi();
  if (keyBindingsReset) {
    keyBindingsReset.addEventListener("click", () => {
      Object.assign(keyBindings, DEFAULT_KEY_BINDINGS);
      saveKeyBindings(keyBindings);
      refreshKeyBindingButtons();
      updateHudKeyHints();
      rebindTarget = null;
      syncKeyBindListeningClass();
    });
  }
  window.addEventListener("keydown", onKeydownCaptureForRebind, true);
  updateHudKeyHints();
}
