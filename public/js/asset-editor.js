import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";

const isDevelopmentHost = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)
  || new URLSearchParams(window.location.search).has("editor");

function formatNumber(value) {
  return Number(value).toFixed(2);
}

export function createAssetEditor(ctx) {
  if (!isDevelopmentHost) return { enabled: false };

  const transform = new TransformControls(ctx.camera, ctx.renderer.domElement);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const panel = document.createElement("aside");
  panel.className = "asset-editor hidden";
  panel.innerHTML = `
    <div class="asset-editor__eyebrow">Development tool</div>
    <h2>Map asset editor</h2>
    <p class="asset-editor__help">F2 opens or closes. Click a model, then use the gizmo.</p>
    <strong class="asset-editor__selection">No asset selected</strong>
    <output class="asset-editor__transform">Select an asset to inspect its transform.</output>
    <div class="asset-editor__modes">
      <button type="button" data-mode="translate">Move <kbd>1</kbd></button>
      <button type="button" data-mode="rotate">Rotate <kbd>2</kbd></button>
      <button type="button" data-mode="scale">Scale <kbd>3</kbd></button>
    </div>
    <button class="asset-editor__copy" type="button">Copy selected config</button>
    <p class="asset-editor__note">Edits are visual until you paste the copied config and refresh. Physics uses the authored map.</p>
  `;
  document.body.append(panel);

  const selectionLabel = panel.querySelector(".asset-editor__selection");
  const transformLabel = panel.querySelector(".asset-editor__transform");
  const copyButton = panel.querySelector(".asset-editor__copy");
  let open = false;
  let selected = null;

  transform.addEventListener("dragging-changed", ({ value }) => {
    ctx.renderer.domElement.style.cursor = value ? "grabbing" : "crosshair";
  });
  transform.addEventListener("objectChange", () => {
    if (!selected) return;
    const config = selected.userData.assetConfig;
    config.x = selected.position.x;
    config.y = selected.position.y;
    config.z = selected.position.z;
    config.rotationY = selected.rotation.y;
    config.scale = selected.scale.x / (config.building ? (Number(ctx.mapConfig.buildingScale) || 1) : 1);
    updateDetails();
  });
  ctx.scene.add(transform);

  function updateDetails() {
    if (!selected) {
      selectionLabel.textContent = "No asset selected";
      transformLabel.textContent = "Select an asset to inspect its transform.";
      copyButton.disabled = true;
      return;
    }
    const { file } = selected.userData.assetConfig;
    selectionLabel.textContent = file;
    transformLabel.textContent = `X ${formatNumber(selected.position.x)}  Y ${formatNumber(selected.position.y)}  Z ${formatNumber(selected.position.z)}  R ${formatNumber(THREE.MathUtils.radToDeg(selected.rotation.y))} deg  S ${formatNumber(selected.scale.x)}`;
    copyButton.disabled = false;
  }

  function select(asset) {
    selected = asset;
    transform.attach(asset);
    updateDetails();
  }

  function setOpen(nextOpen) {
    open = nextOpen;
    ctx.state.editorOpen = open;
    panel.classList.toggle("hidden", !open);
    if (open && document.pointerLockElement === ctx.renderer.domElement) document.exitPointerLock();
    if (!open) transform.detach();
    updateDetails();
  }

  function findEditableAsset(object) {
    let current = object;
    while (current) {
      if (current.userData.editableAsset) return current;
      current = current.parent;
    }
    return null;
  }

  ctx.renderer.domElement.addEventListener("pointerdown", (event) => {
    if (!open || transform.dragging) return;
    const rect = ctx.renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, ctx.camera);
    const hit = raycaster.intersectObjects(ctx.editableAssets, true)[0];
    const asset = hit && findEditableAsset(hit.object);
    if (asset) select(asset);
    event.preventDefault();
  }, true);

  panel.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => transform.setMode(button.dataset.mode));
  });
  copyButton.addEventListener("click", async () => {
    if (!selected) return;
    const config = selected.userData.assetConfig;
    const exportConfig = {
      file: config.file,
      x: Number(formatNumber(config.x)),
      y: Number(formatNumber(config.y || 0)),
      z: Number(formatNumber(config.z)),
      scale: Number(formatNumber(config.scale)),
      rotationY: Number(formatNumber(config.rotationY)),
      solid: Boolean(config.solid),
      building: Boolean(config.building)
    };
    await navigator.clipboard?.writeText(JSON.stringify(exportConfig, null, 2));
    copyButton.textContent = "Copied";
    window.setTimeout(() => { copyButton.textContent = "Copy selected config"; }, 1200);
  });

  document.addEventListener("keydown", (event) => {
    if (event.code === "F2") {
      event.preventDefault();
      setOpen(!open);
      return;
    }
    if (!open) return;
    if (event.code === "Digit1") transform.setMode("translate");
    if (event.code === "Digit2") transform.setMode("rotate");
    if (event.code === "Digit3") transform.setMode("scale");
    if (event.code === "Escape") setOpen(false);
  });

  updateDetails();
  return { enabled: true, toggle: () => setOpen(!open) };
}
