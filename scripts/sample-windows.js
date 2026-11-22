// Sample windows (api.samples, contract in samples.mjs): the import dialogs of the module over pictures that are made
// up and held in memory, so translators and testers see every text in its place without pasting anything first.
// Nothing here writes: no upload, no scene, token, tile, item or journal, no setting (the window size is not saved), no
// usage counter. Insert does nothing but say so, the window is not modal.
import { closeSample, markSample, openSampleHtml, sampleBlocked, sampleCast, sampleId, sampleText } from "./samples.mjs";

const MODULE_ID = "sephrals-image-paste-drop";
const ICON_BASE = "icons/environment/people/";
// The look of the hexagons is pointy topped ("rows"), the family Foundry calls hex rows
const SQRT3 = Math.sqrt(3);

/* -------------------------------------------- */
/*  Pure parts (unit tests)                     */
/* -------------------------------------------- */

/** The pictures of the samples: size, background and the picture of Foundry that is drawn on it. */
export function tokenPictureSpec(kind) {
  const cast = new Map(sampleCast().map((member) => [member.id, member]));
  const specs = {
    plain: { width: 560, height: 760, background: "plain", hero: "sela", file: "Sela.png", type: "image/png" },
    transparent: { width: 0, height: 0, background: "transparent", hero: "tovin", file: "Tovin.webp", type: "image/webp" },
    busy: { width: 760, height: 560, background: "busy", hero: "ari", file: "Ari.png", type: "image/png" }
  };
  const spec = specs[kind] ?? specs.plain;
  return { ...spec, img: cast.get(spec.hero).img, name: cast.get(spec.hero).name };
}

/** The maps of the new scene samples. Squares across and down follow from the size of a cell. */
export function scenePictureSpec(kind) {
  const specs = {
    name: { width: 1400, height: 1000, grid: null, file: "Old mill 20x14.jpg" },
    square: { width: 1400, height: 1000, grid: { type: "square", size: 70 }, file: "Old mill.jpg" },
    hex: { width: 1400, height: 1000, grid: { type: "hex", size: 80 }, file: "Marsh.jpg" },
    none: { width: 1400, height: 1000, grid: null, file: "Cave.jpg" }
  };
  const spec = specs[kind] ?? specs.square;
  return { ...spec, kind };
}

/** Centers of the hexagons (pointy top) of a printed hex grid, one cell is `size` pixels across the flat sides. */
export function hexCenters(width, height, size) {
  const radius = size / SQRT3;
  const centers = [];
  for (let row = 0; ((row * 1.5) - 1) * radius < height; row++) {
    for (let column = -1; (column * size) < width + size; column++) {
      centers.push({ x: (column + (row % 2 ? 1 : 0.5)) * size, y: radius + (row * 1.5 * radius) });
    }
  }
  return { radius, centers };
}

/** What a drop onto something hands the dialog: the token, actor, tile, map pin, item or journal entry (never saved). */
export function sampleContext(kind, { actions, kinds }) {
  const hero = sampleCast()[0];
  const actor = { id: "sample-ari", uuid: "Actor.sample-ari", name: hero.name, img: hero.img, isOwner: true, testUserPermission: () => false, prototypeToken: { disposition: 1 } };
  const token = { id: "sample-token", uuid: "Scene.sample.Token.sample-token", name: hero.name, isOwner: true, disposition: 1, actorLink: true, actorId: null, actor };
  const tile = { id: "sample-tile", name: sampleText("place"), isOwner: true };
  const list = {
    token: { kind: kinds.TOKEN, document: token, name: hero.name, actor, action: actions.TOKEN_IMAGE },
    portrait: { kind: kinds.ACTOR, document: actor, name: hero.name, action: actions.ACTOR_PORTRAIT },
    tile: { kind: kinds.TILE, document: tile, name: tile.name, action: actions.TILE_IMAGE },
    note: { kind: kinds.NOTE, document: { id: "sample-note", isOwner: true }, name: sampleText("place"), action: actions.NOTE_IMAGE },
    item: { kind: kinds.ITEM, document: { id: "sample-item", name: sampleText("longsword"), isOwner: true }, name: sampleText("longsword"), action: actions.ITEM_IMAGE },
    journal: { kind: kinds.JOURNAL, document: { id: "sample-journal", name: sampleText("place"), isOwner: true }, name: sampleText("place"), action: actions.JOURNAL_PAGE }
  };
  return list[kind] ?? null;
}

