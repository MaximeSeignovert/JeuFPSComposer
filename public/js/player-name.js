import { PLAYER_NAME_STORAGE_KEY } from "./config.js";

export function sanitizePlayerName(rawName) {
  const cleaned = String(rawName || "").trim().slice(0, 20);
  return cleaned || "Player";
}

export function savePlayerName(name) {
  try {
    localStorage.setItem(PLAYER_NAME_STORAGE_KEY, sanitizePlayerName(name));
  } catch {
    // Ignore localStorage failures (private mode / quota)
  }
}

export function loadPlayerName() {
  try {
    return sanitizePlayerName(localStorage.getItem(PLAYER_NAME_STORAGE_KEY) || "Player");
  } catch {
    return "Player";
  }
}
