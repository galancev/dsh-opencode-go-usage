/**
 * Browser-half tests: the GO dock entry and its floating quota card.
 *
 * The bundle is executed inside a jsdom realm exactly like the DSH module
 * loader would execute it (`window.__ModuleLoader__.load`), then its slot
 * component is rendered with React and driven with real DOM events. The
 * point of these tests is the interaction model that replaced the permanent
 * sidebar block:
 *
 *  - registration goes to `conversation.composer.dock` only, ordered between
 *    the session statistics and the balance pill;
 *  - the quota route is fetched lazily, only while the card is open;
 *  - hover opens, hovering out closes after the grace period, click pins,
 *    Escape / outside click / second click dismiss;
 *  - the card is positioned against the button and re-anchors on resize.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const BUNDLE = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
const React = require("react");
const jsxRuntime = require("react/jsx-runtime");

/** Loaded after the jsdom globals exist (react-dom probes `canUseDOM` once). */
let ReactDOMClient;
let act;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** jsdom globals some Node versions expose as read-only, so define, don't assign. */
function setGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

/**
 * Build a browser-like environment and point React's globals at it.
 * @returns {{ dom: JSDOM, window: Window, document: Document }}
 */
function setupDom() {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
    runScripts: "outside-only"
  });
  const { window } = dom;
  // Anchor the dock button near the bottom of a 1024x768 viewport and give the
  // card a real box, so placement assertions do not depend on jsdom's zeroes.
  Object.defineProperty(window.HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() { return this.classList.contains("ocg-card") ? 320 : 0; }
  });
  Object.defineProperty(window.HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() { return this.classList.contains("ocg-card") ? 180 : 0; }
  });
  window.Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    if (this.hasAttribute && this.hasAttribute("data-ocg-dock")) {
      return { top: 500, bottom: 524, left: 300, right: 350, width: 50, height: 24 };
    }
    return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
  };
  setGlobal("window", window);
  setGlobal("document", window.document);
  setGlobal("navigator", window.navigator);
  setGlobal("HTMLElement", window.HTMLElement);
  setGlobal("Element", window.Element);
  setGlobal("Node", window.Node);
  setGlobal("Event", window.Event);
  setGlobal("MouseEvent", window.MouseEvent);
  setGlobal("KeyboardEvent", window.KeyboardEvent);
  setGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  if (ReactDOMClient === undefined) {
    ReactDOMClient = require("react-dom/client");
    act = React.act;
  }
  return { dom, window, document: window.document };
}

/** Execute the shipped bundle and return its module exports. */
function loadBundle(window) {
  let captured = null;
  window.__ModuleLoader__ = { load: (definition) => { captured = definition; } };
  window.eval(BUNDLE);
  assert.ok(captured !== null, "bundle must call __ModuleLoader__.load");
  assert.equal(captured.id, "@astervolans/dsh-opencode-go-usage");
  return captured.factory((id) => {
    if (id === "react") return React;
    if (id === "react/jsx-runtime") return jsxRuntime;
    throw new Error("unexpected require: " + id);
  });
}

/** Minimal cordis context that records what the plugin registers. */
function applyPlugin(exports) {
  const state = { injections: [], registrations: [], dictionaries: [], effects: [] };
  const ctx = {
    effect(fn, label) {
      state.effects.push(label);
      return fn();
    },
    locale: {
      register(ns, dict) {
        state.dictionaries.push({ ns, dict });
        return () => {};
      }
    },
    slots: {
      inject(name, fn) {
        state.injections.push(name);
        return fn();
      },
      register(entry, component) {
        state.registrations.push({ entry, component });
        return () => {};
      }
    }
  };
  exports.apply(ctx);
  return state;
}

/** Translate through a captured dictionary, interpolating `{name}` placeholders. */
function makeT(dict) {
  return (key, vars) => {
    let text = dict[key] ?? key;
    if (vars !== undefined) {
      for (const [name, value] of Object.entries(vars)) text = text.split("{" + name + "}").join(String(value));
    }
    return text;
  };
}

/** A well-formed usage payload for the proxy route. */
function sampleUsage() {
  const now = Date.now();
  const at = (ms) => new Date(now + ms).toISOString();
  return {
    usage: {
      rolling: { percent: 4, status: "ok", resetsAt: at(2 * 3600e3) },
      weekly: { percent: 1, status: "ok", resetsAt: at(3 * 86400e3) },
      monthly: { percent: 0, status: "ok", resetsAt: at(20 * 86400e3) }
    },
    update: { current: "1.6.0", available: false, latest: null }
  };
}

