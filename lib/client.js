// dsh-opencode-go-usage — browser half.
//
// Hand-authored client bundle in the DSH module-loader factory format:
// `window.__ModuleLoader__.load({ id, factory })`. The factory receives the
// module-table `require`, so only shell-externalized modules may be imported
// (react / react/jsx-runtime are in the static table).
//
// The browser half contributes ONE compact entry to the composer dock
// (`conversation.composer.dock`): a "GO" button sitting on the session
// statistics strip, left of the balance pill. The full quota card is no longer
// a permanent sidebar block — it lives in a floating popover that opens on
// hover and stays pinned on click. The quota is read once at startup (so the
// button tooltip is useful), refreshed immediately when the card opens on
// stale data, and re-polled every 5 minutes while the card is open; there is no
// manual Refresh button. The GO API key never enters the browser;
// `/opencode-go/usage` is the same-origin proxy owned by the host half.
//
// UI strings are bilingual via the DSH locale service (dictionaries registered
// under the `dsh-opencode-go-usage` namespace).
window.__ModuleLoader__.load({
	id: "@galancev/dsh-opencode-go-usage",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");

		// The shell module table exposes react-dom, and the whole card is mounted
		// through a portal so it is not trapped by its layout ancestors. DSH 0.2.2
		// gave the composer seat `will-change: transform` (which makes it the
		// containing block for `position: fixed`) and the conversation root
		// `overflow: hidden` (which clips absolutely positioned popovers), so an
		// in-tree popover landed far below the viewport. Guarded so an older shell
		// without react-dom still renders the card inline (fixed works there).
		let createPortal = null;
		try {
			const reactDom = require("react-dom");
			createPortal = typeof reactDom.createPortal === "function" ? reactDom.createPortal : null;
		} catch {
			createPortal = null;
		}

		// ── styles (injected once, same pattern as built-in client plugins) ──
		const CSS_ID = "dsh-opencode-go-usage/dock.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=\"" + CSS_ID + "\"]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-opencode-go-usage";
			tag.dataset.pluginCss = CSS_ID;
			tag.textContent = [
				// Dock button: same type scale and hover token as the neighbouring
				// statistics/balance pills, so the strip reads as one row.
				".ocg-dock{display:inline-flex;align-items:center;min-width:0}",
				".ocg-dock-btn{box-sizing:border-box;display:inline-flex;align-items:center;gap:5px;padding:1px 8px;border:none;border-radius:24px;background:0 0;color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xs-13,inherit);font-size:var(--dsh-content-font-size-secondary,13px);font-variant-numeric:tabular-nums;line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));white-space:nowrap;cursor:pointer}",
				".ocg-dock-btn svg{flex:none;width:14px;height:14px}",
				".ocg-dock-btn:hover,.ocg-dock-btn[data-active=\"true\"]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}",
				".ocg-dock-btn:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}",
				// Floating card. `position:fixed` escapes the dock's flex box and any
				// ancestor clipping; the 8 px transparent padding doubles as the
				// hover bridge between the button and the card, so crossing the gap
				// never closes the popover. The arrow is a pseudo-element so it adds
				// no DOM and no second hit target.
				".ocg-pop{position:fixed;z-index:1000;margin:0}",
				".ocg-pop[data-placement=\"up\"]{padding-bottom:8px}",
				".ocg-pop[data-placement=\"down\"]{padding-top:8px}",
				".ocg-pop[data-placement=\"up\"]::after{content:\"\";position:absolute;bottom:2px;left:calc(var(--ocg-arrow-x,50%) - 6px);border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid var(--dsw-specific-menu);pointer-events:none}",
				".ocg-pop[data-placement=\"down\"]::after{content:\"\";position:absolute;top:2px;left:calc(var(--ocg-arrow-x,50%) - 6px);border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:7px solid var(--dsw-specific-menu);pointer-events:none}",
				".ocg-card{box-sizing:border-box;width:320px;max-width:calc(100vw - 16px);display:flex;flex-direction:column;gap:7px;padding:8px 10px 10px;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);box-shadow:var(--dsw-elevation-panel);color:var(--dsw-alias-label-primary)}",
				".ocg-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;font-weight:600;line-height:18px}",
				".ocg-row{display:flex;flex-direction:column;gap:3px;min-width:0}",
				".ocg-row-label{display:flex;justify-content:space-between;gap:8px;font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary)}",
				".ocg-row-label b{font-weight:500;color:var(--dsw-alias-label-primary)}",
				".ocg-meta{display:flex;align-items:center;gap:6px;min-width:0}",
				// The two stacked bars share one flex column. `min-width:0` + `flex:1`
				// belongs on the COLUMN (it is the flex item of .ocg-meta); the bars
				// inside it must keep their own fixed heights, hence flex:none — with
				// `flex:1` on a column axis they would flex to zero height.
				".ocg-meta .ocg-bars{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}",
				".ocg-meta>span{font-size:10px;line-height:14px;color:var(--dsw-alias-label-secondary);white-space:nowrap;flex:none}",
				".ocg-track{box-sizing:border-box;flex:none;height:5px;border-radius:3px;background:var(--dsw-alias-border-l2);overflow:hidden}",
				".ocg-fill{height:100%;border-radius:3px;transition:width .4s ease}",
				// Time bar: two SIDE-BY-SIDE segments, never overlapping. The gray
				// segment on the left is the time already elapsed (it grows
				// rightward) and the blue segment on the right is the time left
				// (it shrinks leftward). Sizing both halves keeps the split exactly
				// at the elapsed fraction.
				//
				// Geometry is deliberately IDENTICAL to the quota bar above
				// (.ocg-track / .ocg-fill: height 5px, radius 3px) so the two
				// stacked bars match in shape and differ only in color and
				// direction. Both segments round ALL four corners — their own
				// outer end AND the junction where they meet — mirroring the
				// reference fill, whose rounded caps stay visible on both ends.
				// The gray also reuses the quota bar's track token, so both
				// grays read as one shade.
				".ocg-timetrack{box-sizing:border-box;flex:none;display:flex;width:100%;height:5px;border-radius:3px;overflow:hidden;background:var(--dsw-alias-border-l2)}",
				".ocg-timeelapsed{height:100%;flex:none;background:var(--dsw-alias-border-l2);border-radius:3px;transition:width .4s ease}",
				".ocg-timeremain{height:100%;flex:1 1 auto;min-width:0;background:var(--dsw-static-deepseek-450, #5686fe);border-radius:3px;transition:width .4s ease}",
				".ocg-err{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}",
				".ocg-update{display:inline-block;padding:1px 6px;border-radius:8px;font-size:10px;line-height:16px;font-weight:600;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);text-decoration:none;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px}"
			].join("");
			document.head.appendChild(tag);
		}

		// ── locale dictionaries ──
		const NS = "dsh-opencode-go-usage";
		const zh = {
			"window.rolling": "滚动窗口 (5h)",
			"window.weekly": "周窗口",
			"window.monthly": "月窗口",
			"window.rolling.hint": "5h",
			"time.soon": "即将重置",
			"time.minutes": "{n}分",
			"time.hours": "{n}小时{m}分",
			"time.days": "{n}天{m}小时",
			"time.elapsed.title": "本窗口时间进度:已流逝 {pct}%,剩余 {rest}%",
			"loading": "加载中…",
			"button.title": "OpenCode GO 月用量 {pct}%",
			"button.title.plain": "OpenCode GO",
			"button.aria": "OpenCode GO 套餐用量:月窗口 {pct}%。按此打开详情。",
			"button.aria.error": "OpenCode GO 数据不可用:{error}。按此打开详情。",
			"dialog.label": "OpenCode GO 套餐用量",
			"update.available": "新版本 v{v}",
			"update.title": "点击查看升级说明"
		};
		const en = {
			"window.rolling": "Rolling (5h)",
			"window.weekly": "Weekly",
			"window.monthly": "Monthly",
			"window.rolling.hint": "5h",
			"time.soon": "resets soon",
			"time.minutes": "{n}m",
			"time.hours": "{n}h{m}m",
			"time.days": "{n}d{m}h",
			"time.elapsed.title": "Window time: {pct}% elapsed, {rest}% left",
			"loading": "Loading…",
			"button.title": "OpenCode GO monthly usage {pct}%",
			"button.title.plain": "OpenCode GO",
			"button.aria": "OpenCode GO plan usage: monthly window {pct}%. Press to open details.",
			"button.aria.error": "OpenCode GO data unavailable: {error}. Press to open details.",
			"dialog.label": "OpenCode GO plan usage",
			"update.available": "v{v} available",
			"update.title": "Click for upgrade instructions"
		};

		// ── data helpers ──
		/** Same-origin quota proxy registered by the host half (lib/index.js). */
		const ROUTE = "/opencode-go/usage";
		/** Quota refresh period: immediately at startup / on open, then every 5 min. */
		const REFRESH_MS = 300_000;
		/** Re-render period for the clock-derived time bars. */
		const TICK_MS = 30_000;
		/** Grace period for moving the pointer from the button into the card. */
		const HOVER_CLOSE_MS = 160;
		/** Visual gap between the button and the card (also the hover bridge). */
		const POPOVER_GAP = 8;
		/** Minimum distance from the card to the viewport edge. */
		const VIEWPORT_MARGIN = 8;

		/**
		 * The three plan windows. `windowMs` is the window LENGTH and is what the
		 * time-remaining bar is computed from; every entry must have one.
		 *
		 * - rolling: the 5 h window documented by the GO plan (matches the
		 *   `window.rolling.hint` label and observed `resetsAt` spacing).
		 * - weekly: anchored to Monday 00:00 UTC — observed `resetsAt` values are
		 *   exactly 7 d apart (e.g. 2026-09-21T00:00:00Z).
		 * - monthly: ~30 d. The monthly window is anchored to the subscription
		 *   day-of-month, so its real length alternates 30/31 d (or 28/29 d in
		 *   February). 30 d is therefore an approximation: the derived fraction is
		 *   clamped to [0,1], so the bar stays correct at the window boundaries and
		 *   is at most ~3 % off mid-window.
		 */
		const WINDOW_MS = { rolling: 5 * 3600e3, weekly: 7 * 86400e3, monthly: 30 * 86400e3 };
		const WINDOWS = [
			{ key: "rolling", labelKey: "window.rolling", hintKey: "window.rolling.hint", windowMs: WINDOW_MS.rolling },
			{ key: "weekly", labelKey: "window.weekly", hintKey: null, windowMs: WINDOW_MS.weekly },
			{ key: "monthly", labelKey: "window.monthly", hintKey: null, windowMs: WINDOW_MS.monthly }
		];

		/**
		 * Fraction of the window ALREADY elapsed, derived from its reset time:
		 * window start = resetsAt - windowMs. 0 = window just opened (empty bar),
		 * 1 = about to reset (full bar), so the bar grows left-to-right as the
		 * window is consumed. Correlate against the quota bar above it to see
		 * whether quota is burning faster or slower than the clock.
		 * @returns {number|null} null when the window length or reset time is unknown.
		 */
		function timeElapsedFraction(resetsAt, windowMs) {
			if (!resetsAt || !windowMs) return null;
			const reset = new Date(resetsAt).getTime();
			if (!Number.isFinite(reset)) return null;
			const elapsed = (windowMs - (reset - Date.now())) / windowMs;
			return Math.max(0, Math.min(1, elapsed));
		}

		/** Short human relative time until `iso`, localized. */
		function timeUntil(iso, t) {
			const target = new Date(iso).getTime();
			if (!Number.isFinite(target)) return "";
			const diff = target - Date.now();
			if (diff <= 0) return t("time.soon");
			const mins = Math.floor(diff / 60000);
			if (mins < 60) return t("time.minutes", { n: mins });
			const hours = Math.floor(mins / 60);
			if (hours < 24) return t("time.hours", { n: hours, m: mins % 60 });
			return t("time.days", { n: Math.floor(hours / 24), m: hours % 24 });
		}

		/** Fill color by usage percent — themed alias tokens (light/dark safe). */
		function fillColor(percent) {
			if (percent >= 90) return "var(--dsw-alias-state-error-primary)";
			if (percent >= 70) return "var(--dsw-alias-state-warn-primary)";
			return "var(--dsw-alias-state-success-primary)";
		}

		/** Compact gauge glyph for the dock button (14 px, currentColor). */
		function GaugeIcon() {
			return react_jsx_runtime.jsx("svg", {
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.3,
				strokeLinecap: "round",
				"aria-hidden": true,
				children: [
					react_jsx_runtime.jsx("path", { d: "M2.4 11.6a6.4 6.4 0 1 1 11.2 0" }, "arc"),
					react_jsx_runtime.jsx("path", { d: "M8 8.4 10.6 5.9" }, "needle")
				]
			});
		}

		/**
		 * One plan-window row: label + percentage, the quota bar, the window
		 * clock bar (gray elapsed / blue remaining) and the countdown.
		 * @param {{ win: Record<string, unknown>, label: string, hint: string|null, t: Function }} props
		 */
		function WindowRow(props) {
			const { win, label, hint, t } = props;
			const elapsed = timeElapsedFraction(win.resetsAt, props.windowMs);
			const countdown = win.status === "ok"
				? (win.resetsAt ? timeUntil(win.resetsAt, t) : (hint ? hint : ""))
				: win.status;
			return react_jsx_runtime.jsx("div", {
				className: "ocg-row",
				children: [
					react_jsx_runtime.jsx("div", {
						className: "ocg-row-label",
						children: [
							react_jsx_runtime.jsx("b", { children: label }, "label"),
							react_jsx_runtime.jsx("b", { children: win.percent + "%" }, "percent")
						]
					}, "labels"),
					react_jsx_runtime.jsx("div", {
						className: "ocg-meta",
						children: [
							react_jsx_runtime.jsx("div", {
								className: "ocg-bars",
								children: [
									react_jsx_runtime.jsx("div", {
										className: "ocg-track",
										children: react_jsx_runtime.jsx("div", {
											className: "ocg-fill",
											style: {
												width: Math.max(0, Math.min(100, win.percent)) + "%",
												background: fillColor(win.percent)
											}
										})
									}, "quota"),
									elapsed === null ? null : react_jsx_runtime.jsx("div", {
										className: "ocg-timetrack",
										title: t("time.elapsed.title", { pct: Math.round(elapsed * 100), rest: Math.round((1 - elapsed) * 100) }),
										children: [
											// Left: elapsed (gray, grows rightward).
											react_jsx_runtime.jsx("div", {
												className: "ocg-timeelapsed",
												style: { width: (elapsed * 100) + "%" }
											}, "elapsed"),
											// Right: remaining (blue, shrinks leftward). Both
											// segments are flex siblings, so they sit next to
											// each other instead of overlapping.
											react_jsx_runtime.jsx("div", {
												className: "ocg-timeremain",
												style: { width: ((1 - elapsed) * 100) + "%" }
											}, "remaining")
										]
									}, "time")
								]
							}, "bars"),
							react_jsx_runtime.jsx("span", { children: countdown }, "countdown")
						]
					}, "meta")
				]
			});
		}

		/**
		 * Composer-dock entry: a compact GO button plus its floating quota card.
		 *
		 * Visibility is `hovered || pinned`:
		 * - hovering the button (or the card) opens it; leaving both schedules a
		 *   short close so crossing the gap does not flicker;
		 * - clicking pins it, so it survives pointer movement; a second click, a
		 *   click outside, or Escape closes it.
		 *
		 * The quota is read once at startup, refreshed immediately when the card
		 * opens on data older than 5 minutes, and re-polled every 5 minutes while
		 * the card stays open — a closed card costs the gateway nothing.
		 *
		 * @param {{ t?: Function }} props - owner props plus the locale translate
		 *   seat declared by this registration.
		 */
		function DockEntry(props) {
			const t = props.t || ((key) => key);
			const [data, setData] = react.useState(null);
			const [error, setError] = react.useState(null);
			const [hovered, setHovered] = react.useState(false);
			const [pinned, setPinned] = react.useState(false);
			const [placement, setPlacement] = react.useState(null);
			const [, setTick] = react.useState(0);

			const rootRef = react.useRef(null);
			const buttonRef = react.useRef(null);
			const popRef = react.useRef(null);
			const closeTimerRef = react.useRef(null);
			/** When the last successful/failed quota read finished (0 = never). */
			const fetchedAtRef = react.useRef(0);
			/** False after unmount, so a late response never touches state. */
			const mountedRef = react.useRef(true);

			const visible = hovered || pinned;

			const clearCloseTimer = () => {
				if (closeTimerRef.current !== null) {
					window.clearTimeout(closeTimerRef.current);
					closeTimerRef.current = null;
				}
			};
			const openFromPointer = () => {
				clearCloseTimer();
				setHovered(true);
			};
			const scheduleClose = () => {
				clearCloseTimer();
				closeTimerRef.current = window.setTimeout(() => {
					closeTimerRef.current = null;
					setHovered(false);
				}, HOVER_CLOSE_MS);
			};
			const close = () => {
				clearCloseTimer();
				setHovered(false);
				setPinned(false);
			};

			// Track liveness before the read effects, so a StrictMode remount resets
			// the flag before the first read of the second pass starts.
			react.useEffect(() => {
				mountedRef.current = true;
				return () => { mountedRef.current = false; };
			}, []);

			// Read the quota proxy. Failures keep the previous card content only
			// until the next read; `fetchedAtRef` is stamped either way, so a broken
			// route is retried on the normal cadence instead of hammering the gateway.
			const fetchQuota = react.useCallback(async () => {
				try {
					const res = await fetch(ROUTE, { cache: "no-store" });
					const json = await res.json().catch(() => null);
					if (!mountedRef.current) return;
					if (!res.ok || json === null || json.error) {
						setError(String((json && json.error) || "HTTP " + res.status));
						setData(null);
					} else {
						setData(json);
						setError(null);
					}
				} catch (e) {
					if (!mountedRef.current) return;
					setError(String((e && e.message) || e));
					setData(null);
				} finally {
					fetchedAtRef.current = Date.now();
				}
			}, []);

			// Automatic refresh, no manual button: one read at startup (the button
			// tooltip is useful before the card is ever opened), an immediate read
			// when the card opens on stale data, and a 5-minute poll while open.
			// A closed card keeps the last snapshot without touching the network.
			react.useEffect(() => {
				if (Date.now() - fetchedAtRef.current >= REFRESH_MS) void fetchQuota();
				if (!visible) return undefined;
				const poll = window.setInterval(() => { void fetchQuota(); }, REFRESH_MS);
				// Clock-derived time bars need a re-render even when the numbers
				// do not move; 30 s keeps them progressing without busy work.
				const tick = window.setInterval(() => setTick((n) => n + 1), TICK_MS);
				return () => {
					window.clearInterval(poll);
					window.clearInterval(tick);
				};
			}, [visible, fetchQuota]);

			// Re-anchor the fixed card to the button on every open, data change
			// (height change), resize and scroll. Measured in a layout effect so the
			// first painted frame is already positioned; the first render stays
			// invisible until `placement` exists.
			react.useLayoutEffect(() => {
				if (!visible) return undefined;
				const place = () => {
					const button = buttonRef.current;
					const pop = popRef.current;
					if (button === null || pop === null) return;
					const rect = button.getBoundingClientRect();
					const card = pop.firstElementChild;
					const width = card === null ? pop.offsetWidth : card.offsetWidth;
					const height = card === null ? pop.offsetHeight : card.offsetHeight;
					let side = "up";
					let top = rect.top - POPOVER_GAP - height;
					if (top < VIEWPORT_MARGIN) {
						// Not enough room above the composer: drop below the button.
						side = "down";
						top = rect.bottom;
					}
					let left = rect.left + rect.width / 2 - width / 2;
					const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
					left = Math.min(Math.max(VIEWPORT_MARGIN, left), maxLeft);
					const arrowX = Math.min(Math.max(rect.left + rect.width / 2 - left, 14), Math.max(14, width - 14));
					setPlacement((prev) => (
						prev !== null && prev.top === top && prev.left === left && prev.side === side && prev.arrowX === arrowX
							? prev
							: { top, left, side, arrowX }
					));
				};
				place();
				window.addEventListener("resize", place);
				window.addEventListener("scroll", place, true);
				return () => {
					window.removeEventListener("resize", place);
					window.removeEventListener("scroll", place, true);
				};
			}, [visible, data, error]);

			// Dismiss on outside click and on Escape, but only while open. The card
			// may live in a portal outside the root span, so both trees are checked.
			react.useEffect(() => {
				if (!visible) return undefined;
				const onPointerDown = (event) => {
					const root = rootRef.current;
					const pop = popRef.current;
					if (event.target instanceof Node) {
						if (root !== null && root.contains(event.target)) return;
						if (pop !== null && pop.contains(event.target)) return;
					}
					close();
				};
				const onKeyDown = (event) => {
					if (event.key === "Escape") close();
				};
				document.addEventListener("mousedown", onPointerDown, true);
				document.addEventListener("keydown", onKeyDown, true);
				return () => {
					document.removeEventListener("mousedown", onPointerDown, true);
					document.removeEventListener("keydown", onKeyDown, true);
				};
			}, [visible]);

			// Hover/focus continuity across the portal boundary. The portal is not a
			// DOM descendant of the dock entry, so React's enter/leave delegation does
			// not connect the two; native listeners on the card keep it open while the
			// pointer crosses the 8 px bridge and close it when it leaves.
			react.useEffect(() => {
				const pop = popRef.current;
				if (pop === null) return undefined;
				const onFocusOut = (event) => {
					if (event.relatedTarget !== null && pop.contains(event.relatedTarget)) return;
					scheduleClose();
				};
				pop.addEventListener("mouseenter", openFromPointer);
				pop.addEventListener("mouseleave", scheduleClose);
				pop.addEventListener("focusin", openFromPointer);
				pop.addEventListener("focusout", onFocusOut);
				return () => {
					pop.removeEventListener("mouseenter", openFromPointer);
					pop.removeEventListener("mouseleave", scheduleClose);
					pop.removeEventListener("focusin", openFromPointer);
					pop.removeEventListener("focusout", onFocusOut);
				};
			}, [visible]);

			// Never leave a pending close timer behind on unmount.
			react.useEffect(() => () => clearCloseTimer(), []);

			const onButtonClick = () => {
				clearCloseTimer();
				if (pinned) {
					setPinned(false);
					setHovered(false);
				} else {
					setPinned(true);
					setHovered(true);
				}
			};
			const onRootBlur = (event) => {
				const root = rootRef.current;
				if (root !== null && event.relatedTarget !== null && root.contains(event.relatedTarget)) return;
				scheduleClose();
			};

			const monthly = data && data.usage ? data.usage.monthly : null;
			const pct = monthly && typeof monthly.percent === "number" ? monthly.percent : null;
			const title = error !== null
				? "OpenCode GO: " + error
				: (pct === null ? t("button.title.plain") : t("button.title", { pct: pct }));
			const ariaLabel = error !== null
				? t("button.aria.error", { error: error })
				: (pct === null ? t("button.title.plain") : t("button.aria", { pct: pct }));

			// Build the three window rows; unknown windows are skipped.
			const rows = [];
			if (data && data.usage) {
				for (const w of WINDOWS) {
					const win = data.usage[w.key];
					if (!win || typeof win.percent !== "number") continue;
					rows.push(react_jsx_runtime.jsx(WindowRow, {
						win: win,
						windowMs: w.windowMs,
						label: t(w.labelKey),
						hint: w.hintKey === null ? null : t(w.hintKey),
						t: t
					}, w.key));
				}
			}

			const button = react_jsx_runtime.jsx("button", {
				type: "button",
				ref: buttonRef,
				className: "ocg-dock-btn",
				"data-ocg-dock": true,
				"data-active": visible ? "true" : "false",
				"aria-haspopup": "dialog",
				"aria-expanded": visible,
				"aria-label": ariaLabel,
				title: title,
				onClick: onButtonClick,
				children: [
					react_jsx_runtime.jsx(GaugeIcon, {}, "icon"),
					react_jsx_runtime.jsx("span", { children: "GO" }, "label")
				]
			}, "button");

			const popover = visible ? react_jsx_runtime.jsx("div", {
				ref: popRef,
				className: "ocg-pop",
				"data-ocg-popover": true,
				"data-placement": placement === null ? "up" : placement.side,
				role: "dialog",
				"aria-label": t("dialog.label"),
				style: placement === null
					? { top: "0px", left: "0px", visibility: "hidden" }
					: { top: placement.top + "px", left: placement.left + "px", "--ocg-arrow-x": placement.arrowX + "px" },
				children: react_jsx_runtime.jsx("div", {
					className: "ocg-card",
					children: [
						react_jsx_runtime.jsx("div", {
							className: "ocg-head",
							children: [
								react_jsx_runtime.jsx("span", { children: "OpenCode GO" }, "title"),
								(data && data.update && data.update.available && data.update.latest
									? react_jsx_runtime.jsx("a", {
										className: "ocg-update",
										href: "https://github.com/galancev/dsh-opencode-go-usage/releases",
										target: "_blank",
										rel: "noreferrer",
										title: t("update.title"),
										children: t("update.available", { v: data.update.latest })
									}, "update")
									: null)
							]
						}, "head"),
						error !== null ? react_jsx_runtime.jsx("div", { className: "ocg-err", title: error, children: error }, "error") : null,
						error === null && data === null ? react_jsx_runtime.jsx("div", { className: "ocg-err", children: t("loading") }, "loading") : null,
						rows.length > 0 ? react_jsx_runtime.jsx(react.Fragment, { children: rows }, "rows") : null
					]
				})
			}, "popover") : null;

			// Mount the card in the body when the shell exposes react-dom: this is the
			// only reliable way to escape a `will-change: transform` containing block
			// and an `overflow: hidden` conversation root. Without react-dom (older
			// shells, where fixed positioning is not trapped) it stays inline.
			const popoverNode = popover === null ? null : (createPortal === null ? popover : createPortal(popover, document.body, "popover-portal"));

			return react_jsx_runtime.jsx(react.Fragment, {
				children: [
					react_jsx_runtime.jsx("span", {
						ref: rootRef,
						className: "ocg-dock",
						onMouseEnter: openFromPointer,
						onMouseLeave: scheduleClose,
						onFocus: openFromPointer,
						onBlur: onRootBlur,
						children: createPortal === null ? [button, popover] : [button]
					}, "dock"),
					popoverNode
				]
			});
		}

		// ── cordis plugin entry ──
		const inject = ["slots", "locale"];

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-opencode-go-usage: dictionaries");
			// `conversation.composer.dock` is the ambient strip under the composer
			// card. Order 1.5 puts the GO button between the session statistics
			// (orders 0 and 1) and dsh-plugin-balance's balance pill (order 2); the
			// dock renders the context meter after its slot list, so that stays last.
			const registerDock = () => ctx.slots.register({
				name: "conversation.composer.dock",
				id: "@galancev/dsh-opencode-go-usage",
				order: 1.5,
				label: "OpenCode GO",
				locale: NS
			}, DockEntry);
			ctx.effect(() => ctx.slots.inject("conversation.composer.dock", registerDock), "dsh-opencode-go-usage: dock entry");
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
