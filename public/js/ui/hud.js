import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { BASE_FOV, WEAPON_STATS } from "../config.js";
import { formatKeyLabel } from "../key-bindings.js";
import { cancelKeyRebind, keyBindings } from "../input/keybinding-ui.js";
import { resetTouchInput, syncTouchControls } from "../input/touch-controls.js";

const DEATH_WEAPON_LABELS = {
  grenade: "Grenade"
};

export function createHudController(ctx) {
  const { camera, state } = ctx;
  const {
    canvas,
    crosshair,
    deathCountdown,
    deathKillerName,
    deathKillerWeapon,
    deathKillerWeaponIcon,
    deathScreen,
    hud,
    hudAmmo,
    hudAmmoCount,
    hudGrenade,
    hudHealth,
    hudHealthFill,
    hudReloadStatus,
    killFeed,
    menu,
    pauseMenuOverlay,
    playerList,
    respawnNotice,
    roomsList,
    sniperScope,
    touchAimBtn,
    touchGrenadeBtn,
    touchReloadBtn,
    weaponChoice
  } = ctx.dom;
  let renderedDeathWeapon = null;

  function getDeathWeaponLabel(weapon) {
    return WEAPON_STATS[weapon]?.label || DEATH_WEAPON_LABELS[weapon] || "Inconnue";
  }

  function normalizeWeaponKey(weapon) {
    return WEAPON_STATS[weapon] || weapon === "grenade" ? weapon : "ak47";
  }

  function createWeaponIcon(weapon, className) {
    const weaponKey = normalizeWeaponKey(weapon);
    const sourceSvg =
      weaponKey === "grenade"
        ? document.querySelector("#hudGrenade svg")
        : weaponChoice?.querySelector(`button[data-weapon="${weaponKey}"] svg`);
    const icon = sourceSvg?.cloneNode(true);
    if (!icon) return null;
    icon.removeAttribute("width");
    icon.removeAttribute("height");
    icon.classList.add(className);
    return icon;
  }

  function updateDeathWeaponIcon(weapon) {
    if (!deathKillerWeaponIcon || renderedDeathWeapon === weapon) return;
    renderedDeathWeapon = weapon;
    deathKillerWeaponIcon.replaceChildren();
    deathKillerWeaponIcon.className = `death-weapon__icon death-weapon__icon--${weapon || "unknown"}`;
    const icon = createWeaponIcon(weapon, "death-weapon__svg");
    if (icon) deathKillerWeaponIcon.append(icon);
  }

  function updateHealth() {
    const clampedHealth = THREE.MathUtils.clamp(Math.round(state.health), 0, 100);
    if (hudHealth) hudHealth.textContent = `Vie: ${clampedHealth}`;
    const healthMeter = hudHealthFill?.closest("[role='meter']");
    if (healthMeter) healthMeter.setAttribute("aria-valuenow", String(clampedHealth));
    if (hudHealthFill) {
      const ratio = clampedHealth / 100;
      hudHealthFill.style.transform = `scaleY(${ratio})`;
      hudHealthFill.style.filter = clampedHealth <= 25 ? "brightness(0.85)" : "";
    }
  }

  function updateAmmo() {
    if (!hudAmmo) return;
    const weapons = ctx.controllers.weapons;
    const weapon = state.weapon;
    const stats = weapons.getWeaponStats(weapon);
    const usesMagazine = !stats.melee;
    hudAmmo.classList.toggle("hud-ammo--hidden", !usesMagazine);
    if (!usesMagazine) {
      hudAmmo.setAttribute("aria-label", "Arme de melee");
      if (touchReloadBtn) touchReloadBtn.disabled = true;
      return;
    }

    const ammo = weapons.ensureWeaponAmmo(weapon);
    const magazineSize = weapons.getMagazineSize(weapon);
    const reloading = weapons.isReloadingWeapon(weapon);
    const remainingMs = Math.max(0, state.reloadUntil - performance.now());
    if (hudAmmoCount) hudAmmoCount.textContent = `${ammo}/${magazineSize}`;
    if (hudReloadStatus) hudReloadStatus.textContent = reloading ? `Reload ${Math.ceil(remainingMs / 1000)}s` : "";
    hudAmmo.classList.toggle("hud-ammo--empty", ammo <= 0);
    hudAmmo.classList.toggle("hud-ammo--reloading", reloading);
    hudAmmo.setAttribute(
      "aria-label",
      reloading ? `Rechargement ${Math.ceil(remainingMs / 1000)} secondes` : `${ammo} balles sur ${magazineSize}`
    );
    if (touchReloadBtn) {
      touchReloadBtn.disabled = reloading || ammo >= magazineSize;
      touchReloadBtn.classList.toggle("is-active", reloading);
    }
  }

  function updateGrenade() {
    if (!hudGrenade) return;
    const has = state.grenadesHeld >= 1;
    hudGrenade.classList.toggle("hud-grenade--ready", has);
    hudGrenade.classList.toggle("hud-grenade--empty", !has);
    const gLabel = formatKeyLabel(keyBindings.grenade);
    hudGrenade.setAttribute("aria-label", has ? `Grenade prête, touche ${gLabel} pour lancer` : "Pas de grenade");
    if (touchGrenadeBtn) {
      touchGrenadeBtn.disabled = !has;
      touchGrenadeBtn.classList.toggle("is-active", has);
    }
  }

  function updateZoom() {
    const weapons = ctx.controllers.weapons;
    const stats = weapons.getWeaponStats();
    const shouldZoom =
      state.joined && state.isAlive && state.isAiming && state.weapon === "sniper" && !state.pauseOpen;
    const targetFov = shouldZoom ? stats.zoomFov : BASE_FOV;
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.2);
    camera.updateProjectionMatrix();
    sniperScope.classList.toggle("hidden", !shouldZoom);
    const showCrosshair = state.joined && state.isAlive && !state.pauseOpen && !shouldZoom;
    crosshair.classList.toggle("hidden", !showCrosshair);
  }

  function updateRespawnNotice() {
    if (!state.joined || state.isAlive) {
      respawnNotice.classList.add("hidden");
      return;
    }
    respawnNotice.classList.add("hidden");
  }

  function updateDeathScreen() {
    if (!state.joined || state.isAlive) {
      deathScreen?.classList.add("hidden");
      return;
    }
    const left = Math.max(0, state.respawnUntil - performance.now());
    const seconds = Math.ceil(left / 1000);
    if (deathKillerName) deathKillerName.textContent = state.deathKillerName || "Inconnu";
    if (deathKillerWeapon) deathKillerWeapon.textContent = getDeathWeaponLabel(state.deathKillerWeapon);
    updateDeathWeaponIcon(state.deathKillerWeapon);
    if (deathCountdown) deathCountdown.textContent = `Respawn dans ${seconds}s...`;
    deathScreen?.classList.remove("hidden");
  }

  function setLocalAlive(alive) {
    state.isAlive = Boolean(alive);
    if (!state.isAlive) {
      state.isFiring = false;
      state.isAiming = false;
      ctx.controllers.weapons?.cancelReload();
      resetTouchInput();
      sniperScope.classList.add("hidden");
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      syncTouchControls();
      return;
    }
    state.deathKillerId = null;
    state.deathKillerName = "";
    state.deathKillerWeapon = "";
    renderedDeathWeapon = null;
    deathScreen?.classList.add("hidden");
    syncTouchControls();
  }

  function addKillFeedEntry({ killerName, victimName, weapon }) {
    if (!killFeed || !killerName || !victimName) return;
    const weaponKey = normalizeWeaponKey(weapon);
    const item = document.createElement("div");
    item.className = `kill-feed__item kill-feed__item--${weaponKey}`;

    const killer = document.createElement("span");
    killer.className = "kill-feed__name kill-feed__name--killer";
    killer.textContent = killerName;
    const iconWrap = document.createElement("span");
    iconWrap.className = "kill-feed__weapon";
    iconWrap.setAttribute("aria-label", getDeathWeaponLabel(weaponKey));
    const icon = createWeaponIcon(weaponKey, "kill-feed__svg");
    if (icon) iconWrap.append(icon);
    const victim = document.createElement("span");
    victim.className = "kill-feed__name kill-feed__name--victim";
    victim.textContent = victimName;

    item.append(killer, iconWrap, victim);
    killFeed.prepend(item);
    window.setTimeout(() => item.classList.add("kill-feed__item--leaving"), 2400);
    window.setTimeout(() => item.remove(), 3000);
  }

  function renderRooms(rooms) {
    roomsList.innerHTML = "";
    rooms.forEach((room) => {
      const item = document.createElement("article");
      item.className = `room-item ${room.count >= room.max ? "full" : ""}`;
      item.innerHTML = `
        <div class="room-item__meta">
          <strong>${room.id}</strong>
          <span>${room.count}/${room.max} joueurs</span>
        </div>
      `;
      const btn = document.createElement("button");
      btn.className = "room-join-button";
      btn.textContent = room.count >= room.max ? "Pleine" : "Rejoindre";
      btn.disabled = room.count >= room.max;
      btn.addEventListener("click", () => ctx.controllers.socket?.joinRoom(room.id));
      item.appendChild(btn);
      roomsList.appendChild(item);
    });
  }

  function enterGame() {
    menu.classList.add("hidden");
    hud.classList.remove("hidden");
    crosshair.classList.remove("hidden");
    playerList.classList.remove("hidden");
    pauseMenuOverlay.classList.add("hidden");
    updateGrenade();
    updateAmmo();
    updateHealth();
    updateRespawnNotice();
    syncTouchControls();
  }

  function setPauseMenu(open) {
    if (!state.joined) return;
    state.pauseOpen = open;
    if (open) state.pauseOpenedAt = performance.now();
    cancelKeyRebind();
    pauseMenuOverlay.classList.toggle("hidden", !open);
    crosshair.classList.toggle("hidden", open);
    sniperScope.classList.add("hidden");
    if (open) {
      state.keys.clear();
      state.isFiring = false;
      state.isAiming = false;
      resetTouchInput();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    }
    syncTouchControls();
  }

  function togglePauseMenu() {
    setPauseMenu(!state.pauseOpen);
  }

  function showRoomError(message) {
    respawnNotice.textContent = message || "Action impossible";
    respawnNotice.classList.remove("hidden");
    setTimeout(() => {
      if (state.isAlive) respawnNotice.classList.add("hidden");
    }, 1500);
  }

  function syncWeaponChoice() {
    weaponChoice.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("active", button.getAttribute("data-weapon") === state.weapon);
    });
  }

  function renderScoreboard(players) {
    const scoreboard = [...players].sort((a, b) => {
      const killDiff = (Number(b.kills) || 0) - (Number(a.kills) || 0);
      if (killDiff !== 0) return killDiff;
      const deathDiff = (Number(a.deaths) || 0) - (Number(b.deaths) || 0);
      if (deathDiff !== 0) return deathDiff;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });

    const html = scoreboard
      .map((p, idx) => {
        const life = p.alive === false ? "MORT" : `${Math.max(0, Number(p.health) || 0)}PV`;
        const isMe = p.id === state.playerId;
        return `<li class="${isMe ? "me" : ""}">
          <span class="rank">#${idx + 1}</span>
          <span class="name">${p.name}${isMe ? " (Toi)" : ""}</span>
          <span class="kd">${Number(p.kills) || 0}/${Number(p.deaths) || 0}</span>
          <span class="life">${life}</span>
        </li>`;
      })
      .join("");
    playerList.innerHTML = `
      <strong>Scoreboard FFA (${players.length}/10)</strong>
      <ul class="scoreboard-list">${html}</ul>
    `;
  }

  function updateFromPlayers(players) {
    const me = players.find((p) => p.id === state.playerId);
    if (me) {
      state.health = Number(me.health) || state.health;
      setLocalAlive(me.alive !== false);
      state.team = me.team || state.team;
      updateHealth();
    }
    renderScoreboard(players);
  }

  function updateFrame() {
    updateZoom();
    updateRespawnNotice();
    updateDeathScreen();
  }

  return {
    addKillFeedEntry,
    enterGame,
    renderRooms,
    setLocalAlive,
    setPauseMenu,
    showRoomError,
    syncWeaponChoice,
    togglePauseMenu,
    updateAmmo,
    updateFrame,
    updateFromPlayers,
    updateGrenade,
    updateHealth
  };
}
