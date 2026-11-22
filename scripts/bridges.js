// Pure helpers for the bridges to other Sephral modules: a new outfit for Token Wardrobe, the picture of a map note and
// the rule for pictures that are shown to players. No Foundry globals here, the callers pass everything in.

const WARDROBE_ID = "sephrals-token-wardrobe";
const LENS_ID = "sephrals-handout-lens";

// The name of a new outfit: what the user typed, else "Outfit N" (the default name of an import is a time stamp)
function outfitLabel(name, {defaultName="", fallback="Outfit", existing=[]}={}) {
  const typed = String(name ?? "").trim();
  const isDefault = !typed || (defaultName && typed.startsWith(defaultName));
  if ( !isDefault ) return typed;
  const taken = new Set((existing ?? []).map(outfit => String(outfit?.label ?? "").toLowerCase()));
  let number = (existing?.length ?? 0) + 1;
  while ( taken.has(`${fallback} ${number}`.toLowerCase()) ) number += 1;
  return `${fallback} ${number}`;
}

// The outfit a picture makes: portrait and token image, a video only as token image
function buildOutfitEntry({label, path, video=false}) {
  return {label, portrait: video ? "" : path, token: path};
}

// The wardrobe with the new outfit at the end. The outfits keep what they have, only the id is new.
function appendOutfit(outfits, entry, makeId) {
  const id = makeId();
  return {id, outfits: [...(outfits ?? []), {...entry, id}]};
}

// Whether a module offers what a bridge needs: active, and the functions on its api
function hasApi(module, names) {
  return Boolean(module?.active) && names.every(name => typeof module?.api?.[name] === "function");
}

// The name a map note goes by in the drop label: its own text, else its journal entry or page, else the fallback
function noteName(note, fallback="") {
  const text = String(note?.text ?? "").trim();
  return text || String(note?.entry?.name ?? "").trim() || String(note?.page?.name ?? "").trim() || fallback;
}

// A picture that is shown to players and read in Handout Lens keeps its size: shrinking would blur the small print.
// The WebP choice of the dialog still counts.
function keepsFullSize({lensActive, sharing}) {
  return Boolean(lensActive) && Boolean(sharing);
}

export {
  WARDROBE_ID,
  LENS_ID,
  outfitLabel,
  buildOutfitEntry,
  appendOutfit,
  hasApi,
  noteName,
  keepsFullSize
};
