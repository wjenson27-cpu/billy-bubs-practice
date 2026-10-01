/* BillyBubs: pannable felt in phone landscape (UI only, no game logic).
 * In phone landscape the felt is shown larger (see css/polish.css, body[data-felt-view="zoom"]) inside
 * a native scroll viewport (.felt-fit):
 *  - touch: native one-finger panning (momentum, edge clamping). A tap that doesn't move still clicks the spot.
 *  - mouse: press and drag to pan. Moves under 8px are plain clicks; a real drag suppresses the click.
 *  - dragging a placed chip still takes it down (chips are touch-action:none and skipped here).
 *  - the felt <-> bubble swipe uses a thin strip on the right edge of the felt, and the Felt/Bubble tabs always work.
 *  - "Fit" switches back to the whole-board view (the original layout, normal swipe). The choice is remembered.
 */
(function () {
  "use strict";
  var LANDSCAPE = "(orientation: landscape) and (max-height: 500px) and (max-width: 980px)";
  var KEY = "bb.feltView";
  var THRESHOLD = 8;
  var mq = window.matchMedia(LANDSCAPE);
  var fit, pane, table, ctl, toggle, map, mapView, hint, fades = {};
  var view = "zoom";

  function store(v) {
    try { localStorage.setItem(KEY, v); } catch (e) { /* private mode */ }
  }
  function load() {
    try { return localStorage.getItem(KEY) === "fit" ? "fit" : "zoom"; } catch (e) { return "zoom"; }
  }
  function zoomed() {
    return mq.matches && view === "zoom";
  }

  function el(tag, cls, parent) {
    var n = document.createElement(tag);
    n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  }

  function build() {
    ctl = el("div", "felt-pan-ctl", document.body);
    ctl.setAttribute("aria-label", "Board view");
    toggle = el("button", "felt-pan-toggle", ctl);
    toggle.type = "button";
    map = el("div", "felt-pan-map", ctl);
    map.setAttribute("aria-hidden", "true");
    mapView = el("span", "felt-pan-map-view", map);
    hint = el("span", "felt-pan-hint", ctl);
    hint.textContent = "Drag the felt to see every bet";
    // Read-only mirror of the balance, so it stays in view while the felt header is panned away.
    var bank = document.getElementById("bankroll");
    if (bank) {
      var mirror = el("span", "felt-pan-bank", ctl);
      var sync = function () { mirror.textContent = bank.textContent; };
      sync();
      new MutationObserver(sync).observe(bank, { childList: true, characterData: true, subtree: true });
    }
    ["l", "r", "t", "b"].forEach(function (s) {
      fades[s] = el("div", "felt-pan-fade felt-pan-fade-" + s, pane);
      fades[s].setAttribute("aria-hidden", "true");
    });
    var edge = el("div", "felt-pan-swipe-edge", pane);
    edge.setAttribute("aria-hidden", "true");
    toggle.addEventListener("click", function () {
      setView(view === "zoom" ? "fit" : "zoom", true);
    });
    map.addEventListener("pointerdown", function (ev) {
      if (!zoomed()) return;
      var r = map.getBoundingClientRect();
      var fx = (ev.clientX - r.left) / r.width;
      var fy = (ev.clientY - r.top) / r.height;
      fit.scrollTo({
        left: fx * fit.scrollWidth - fit.clientWidth / 2,
        top: fy * fit.scrollHeight - fit.clientHeight / 2,
        behavior: "smooth"
      });
      ev.preventDefault();
    });
  }

  function setView(v, user) {
    view = v;
    document.body.setAttribute("data-felt-view", v);
    toggle.textContent = v === "zoom" ? "Fit board" : "Zoom in";
    toggle.setAttribute("aria-pressed", v === "zoom" ? "false" : "true");
    toggle.setAttribute("title", v === "zoom" ? "Show the whole board" : "Larger board, drag to move");
    if (user) store(v);
    if (v === "fit") { fit.scrollLeft = 0; fit.scrollTop = 0; }
    requestAnimationFrame(update);
  }

  function update() {
    var on = zoomed();
    var maxX = Math.max(0, fit.scrollWidth - fit.clientWidth);
    var maxY = Math.max(0, fit.scrollHeight - fit.clientHeight);
    var x = fit.scrollLeft, y = fit.scrollTop;
    fades.l.classList.toggle("is-on", on && x > 2);
    fades.r.classList.toggle("is-on", on && x < maxX - 2);
    fades.t.classList.toggle("is-on", on && y > 2);
    fades.b.classList.toggle("is-on", on && y < maxY - 2);
    if (on && fit.scrollWidth && fit.scrollHeight) {
      mapView.style.left = (x / fit.scrollWidth) * 100 + "%";
      mapView.style.top = (y / fit.scrollHeight) * 100 + "%";
      mapView.style.width = (fit.clientWidth / fit.scrollWidth) * 100 + "%";
      mapView.style.height = (fit.clientHeight / fit.scrollHeight) * 100 + "%";
    }
    var dock = document.querySelector(".console");
    if (dock) {
      var r = dock.getBoundingClientRect();
      document.documentElement.style.setProperty("--bb-dock-top", r.top + "px");
      document.documentElement.style.setProperty("--bb-dock-h", r.height + "px");
    }
  }

  /* Mouse drag-to-pan. Touch uses native scrolling. */
  var drag = null;
  var suppressClick = false;
  var suppressTimer = 0;
  function onDown(ev) {
    suppressClick = false; // a new press is never the tail of an old drag
    if (!zoomed() || ev.pointerType !== "mouse" || ev.button !== 0) return;
    if (ev.target.closest(".felt-chip")) return; // chip drag = take down (ui.js)
    drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, sl: fit.scrollLeft, st: fit.scrollTop, moved: false };
  }
  function onMove(ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    var dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (!drag.moved) {
      if (dx * dx + dy * dy < THRESHOLD * THRESHOLD) return;
      drag.moved = true;
      document.body.classList.add("is-felt-panning");
      try { fit.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    }
    fit.scrollLeft = drag.sl - dx; // the browser clamps to the edges
    fit.scrollTop = drag.st - dy;
    ev.preventDefault();
  }
  function onUp(ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    if (drag.moved) {
      // swallow only the click generated by this drag's release
      suppressClick = true;
      clearTimeout(suppressTimer);
      suppressTimer = setTimeout(function () { suppressClick = false; }, 300);
    }
    drag = null;
    document.body.classList.remove("is-felt-panning");
  }
  function onClickCapture(ev) {
    if (suppressClick && fit.contains(ev.target)) {
      suppressClick = false;
      ev.preventDefault();
      ev.stopPropagation();
    }
  }

  function init() {
    fit = document.getElementById("felt-fit");
    pane = document.getElementById("pane-felt") || (fit && fit.closest(".board-pane"));
    table = document.getElementById("table");
    if (!fit || !pane || !table) return;
    build();
    setView(load(), false);
    fit.addEventListener("scroll", function () {
      requestAnimationFrame(update);
      if (fit.scrollLeft > 30 || fit.scrollTop > 30) document.body.classList.add("felt-pan-used");
    }, { passive: true });
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("click", onClickCapture, true);
    window.addEventListener("resize", function () { requestAnimationFrame(update); });
    if (mq.addEventListener) mq.addEventListener("change", function () { requestAnimationFrame(update); });
    if (window.ResizeObserver) new ResizeObserver(function () { requestAnimationFrame(update); }).observe(fit);
    update();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
