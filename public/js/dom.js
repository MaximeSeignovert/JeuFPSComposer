export const app = document.getElementById("app");
export const menu = document.getElementById("menu");
export const roomsList = document.getElementById("roomsList");
export const nameInput = document.getElementById("nameInput");
export const weaponChoice = document.getElementById("weaponChoice");
export const pauseMenuOverlay = document.getElementById("pauseMenuOverlay");
export const pauseMenu = document.getElementById("pauseMenu");
export const resumeBtn = document.getElementById("resumeBtn");
export const hud = document.getElementById("hud");
export const crosshair = document.getElementById("crosshair");
export const damageOverlay = document.getElementById("damageOverlay");
export const hitmarker = document.getElementById("hitmarker");
export const sniperScope = document.getElementById("sniperScope");
export const playerList = document.getElementById("playerList");
export const hudRoom = document.getElementById("hudRoom");
export const hudTeam = document.getElementById("hudTeam");
export const hudWeapon = document.getElementById("hudWeapon");
export const hudWeaponName = document.getElementById("hudWeaponName");
export const hudGrenade = document.getElementById("hudGrenade");
export const hudGrenadeKey = document.getElementById("hudGrenadeKey");
export const hudControlsHint = document.getElementById("hudControlsHint");
export const keyBindingsList = document.getElementById("keyBindingsList");
export const keyBindingsReset = document.getElementById("keyBindingsReset");
export const hudHealth = document.getElementById("hudHealth");
export const hudHealthFill = document.getElementById("hudHealthFill");
export const respawnNotice = document.getElementById("respawnNotice");
export const deathScreen = document.getElementById("deathScreen");
export const deathKillerName = document.getElementById("deathKillerName");
export const deathCountdown = document.getElementById("deathCountdown");
export const canvas = document.getElementById("gameCanvas");
export const touchControls = document.getElementById("touchControls");
export const touchMoveStick = document.getElementById("touchMoveStick");
export const touchFireBtn = document.getElementById("touchFireBtn");
export const touchAimBtn = document.getElementById("touchAimBtn");
export const touchJumpBtn = document.getElementById("touchJumpBtn");
export const touchGrenadeBtn = document.getElementById("touchGrenadeBtn");
export const touchPauseBtn = document.getElementById("touchPauseBtn");
export const touchFullscreenBtn = document.getElementById("touchFullscreenBtn");

export const mobileControlsQuery = window.matchMedia("(max-width: 820px), (hover: none), (pointer: coarse)");

export const touchInput = {
  move: { pointerId: null, x: 0, y: 0, strength: 0 },
  look: { pointerId: null, lastX: 0, lastY: 0 }
};
