import {
  CAMERA_SENSITIVITY_STORAGE_KEY,
  DEFAULT_CAMERA_SENSITIVITY,
  MAX_CAMERA_SENSITIVITY,
  MIN_CAMERA_SENSITIVITY
} from "../config.js";
import { cameraSensitivityInput, cameraSensitivityValue } from "../dom.js";
import { state } from "../state.js";

function clampCameraSensitivity(value) {
  if (value === null || value === undefined || value === "") return DEFAULT_CAMERA_SENSITIVITY;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_CAMERA_SENSITIVITY;
  return Math.min(MAX_CAMERA_SENSITIVITY, Math.max(MIN_CAMERA_SENSITIVITY, parsed));
}

function loadCameraSensitivity() {
  try {
    return clampCameraSensitivity(localStorage.getItem(CAMERA_SENSITIVITY_STORAGE_KEY));
  } catch {
    return DEFAULT_CAMERA_SENSITIVITY;
  }
}

function saveCameraSensitivity(value) {
  try {
    localStorage.setItem(CAMERA_SENSITIVITY_STORAGE_KEY, String(value));
  } catch {
    // Ignore localStorage failures (private mode / quota)
  }
}

function syncCameraSensitivityUi() {
  if (cameraSensitivityInput) cameraSensitivityInput.value = String(state.cameraSensitivity);
  if (cameraSensitivityValue) cameraSensitivityValue.textContent = `${Math.round(state.cameraSensitivity * 100)}%`;
}

export function initializeCameraSensitivityUi() {
  state.cameraSensitivity = loadCameraSensitivity();
  syncCameraSensitivityUi();

  cameraSensitivityInput?.addEventListener("input", () => {
    state.cameraSensitivity = clampCameraSensitivity(cameraSensitivityInput.value);
    saveCameraSensitivity(state.cameraSensitivity);
    syncCameraSensitivityUi();
  });
}
