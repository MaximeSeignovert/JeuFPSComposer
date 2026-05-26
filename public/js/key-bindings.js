import { DEFAULT_KEY_BINDINGS, KEY_BINDINGS_STORAGE_KEY } from "./config.js";

const KEY_LABEL_FR = {
  Escape: "Échap",
  Space: "Espace",
  ShiftLeft: "Maj gauche",
  ShiftRight: "Maj droite",
  ControlLeft: "Ctrl gauche",
  ControlRight: "Ctrl droite",
  AltLeft: "Alt gauche",
  AltRight: "Alt droite",
  Tab: "Tab",
  Enter: "Entrée",
  Backspace: "Retour",
  CapsLock: "Verr. maj",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→"
};

const LEGACY_CODE_TO_AZERTY_KEY = {
  KeyW: "z",
  KeyA: "q",
  KeyS: "s",
  KeyD: "d",
  KeyG: "g",
  Digit0: "0",
  Digit1: "1",
  Digit2: "2",
  Digit3: "3",
  Digit4: "4",
  Digit5: "5",
  Digit6: "6",
  Digit7: "7",
  Digit8: "8",
  Digit9: "9"
};

export function normalizeKeyBindingValue(value) {
  if (!value) return "";
  if (LEGACY_CODE_TO_AZERTY_KEY[value]) return LEGACY_CODE_TO_AZERTY_KEY[value];
  if (value === " ") return "Space";
  if (value.length === 1) return value.toLocaleLowerCase("fr-FR");
  if (value.startsWith("Key") && value.length === 4) return value.slice(3).toLocaleLowerCase("fr-FR");
  if (value.startsWith("Digit")) return value.slice(5);
  return value;
}

export function getKeyBindingFromEvent(event) {
  if (event.code === "Space" || event.key === " ") return "Space";
  if (event.key && event.key.length === 1) return event.key.toLocaleLowerCase("fr-FR");
  return event.code || event.key || "";
}

export function formatKeyLabel(key) {
  if (!key) return "?";
  if (KEY_LABEL_FR[key]) return KEY_LABEL_FR[key];
  if (key.length === 1) return key.toLocaleUpperCase("fr-FR");
  if (key.startsWith("Numpad")) return "Pav. " + key.slice(6);
  return key;
}

export function loadKeyBindings() {
  const merged = { ...DEFAULT_KEY_BINDINGS };
  try {
    const raw = localStorage.getItem(KEY_BINDINGS_STORAGE_KEY);
    if (!raw) return merged;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || !parsed) return merged;
    for (const id of Object.keys(DEFAULT_KEY_BINDINGS)) {
      if (typeof parsed[id] === "string" && parsed[id].length) {
        merged[id] = normalizeKeyBindingValue(parsed[id]);
      }
    }
  } catch {
    // ignore
  }
  return merged;
}

export function saveKeyBindings(keyBindings) {
  try {
    localStorage.setItem(KEY_BINDINGS_STORAGE_KEY, JSON.stringify(keyBindings));
  } catch {
    // ignore
  }
}
