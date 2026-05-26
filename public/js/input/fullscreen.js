import { app, touchFullscreenBtn } from "../dom.js";

export function getFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

export function syncFullscreenButton() {
  if (!touchFullscreenBtn) return;
  const fullscreenTarget = getFullscreenElement();
  const isFullscreen = fullscreenTarget === document.documentElement || fullscreenTarget === document.body || fullscreenTarget === app;
  touchFullscreenBtn.classList.toggle("is-active", isFullscreen);
  touchFullscreenBtn.setAttribute("aria-label", isFullscreen ? "Quitter le plein écran" : "Plein écran");
  touchFullscreenBtn.title = isFullscreen ? "Quitter le plein écran" : "Plein écran";
}

export async function toggleFullscreenMode({ resizeRendererToViewport } = {}) {
  const fullscreenElement = getFullscreenElement();
  try {
    if (fullscreenElement) {
      const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
      if (exitFullscreen) await exitFullscreen.call(document);
    } else {
      const target = app || document.documentElement;
      const requestFullscreen = target.requestFullscreen || target.webkitRequestFullscreen;
      if (requestFullscreen) await requestFullscreen.call(target);
    }
  } catch {
    // Some mobile browsers reject fullscreen outside trusted gestures.
  } finally {
    syncFullscreenButton();
    if (resizeRendererToViewport) setTimeout(resizeRendererToViewport, 80);
  }
}
