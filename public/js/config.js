export const BASE_FOV = 74;
export const PLAYER_NAME_STORAGE_KEY = "fps.playerName";
export const KEY_BINDINGS_STORAGE_KEY = "fps.keyBindings";

export const DEFAULT_KEY_BINDINGS = {
  forward: "z",
  back: "s",
  left: "q",
  right: "d",
  sprint: "ShiftLeft",
  jump: "Space",
  grenade: "g",
  pause: "Escape"
};

export const KEY_BINDING_ROWS = [
  { id: "forward", label: "Avancer" },
  { id: "back", label: "Reculer" },
  { id: "left", label: "Strafe gauche" },
  { id: "right", label: "Strafe droite" },
  { id: "sprint", label: "Sprint" },
  { id: "jump", label: "Sauter" },
  { id: "grenade", label: "Grenade" },
  { id: "pause", label: "Pause / menu" }
];

export const MAP_HALF_SIZE = 40;
export const REMOTE_INTERP_SPEED = 12;
export const VIEW_RECOIL_DECAY = 15;
export const VIEW_RECOIL_BOB_SUPPRESS_K = 0.48;
export const VIEW_RECOIL_NORM_CAP = 0.16;

export const WEAPON_STATS = {
  shotgun: {
    label: "Fusil a pompe",
    fireRate: 1.0,
    pellets: 12,
    spreadX: 0.18,
    spreadY: 0.04,
    spread: 0.12,
    damage: 12,
    range: 22,
    bulletSpeed: 120,
    auto: false,
    zoomFov: BASE_FOV,
    viewRecoil: { z: 0.135, y: -0.02, rotX: 0.078, rotZ: 0.05 }
  },
  ak47: {
    label: "AK47",
    fireRate: 8.2,
    pellets: 1,
    spread: 0.017,
    damage: 20,
    range: 58,
    bulletSpeed: 145,
    auto: true,
    zoomFov: BASE_FOV,
    viewRecoil: { z: 0.042, y: -0.006, rotX: 0.032, rotZ: 0.02 }
  },
  sniper: {
    label: "Sniper",
    fireRate: 0.72,
    pellets: 1,
    spread: 0.002,
    damage: 92,
    range: 125,
    bulletSpeed: 210,
    auto: false,
    zoomFov: 28,
    viewRecoil: { z: 0.158, y: -0.014, rotX: 0.068, rotZ: 0.028 }
  }
};

export const GRENADE_CONFIG = {
  pickupRadius: 1.7,
  radius: 0.18,
  gravity: 24,
  throwSpeed: 16,
  fuseMs: 1600,
  blastRadius: 8.5,
  bounceDamping: 0.62,
  friction: 0.84,
  minVerticalBounce: 1.4,
  minHorizontalSpeed: 0.2
};
