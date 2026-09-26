// dsh-refresh-button client half.
//
// The DSH desktop shell registers its "reload page" menu role only in
// development builds, so production desktop has neither a refresh button nor
// the F5 / Ctrl+R accelerators. This client injects both into the page:
//   - a small floating ⟳ button (draggable, edge-anchored, position
//     persisted — the button keeps hugging the corner it was dragged to
//     when the window is resized), and
//   - a capture-phase keydown listener for F5 / Ctrl+R → location.reload().
// location.reload() on the web app is exactly the web-side F5: the whole SPA
// re-boots, plugin bundles re-apply. No host services are needed, so
// exports.inject stays empty.
window.__ModuleLoader__.load({
	id: "dsh-refresh-button",
	factory: () => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const ROOT_ID = "dsh-refresh-button-root";
		const POS_KEY = "dsh-refresh-button.pos";
		const DRAG_THRESHOLD = 4;
		const SIZE = 30;

		// Position model: offsets from the two NEAREST viewport edges
		// ({ax, ay, ox, oy}), so a window resize keeps the button pinned to
		// the corner it was left in instead of stranding it mid-screen.
		function loadPos() {
			try {
				const p = JSON.parse(localStorage.getItem(POS_KEY));
				if (!p || typeof p !== "object") return null;
				if ((p.ax === "left" || p.ax === "right") && (p.ay === "top" || p.ay === "bottom") && typeof p.ox === "number" && typeof p.oy === "number") return p;
				// Legacy {left, top} entries convert to left/top anchoring.
				if (typeof p.left === "number" && typeof p.top === "number") return { ax: "left", ay: "top", ox: p.left, oy: p.top };
			} catch {}
			return null;
		}

		function savePos(btn) {
			try {
				const rect = btn.getBoundingClientRect();
				const ax = rect.left + rect.width / 2 <= window.innerWidth / 2 ? "left" : "right";
				const ay = rect.top + rect.height / 2 <= window.innerHeight / 2 ? "top" : "bottom";
				const pos = {
					ax, ay,
					ox: Math.round(ax === "left" ? rect.left : window.innerWidth - rect.right),
					oy: Math.round(ay === "top" ? rect.top : window.innerHeight - rect.bottom),
				};
				localStorage.setItem(POS_KEY, JSON.stringify(pos));
			} catch {}
		}

		// Clamp a viewport point so the button never leaves the visible area.
		function clamp(left, top, w, h) {
			const margin = 8;
			return {
				left: Math.min(Math.max(margin, left), window.innerWidth - w - margin),
				top: Math.min(Math.max(margin, top), window.innerHeight - h - margin),
			};
		}

		// Place the button per its stored anchors (or the default bottom-right
		// pinning when never dragged), re-clamped against the current viewport.
		function place(btn) {
			const pos = loadPos();
			if (!pos) {
				btn.style.left = "auto";
				btn.style.top = "auto";
				btn.style.right = "18px";
				btn.style.bottom = "18px";
				return;
			}
			const c = clamp(
				pos.ax === "left" ? pos.ox : window.innerWidth - SIZE - pos.ox,
				pos.ay === "top" ? pos.oy : window.innerHeight - SIZE - pos.oy,
				SIZE, SIZE,
			);
			btn.style.left = c.left + "px";
			btn.style.top = c.top + "px";
			btn.style.right = "auto";
			btn.style.bottom = "auto";
		}

		function apply() {
			if (document.getElementById(ROOT_ID)) return;
			// The ModuleLoader may apply client bundles before <body> exists
			// (early boot) — defer DOM work until the document is interactive.
			if (!document.body || document.readyState === "loading") {
				document.addEventListener("DOMContentLoaded", apply, { once: true });
				return;
			}
			startButton();
			startKeys();
		}

		function startButton() {
			const btn = document.createElement("button");
			btn.id = ROOT_ID;
			btn.type = "button";
			btn.title = "刷新页面（F5 / Ctrl+R，可拖动）";
			btn.textContent = "⟳";
			Object.assign(btn.style, {
				position: "fixed",
				zIndex: "2147483000",
				width: SIZE + "px",
				height: SIZE + "px",
				borderRadius: "50%",
				border: "1px solid rgba(128,128,128,0.35)",
				background: "rgba(96,96,96,0.28)",
				color: "inherit",
				fontSize: "17px",
				lineHeight: "28px",
				textAlign: "center",
				cursor: "grab",
				userSelect: "none",
				WebkitUserSelect: "none",
				touchAction: "none",
				opacity: "0.45",
				padding: "0",
				margin: "0",
			});
			btn.addEventListener("mouseenter", () => { btn.style.opacity = "0.95"; });
			btn.addEventListener("mouseleave", () => { btn.style.opacity = "0.45"; });

			place(btn);
			// Keep hugging the stored corner across window resizes.
			window.addEventListener("resize", () => place(btn));
			document.body.appendChild(btn);

			// Drag to move; a clean click (no real movement) reloads the page.
			let dragging = false;
			let moved = false;
			let grabDX = 0;
			let grabDY = 0;
			let origLeft = 0;
			let origTop = 0;
			btn.addEventListener("pointerdown", (e) => {
				if (e.button !== 0) return;
				const rect = btn.getBoundingClientRect();
				// Work in left/top coordinates while dragging.
				btn.style.left = rect.left + "px";
				btn.style.top = rect.top + "px";
				btn.style.right = "auto";
				btn.style.bottom = "auto";
				dragging = true;
				moved = false;
				origLeft = rect.left;
				origTop = rect.top;
				grabDX = e.clientX - rect.left;
				grabDY = e.clientY - rect.top;
				btn.setPointerCapture(e.pointerId);
				btn.style.cursor = "grabbing";
			});
			btn.addEventListener("pointermove", (e) => {
				if (!dragging) return;
				const nx = e.clientX - grabDX;
				const ny = e.clientY - grabDY;
				// Compare against the grab origin, not the last position — the
				// latter is rewritten every frame and would swallow slow drags.
				if (!moved && Math.hypot(nx - origLeft, ny - origTop) > DRAG_THRESHOLD) {
					moved = true;
				}
				if (moved) {
					const c = clamp(nx, ny, btn.offsetWidth, btn.offsetHeight);
					btn.style.left = c.left + "px";
					btn.style.top = c.top + "px";
				}
			});
			btn.addEventListener("pointerup", (e) => {
				if (!dragging) return;
				dragging = false;
				btn.style.cursor = "grab";
				try { btn.releasePointerCapture(e.pointerId); } catch {}
				if (moved) {
					savePos(btn);
					place(btn); // snap to the saved edge anchors
				} else {
					place(btn); // restore the pre-grab anchor on a clean click
					location.reload();
				}
			});
			btn.addEventListener("pointercancel", () => {
				dragging = false;
				btn.style.cursor = "grab";
			});
		}

		// Restore the accelerators the production shell never registers.
		function startKeys() {
			window.addEventListener("keydown", (e) => {
				const isF5 = e.key === "F5";
				const isCtrlR = (e.ctrlKey || e.metaKey) && (e.key === "r" || e.key === "R");
				if (!isF5 && !isCtrlR) return;
				e.preventDefault();
				e.stopPropagation();
				location.reload();
			}, true);
		}

		exports.inject = [];
		exports.apply = apply;
		return module.exports;
	}
});
