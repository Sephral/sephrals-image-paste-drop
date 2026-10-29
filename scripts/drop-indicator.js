// The drop indicator: while image files are dragged over Foundry, a glow on the token, tile or sheet a drop would
// change, a marker where it would land on the board, and a label next to the cursor that names the target.
// What to show comes from a describe callback, this file only draws it and cleans up.
import {labelPosition} from "./drop-context.js";

// A dragleave towards nothing hides after this delay unless the next dragover comes first, some browsers report no
// element for a moment when the cursor moves onto the canvas.
const LEAVE_DELAY = 120;
// Browsers repeat dragover while the cursor rests, so a long silence means the drag ended where no event reached us.
const IDLE_TIMEOUT = 1500;
const SHEET_CLASS = "sipd-drop-target";
// The box sits a little outside the token or tile, so the glow does not cover its edge.
const BOX_PADDING = 3;

const nextFrame = callback => (typeof globalThis.requestAnimationFrame === "function")
  ? globalThis.requestAnimationFrame(callback)
  : setTimeout(callback, 16);
const cancelFrame = id => (typeof globalThis.cancelAnimationFrame === "function")
  ? globalThis.cancelAnimationFrame(id)
  : clearTimeout(id);

class DropIndicator {
  #describe;
  #onShow;
  #state = null;
  #frame = null;
  #hideTimer = null;
  #idleTimer = null;
  #elements = null;
  #sheet = null;
  #visible = false;

  /**
   * @param {object} options
   * @param {Function} options.describe   (state) => view or null, see #render
   * @param {Function} [options.onShow]   Called when the indicator appears for a drag
   */
  constructor({describe, onShow=null}={}) {
    this.#describe = describe;
    this.#onShow = onShow;
  }

  get visible() {
    return this.#visible;
  }

  // Takes the data of a dragover now (the event cannot be read later) and draws on the next frame.
  update(state) {
    this.#state = state;
    clearTimeout(this.#hideTimer);
    this.#hideTimer = null;
    clearTimeout(this.#idleTimer);
    this.#idleTimer = setTimeout(() => this.hide(), IDLE_TIMEOUT);
    if ( this.#frame === null ) this.#frame = nextFrame(() => this.#render());
  }

  leave() {
    clearTimeout(this.#hideTimer);
    this.#hideTimer = setTimeout(() => this.hide(), LEAVE_DELAY);
  }

  hide() {
    if ( this.#frame !== null ) cancelFrame(this.#frame);
    this.#frame = null;
    clearTimeout(this.#hideTimer);
    clearTimeout(this.#idleTimer);
    this.#hideTimer = null;
    this.#idleTimer = null;
    this.#state = null;
    this.#setSheet(null);
    if ( this.#elements ) {
      this.#elements.layer.hidden = true;
      this.#elements.label.hidden = true;
    }
    this.#visible = false;
  }

  destroy() {
    this.hide();
    this.#elements?.layer.remove();
    this.#elements?.label.remove();
    this.#elements = null;
  }

  // The view: {label: {icon, title, detail}, theme, box: {left, top, width, height, shape}|null,
  // marker: {x, y, size}|null, sheet: HTMLElement|null}. No view hides the indicator.
  #render() {
    this.#frame = null;
    const state = this.#state;
    if ( !state ) return;
    let view = null;
    try {
      view = this.#describe(state);
    } catch (error) {
      console.warn("sephrals-image-paste-drop | Drop indicator failed", error);
    }
    const elements = view ? this.#ensureElements() : null;
    if ( !elements ) {
      this.hide();
      return;
    }
    const {box, marker, label} = elements;
    elements.layer.hidden = false;

    box.hidden = !view.box;
    if ( view.box ) {
      box.dataset.shape = view.box.shape ?? "token";
      Object.assign(box.style, {
        left: `${Math.round(view.box.left - BOX_PADDING)}px`,
        top: `${Math.round(view.box.top - BOX_PADDING)}px`,
        width: `${Math.round(view.box.width + (BOX_PADDING * 2))}px`,
        height: `${Math.round(view.box.height + (BOX_PADDING * 2))}px`
      });
    }

    marker.hidden = !view.marker;
    if ( view.marker ) {
      marker.style.left = `${Math.round(view.marker.x)}px`;
      marker.style.top = `${Math.round(view.marker.y)}px`;
      marker.style.setProperty("--sipd-marker-size", `${Math.round(view.marker.size ?? 48)}px`);
    }

    this.#setSheet(view.sheet ?? null);

    label.dataset.uiTheme = view.theme ?? "signature";
    elements.labelIcon.className = `sipd-drop-label__icon fa-solid ${view.label?.icon ?? "fa-image"}`;
    elements.labelTitle.textContent = view.label?.title ?? "";
    elements.labelDetail.textContent = view.label?.detail ?? "";
    elements.labelDetail.hidden = !view.label?.detail;
    label.hidden = false;
    const viewport = {width: globalThis.innerWidth ?? 0, height: globalThis.innerHeight ?? 0};
    const size = {width: label.offsetWidth ?? 0, height: label.offsetHeight ?? 0};
    const {left, top} = labelPosition({x: state.x, y: state.y}, size, viewport);
    label.style.transform = `translate(${left}px, ${top}px)`;

    if ( !this.#visible ) {
      this.#visible = true;
      this.#onShow?.();
    }
  }

  #setSheet(element) {
    if ( this.#sheet === element ) return;
    this.#sheet?.classList?.remove(SHEET_CLASS);
    this.#sheet = element;
    element?.classList?.add(SHEET_CLASS);
  }

  #ensureElements() {
    if ( this.#elements ) return this.#elements;
    if ( typeof globalThis.document?.createElement !== "function" || !document.body ) return null;
    const layer = document.createElement("div");
    layer.className = "sipd-drop-layer";
    layer.setAttribute("aria-hidden", "true");
    const box = document.createElement("div");
    box.className = "sipd-drop-box";
    const marker = document.createElement("div");
    marker.className = "sipd-drop-marker";
    layer.append(box, marker);

    const label = document.createElement("div");
    label.className = "sipd-drop-label";
    label.setAttribute("aria-hidden", "true");
    const labelIcon = document.createElement("i");
    const text = document.createElement("span");
    text.className = "sipd-drop-label__text";
    const labelTitle = document.createElement("span");
    labelTitle.className = "sipd-drop-label__title";
    const labelDetail = document.createElement("span");
    labelDetail.className = "sipd-drop-label__detail";
    text.append(labelTitle, labelDetail);
    label.append(labelIcon, text);

    document.body.append(layer, label);
    this.#elements = {layer, box, marker, label, labelIcon, labelTitle, labelDetail};
    return this.#elements;
  }
}

export {DropIndicator, LEAVE_DELAY, IDLE_TIMEOUT, SHEET_CLASS};