/** fetch stub that records calls; `payload` may be a function for a new body per call. */
function makeFetch(payload = sampleUsage) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const body = typeof payload === "function" ? payload() : payload;
    if (body instanceof Error) throw body;
    return { ok: true, status: 200, json: async () => body };
  };
  impl.calls = calls;
  return impl;
}

/** Render the registered component into a container and return handles. */
async function renderEntry(state, props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = ReactDOMClient.createRoot(container);
  await act(async () => {
    root.render(React.createElement(state.registrations[0].component, props));
  });
  // The entry reads the quota once at startup; flush that microtask chain so
  // callers see the settled snapshot.
  await act(async () => { await sleep(0); });
  return {
    container,
    root,
    button: () => container.querySelector("[data-ocg-dock]"),
    popover: () => container.querySelector("[data-ocg-popover]")
  };
}

/** Dispatch a bubbling mouse event and let React flush the update. */
async function fire(target, type, init = {}) {
  await act(async () => {
    target.dispatchEvent(new (globalThis.MouseEvent)(type, { bubbles: true, cancelable: true, ...init }));
  });
}

/** Dispatch a keyboard event on the document. */
async function pressKey(key) {
  await act(async () => {
    document.dispatchEvent(new (globalThis.KeyboardEvent)("keydown", { key, bubbles: true }));
  });
}

/** Open the card by hovering the button (the pointer path). */
async function hoverOpen(handles) {
  await fire(handles.button(), "mouseover", { relatedTarget: document.body });
  await act(async () => { await sleep(0); });
}

/** Unmount, close the jsdom realm and restore nothing (next setup resets globals). */
async function teardown(handles, dom) {
  if (handles !== undefined) await act(async () => handles.root.unmount());
  dom.window.close();
}

test("registers only the composer-dock entry, between statistics and balance", async () => {
  const { dom, window } = setupDom();
  const exports = loadBundle(window);
  const state = applyPlugin(exports);
  try {
    assert.deepEqual([...exports.inject], ["slots", "locale"]);
    assert.deepEqual(state.injections, ["conversation.composer.dock"]);
    assert.ok(!state.injections.includes("sidebar.footer.action"), "the permanent sidebar widget must be gone");
    assert.equal(state.registrations.length, 1);
    const { entry } = state.registrations[0];
    assert.equal(entry.name, "conversation.composer.dock");
    assert.equal(entry.id, "@astervolans/dsh-opencode-go-usage");
    assert.equal(entry.order, 1.5);
    assert.equal(entry.label, "OpenCode GO");
    assert.equal(entry.locale, "dsh-opencode-go-usage");
  } finally {
    await teardown(undefined, dom);
  }
});

test("registers matching zh/en dictionaries without the old sidebar keys", async () => {
  const { dom, window } = setupDom();
  const exports = loadBundle(window);
  const state = applyPlugin(exports);
  try {
    assert.equal(state.dictionaries.length, 1);
    assert.equal(state.dictionaries[0].ns, "dsh-opencode-go-usage");
    const { zh, en } = state.dictionaries[0].dict;
    assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
    for (const key of ["button.title", "button.aria", "dialog.label", "loading"]) {
      assert.ok(key in en, "missing dictionary key: " + key);
    }
    assert.ok(!("refresh" in en), "the manual Refresh button and its key are removed");
    assert.ok(!("rail.title" in en), "sidebar rail keys should be removed");
    assert.ok(!("rail.plain" in en), "sidebar rail keys should be removed");
  } finally {
    await teardown(undefined, dom);
  }
});

test("renders a compact GO button and reads the quota once at startup", async () => {
  const { dom, window } = setupDom();
  const exports = loadBundle(window);
  const state = applyPlugin(exports);
  const t = makeT(state.dictionaries[0].dict.en);
  const fetchImpl = makeFetch();
  window.fetch = fetchImpl;
  const handles = await renderEntry(state, { t });
  try {
    const button = handles.button();
    assert.ok(button !== null, "dock button must render");
    assert.equal(button.textContent, "GO");
    assert.equal(button.getAttribute("aria-haspopup"), "dialog");
    assert.equal(button.getAttribute("aria-expanded"), "false");
    assert.equal(handles.popover(), null, "card is closed by default");
    // One read at startup keeps the hover tooltip current without opening the card.
    assert.equal(fetchImpl.calls.length, 1, "startup read must happen once");
    assert.equal(fetchImpl.calls[0].url, "/opencode-go/usage");
    assert.match(button.getAttribute("title"), /monthly usage 0%/);
    assert.equal(document.querySelectorAll(".ocg-pop").length, 0);
    // Styles ship with the module, keyed so HMR reloads replace them.
    assert.ok(document.querySelector('style[data-plugin-css="dsh-opencode-go-usage/dock.css"]') !== null);
  } finally {
    await teardown(handles, dom);
  }
});