/** The ids of the entries, in the order of the list. */
export const SAMPLE_IDS = Object.freeze([
  "scene-name", "scene-found", "scene-hex", "scene-measure", "scene-video", "linked-ask", "linked-dialog",
  "token-plain", "token-transparent", "token-busy", "portrait", "tile", "note", "item", "journal",
  "batch", "drop-labels", "drop-tip", "undo"
]);

/* -------------------------------------------- */
/*  The dialog                                  */
/* -------------------------------------------- */

// Insert (and Enter in a field) does nothing here and says so, Cancel and the gear work as always.
function blockInsert(dialog) {
  if (dialog._sampleInsertBlocked) return;
  dialog._sampleInsertBlocked = true;
  const element = dialog.element;
  const stop = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    sampleBlocked();
  };
  element.addEventListener("click", (event) => {
    if (event.target.closest?.('button[data-action="confirm"], button[data-action="useUrl"]')) stop(event);
  }, true);
  element.addEventListener("submit", stop, true);
}

/**
 * Opens a dialog of the module (the config its prompt would give DialogV2.wait) as a sample window: with the banner,
 * not modal, Insert blocked. The window size is not saved (the module skips that for samples).
 * @param {object} config
 * @param {{key: string}} sample
 */
export async function openSampleDialog(config, { key, prepare = null }) {
  const { DialogV2 } = foundry.applications.api;
  const id = sampleId(MODULE_ID, key);
  await closeSample(id);
  const { render, rejectClose: _reject, close: _close, renderOptions: _options, modal: _modal, ...rest } = config;
  // The question about a linked picture has no width of its own, a modal one is sized by Foundry
  const dialog = new DialogV2({ ...rest, id, modal: false, position: { width: 560, ...rest.position } });
  markSample(dialog);
  dialog.addEventListener("render", (event) => {
    const first = !dialog._sampleInsertBlocked;
    blockInsert(dialog);
    render?.(event, dialog);
    // Choices a sample starts with (a box ticked, a frame picked), set once like a user would
    if (first) prepare?.(dialog.element.querySelector("form"));
  });
  await dialog.render({ force: true });
  return dialog;
}

/* -------------------------------------------- */
/*  Pictures in memory                          */
/* -------------------------------------------- */

async function loadImage(src) {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

function canvasFile(canvas, name, type = "image/png", quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(new File([blob], name, { type })) : reject(new Error("no picture"))), type, quality);
  });
}

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A picture of a hero of Foundry: plain background, busy background, or the transparent picture as it is. */
async function tokenPicture(kind) {
  const spec = tokenPictureSpec(kind);
  if (spec.background === "transparent") {
    const blob = await (await fetch(spec.img)).blob();
    return new File([blob], spec.file, { type: spec.type });
  }
  const canvas = document.createElement("canvas");
  canvas.width = spec.width;
  canvas.height = spec.height;
  const context = canvas.getContext("2d");
  if (spec.background === "plain") {
    context.fillStyle = "#d9cfae";
    context.fillRect(0, 0, spec.width, spec.height);
  } else {
    const rand = random(7);
    const gradient = context.createLinearGradient(0, 0, spec.width, spec.height);
    gradient.addColorStop(0, "#3f5a3a");
    gradient.addColorStop(1, "#8a6a3d");
    context.fillStyle = gradient;
    context.fillRect(0, 0, spec.width, spec.height);
    for (let i = 0; i < 260; i++) {
      context.fillStyle = `rgba(${Math.floor(rand() * 120)}, ${Math.floor(60 + (rand() * 120))}, ${Math.floor(rand() * 90)}, ${0.15 + (rand() * 0.3)})`;
      context.beginPath();
      context.arc(rand() * spec.width, rand() * spec.height, 6 + (rand() * 40), 0, Math.PI * 2);
      context.fill();
    }
  }
  const hero = await loadImage(spec.img);
  const scale = Math.min((spec.width * 0.86) / hero.naturalWidth, (spec.height * 0.86) / hero.naturalHeight);
  const width = hero.naturalWidth * scale;
  const height = hero.naturalHeight * scale;
  context.drawImage(hero, (spec.width - width) / 2, (spec.height - height) / 2, width, height);
  return canvasFile(canvas, spec.file, spec.type);
}

