/**
 * Live full-table UI: felt, dice, themes, odds, coach, and the simulator.
 */
(function () {
  "use strict";

  var E = window.TableEngine;
  var G = window.DieGeom;
  var S = window.CrapsStrategies;
  var Bubble = window.CrapsEngine;
  var STORE = "billy-bubs-table";

  var THEMES = [
    { id: "billy", name: "Billy Bubs", color: "#0c4226" },
    { id: "classic", name: "Casino", color: "#0e7a38" },
    { id: "vegas", name: "Vegas", color: "#7a1824" },
    { id: "blue", name: "Pacific", color: "#0d4e86" },
    { id: "highlimit", name: "High Limit", color: "#161411" },
    { id: "bubble", name: "Billy Bubs", color: "#07180f" },
  ];

  var ODDS = [
    { id: "345", label: "3-4-5x" },
    { id: "5", label: "5x" },
    { id: "10", label: "10x" },
  ];

  var CHIPS = [1, 5, 10, 25, 100];
  var BONUS = [
    { id: "small", label: "Low Rolls" },
    { id: "tall", label: "High Rolls" },
    { id: "all", label: "Roll 'Em All" },
    { id: "hardAllDay", label: "Hard Way All Day" },
  ];

  var COLORS = ["#f0d078", "#7dffb3", "#8ec5ff", "#ff8d8d", "#e6a0ff", "#ffffff"];

  var els = {
    felt: document.getElementById("felt"),
    themes: document.getElementById("themes"),
    puck: document.getElementById("puck"),
    phase: document.getElementById("phase-label"),
    last: document.getElementById("last-roll"),
    bank: document.getElementById("bankroll"),
    onTable: document.getElementById("on-table"),
    net: document.getElementById("net-pl"),
    chips: document.getElementById("chips"),
    place: document.getElementById("btn-place"),
    take: document.getElementById("btn-take"),
    max: document.getElementById("btn-max-odds"),
    roll: document.getElementById("roll-btn"),
    sets: document.getElementById("set-grid"),
    faces: document.getElementById("face-pick"),
    ctrlOn: document.getElementById("ctrl-on"),
    ctrlBody: document.getElementById("ctrl-body"),
    ctrlInf: document.getElementById("ctrl-inf"),
    ctrlInfLabel: document.getElementById("ctrl-inf-label"),
    ctrlSrr: document.getElementById("ctrl-srr"),
    ctrlSrrLabel: document.getElementById("ctrl-srr-label"),
    strategy: document.getElementById("strategy-pick"),
    card: document.getElementById("strategy-card"),
    coach: document.getElementById("coach-line"),
    bonusOpts: document.getElementById("bonus-opts"),
    simRows: document.getElementById("sim-rows"),
    simAdd: document.getElementById("sim-add-strategy"),
    simBonuses: document.getElementById("sim-bonuses"),
    simRolls: document.getElementById("sim-rolls"),
    simCustom: document.getElementById("sim-custom-rolls"),
    simTrials: document.getElementById("sim-trials"),
    simBank: document.getElementById("sim-bank"),
    simMin: document.getElementById("sim-min"),
    simRun: document.getElementById("sim-run"),
    simStatus: document.getElementById("sim-status"),
    simChart: document.getElementById("sim-chart"),
    simLegend: document.getElementById("sim-legend"),
    simTable: document.getElementById("sim-table"),
    simWatch: document.getElementById("sim-watch"),
    stats: document.getElementById("stats"),
    histo: document.getElementById("histobar"),
    history: document.getElementById("history"),
    log: document.getElementById("log"),
    side: document.querySelector(".side"),
    toasts: document.getElementById("toasts"),
    rules: document.getElementById("rules"),
    oddsPass: document.getElementById("odds-pass"),
    oddsCome: document.getElementById("odds-come"),
    oddsDont: document.getElementById("odds-dont"),
    oddsDc: document.getElementById("odds-dc"),
    linkLines: document.getElementById("link-lines"),
    linkDont: document.getElementById("link-dont"),
    fieldMode: document.getElementById("field-mode"),
    vigBuy: document.getElementById("vig-buy"),
    vigLay: document.getElementById("vig-lay"),
    hardOff: document.getElementById("hard-off"),
    placeOn: document.getElementById("place-on"),
    tableMin: document.getElementById("table-min"),
    startBank: document.getElementById("start-bank"),
  };

  var saved = loadStore();
  var chip = saved.chip || 1000;
  var betMode = "place";
  var busy = false;
  var watchStop = false;
  var memory = {};
  var simRows = [];
  var simResults = [];
  var simJob = 0;
  var worker = null;
  var dice = [];
  var selectedDie = 0;
  var feltName = null;
  var fieldHint = null;

  var game = E.createGame(gameOptions(saved.startBank ? Math.round(Number(saved.startBank) * 100) : 100000));

  function loadStore() {
    try {
      var raw = localStorage.getItem(STORE);
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      return {};
    }
  }

  function saveStore() {
    var data = {
      felt: document.body.getAttribute("data-felt") || "billy",
      oddsPass: els.oddsPass.value,
      oddsCome: els.oddsCome.value,
      oddsDont: els.oddsDont.value,
      oddsDontCome: els.oddsDc.value,
      linkLines: els.linkLines.checked,
      linkDont: els.linkDont.checked,
      fieldMode: els.fieldMode.value,
      vigBuy: els.vigBuy.value,
      vigLay: els.vigLay.value,
      hardwaysOffComeOut: els.hardOff.checked,
      placeOnComeOut: els.placeOn.checked,
      tableMin: numberOr(els.tableMin.value, 10),
      startBank: numberOr(els.startBank.value, 1000),
      chip: chip,
    };
    try {
      localStorage.setItem(STORE, JSON.stringify(data));
    } catch (err) {
      /* private mode */
    }
  }

  function numberOr(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function centsFromDollars(value, fallbackCents) {
    var n = Number(value);
    if (!isFinite(n) || n <= 0) return fallbackCents;
    return Math.round(n * 100);
  }

  function oddsLabel(id) {
    var i;
    for (i = 0; i < ODDS.length; i++) if (ODDS[i].id === id) return ODDS[i].label;
    return "3-4-5x";
  }

  function gameOptions(bankroll) {
    return {
      bankroll: bankroll,
      startingBankroll: bankroll,
      tableMin: centsFromDollars(els.tableMin.value, 1000),
      oddsPass: els.oddsPass.value || "345",
      oddsCome: els.oddsCome.value || "345",
      oddsDont: els.oddsDont.value || "345",
      oddsDontCome: els.oddsDc.value || "345",
      fieldMode: els.fieldMode.value || "double",
      vigBuy: els.vigBuy.value || "win",
      vigLay: els.vigLay.value || "upfront",
      hardwaysOffComeOut: els.hardOff.checked,
      placeOnComeOut: els.placeOn.checked,
    };
  }

  function applySettings() {
    var min = centsFromDollars(els.tableMin.value, game.tableMin);
    game.tableMin = min;
    game.oddsPass = els.oddsPass.value;
    game.oddsCome = els.linkLines.checked ? els.oddsPass.value : els.oddsCome.value;
    game.oddsDont = els.oddsDont.value;
    game.oddsDontCome = els.linkDont.checked ? els.oddsDont.value : els.oddsDc.value;
    if (els.linkLines.checked) els.oddsCome.value = game.oddsCome;
    if (els.linkDont.checked) els.oddsDc.value = game.oddsDontCome;
    els.oddsCome.disabled = els.linkLines.checked;
    els.oddsDc.disabled = els.linkDont.checked;
    game.fieldMode = els.fieldMode.value;
    game.vigBuy = els.vigBuy.value;
    game.vigLay = els.vigLay.value;
    game.hardwaysOffComeOut = els.hardOff.checked;
    game.placeOnComeOut = els.placeOn.checked;
    if (fieldHint) fieldHint.textContent = fieldCopy(game.fieldMode);
    saveStore();
    render();
  }

  function fieldCopy(mode) {
    if (mode === "triple") return "2 and 12 pay 3 to 1";
    if (mode === "twelveTriple") return "2 pays 2 to 1, 12 pays 3 to 1";
    return "2 and 12 pay 2 to 1";
  }

  function fillOddsSelect(select, value) {
    select.innerHTML = "";
    ODDS.forEach(function (o) {
      var opt = document.createElement("option");
      opt.value = o.id;
      opt.textContent = o.label;
      select.appendChild(opt);
    });
    select.value = value || "345";
  }

  function toast(text) {
    if (!text) return;
    var el = document.createElement("div");
    el.className = "toast";
    el.textContent = text;
    els.toasts.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 2600);
  }

  function playMode() {
    var picked = document.querySelector('input[name="play-mode"]:checked');
    return picked ? picked.value : "hand";
  }

  function liveBonuses() {
    var out = {};
    els.bonusOpts.querySelectorAll("input").forEach(function (input) {
      out[input.getAttribute("data-bonus")] = input.checked;
    });
    return out;
  }

  function simBonuses() {
    var out = {};
    els.simBonuses.querySelectorAll("input").forEach(function (input) {
      out[input.getAttribute("data-bonus")] = input.checked;
    });
    return out;
  }

  function liveSpec() {
    return {
      id: els.strategy.value,
      odds: {
        pass: game.oddsPass,
        come: game.oddsCome,
        dont: game.oddsDont,
        dontCome: game.oddsDontCome,
      },
      bonuses: liveBonuses(),
    };
  }

  function spotEl(kind, number, label, hint, className) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "spot" + (className ? " " + className : "");
    btn.dataset.kind = kind;
    if (number != null) btn.dataset.number = String(number);
    btn.setAttribute("aria-label", E.describeSpot({ kind: kind, number: number }));
    btn.innerHTML = '<span class="lbl"></span>' + (hint ? '<small class="hint"></small>' : "") + '<span class="amt"></span>';
    btn.querySelector(".lbl").textContent = label;
    if (hint) btn.querySelector(".hint").textContent = hint;
    btn.addEventListener("click", onSpot);
    return btn;
  }

  function brandMark() {
    var brand = document.createElement("div");
    brand.className = "felt-brand";
    brand.setAttribute("aria-hidden", "true");
    brand.innerHTML =
      '<div class="bb-lockup"><span class="bb-neon bb-b1">B</span><span class="bb-neon bb-b2">B</span></div>' +
      '<p class="bb-word"></p><p class="bb-tag">Practice · No cash</p>';
    return brand;
  }

  function buildFelt() {
    els.felt.innerHTML = "";
    els.felt.appendChild(brandMark());
    var head = document.createElement("div");
    head.className = "felt-head";
    feltName = document.createElement("h2");
    feltName.className = "felt-name";
    var flag = document.createElement("p");
    flag.className = "felt-flag";
    flag.textContent = "Practice";
    head.appendChild(feltName);
    head.appendChild(flag);
    els.felt.appendChild(head);

    var shell = document.createElement("div");
    shell.className = "table-shell";
    var leftPass = spotEl("pass", null, "Pass line", "", "pass pass-mirror");
    var rightPass = spotEl("pass", null, "Pass line", "", "pass pass-mirror");
    var body = document.createElement("div");
    body.className = "table-body";

    var bonus = document.createElement("div");
    bonus.className = "bonus-row";
    BONUS.forEach(function (b) {
      var btn = spotEl(b.id, null, b.label, null, "bonus");
      var lamps = document.createElement("span");
      lamps.className = "lamps";
      lamps.setAttribute("data-progress", b.id);
      btn.insertBefore(lamps, btn.querySelector(".amt"));
      bonus.appendChild(btn);
    });
    body.appendChild(bonus);

    var props = document.createElement("div");
    props.className = "prop-box";
    var hard = document.createElement("div");
    hard.className = "hard-grid";
    [
      [4, "7 to 1"],
      [6, "9 to 1"],
      [8, "9 to 1"],
      [10, "7 to 1"],
    ].forEach(function (row) {
      hard.appendChild(spotEl("hardway", row[0], "Hard " + row[0], row[1]));
    });
    var mid = document.createElement("div");
    mid.className = "mid-props";
    mid.appendChild(spotEl("any7", null, "Any Seven", "4 to 1"));
    mid.appendChild(spotEl("anyCraps", null, "Any Craps", "7 to 1"));
    mid.appendChild(spotEl("eleven", null, "Yo", "15 to 1"));
    mid.appendChild(spotEl("horn", null, "Horn", "$4 units"));
    var ce = spotEl("ce", null, "C & E", "split");
    ce.classList.add("span2");
    mid.appendChild(ce);
    var hops = document.createElement("div");
    hops.className = "hop-grid";
    [
      [2, "30 to 1"],
      [3, "15 to 1"],
      [11, "15 to 1"],
      [12, "30 to 1"],
    ].forEach(function (row) {
      hops.appendChild(spotEl("hop", row[0], "Hop " + row[0], row[1]));
    });
    props.appendChild(hard);
    props.appendChild(mid);
    props.appendChild(hops);
    body.appendChild(props);

    var nums = document.createElement("div");
    nums.className = "num-row";
    nums.appendChild(spotEl("big6", null, "Big 6", "even", "big"));
    ;[4, 5, 6, 8, 9, 10].forEach(function (n) {
      var box = document.createElement("div");
      box.className = "num";
      box.dataset.number = String(n);
      var face = document.createElement("div");
      face.className = "num-face";
      face.textContent = String(n);
      var bets = document.createElement("div");
      bets.className = "num-bets";
      bets.appendChild(spotEl("place", n, "Place", ""));
      bets.appendChild(spotEl("buy", n, "Buy", ""));
      bets.appendChild(spotEl("lay", n, "Lay", ""));
      var tag = document.createElement("div");
      tag.className = "come-tag";
      var odds = document.createElement("div");
      odds.className = "odds-row";
      odds.appendChild(spotEl("comeOdds", n, "C odds", ""));
      odds.appendChild(spotEl("dontComeOdds", n, "DC lay", ""));
      box.appendChild(face);
      box.appendChild(bets);
      box.appendChild(tag);
      box.appendChild(odds);
      nums.appendChild(box);
    });
    nums.appendChild(spotEl("big8", null, "Big 8", "even", "big"));
    body.appendChild(nums);

    var come = document.createElement("div");
    come.className = "line-row come";
    come.appendChild(spotEl("come", null, "Come", "", "band"));
    come.appendChild(spotEl("dontCome", null, "Don't Come", ""));
    body.appendChild(come);

    var field = spotEl("field", null, "Field", fieldCopy("double"), "field band");
    fieldHint = field.querySelector(".hint");
    var numsLabel = document.createElement("span");
    numsLabel.className = "nums";
    numsLabel.innerHTML = "<em>2</em> 3 4 9 10 11 <em>12</em>";
    field.insertBefore(numsLabel, field.querySelector(".amt"));
    body.appendChild(field);

    var dont = document.createElement("div");
    dont.className = "line-row dont";
    dont.appendChild(spotEl("dontPass", null, "Don't Pass", "Bar 12", "band"));
    dont.appendChild(spotEl("dontPassOdds", null, "Lay odds", ""));
    body.appendChild(dont);

    var pass = document.createElement("div");
    pass.className = "line-row passline";
    pass.appendChild(spotEl("pass", null, "Pass line", "", "pass pass-main band"));
    pass.appendChild(spotEl("passOdds", null, "Odds", ""));
    body.appendChild(pass);

    shell.appendChild(leftPass);
    shell.appendChild(body);
    shell.appendChild(rightPass);
    els.felt.appendChild(shell);

    var layer = document.createElement("div");
    layer.className = "dice-layer";
    layer.id = "dice-layer";
    document.getElementById("felt-fit").appendChild(layer);
    buildDice(layer);
    applyTheme(document.body.getAttribute("data-felt") || "billy");
  }

  function buildDice(layer) {
    dice = [];
    ;[0, 1].forEach(function (i) {
      var el = document.createElement("div");
      el.className = "die";
      el.style.left = i === 0 ? "42%" : "58%";
      el.style.top = "48%";
      var scene = document.createElement("div");
      scene.className = "die-scene";
      var cube = document.createElement("div");
      cube.className = "die-cube";
      ["front", "back", "right", "left", "top", "bottom"].forEach(function (slot) {
        var face = document.createElement("div");
        face.className = "die-face slot-" + slot;
        cube.appendChild(face);
      });
      var shadow = document.createElement("div");
      shadow.className = "die-shadow";
      scene.appendChild(cube);
      el.appendChild(scene);
      el.appendChild(shadow);
      layer.appendChild(el);
      var die = {
        index: i,
        el: el,
        cube: cube,
        ori: G.identity(),
        x: i === 0 ? 42 : 58,
        y: 48,
      };
      dice.push(die);
      bindDie(die);
      paintDie(die);
    });
    markSelected();
  }

  function paintDie(die) {
    var o = die.ori;
    var map = {
      top: o.top,
      front: G.front(o),
      right: o.right,
      left: G.left(o),
      bottom: G.bottom(o),
      back: o.away,
    };
    Object.keys(map).forEach(function (slot) {
      var face = die.cube.querySelector(".slot-" + slot);
      face.setAttribute("data-face", String(map[slot]));
      face.setAttribute("aria-hidden", "true");
    });
    die.el.style.left = die.x + "%";
    die.el.style.top = die.y + "%";
    die.el.setAttribute("aria-label", "Die showing " + o.top);
  }

  function markSelected() {
    dice.forEach(function (d) {
      d.el.classList.toggle("is-selected", d.index === selectedDie);
    });
    if (!els.faces) return;
    var top = dice[selectedDie] ? dice[selectedDie].ori.top : 0;
    els.faces.querySelectorAll(".face-btn").forEach(function (btn) {
      btn.classList.toggle("is-on", Number(btn.getAttribute("data-face")) === top);
    });
  }

  function copyOri(o) {
    return { top: o.top, away: o.away, right: o.right };
  }

  function setOrientation(die, ori) {
    die.ori = copyOri(ori);
    paintDie(die);
  }

  function orientForTop(top) {
    var all = G.allOrientations();
    var matches = [];
    var i;
    for (i = 0; i < all.length; i++) if (all[i].top === top) matches.push(all[i]);
    if (!matches.length) return G.identity();
    var buf = new Uint32Array(1);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(buf);
    else buf[0] = Math.floor(Math.random() * 0xffffffff);
    return copyOri(matches[buf[0] % matches.length]);
  }

  function bindDie(die) {
    die.el.addEventListener("pointerdown", function (ev) {
      if (busy) return;
      ev.preventDefault();
      ev.stopPropagation();
      selectedDie = die.index;
      markSelected();
      die.el.setPointerCapture(ev.pointerId);
      var startX = ev.clientX;
      var startY = ev.clientY;
      var startT = performance.now();
      var originX = die.x;
      var originY = die.y;
      function move(e) {
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        if (Math.hypot(dx, dy) < 8) return;
        var rect = die.el.parentElement.getBoundingClientRect();
        die.x = clamp(((e.clientX - rect.left) / rect.width) * 100, 6, 94);
        die.y = clamp(((e.clientY - rect.top) / rect.height) * 100, 8, 92);
        paintDie(die);
      }
      function up(e) {
        die.el.removeEventListener("pointermove", move);
        die.el.removeEventListener("pointerup", up);
        die.el.removeEventListener("pointercancel", up);
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        var dist = Math.hypot(dx, dy);
        var dt = performance.now() - startT;
        if (dist < 10) {
          die.ori = G.rotate(die.ori, "up");
          paintDie(die);
        } else if (dist < 74 && dt < 340) {
          var dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
          die.x = originX;
          die.y = originY;
          die.ori = G.rotate(die.ori, dir);
          paintDie(die);
        }
        pushControl();
      }
      die.el.addEventListener("pointermove", move);
      die.el.addEventListener("pointerup", up);
      die.el.addEventListener("pointercancel", up);
    });
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function pushControl() {
    var mode = document.querySelector('input[name="ctrl-mode"]:checked');
    game.control.enabled = els.ctrlOn.checked;
    game.control.mode = mode ? mode.value : "influence";
    game.control.influence = Number(els.ctrlInf.value) / 100;
    game.control.srr = Number(els.ctrlSrr.value);
    game.control.set = { d1: dice[0].ori.top, d2: dice[1].ori.top };
    els.ctrlInfLabel.textContent = els.ctrlInf.value + "%";
    els.ctrlSrrLabel.textContent = els.ctrlSrr.value;
    els.ctrlBody.hidden = !els.ctrlOn.checked;
  }

  function reducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function tossDie(die, top, duration) {
    return new Promise(function (resolve) {
      var landed = orientForTop(top);
      if (reducedMotion()) {
        setOrientation(die, landed);
        die.cube.style.transform = "";
        resolve();
        return;
      }
      var x0 = die.x;
      var y0 = die.y;
      var wallX = clamp(28 + die.index * 36 + ((top * 3) % 7) - 3, 18, 82);
      var wallY = 14 + die.index * 3;
      var endX = die.index === 0 ? 40 : 60;
      var endY = 46;
      var t0 = performance.now();
      var step = -1;
      var dirs = ["up", "right", "up", "left", "down", "right"];
      function frame(now) {
        var t = Math.min(1, (now - t0) / duration);
        var x;
        var y;
        if (t < 0.58) {
          var u = 1 - Math.pow(1 - t / 0.58, 2);
          x = x0 + (wallX - x0) * u;
          y = y0 + (wallY - y0) * u;
        } else if (t < 0.74) {
          var b = (t - 0.58) / 0.16;
          x = wallX + (endX - wallX) * b * 0.35;
          y = wallY + Math.sin(b * Math.PI) * 7;
        } else {
          var s = (t - 0.74) / 0.26;
          var e = s * s * (3 - 2 * s);
          var midX = wallX + (endX - wallX) * 0.35;
          var midY = wallY;
          x = midX + (endX - midX) * e;
          y = midY + (endY - midY) * e;
        }
        die.x = x;
        die.y = y;
        var tumble = Math.floor(t * 16);
        if (tumble !== step && t < 0.9) {
          step = tumble;
          die.ori = G.rotate(die.ori, dirs[tumble % dirs.length]);
        }
        if (t >= 0.9) setOrientation(die, landed);
        else paintDie(die);
        var wobble = Math.sin(t * 18) * 16;
        die.cube.style.transform =
          "rotateX(" + (-28 + wobble) + "deg) rotateY(" + (32 + t * 720) + "deg)";
        if (t < 1) requestAnimationFrame(frame);
        else {
          die.cube.style.transform = "";
          setOrientation(die, landed);
          resolve();
        }
      }
      requestAnimationFrame(frame);
    });
  }

  function animateRoll(d1, d2, duration) {
    return Promise.all([tossDie(dice[0], d1, duration), tossDie(dice[1], d2, duration)]);
  }

  function onSpot(ev) {
    if (busy) return;
    var el = ev.currentTarget;
    var spot = {
      kind: el.dataset.kind,
      number: el.dataset.number ? Number(el.dataset.number) : undefined,
    };
    var res = betMode === "take" ? E.removeBet(game, spot, chip) : E.placeBet(game, spot, chip);
    if (!res.ok) toast(res.error);
    render();
  }

  function topUp(kind, number, max) {
    var have = E.getAmount(game, { kind: kind, number: number });
    var need = max - have;
    if (need > game.bankroll) need = game.bankroll;
    if (need <= 0) return false;
    var res = E.placeBet(game, { kind: kind, number: number }, need);
    if (!res.ok) {
      toast(res.error);
      return false;
    }
    return true;
  }

  function maxOdds() {
    if (busy) return;
    var placed = false;
    if (game.bets.pass && game.point) {
      placed = topUp("passOdds", null, E.maxPassOdds(game.bets.pass, game.point, game.oddsPass)) || placed;
    }
    if (game.bets.dontPass && game.point) {
      placed = topUp("dontPassOdds", null, E.maxLayOdds(game.bets.dontPass, game.point, game.oddsDont)) || placed;
    }
    Object.keys(game.bets.comeBets).forEach(function (key) {
      var n = Number(key);
      var slot = game.bets.comeBets[key];
      if (!slot || !slot.amount) return;
      placed = topUp("comeOdds", n, E.maxPassOdds(slot.amount, n, game.oddsCome)) || placed;
    });
    Object.keys(game.bets.dontComeBets).forEach(function (key) {
      var n = Number(key);
      var slot = game.bets.dontComeBets[key];
      if (!slot || !slot.amount) return;
      placed = topUp("dontComeOdds", n, E.maxLayOdds(slot.amount, n, game.oddsDontCome)) || placed;
    });
    if (!placed) toast("No odds to take right now.");
    render();
  }

  function roll() {
    if (busy) return;
    busy = true;
    els.roll.disabled = true;
    pushControl();
    var mode = playMode();
    if (mode === "auto") {
      var prep = S.prepareRoll(game, liveSpec(), memory);
      if (prep.skipped && prep.skipped.length) toast(prep.skipped[0].error);
      render();
    }
    var rolled = E.rollForState(game);
    animateRoll(rolled.d1, rolled.d2, 1100).then(function () {
      E.settle(game, rolled.d1, rolled.d2);
      pushControl();
      busy = false;
      els.roll.disabled = false;
      render();
      if (game.lastNarrative) toast(game.lastNarrative);
    });
  }

  function breakChips(cents) {
    var denoms = [100, 25, 10, 5, 1];
    var left = Math.max(0, Math.round(cents / 100));
    var out = [];
    var i;
    for (i = 0; i < denoms.length; i++) {
      var count = Math.floor(left / denoms[i]);
      var shown = Math.min(count, 4 - out.length);
      var k;
      for (k = 0; k < shown; k++) out.push(denoms[i]);
      left -= count * denoms[i];
      if (out.length >= 4) break;
    }
    if (!out.length) out.push(1);
    return out;
  }

  function paintStack(holder, cents, label) {
    holder.innerHTML = "";
    if (!cents) return;
    var text = document.createElement("span");
    text.className = "amt-text";
    text.textContent = label;
    var stack = document.createElement("span");
    stack.className = "stack";
    breakChips(cents).forEach(function (dollars, index) {
      var piece = document.createElement("i");
      piece.className = "mini is-" + dollars;
      piece.style.setProperty("--i", String(index));
      piece.setAttribute("aria-hidden", "true");
      stack.appendChild(piece);
    });
    holder.appendChild(text);
    holder.appendChild(stack);
  }

  function amountText(kind, amount) {
    var text = E.dollars(amount);
    var off = game.phase === "come-out" && amount > 0;
    if (off && kind === "comeOdds" && game.comeOddsOffOnComeOut) return text + " off";
    if (off && (kind === "place" || kind === "buy") && !game.placeOnComeOut) return text + " off";
    if (off && kind === "hardway" && game.hardwaysOffComeOut) return text + " off";
    return text;
  }

  function renderFelt() {
    els.felt.querySelectorAll(".spot").forEach(function (el) {
      var spot = {
        kind: el.dataset.kind,
        number: el.dataset.number ? Number(el.dataset.number) : undefined,
      };
      var amount = E.getAmount(game, spot);
      el.classList.toggle("has-bet", amount > 0);
      var amt = el.querySelector(".amt");
      if (!amt || el.classList.contains("pass-mirror")) return;
      if (amount) paintStack(amt, amount, amountText(spot.kind, amount));
      else amt.innerHTML = "";
    });
    els.felt.querySelectorAll(".num").forEach(function (box) {
      var n = Number(box.dataset.number);
      box.classList.toggle("is-point", game.point === n);
      var bits = [];
      var come = game.bets.comeBets[n];
      var dc = game.bets.dontComeBets[n];
      if (come && come.amount) bits.push("Come " + E.dollars(come.amount));
      if (dc && dc.amount) bits.push("DC " + E.dollars(dc.amount));
      box.querySelector(".come-tag").textContent = bits.join(" · ");
    });
    els.felt.querySelectorAll("[data-progress]").forEach(function (el) {
      var kind = el.getAttribute("data-progress");
      var set = Bubble.makeEmSet(kind);
      var hits = (game.progress && game.progress[kind]) || {};
      el.innerHTML = "";
      set.forEach(function (n) {
        var lamp = document.createElement("span");
        lamp.className = "lamp" + (hits[n] ? " is-lit" : "");
        lamp.textContent = kind === "hardAllDay" ? "H" + n : String(n);
        el.appendChild(lamp);
      });
    });
    var on = game.phase === "point";
    els.puck.setAttribute("data-on", on ? "true" : "false");
    els.puck.textContent = on ? "ON" : "OFF";
    els.phase.textContent = on ? "Point " + game.point : "Come-out";
    if (game.lastDice) {
      var d = game.lastDice;
      els.last.textContent = d.d1 + "–" + d.d2 + " = " + d.total + (d.hard ? " hard" : "");
    }
  }

  function renderRack() {
    els.bank.textContent = E.dollars(game.bankroll);
    els.onTable.textContent = E.dollars(E.tableTotal(game.bets));
    var pl = E.netPL(game);
    els.net.textContent = (pl > 0 ? "+" : "") + E.dollars(pl);
    els.net.classList.toggle("is-up", pl > 0);
    els.net.classList.toggle("is-down", pl < 0);
  }

  function renderSession() {
    var st = game.stats;
    var rows = [
      ["Rolls", st.rolls],
      ["Sevens", st.sevens],
      ["Seven-outs", st.sevenOuts],
      ["Points made", st.pointsMade],
      ["This hand", st.handRolls],
      ["Longest hand", st.longestHand],
    ];
    els.stats.innerHTML = "";
    rows.forEach(function (row) {
      var dt = document.createElement("dt");
      dt.textContent = row[0];
      var dd = document.createElement("dd");
      dd.textContent = String(row[1]);
      els.stats.appendChild(dt);
      els.stats.appendChild(dd);
    });
    var max = 1;
    var n;
    for (n = 2; n <= 12; n++) max = Math.max(max, st.totals[n] || 0);
    els.histo.innerHTML = "";
    for (n = 2; n <= 12; n++) {
      var bar = document.createElement("span");
      var count = st.totals[n] || 0;
      bar.style.height = Math.max(6, (count / max) * 100) + "%";
      bar.title = n + ": " + count;
      var em = document.createElement("em");
      em.textContent = String(n);
      bar.appendChild(em);
      els.histo.appendChild(bar);
    }
    els.history.innerHTML = "";
    game.history.forEach(function (h) {
      var b = document.createElement("b");
      b.textContent = h.d1 + "–" + h.d2;
      els.history.appendChild(b);
    });
    els.log.innerHTML = "";
    game.log.forEach(function (line) {
      var li = document.createElement("li");
      li.textContent = line;
      els.log.appendChild(li);
    });
  }

  function actionLine(actions) {
    if (!actions || !actions.length) return "Nothing to bet before the next roll.";
    return actions
      .map(function (a) {
        var name = E.describeSpot({ kind: a.kind, number: a.number });
        var verb = a.op === "remove" ? "Take down " : "Bet ";
        return verb + name + " " + E.dollars(a.amount);
      })
      .join(" · ");
  }

  function renderCoach() {
    var mode = playMode();
    if (mode === "hand") {
      els.coach.hidden = true;
      return;
    }
    var actions = S.coach(game, liveSpec(), memory);
    els.coach.hidden = false;
    els.coach.textContent = (mode === "auto" ? "Auto next: " : "Next: ") + actionLine(actions);
  }

  function renderStrategy() {
    var strategy = S.BY_ID[els.strategy.value];
    els.card.innerHTML = "";
    if (!strategy) return;
    var h = document.createElement("h3");
    h.textContent = strategy.name;
    var risk = document.createElement("span");
    risk.className = "risk " + strategy.risk;
    risk.textContent = strategy.risk;
    var p = document.createElement("p");
    p.textContent = strategy.summary;
    els.card.appendChild(h);
    els.card.appendChild(risk);
    els.card.appendChild(p);
    if (strategy.warning) {
      var warn = document.createElement("p");
      warn.className = "warn";
      warn.textContent = strategy.warning;
      els.card.appendChild(warn);
    }
    var list = document.createElement("ul");
    (strategy.edges || []).forEach(function (edge) {
      var li = document.createElement("li");
      li.textContent = edge.bet + " · house edge " + edge.edge;
      list.appendChild(li);
    });
    els.card.appendChild(list);
  }

  function render() {
    renderFelt();
    renderRack();
    renderSession();
    renderCoach();
    markSelected();
    highlightSet();
  }

  function highlightSet() {
    els.sets.querySelectorAll(".set-btn").forEach(function (btn) {
      var set = G.SETS.filter(function (s) {
        return s.id === btn.getAttribute("data-set");
      })[0];
      var on = set && same(dice[0].ori, set.d1) && same(dice[1].ori, set.d2);
      btn.classList.toggle("is-on", !!on);
    });
  }

  function same(a, b) {
    return a && b && a.top === b.top && a.away === b.away && a.right === b.right;
  }

  function applyTheme(id) {
    var theme = THEMES.filter(function (t) {
      return t.id === id;
    })[0] || THEMES[0];
    document.body.setAttribute("data-felt", theme.id);
    if (feltName) feltName.textContent = theme.name;
    var word = document.querySelector(".bb-word");
    var tag = document.querySelector(".bb-tag");
    var brand = document.querySelector(".felt-brand");
    if (word) word.textContent = theme.name;
    if (tag) tag.textContent = theme.id === "billy" || theme.id === "bubble" ? "Practice · No cash" : "Practice";
    if (brand) brand.setAttribute("data-brand", theme.id);
    els.themes.querySelectorAll(".theme-swatch").forEach(function (btn) {
      var on = btn.getAttribute("data-felt") === theme.id;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
    });
    saveStore();
  }

  function shortLandscape() {
    return window.matchMedia("(orientation: landscape) and (max-height: 520px)").matches;
  }

  function showTab(name, toggle) {
    document.querySelectorAll(".tab").forEach(function (tab) {
      var on = tab.getAttribute("data-tab") === name;
      tab.classList.toggle("is-on", on);
      tab.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll(".panel").forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-panel") !== name;
    });
    if (shortLandscape()) {
      if (toggle && els.side.classList.contains("sheet-open")) els.side.classList.remove("sheet-open");
      else els.side.classList.add("sheet-open");
    }
  }

  function buildSets() {
    G.SETS.forEach(function (set) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "set-btn";
      btn.setAttribute("data-set", set.id);
      var strong = document.createElement("strong");
      strong.textContent = set.name;
      var span = document.createElement("span");
      span.textContent = set.blurb;
      btn.appendChild(strong);
      btn.appendChild(span);
      btn.addEventListener("click", function () {
        setOrientation(dice[0], set.d1);
        setOrientation(dice[1], set.d2);
        pushControl();
        render();
      });
      els.sets.appendChild(btn);
    });
    var caption = document.createElement("p");
    caption.className = "note";
    caption.textContent = "Selected die, top face.";
    els.faces.appendChild(caption);
    ;[1, 2, 3, 4, 5, 6].forEach(function (n) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "face-btn";
      btn.setAttribute("data-face", String(n));
      btn.textContent = String(n);
      btn.addEventListener("click", function () {
        var die = dice[selectedDie];
        var next = G.withTopFront(n, G.front(die.ori));
        if (!next) next = orientForTop(n);
        setOrientation(die, next);
        pushControl();
        render();
      });
      els.faces.appendChild(btn);
    });
  }

  function buildChips() {
    CHIPS.forEach(function (dollars) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip is-" + dollars;
      btn.setAttribute("data-value", String(dollars));
      btn.setAttribute("aria-label", "$" + dollars + " chip");
      var face = document.createElement("span");
      face.className = "chip-face";
      var mark = document.createElement("span");
      mark.className = "chip-bb";
      mark.textContent = "BB";
      var val = document.createElement("span");
      val.className = "chip-val";
      val.textContent = "$" + dollars;
      face.appendChild(mark);
      face.appendChild(val);
      btn.appendChild(face);
      btn.addEventListener("click", function () {
        chip = dollars * 100;
        markChip();
        saveStore();
      });
      els.chips.appendChild(btn);
    });
    markChip();
  }

  function markChip() {
    els.chips.querySelectorAll(".chip").forEach(function (btn) {
      btn.classList.toggle("is-on", Number(btn.getAttribute("data-value")) * 100 === chip);
      btn.setAttribute("aria-checked", Number(btn.getAttribute("data-value")) * 100 === chip ? "true" : "false");
    });
  }

  function fillStrategySelect(select) {
    select.innerHTML = "";
    S.STRATEGIES.forEach(function (strategy) {
      var opt = document.createElement("option");
      opt.value = strategy.id;
      opt.textContent = strategy.name;
      select.appendChild(opt);
    });
  }

  function bonusChecks(host) {
    BONUS.forEach(function (b) {
      var label = document.createElement("label");
      label.className = "check";
      var input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("data-bonus", b.id);
      label.appendChild(input);
      label.appendChild(document.createTextNode(" " + b.label));
      host.appendChild(label);
    });
  }

  function addSimRow(id, odds) {
    var row = { id: id || els.simAdd.value || "passMax", odds: odds || els.oddsPass.value || "345" };
    simRows.push(row);
    var el = document.createElement("div");
    el.className = "sim-row";
    var name = document.createElement("span");
    name.textContent = (S.BY_ID[row.id] && S.BY_ID[row.id].name) || row.id;
    var select = document.createElement("select");
    select.setAttribute("aria-label", "Odds for " + name.textContent);
    fillOddsSelect(select, row.odds);
    select.addEventListener("change", function () {
      row.odds = select.value;
    });
    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ghost";
    remove.textContent = "Remove";
    remove.addEventListener("click", function () {
      var idx = simRows.indexOf(row);
      if (idx >= 0) simRows.splice(idx, 1);
      el.parentNode.removeChild(el);
    });
    el.appendChild(name);
    el.appendChild(select);
    el.appendChild(remove);
    els.simRows.appendChild(el);
  }

  function simConfig() {
    var rolls = els.simRolls.value === "custom" ? numberOr(els.simCustom.value, 100) : numberOr(els.simRolls.value, 250);
    rolls = clamp(Math.round(rolls), 10, 5000);
    var trials = clamp(Math.round(numberOr(els.simTrials.value, 1000)), 50, 5000);
    return {
      trials: trials,
      rolls: rolls,
      bankroll: centsFromDollars(els.simBank.value, 100000),
      tableMin: centsFromDollars(els.simMin.value, 1000),
      fieldMode: game.fieldMode,
      vigBuy: game.vigBuy,
      vigLay: game.vigLay,
      hardwaysOffComeOut: game.hardwaysOffComeOut,
      placeOnComeOut: game.placeOnComeOut,
      strategies: simRows.map(function (row) {
        return { id: row.id, odds: row.odds, bonuses: simBonuses() };
      }),
    };
  }

  function pct(n) {
    return (n * 100).toFixed(1) + "%";
  }

  function renderSim(results) {
    simResults = results || [];
    drawChart(simResults);
    els.simLegend.innerHTML = "";
    els.simTable.innerHTML = "";
    var head = document.createElement("tr");
    ;["Strategy", "Odds", "Avg end", "Median", "Win %", "Bust %", "Best", "Worst", "Avg drawdown", "Avg wagered", "Expected loss", "Actual loss"].forEach(function (label) {
      var th = document.createElement("th");
      th.textContent = label;
      head.appendChild(th);
    });
    var thead = document.createElement("thead");
    thead.appendChild(head);
    var tbody = document.createElement("tbody");
    simResults.forEach(function (row, i) {
      var tr = document.createElement("tr");
      var cells = [
        row.name,
        oddsLabel(row.odds),
        E.dollars(row.avgEnd),
        E.dollars(row.medianEnd),
        pct(row.winPct),
        pct(row.bustPct),
        E.dollars(row.best),
        E.dollars(row.worst),
        E.dollars(row.avgDrawdown),
        E.dollars(row.avgWagered),
        E.dollars(row.avgExpectedLoss),
        E.dollars(row.avgActualLoss),
      ];
      cells.forEach(function (value, c) {
        var td = document.createElement("td");
        td.textContent = value;
        if (c === 0) td.style.color = COLORS[i % COLORS.length];
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
      var key = document.createElement("span");
      var swatch = document.createElement("i");
      swatch.style.background = COLORS[i % COLORS.length];
      key.appendChild(swatch);
      key.appendChild(document.createTextNode(row.name + " " + oddsLabel(row.odds)));
      els.simLegend.appendChild(key);
    });
    els.simTable.appendChild(thead);
    els.simTable.appendChild(tbody);
  }

  function drawChart(results) {
    var canvas = els.simChart;
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || 640;
    var h = 280;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#070b09";
    ctx.fillRect(0, 0, w, h);
    if (!results.length) {
      ctx.fillStyle = "rgba(246,237,216,0.7)";
      ctx.font = "14px Archivo, sans-serif";
      ctx.fillText("Run a simulation to see bankroll over rolls.", 16, 32);
      return;
    }
    var lo = Infinity;
    var hi = -Infinity;
    var maxRoll = 1;
    results.forEach(function (row) {
      var b = row.bands;
      maxRoll = Math.max(maxRoll, b.rolls[b.rolls.length - 1] || 1);
      b.p10.concat(b.p90).forEach(function (v) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      });
    });
    if (lo === hi) {
      lo -= 100;
      hi += 100;
    }
    var pad = 16;
    function xAt(roll) {
      return pad + (roll / maxRoll) * (w - pad * 2);
    }
    function yAt(v) {
      return pad + (1 - (v - lo) / (hi - lo)) * (h - pad * 2);
    }
    results.forEach(function (row, i) {
      var color = COLORS[i % COLORS.length];
      var b = row.bands;
      ctx.beginPath();
      b.rolls.forEach(function (roll, p) {
        var x = xAt(roll);
        var y = yAt(b.p90[p]);
        if (p === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      for (var p = b.rolls.length - 1; p >= 0; p--) ctx.lineTo(xAt(b.rolls[p]), yAt(b.p10[p]));
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.18;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      b.rolls.forEach(function (roll, p) {
        var x = xAt(roll);
        var y = yAt(b.p50[p]);
        if (p === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      b.rolls.forEach(function (roll, p) {
        var x = xAt(roll);
        var y = yAt(row.sample[p]);
        if (p === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    });
  }

  function runSim() {
    if (!simRows.length) {
      toast("Add a strategy first.");
      return;
    }
    var config = simConfig();
    simJob += 1;
    var id = simJob;
    els.simStatus.textContent = "Running " + config.trials + " sessions of " + config.rolls + " rolls…";
    els.simRun.disabled = true;
    function finish(results) {
      if (id !== simJob) return;
      els.simRun.disabled = false;
      els.simStatus.textContent = "Done. " + config.trials + " sessions, " + config.rolls + " rolls each.";
      renderSim(results);
    }
    function fail(message) {
      if (id !== simJob) return;
      els.simRun.disabled = false;
      els.simStatus.textContent = message || "Simulation failed.";
    }
    if (worker) {
      worker.onmessage = function (event) {
        var msg = event.data || {};
        if (msg.id !== id) return;
        if (msg.type === "result") finish(msg.results);
        else fail(msg.message);
      };
      worker.onerror = function () {
        worker = null;
        finish(S.runSim(config));
      };
      try {
        worker.postMessage({ type: "run", id: id, config: config });
        return;
      } catch (err) {
        worker = null;
      }
    }
    setTimeout(function () {
      try {
        finish(S.runSim(config));
      } catch (err) {
        fail(err && err.message);
      }
    }, 30);
  }

  function restoreSnapshot(snap) {
    game = snap.game;
    memory = snap.memory;
    dice.forEach(function (d, i) {
      d.x = snap.dice[i].x;
      d.y = snap.dice[i].y;
      setOrientation(d, snap.dice[i].ori);
    });
    pushControl();
    render();
  }

  function watchSession() {
    if (busy) return;
    if (!simRows.length) {
      toast("Add a strategy first.");
      return;
    }
    var config = simConfig();
    var spec = config.strategies[0];
    config.rolls = Math.min(config.rolls, 250);
    els.simStatus.textContent = "Watching " + ((S.BY_ID[spec.id] && S.BY_ID[spec.id].name) || spec.id) + " at " + oddsLabel(spec.odds) + ".";
    var snap = {
      game: E.clone(game),
      memory: E.clone(memory),
      dice: dice.map(function (d) {
        return { x: d.x, y: d.y, ori: copyOri(d.ori) };
      }),
    };
    var built = S.buildWatch(spec, config);
    game = E.createGame({
      bankroll: config.bankroll,
      startingBankroll: config.bankroll,
      tableMin: config.tableMin,
      fieldMode: config.fieldMode,
      vigBuy: config.vigBuy,
      vigLay: config.vigLay,
      hardwaysOffComeOut: config.hardwaysOffComeOut,
      placeOnComeOut: config.placeOnComeOut,
    });
    if (typeof spec.odds === "string") E.applyOddsPreset(game, spec.odds);
    memory = {};
    busy = true;
    watchStop = false;
    els.side.classList.remove("sheet-open");
    els.simWatch.textContent = "Stop";
    render();
    var i = 0;
    function step() {
      if (watchStop || i >= built.frames.length) {
        restoreSnapshot(snap);
        busy = false;
        els.simWatch.textContent = "Watch one session on the felt";
        toast(watchStop ? "Stopped. Your session is back." : "Watch finished. Your session is back.");
        return;
      }
      var frame = built.frames[i];
      i += 1;
      S.applyActions(game, frame.actions);
      render();
      var duration = reducedMotion() ? 0 : 420;
      animateRoll(frame.d1, frame.d2, duration || 1).then(function () {
        E.settle(game, frame.d1, frame.d2);
        render();
        if (reducedMotion()) setTimeout(step, 80);
        else step();
      });
    }
    step();
  }

  function newSession() {
    if (busy) return;
    var bank = centsFromDollars(els.startBank.value, 100000);
    game = E.createGame(gameOptions(bank));
    game.startingBankroll = bank;
    memory = {};
    pushControl();
    render();
    toast("New session.");
  }

  function initSettings() {
    fillOddsSelect(els.oddsPass, saved.oddsPass || "345");
    fillOddsSelect(els.oddsCome, saved.oddsCome || saved.oddsPass || "345");
    fillOddsSelect(els.oddsDont, saved.oddsDont || "345");
    fillOddsSelect(els.oddsDc, saved.oddsDontCome || saved.oddsDont || "345");
    els.linkLines.checked = saved.linkLines !== false;
    els.linkDont.checked = saved.linkDont !== false;
    if (saved.fieldMode) els.fieldMode.value = saved.fieldMode;
    if (saved.vigBuy) els.vigBuy.value = saved.vigBuy;
    if (saved.vigLay) els.vigLay.value = saved.vigLay;
    els.hardOff.checked = !!saved.hardwaysOffComeOut;
    els.placeOn.checked = !!saved.placeOnComeOut;
    els.tableMin.value = saved.tableMin || 10;
    els.startBank.value = saved.startBank || 1000;
    ;[els.oddsPass, els.oddsCome, els.oddsDont, els.oddsDc, els.fieldMode, els.vigBuy, els.vigLay].forEach(function (el) {
      el.addEventListener("change", applySettings);
    });
    ;[els.linkLines, els.linkDont, els.hardOff, els.placeOn].forEach(function (el) {
      el.addEventListener("change", applySettings);
    });
    els.tableMin.addEventListener("change", applySettings);
    els.startBank.addEventListener("change", saveStore);
    applySettings();
  }

  function initThemes() {
    THEMES.forEach(function (theme) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "theme-swatch";
      btn.setAttribute("role", "radio");
      btn.setAttribute("data-felt", theme.id);
      btn.title = theme.id === "bubble" ? "Bubble craps" : theme.name;
      btn.setAttribute("aria-label", theme.id === "bubble" ? "Bubble craps felt" : theme.name + " felt");
      btn.style.background = theme.color;
      if (theme.id === "bubble") btn.style.boxShadow = "inset 0 0 0 3px #3dff6e";
      if (theme.id === "highlimit") btn.style.boxShadow = "inset 0 0 0 3px #e0c36a";
      btn.addEventListener("click", function () {
        applyTheme(theme.id);
      });
      els.themes.appendChild(btn);
    });
    applyTheme(saved.felt || "billy");
  }

  function init() {
    buildFelt();
    buildChips();
    buildSets();
    initThemes();
    initSettings();
    fillStrategySelect(els.strategy);
    fillStrategySelect(els.simAdd);
    bonusChecks(els.bonusOpts);
    bonusChecks(els.simBonuses);
    renderStrategy();
    addSimRow("passMax", "345");
    addSimRow("dontMax", "345");
    try {
      worker = new Worker("js/sim-worker.js");
    } catch (err) {
      worker = null;
    }

    els.place.addEventListener("click", function () {
      betMode = "place";
      els.place.classList.add("is-on");
      els.take.classList.remove("is-on");
    });
    els.take.addEventListener("click", function () {
      betMode = "take";
      els.take.classList.add("is-on");
      els.place.classList.remove("is-on");
    });
    els.max.addEventListener("click", maxOdds);
    els.roll.addEventListener("click", roll);
    els.strategy.addEventListener("change", function () {
      memory = {};
      renderStrategy();
      renderCoach();
    });
    document.querySelectorAll('input[name="play-mode"]').forEach(function (input) {
      input.addEventListener("change", renderCoach);
    });
    els.bonusOpts.addEventListener("change", renderCoach);
    els.ctrlOn.addEventListener("change", pushControl);
    els.ctrlInf.addEventListener("input", pushControl);
    els.ctrlSrr.addEventListener("input", pushControl);
    document.querySelectorAll('input[name="ctrl-mode"]').forEach(function (input) {
      input.addEventListener("change", pushControl);
    });
    document.getElementById("sim-add").addEventListener("click", function () {
      addSimRow(els.simAdd.value, els.oddsPass.value || "345");
    });
    els.simRun.addEventListener("click", runSim);
    els.simWatch.addEventListener("click", function () {
      if (busy) watchStop = true;
      else watchSession();
    });
    document.getElementById("btn-new").addEventListener("click", newSession);
    document.getElementById("btn-rules").addEventListener("click", function () {
      if (els.rules.showModal) els.rules.showModal();
    });
    document.querySelectorAll(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        var name = tab.getAttribute("data-tab");
        var toggle = tab.classList.contains("is-on");
        showTab(name, toggle);
      });
    });
    els.felt.addEventListener("pointerdown", function () {
      if (shortLandscape()) els.side.classList.remove("sheet-open");
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.code !== "Space") return;
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      ev.preventDefault();
      roll();
    });
    pushControl();
    render();
    drawChart([]);
  }

  init();
})();