test("hover opens the floating card and reuses the fresh startup read", async () => {
  const { dom, window } = setupDom();
  const exports = loadBundle(window);
  const state = applyPlugin(exports);
  const t = makeT(state.dictionaries[0].dict.en);
  const fetchImpl = makeFetch();
  window.fetch = fetchImpl;
  const handles = await renderEntry(state, { t });
  try {
    await hoverOpen(handles);
    const popover = handles.popover();
    assert.ok(popover !== null, "card must open on hover");
    assert.equal(popover.getAttribute("role"), "dialog");
    assert.equal(popover.getAttribute("aria-label"), "OpenCode GO plan usage");
    assert.equal(handles.button().getAttribute("aria-expanded"), "true");
    assert.equal(handles.button().getAttribute("data-active"), "true");

    assert.equal(fetchImpl.calls.length, 1, "a fresh open must not refetch");
    assert.equal(fetchImpl.calls[0].url, "/opencode-go/usage");

    const rows = popover.querySelectorAll(".ocg-row");
    assert.equal(rows.length, 3);
    const labels = [...rows].flatMap((row) => [...row.querySelectorAll(".ocg-row-label b")].map((node) => node.textContent));
    assert.deepEqual(labels, ["Rolling (5h)", "4%", "Weekly", "1%", "Monthly", "0%"]);
    // Every row draws the quota bar and the window-clock bar.
    assert.equal(popover.querySelectorAll(".ocg-track").length, 3);
    assert.equal(popover.querySelectorAll(".ocg-timetrack").length, 3);
    assert.equal(popover.querySelectorAll(".ocg-fill").length, 3);
    // The monthly percentage is used for the button's accessible name.
    assert.match(handles.button().getAttribute("aria-label"), /monthly window 0%/);

    // Placement is anchored above the button: 500 - gap(8) - card height(180).
    assert.equal(popover.getAttribute("data-placement"), "up");
    assert.equal(popover.style.top, "312px");
    assert.equal(popover.style.left, "165px");
    assert.equal(popover.style.getPropertyValue("--ocg-arrow-x"), "160px");
  } finally {
    await teardown(handles, dom);
  }
});

test("hovering from the button into the card keeps it open", async () => {
  const { dom, window } = setupDom();
  const exports = loadBundle(window);
  const state = applyPlugin(exports);
  const t = makeT(state.dictionaries[0].dict.en);
  window.fetch = makeFetch();
  const handles = await renderEntry(state, { t });
  try {
    await hoverOpen(handles);
    const popover = handles.popover();
    // Pointer leaves the button towards the card (still inside the root span).
    await fire(handles.button(), "mouseout", { relatedTarget: popover });
    await act(async () => { await sleep(260); });
    assert.ok(handles.popover() !== null, "card must survive crossing the hover bridge");
  } finally {
    await teardown(handles, dom);
  }
});

test("leaving the button closes the card after the grace period", async () => {
  const { dom, window } = setupDom();
  const exports = loadBundle(window);
  const state = applyPlugin(exports);
  const t = makeT(state.dictionaries[0].dict.en);
  window.fetch = makeFetch();
  const handles = await renderEntry(state, { t });
  try {
    await hoverOpen(handles);
    assert.ok(handles.popover() !== null);
    await fire(handles.button(), "mouseout", { relatedTarget: document.body });
    await act(async () => { await sleep(260); });
    assert.equal(handles.popover(), null, "card must close after hover-out");
  } finally {
    await teardown(handles, dom);
  }
});

test("click pins the card so it survives pointer movement; second click closes", async () => {
  const { dom, window } = setupDom();
  const exports = loadBundle(window);
  const state = applyPlugin(exports);
  const t = makeT(state.dictionaries[0].dict.en);
  window.fetch = makeFetch();
  const handles = await renderEntry(state, { t });
  try {
    await fire(handles.button(), "click");
    await act(async () => { await sleep(0); });
    assert.ok(handles.popover() !== null, "click must open the card");
    await fire(handles.button(), "mouseout", { relatedTarget: document.body });
    await act(async () => { await sleep(260); });
    assert.ok(handles.popover() !== null, "pinned card must not close on hover-out");

    await fire(handles.button(), "click");
    assert.equal(handles.popover(), null, "second click must close the pinned card");
  } finally {
    await teardown(handles, dom);
  }
});