/** A battle map: earth tones and rounded rooms, with a printed square or hex grid when the spec has one. */
async function scenePicture(kind, { thumbnail = false } = {}) {
  const spec = scenePictureSpec(kind);
  const scale = thumbnail ? 0.4 : 1;
  const width = Math.round(spec.width * scale);
  const height = Math.round(spec.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const rand = random(spec.file.length * 31);
  context.fillStyle = "#6b6652";
  context.fillRect(0, 0, width, height);
  for (let i = 0; i < 900; i++) {
    const tone = Math.floor(70 + (rand() * 90));
    context.fillStyle = `rgba(${tone}, ${Math.floor(tone * 0.92)}, ${Math.floor(tone * 0.7)}, ${0.1 + (rand() * 0.25)})`;
    context.beginPath();
    context.arc(rand() * width, rand() * height, (4 + (rand() * 46)) * scale, 0, Math.PI * 2);
    context.fill();
  }
  for (let i = 0; i < 7; i++) {
    context.fillStyle = `rgba(30, 28, 24, ${0.35 + (rand() * 0.3)})`;
    context.fillRect(rand() * width * 0.7, rand() * height * 0.7, (160 + (rand() * 260)) * scale, (120 + (rand() * 220)) * scale);
  }
  if (spec.grid) {
    const size = spec.grid.size * scale;
    context.strokeStyle = "rgba(255, 255, 255, 0.55)";
    context.lineWidth = Math.max(1, 2 * scale);
    if (spec.grid.type === "square") {
      context.beginPath();
      for (let x = 0; x <= width; x += size) { context.moveTo(x, 0); context.lineTo(x, height); }
      for (let y = 0; y <= height; y += size) { context.moveTo(0, y); context.lineTo(width, y); }
      context.stroke();
    } else {
      const { radius, centers } = hexCenters(width, height, size);
      context.beginPath();
      for (const center of centers) {
        for (let corner = 0; corner < 6; corner++) {
          const angle = (Math.PI / 180) * ((60 * corner) - 30);
          const x = center.x + (radius * Math.cos(angle));
          const y = center.y + (radius * Math.sin(angle));
          if (corner === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.closePath();
      }
      context.stroke();
    }
  }
  return canvasFile(canvas, spec.file, "image/jpeg", 0.9);
}

/** A short video of a moving shape, recorded from a canvas in the browser (nothing is stored). */
async function sampleVideo() {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext("2d");
  if (typeof canvas.captureStream !== "function" || typeof MediaRecorder !== "function") return null;
  const type = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((entry) => MediaRecorder.isTypeSupported(entry));
  if (!type) return null;
  const recorder = new MediaRecorder(canvas.captureStream(15), { mimeType: type });
  const chunks = [];
  recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
  const done = new Promise((resolve) => { recorder.onstop = resolve; });
  recorder.start();
  const started = performance.now();
  await new Promise((resolve) => {
    const frame = () => {
      const time = (performance.now() - started) / 1000;
      context.fillStyle = "#2c3a4a";
      context.fillRect(0, 0, 640, 360);
      context.fillStyle = "#e0b04a";
      context.beginPath();
      context.arc(120 + (time * 220), 180 + (Math.sin(time * 4) * 70), 34, 0, Math.PI * 2);
      context.fill();
      if (time < 0.8) requestAnimationFrame(frame);
      else resolve();
    };
    frame();
  });
  recorder.stop();
  await done;
  return new File([new Blob(chunks, { type: "video/webm" })], "Candle room.webm", { type: "video/webm" });
}

/* -------------------------------------------- */
/*  The entries                                 */
/* -------------------------------------------- */

/**
 * The sample windows of the module (api.samples).
 * @param {object} inner   what the module hands over: the real dialogs and helpers (see sampleInternals in sipd.js)
 * @returns {{id: string, label: string, group: string, open: () => Promise<object>}[]}
 */
export function sampleWindows(inner) {
  const t = (key) => inner.localize(`SIPD.Sample.${key}`);
  const groups = { scene: t("Group.Scene"), target: t("Group.Target"), more: t("Group.More") };
  const entries = [];
  const add = (id, group, label, open) => entries.push({ id, group, label, open });
  const hold = async (app, urls) => {
    app.addEventListener?.("close", () => urls.forEach((url) => URL.revokeObjectURL(url)), { once: true });
    return app;
  };

  const scene = (id, label, kind, options = {}) => add(id, groups.scene, label, async () => {
    const file = await scenePicture(kind);
    const named = inner.detectGridFromFileName(file.name, { width: 1400, height: 1000 });
    // A drop on the empty canvas starts with the new scene target, whatever the user's last choice was
    return inner.openImport(file, { key: id, context: { action: inner.ACTIONS.SCENE_BACKGROUND }, name: file.name.replace(/\.[^.]+$/, ""), grid: named ? { ...named } : null, searchGrid: !named, planSize: { width: 6000, height: 4000 }, ...options });
  });
  // The shrinking and format lines show in the three forms they have: size, size and format, format only
  scene("scene-name", t("SceneName"), "name");
  scene("scene-found", t("SceneFound"), "square", { optimize: { maxSize: 4096, webp: false, quality: 85 } });
  scene("scene-hex", t("SceneHex"), "hex", { optimize: { maxSize: 4096, webp: true, quality: 85 } });
  scene("scene-measure", t("SceneMeasure"), "none");
  add("scene-video", groups.scene, t("SceneVideo"), async () => {
    const file = await sampleVideo();
    if (!file) return inner.openImport(await scenePicture("none"), { key: "scene-video" });
    return inner.openImport(file, { key: "scene-video", video: true, name: "Candle room", context: { action: inner.ACTIONS.SCENE_BACKGROUND } });
  });
  add("linked-ask", groups.scene, t("LinkedAsk"), () => inner.openRemote("https://maps.example.org/battlemaps/old-mill.jpg", "linked-ask"));
  add("linked-dialog", groups.scene, t("LinkedDialog"), () => inner.openImport(new File([], "Old mill.jpg", { type: "image/jpeg" }), {
    key: "linked-dialog", remoteUrl: true, previewUrl: `${ICON_BASE}cavalry.webp`
  }));

  const onto = (id, label, pictureKind, contextKind, options = {}) => add(id, groups.target, label, async () => {
    const file = await tokenPicture(pictureKind);
    const context = sampleContext(contextKind, { actions: inner.ACTIONS, kinds: inner.CONTEXT_KINDS });
    return inner.openImport(file, { key: id, context, name: file.name.replace(/\.[^.]+$/, ""), ...options });
  });
  // The plain picture starts with the cut to a square, the background removed and a frame, so the result shows
  onto("token-plain", t("TokenPlain"), "plain", "token", {
    prepare: (form) => {
      const change = (field) => field?.dispatchEvent(new Event("change", { bubbles: true }));
      for (const name of ["squareCrop", "removeBackground"]) {
        const field = form?.elements?.[name];
        if (field && !field.disabled) { field.checked = true; change(field); }
      }
      form?.querySelectorAll("[data-frame-style]")[3]?.click();
    }
  });
  onto("token-transparent", t("TokenTransparent"), "transparent", "token");
  onto("token-busy", t("TokenBusy"), "busy", "token", { optimize: { maxSize: 0, webp: true, quality: 85 } });
  onto("portrait", t("Portrait"), "plain", "portrait");
  onto("tile", t("Tile"), "busy", "tile");
  onto("note", t("Note"), "plain", "note");
  onto("item", t("Item"), "plain", "item");
  onto("journal", t("Journal"), "busy", "journal");

  add("batch", groups.more, t("Batch"), async () => {
    const optimize = { maxSize: 4096, webp: true, quality: 85 };
    const files = [await scenePicture("square", { thumbnail: true }), await scenePicture("hex", { thumbnail: true }),
      await tokenPicture("plain"), await tokenPicture("busy")];
    const urls = files.map((file) => URL.createObjectURL(file));
    const items = [];
    for (const [index, file] of files.entries()) {
      const dimensions = await inner.readMediaDimensions(urls[index], { video: false });
      const plan = await inner.getImageOptimizationPlan(file, optimize);
      items.push({
        file, objectUrl: urls[index], sourceName: file.name.replace(/\.[^.]+$/, ""), video: false, plan,
        width: plan ? 6000 : dimensions.width, height: plan ? 4000 : dimensions.height,
        grid: index === 0 ? { size: 70 } : null
      });
    }
    // The batch starts with one new scene per image, so the grid notes and the navigation choice show
    const prepare = (form) => {
      const field = form?.elements?.action;
      if (field) { field.value = inner.ACTIONS.SCENE_BACKGROUND; field.dispatchEvent(new Event("change", { bubbles: true })); }
    };
    return hold(await inner.openBatch({ items, defaultName: sampleText("place"), key: "batch", prepare, optimize }), urls);
  });

  add("drop-labels", groups.more, t("DropLabels"), () => openSampleHtml({
    moduleId: MODULE_ID, id: "drop-labels", title: t("DropLabels"), width: 640,
    body: () => {
      const wrap = document.createElement("div");
      wrap.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;padding:6px;";
      for (const label of inner.dropLabels()) {
        const chip = document.createElement("div");
        chip.className = "sipd-drop-label";
        chip.dataset.uiTheme = inner.theme();
        chip.style.cssText = "position:static;transform:none;display:flex;";
        chip.innerHTML = `<i class="sipd-drop-label__icon fa-solid ${inner.escapeHtml(label.icon)}"></i>`
          + `<span class="sipd-drop-label__text"><span class="sipd-drop-label__title">${inner.escapeHtml(label.title)}</span>`
          + `<span class="sipd-drop-label__detail">${inner.escapeHtml(label.detail)}</span></span>`;
        wrap.append(chip);
      }
      return wrap;
    }
  }));

  add("drop-tip", groups.more, t("DropTip"), () => openSampleHtml({
    moduleId: MODULE_ID, id: "drop-tip", title: t("DropTip"), width: 560,
    body: () => {
      const tip = inner.buildDropTip();
      tip.style.cssText = "position:static;transform:none;margin:6px;";
      return tip;
    }
  }));

  add("undo", groups.more, t("Undo"), () => openSampleHtml({
    moduleId: MODULE_ID, id: "undo", title: t("Undo"), width: 520,
    body: () => {
      const e = inner.escapeHtml;
      const box = document.createElement("div");
      box.className = "sipd-app";
      box.style.cssText = "display:flex;flex-direction:column;gap:10px;padding:8px;";
      box.innerHTML = `
        <p>${e(inner.localize("SIPD.Notification.TokenUpdated", { count: 1 }))} <a class="sipd-undo-link" href="#">${e(inner.localize("SIPD.Undo.Link"))}</a></p>
        <p><button type="button" class="control-icon sipd-previous-picture" style="position:static;"><i class="fa-solid fa-rotate-left"></i></button>
          <span>${e(inner.localize("SIPD.Undo.Previous"))}</span></p>
        <p>${e(inner.localize("SIPD.Undo.Restored", { count: 1 }))}</p>
        <p>${e(inner.localize("SIPD.Undo.Failed", { count: 1 }))}</p>
        <p>${e(inner.localize("SIPD.Undo.Nothing"))}</p>`;
      return box;
    }
  }));

  return entries;
}

export const __test__ = { random, hexCenters };
