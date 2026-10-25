// Pure helpers for batch imports and the token, chat, map pin and sharing targets.

// v13 roll modes and their v14 message mode names
const LEGACY_ROLL_MODES = Object.freeze({
  public: "publicroll",
  gm: "gmroll",
  blind: "blindroll",
  self: "selfroll"
});
const MESSAGE_MODES = Object.freeze(["public", "gm", "blind", "self", "ic"]);
const GENERIC_FILE_NAMES = /^(image|blob|clipboard-image|unknown|untitled)(\s*\(\d+\))?$/i;
// CONST.VIDEO_FILE_EXTENSIONS in v13 and v14
const VIDEO_FILE_EXTENSIONS = Object.freeze(["m4v", "mp4", "ogv", "webm"]);

// Whether a path or URL points to a video, judged by its extension like Foundry does. Query and hash do not count.
function isVideoPath(path) {
  const value = String(path ?? "").split(/[?#]/)[0];
  const extension = /\.([a-z0-9]+)$/i.exec(value)?.[1]?.toLowerCase();
  return Boolean(extension) && VIDEO_FILE_EXTENSIONS.includes(extension);
}

// Keeps a span inside a range. A span longer than the range stays centered on it.
function clampSpan(start, length, rangeStart, rangeLength) {
  if ( length >= rangeLength ) return rangeStart + ((rangeLength - length) / 2);
  return Math.min(Math.max(start, rangeStart), rangeStart + rangeLength - length);
}

// Lays out tiles in a grid of equal cells, centered on a point (or the rect) and kept inside the rect.
// Images keep their size unless the grid would not fit, then every cell shrinks the same way.
// With anchor set, x/y is the tile center (v14), otherwise the top-left corner (v13).
function layoutTileGrid(sizes, rect, {gap=0, center=null, anchor=false}={}) {
  const count = sizes?.length ?? 0;
  if ( !count ) return [];

  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const spacing = Math.max(0, Math.min(Number(gap) || 0, rect.width / (columns * 4), rect.height / (rows * 4)));
  const maxWidth = Math.max(...sizes.map(size => size.width));
  const maxHeight = Math.max(...sizes.map(size => size.height));
  const cellWidth = Math.max(1, Math.min(maxWidth, (rect.width - (spacing * (columns - 1))) / columns));
  const cellHeight = Math.max(1, Math.min(maxHeight, (rect.height - (spacing * (rows - 1))) / rows));
  const gridWidth = (columns * cellWidth) + (spacing * (columns - 1));
  const gridHeight = (rows * cellHeight) + (spacing * (rows - 1));

  const origin = center ?? {x: rect.x + (rect.width / 2), y: rect.y + (rect.height / 2)};
  const left = clampSpan(origin.x - (gridWidth / 2), gridWidth, rect.x, rect.width);
  const top = clampSpan(origin.y - (gridHeight / 2), gridHeight, rect.y, rect.height);

  return sizes.map((size, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const scale = Math.min(cellWidth / size.width, cellHeight / size.height, 1);
    const width = Math.max(1, Math.round(size.width * scale));
    const height = Math.max(1, Math.round(size.height * scale));
    const cornerX = left + (column * (cellWidth + spacing)) + ((cellWidth - width) / 2);
    const cornerY = top + (row * (cellHeight + spacing)) + ((cellHeight - height) / 2);
    return {
      x: Math.round(cornerX + (anchor ? width / 2 : 0)),
      y: Math.round(cornerY + (anchor ? height / 2 : 0)),
      width,
      height
    };
  });
}

// A point inside the rect, or the rect center without a point.
function clampPointToRect(point, rect) {
  if ( !point ) return {x: Math.round(rect.x + (rect.width / 2)), y: Math.round(rect.y + (rect.height / 2))};
  return {
    x: Math.round(Math.min(Math.max(point.x, rect.x), rect.x + rect.width)),
    y: Math.round(Math.min(Math.max(point.y, rect.y), rect.y + rect.height))
  };
}

// Name of one image in a batch: its own file name when it has a real one, else the batch name with a number.
function batchItemName(baseName, fileName, index) {
  const ownName = String(fileName ?? "").replace(/\.[^./]+$/, "").trim();
  if ( ownName && !GENERIC_FILE_NAMES.test(ownName) ) return ownName;
  return `${String(baseName ?? "").trim()} ${index + 1}`.trim();
}

// URLs of a text/uri-list without comments and blank lines.
function parseUriList(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"));
}

// The link a drop carries: the first entry of text/uri-list, else plain text that is a single web or data:image
// address, else the first image of dropped HTML. Dropped text without a link is no image drop.
function pickDroppedUri({uriList="", text="", html=""}={}) {
  const listed = parseUriList(uriList)[0];
  if ( listed ) return listed;
  const lines = parseUriList(text);
  const plain = lines.length === 1 ? lines[0] : "";
  if ( plain && !/\s/.test(plain) && /^(https?:\/\/|data:image\/)/i.test(plain) ) return plain;
  const match = /<img\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1/i.exec(String(html ?? ""));
  const source = match?.[2]?.replace(/&amp;/g, "&").trim();
  return source && /^(https?:\/\/|data:image\/)/i.test(source) ? source : null;
}

// Several pasted image links, one per line. Any other line makes it plain text.
function parseImageUrlList(text, parseImageUrl) {
  const lines = String(text ?? "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if ( lines.length < 2 ) return [];
  const urls = lines.map(line => parseImageUrl(line));
  return urls.every(Boolean) ? Array.from(new Set(urls)) : [];
}

// v14 message mode for a v13 roll mode or a v14 mode, public for anything unknown.
function toMessageMode(value) {
  const mode = String(value ?? "");
  if ( MESSAGE_MODES.includes(mode) ) return mode;
  const legacy = Object.entries(LEGACY_ROLL_MODES).find(([, rollMode]) => rollMode === mode);
  return legacy ? legacy[0] : "public";
}

// Blind posts would hide the image from its own author, so they go to the GM like a private post.
function imagePostMode(mode) {
  const resolved = toMessageMode(mode);
  return resolved === "blind" ? "gm" : resolved;
}

function toLegacyRollMode(mode) {
  return LEGACY_ROLL_MODES[mode] ?? LEGACY_ROLL_MODES.public;
}

// Videos play muted in a loop, like an animated map on the canvas.
function buildChatImageContent(images, escape) {
  const markup = images.map(({path, name}) => isVideoPath(path)
    ? `<video src="${escape(path)}" aria-label="${escape(name)}" autoplay loop muted playsinline></video>`
    : `<img src="${escape(path)}" alt="${escape(name)}">`).join("");
  return `<div class="sipd-chat-images">${markup}</div>`;
}

// A file that is replaced under the same name keeps its URL, so canvas textures and browser caches would keep
// showing the old image. A version query makes every replacement a new URL for the same file.
function withVersionQuery(path, version) {
  const value = String(path ?? "");
  const tag = String(version ?? "").trim();
  if ( !value || !tag ) return value;
  const [base, hash = null] = value.split("#");
  const query = `v=${encodeURIComponent(tag)}`;
  const versioned = /[?&]v=[^&]*/.test(base)
    ? base.replace(/([?&])v=[^&]*/, `$1${query}`)
    : `${base}${base.includes("?") ? "&" : "?"}${query}`;
  return hash === null ? versioned : `${versioned}#${hash}`;
}

// Unique user ids that exist. An empty list means everyone.
function normalizeRecipientIds(ids, validIds) {
  const valid = new Set(validIds ?? []);
  const list = Array.isArray(ids) ? ids : (ids ? [ids] : []);
  return Array.from(new Set(list.map(id => String(id ?? "").trim()).filter(id => valid.has(id))));
}

export {
  LEGACY_ROLL_MODES,
  MESSAGE_MODES,
  VIDEO_FILE_EXTENSIONS,
  isVideoPath,
  clampSpan,
  layoutTileGrid,
  clampPointToRect,
  batchItemName,
  parseUriList,
  pickDroppedUri,
  parseImageUrlList,
  toMessageMode,
  imagePostMode,
  toLegacyRollMode,
  buildChatImageContent,
  normalizeRecipientIds,
  withVersionQuery
};