test("Escape closes a pinned card", async () => {
  const { dom, window } = setupDom();
  const exports = loadBundle(window);
  const state = applyPlugin(exports);
  const t = makeT(state.dictionaries[0].dict.en);
  window.fetch = makeFetch();
  const handles = await renderEntry(state, { t });
  try {
    await fire(handles.button(), "click");
    await act(async () => { await sleep(0); });
    assert.ok(handles.popover() !== null);
    await pressKey("Escape");
    assert.equal(handles.popover(), null, "Escape must dismiss the card");
  } finally {
    await teardown(handles, dom);
  }
});

test("a mousedown outside the entry closes a pinned card", async () => {
  const { dom, window } = setupDom();
  const exports = loadBundle(window);
  const state = applyPlugin(exports);
  const t = makeT(state.dictionaries[0].dict.en);
  window.fetch = makeFetch();
  const handles = await renderEntry(state, { t });
  try {
    await fire(handles.button(), "click");
    await act(async () => { await sleep(0); });
    assert.ok(handles.popover() !== null);
    await fire(document.body, "mousedown");
    assert.equal(handles.popover(), null, "outside click must dismiss the card");
  } finally {
    await teardown(handles, dom);
  }
});

test("manual Refresh is gone; a 5-minute poll keeps the open card current", async () => {
  const { dom, window } = setupDom();
  const exports = loadBundle(window);
  const state = applyPlugin(exports);
  const t = makeT(state.dictionaries[0].dict.en);
  window.fetch = makeFetch();
  // Record the timers the entry schedules while open.
  const delays = [];
  const realSetInterval = window.setInterval.bind(window);
  window.setInterval = (fn, delay, ...rest) => {
    delays.push(delay);
    return realSetInterval(fn, delay, ...rest);
  };
  const handles = await renderEntry(state, { t });
  try {
    await fire(handles.button(), "click");
    await act(async () => { await sleep(0); });
    assert.equal(handles.popover().querySelector(".ocg-refresh"), null, "Refresh button must be removed");
    assert.ok(delays.includes(300_000), "open card must poll every 5 minutes");
    assert.ok(delays.includes(30_000), "time bars must still tick");
  } finally {
    await teardown(handles, dom);
  }
});

test("opening a card whose snapshot is older than 5 minutes refreshes immediately", async () => {
  const { dom, window } = setupDom();
  const exports = loadBundle(window);
  const state = applyPlugin(exports);
  const t = makeT(state.dictionaries[0].dict.en);
  const fetchImpl = makeFetch();
  window.fetch = fetchImpl;
  const handles = await renderEntry(state, { t });
  const realNow = window.Date.now;
  try {
    assert.equal(fetchImpl.calls.length, 1, "startup read");
    // Pretend the page has been open for 6 minutes. The component reads the
    // clock from its own realm, so moving that realm's Date.now is enough.
    window.Date.now = () => realNow() + 6 * 60_000;
    await hoverOpen(handles);
    assert.equal(fetchImpl.calls.length, 2, "stale open must refresh immediately");
    assert.ok(handles.popover() !== null);
  } finally {
    window.Date.now = realNow;
    await teardown(handles, dom);
  }
});

test("an error from the route is shown in the card and in the button tooltip", async () => {
  const { dom, window } = setupDom();
  const exports = loadBundle(window);
  const state = applyPlugin(exports);
  const t = makeT(state.dictionaries[0].dict.en);
  window.fetch = makeFetch(new Error("no API key"));
  const handles = await renderEntry(state, { t });
  try {
    await fire(handles.button(), "click");
    await act(async () => { await sleep(0); });
    const popover = handles.popover();
    assert.ok(popover !== null);
    const error = popover.querySelector(".ocg-err");
    assert.ok(error !== null);
    assert.match(error.textContent, /no API key/);
    assert.match(handles.button().getAttribute("title"), /no API key/);
  } finally {
    await teardown(handles, dom);
  }
});

test("re-anchors the card when the viewport changes", async () => {
  const { dom, window } = setupDom();
  const exports = loadBundle(window);
  const state = applyPlugin(exports);
  const t = makeT(state.dictionaries[0].dict.en);
  window.fetch = makeFetch();
  const handles = await renderEntry(state, { t });
  try {
    await hoverOpen(handles);
    const popover = handles.popover();
    assert.equal(popover.style.left, "165px");
    // Move the button near the right edge and simulate a resize.
    window.Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this.hasAttribute && this.hasAttribute("data-ocg-dock")) {
        return { top: 500, bottom: 524, left: 960, right: 1010, width: 50, height: 24 };
      }
      return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
    };
    await act(async () => { window.dispatchEvent(new window.Event("resize")); });
    // 1024 - card 320 - margin 8 = 696 is the rightmost allowed left.
    assert.equal(handles.popover().style.left, "696px");
    assert.ok(handles.popover() !== null);
  } finally {
    await teardown(handles, dom);
  }
});
