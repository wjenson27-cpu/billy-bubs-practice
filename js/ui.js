/**
 * DOM rendering and interaction. Talks to CrapsEngine + CrapsDice only.
 */
(function (root) {
  "use strict";

  var E = root.CrapsEngine;
  var Dice = root.CrapsDice;
  var STORAGE_KEY = "craps-practice-v5";

  var state;
  var selectedChip = 500;
  var takeDown = false;
  var rolling = false;
  var lastWagerSet = [];
  var acrossKind = "place";
  var suppressSpotClick = false;

  var els = {};
  var drag = {
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    spot: null,
    sourceChip: null,
    ghost: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function formatMoney(cents) {
    var n = cents / 100;
    var abs = Math.abs(n);
    var body = abs.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: abs % 1 === 0 ? 0 : 2,
    });
    return n < 0 ? "-" + body.replace("-", "") : body;
  }

  function save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          state: state,
          selectedChip: selectedChip,
          lastWagerSet: lastWagerSet,
          acrossKind: acrossKind,
        })
      );
    } catch (err) {
      /* ignore quota / private mode */
    }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  function numberList() {
    return state.mode === "crapless" ? [2, 3, 4, 5, 6, 8, 9, 10, 11, 12] : [4, 5, 6, 8, 9, 10];
  }

  function numberLabel(n) {
    if (n === 6) return "SIX";
    if (n === 9) return "NINE";
    return String(n);
  }

  function placePayLabel(n) {
    if (n === 4 || n === 10) return "9:5";
    if (n === 5 || n === 9) return "7:5";
    if (n === 6 || n === 8) return "7:6";
    if (n === 2 || n === 12) return "11:2";
    if (n === 3 || n === 11) return "11:4";
    return "";
  }

  function buyPayLabel(n) {
    if (n === 4 || n === 10) return "2:1";
    if (n === 5 || n === 9) return "3:2";
    if (n === 6 || n === 8) return "6:5";
    if (n === 2 || n === 12) return "6:1";
    if (n === 3 || n === 11) return "3:1";
    return "";
  }

  function buildNumbers() {
    var rootEl = els.numbers;
    rootEl.innerHTML = "";
    numberList().forEach(function (n) {
      var cell = document.createElement("div");
      cell.className = "number-cell";
      cell.dataset.number = String(n);
      cell.innerHTML =
        '<span class="mini-puck" aria-hidden="true"></span>' +
        '<button type="button" class="spot buy" data-kind="buy" data-number="' +
        n +
        '"><span class="place-k">Buy</span><small>' +
        buyPayLabel(n) +
        '</small><span class="off-tag">OFF</span><span class="spot-amt"></span></button>' +
        '<div class="n">' +
        numberLabel(n) +
        "</div>" +
        '<button type="button" class="spot place" data-kind="place" data-number="' +
        n +
        '"><span class="place-k">Place</span><small>' +
        placePayLabel(n) +
        '</small><span class="off-tag">OFF</span><span class="spot-amt"></span></button>' +
        '<div class="come-tags" data-come-tags="' +
        n +
        '"></div>' +
        '<button type="button" class="spot odds-mini" data-kind="comeOdds" data-number="' +
        n +
        '">Come odds</button>' +
        (state.mode === "regular"
          ? '<button type="button" class="spot odds-mini regular-only" data-kind="dontComeOdds" data-number="' +
            n +
            '">DC odds</button>'
          : "");
      rootEl.appendChild(cell);
    });
  }

  function parseSpot(el) {
    return {
      kind: el.getAttribute("data-kind"),
      number: el.hasAttribute("data-number") ? Number(el.getAttribute("data-number")) : undefined,
    };
  }

  function amountOn(spot) {
    return E.getSpotAmount(state, spot);
  }

  function setSpotVisual(el) {
    var spot = parseSpot(el);
    if (!spot.kind) return;
    var amt = amountOn(spot);
    var label = el.querySelector(".spot-amt");
    if (label) label.innerHTML = amt ? feltChipHtml(amt) : "";
    el.classList.toggle("has-bet", amt > 0);
    el.classList.toggle(
      "is-on",
      (spot.kind === "hardway" || spot.kind === "hop" || spot.kind === "any7") && amt > 0
    );

    var probeAmt = spot.kind === "horn" ? 400 : selectedChip;
    var canAdd = E.validatePlace(state, spot, probeAmt, false) == null;
    var canTake = amt > 0 && E.canRemove(state, spot);
    // Keep chips pointer-interactive even when the spot cannot take another wager
    // (locked Pass during a point, etc.) so they can be dragged off.
    if (amt > 0) {
      el.disabled = false;
    } else {
      el.disabled = takeDown ? true : !canAdd;
    }
    el.classList.toggle("is-locked", amt > 0 && !canAdd && !takeDown);
    el.classList.toggle("can-take", canTake);
    if (spot.kind === "place" || spot.kind === "buy") {
      el.classList.toggle("is-working-off", !E.placeBetsWorking(state));
    }
  }

  function renderSpots() {
    document.querySelectorAll(".spot").forEach(setSpotVisual);
  }

  function renderComeTags() {
    document.querySelectorAll("[data-come-tags]").forEach(function (el) {
      var n = Number(el.getAttribute("data-come-tags"));
      var bits = [];
      var come = state.bets.comeBets[n];
      var dc = state.bets.dontComeBets[n];
      if (come && come.amount) {
        bits.push("<span>C " + formatMoney(come.amount) + (come.odds ? " +odds " + formatMoney(come.odds) : "") + "</span>");
      }
      if (dc && dc.amount) {
        bits.push("<span>DC " + formatMoney(dc.amount) + (dc.odds ? " +lay " + formatMoney(dc.odds) : "") + "</span>");
      }
      el.innerHTML = bits.join("");
    });
  }

  function renderLamps() {
    document.querySelectorAll("[data-progress]").forEach(function (el) {
      var kind = el.getAttribute("data-progress");
      var set = E.makeEmSet(kind);
      var hits = (state.progress && state.progress[kind]) || {};
      el.innerHTML = set
        .map(function (n) {
          var label = kind === "hardAllDay" ? "H" + n : String(n);
          return '<span class="lamp' + (hits[n] ? " is-lit" : "") + '">' + label + "</span>";
        })
        .join("");
    });
  }

  function renderPuck() {
    var on = state.phase === "point";
    els.puck.setAttribute("data-on", on ? "true" : "false");
    els.phaseLabel.textContent = on ? "Point" : "Come-out";
    els.pointLabel.textContent = on ? String(state.point) : "No point";
    document.querySelectorAll(".number-cell").forEach(function (cell) {
      cell.classList.toggle("is-point", on && Number(cell.dataset.number) === state.point);
    });
  }

  function renderRack() {
    els.bankroll.textContent = formatMoney(state.bankroll);
    els.onTable.textContent = formatMoney(E.tableTotal(state.bets));
    var pl = E.netPL(state);
    els.netPl.textContent = (pl > 0 ? "+" : "") + formatMoney(pl);
    els.netPl.classList.toggle("is-up", pl > 0);
    els.netPl.classList.toggle("is-down", pl < 0);
  }

  function renderDiceIdle() {
    var d = state.lastDice || { d1: 5, d2: 2 };
    Dice.renderDie(els.die1, d.d1);
    Dice.renderDie(els.die2, d.d2);
    if (!state.lastDice) {
      els.diceTotal.textContent = "";
      els.diceTotal.classList.add("is-empty");
      paintLastRoll(null);
      return;
    }
    els.diceTotal.classList.remove("is-empty");
    els.diceTotal.textContent = String(d.total != null ? d.total : state.lastDice.total);
    paintLastRoll(d);
  }

  function pipDieHtml(face, extraClass) {
    var n = Number(face);
    if (n < 1 || n > 6) n = 1;
    return (
      '<span class="' +
      (extraClass || "roll-die") +
      '" data-face="' +
      n +
      '" aria-hidden="true"></span>'
    );
  }

  function isHardCombo(d) {
    if (!d) return false;
    if (d.hard != null) return !!d.hard;
    return d.d1 > 0 && d.d1 === d.d2;
  }

  function paintLastRoll(d) {
    if (!els.lastRollBody) return;
    if (!d || !d.d1 || !d.d2) {
      els.lastRollBody.className = "last-roll-body is-empty";
      els.lastRollBody.innerHTML = '<span class="last-roll-empty">Roll to see the combo on the felt</span>';
      if (els.lastRoll) {
        els.lastRoll.classList.remove("is-seven", "is-craps", "is-hard", "has-roll");
        els.lastRoll.removeAttribute("aria-label");
      }
      return;
    }
    var total = d.total != null ? d.total : d.d1 + d.d2;
    var hard = isHardCombo(d);
    var tone = "";
    if (total === 7) tone = " is-seven";
    else if (total === 2 || total === 3 || total === 12) tone = " is-craps";
    els.lastRollBody.className = "last-roll-body";
    els.lastRollBody.innerHTML =
      '<span class="last-roll-dice">' +
      pipDieHtml(d.d1, "roll-die") +
      pipDieHtml(d.d2, "roll-die") +
      "</span>" +
      '<span class="last-roll-read">' +
      "<strong>" +
      d.d1 +
      "–" +
      d.d2 +
      "</strong>" +
      '<span class="last-roll-eq">= ' +
      total +
      "</span>" +
      "</span>" +
      (hard ? '<span class="hard-tag">Hard</span>' : "");
    if (els.lastRoll) {
      els.lastRoll.className = "last-roll has-roll" + tone + (hard ? " is-hard" : "");
      els.lastRoll.setAttribute(
        "aria-label",
        "Last roll " + d.d1 + " and " + d.d2 + " equals " + total + (hard ? ", hard" : "")
      );
    }
  }

  function renderHistory() {
    els.history.innerHTML = state.history
      .slice(0, 12)
      .map(function (h) {
        var d1 = h.d1 || 0;
        var d2 = h.d2 || 0;
        var total = h.total != null ? h.total : d1 + d2;
        var hard = isHardCombo(h);
        var cls = "hist";
        if (total === 7) cls += " is-seven";
        else if (total === 2 || total === 3 || total === 12) cls += " is-craps";
        else cls += " is-point";
        if (hard) cls += " is-hard";
        var faces = d1 && d2 ? d1 + "–" + d2 : "";
        var dice =
          d1 && d2
            ? '<span class="hist-dice">' + pipDieHtml(d1, "hist-die") + pipDieHtml(d2, "hist-die") + "</span>"
            : "";
        return (
          '<span class="' +
          cls +
          '" title="' +
          (faces ? faces + " = " : "") +
          total +
          (hard ? " hard" : "") +
          '">' +
          dice +
          (faces ? '<span class="hist-faces">' + faces + "</span>" : "") +
          '<span class="hist-total">' +
          total +
          "</span></span>"
        );
      })
      .join("");
  }

  function renderBets() {
    var items = E.listActiveBets(state);
    if (!items.length) {
      els.betList.innerHTML = '<li class="empty">No bets on the layout.</li>';
      return;
    }
    els.betList.innerHTML = items
      .map(function (b) {
        var extra = "";
        if (state.betsOff && (b.kind === "place" || b.kind === "buy")) extra = " (off)";
        return "<li><span>" + b.label + extra + "</span><strong>" + formatMoney(b.amount) + "</strong></li>";
      })
      .join("");
  }

  function renderStats() {
    var s = state.stats;
    els.stats.innerHTML =
      "<div><dt>Rolls</dt><dd>" +
      s.rolls +
      "</dd></div><div><dt>This hand</dt><dd>" +
      (state.handRolls || 0) +
      "</dd></div><div><dt>Winning bets</dt><dd>" +
      s.wins +
      "</dd></div><div><dt>Losing bets</dt><dd>" +
      s.losses +
      "</dd></div><div><dt>Win streak</dt><dd>" +
      s.currentWinStreak +
      " (best " +
      s.longestWinStreak +
      ")</dd></div>";
  }

  function renderLog() {
    if (!state.log.length) {
      els.log.innerHTML = '<li class="empty">Place a bet and roll.</li>';
      return;
    }
    els.log.innerHTML = state.log
      .slice(0, 24)
      .map(function (entry) {
        return '<li class="' + entry.type + '">' + entry.text + "</li>";
      })
      .join("");
  }

  function renderChips() {
    els.chips.querySelectorAll(".chip").forEach(function (btn) {
      btn.classList.toggle("is-selected", Number(btn.dataset.cents) === selectedChip);
    });
    els.chipHint.textContent = takeDown
      ? "Take-down mode: tap a removable bet to pick it up."
      : "Billy Bubs " + formatMoney(selectedChip) + " chip. Tap a glowing spot to bet.";
    document.body.classList.toggle("is-take", takeDown);
    els.btnAdd.classList.toggle("is-active", !takeDown);
    els.btnTake.classList.toggle("is-active", takeDown);
  }

  function renderMode() {
    document.documentElement.setAttribute("data-rules", state.mode);
    document.body.setAttribute("data-rules", state.mode);
    if (els.rulesPill) {
      els.rulesPill.textContent = state.mode === "crapless" ? "Crapless rules" : "Regular rules";
    }
    document.querySelectorAll(".mode-btn").forEach(function (btn) {
      var on = btn.getAttribute("data-mode-target") === state.mode;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    els.placeComeout.checked = !!state.placeWorkingOnComeOut;
    els.comeOdds.checked = !!state.comeOddsOffOnComeOut;
  }

  function render() {
    renderMode();
    renderPuck();
    renderRack();
    renderDiceIdle();
    renderHistory();
    renderComeTags();
    renderLamps();
    renderSpots();
    renderBets();
    renderStats();
    renderLog();
    renderChips();
    setRollDisabled(rolling);
    updateRepeatButton();
    fitFelt();
    updateMachineKeys();
    save();
  }

  function toast(text, type) {
    var el = document.createElement("div");
    el.className = "toast " + (type || "");
    el.textContent = text;
    els.toasts.appendChild(el);
    setTimeout(function () {
      el.remove();
    }, 3200);
  }

  function announceDecisions(result) {
    if (!result.decisions.length) {
      toast(result.narrative, "info");
      return;
    }
    result.decisions.forEach(function (d) {
      if (d.result === "win") toast(d.bet + " wins " + formatMoney(d.profit) + (d.note ? " — " + d.note : ""), "win");
      else if (d.result === "lose") toast(d.bet + " loses " + formatMoney(d.stake), "lose");
      else if (d.result === "push") toast(d.bet + " push", "info");
      else if (d.result === "move") toast(d.bet + " " + (d.note || "moves"), "info");
    });
  }

  function applyResult(next) {
    state = next;
    render();
  }

  function rememberWagers() {
    lastWagerSet = E.snapshotWagers(state);
    updateRepeatButton();
  }

  function updateRepeatButton() {
    if (!els.repeatBtn) return;
    var empty = !lastWagerSet || lastWagerSet.length === 0;
    els.repeatBtn.classList.toggle("is-disabled", empty);
    els.repeatBtn.setAttribute("aria-disabled", empty ? "true" : "false");
  }

  function updateMachineKeys() {
    if (els.betsOffBtn) {
      var off = !!state.betsOff;
      els.betsOffBtn.classList.toggle("is-off", off);
      els.betsOffBtn.setAttribute("aria-pressed", off ? "true" : "false");
      if (els.betsOffKicker) els.betsOffKicker.textContent = off ? "OFF" : "Working";
    }
    if (els.acrossKicker) {
      var buyStake = E.billysWayBuyStake(selectedChip);
      var placeStake = E.billysWayPlace68Stake(selectedChip);
      els.acrossKicker.textContent =
        "Buy " + formatMoney(buyStake) + " · 6/8 " + formatMoney(placeStake);
    }
    if (els.handRollsCount) {
      els.handRollsCount.textContent = String(state.handRolls || 0);
    }
    if (els.handRollsCountShoot) {
      els.handRollsCountShoot.textContent = String(state.handRolls || 0);
    }
    if (els.handRollsCountBubble) {
      els.handRollsCountBubble.textContent = String(state.handRolls || 0);
    }
    if (els.startBetBtn) {
      var hasStart = !!(state.startingWagerSet && state.startingWagerSet.length);
      els.startBetBtn.classList.toggle("is-disabled", !hasStart);
      els.startBetBtn.setAttribute("aria-disabled", hasStart ? "false" : "true");
    }
    document.body.classList.toggle("is-bets-off", !!state.betsOff);
  }

  function doBetsOff() {
    if (rolling) return;
    applyResult(E.setBetsOff(state, !state.betsOff));
    toast(
      state.betsOff
        ? "Bets Off — Place and Buy will not win or lose until you turn them on."
        : "Bets On — Place and Buy are working.",
      "info"
    );
  }

  function doBillysWay() {
    if (rolling) return;
    var buyStake = E.billysWayBuyStake(selectedChip);
    var placeStake = E.billysWayPlace68Stake(selectedChip);
    var result = E.placeBillysWay(state, selectedChip);
    applyResult(result.state);
    if (!result.placed.length) {
      toast("Couldn’t place Billy’s Way — not enough credits.", "lose");
      return;
    }
    rememberWagers();
    render();
    var buys = result.placed
      .filter(function (p) {
        return p.kind === "buy";
      })
      .map(function (p) {
        return p.number;
      });
    var places = result.placed
      .filter(function (p) {
        return p.kind === "place";
      })
      .map(function (p) {
        return p.number;
      });
    var parts = [];
    if (buys.length) parts.push("Buy " + formatMoney(buyStake) + " on " + buys.join(", "));
    if (places.length) parts.push("Place " + formatMoney(placeStake) + " on " + places.join(", "));
    var msg = "Billy’s Way: " + parts.join("; ") + ".";
    if (result.skipped.length) {
      var totalNums = result.placed.length + result.skipped.length;
      msg +=
        " Posted " +
        result.placed.length +
        " of " +
        totalNums +
        "." +
        (result.shortfall ? " Short " + formatMoney(result.shortfall) + "." : "");
    }
    toast(msg, "info");
  }

  function doResetStarting() {
    if (rolling) return;
    var result = E.resetToStartingBets(state);
    if (!result.ok) {
      toast(result.error, "info");
      return;
    }
    applyResult(result.state);
    rememberWagers();
    render();
    if (!result.placed.length && !result.taken.length) {
      toast("Already on the starting bet.", "info");
      return;
    }
    var msg = "Reset to starting bet.";
    var blocked = result.skipped.filter(function (s) {
      return s.reason !== "already on";
    });
    if (blocked.length) msg += " Skipped bets you couldn’t restore.";
    toast(msg, "info");
  }

  function doRepeat() {
    if (rolling) return;
    if (!lastWagerSet || !lastWagerSet.length) {
      toast("Nothing to repeat.", "info");
      return;
    }
    var result = E.repeatWagers(state, lastWagerSet);
    applyResult(result.state);
    if (!result.placed.length) {
      toast("Nothing to repeat.", "info");
      return;
    }
    rememberWagers();
    render();
    var msg = result.placed.length === 1 ? "Repeated last bet." : "Repeated " + result.placed.length + " bets.";
    if (result.skipped.some(function (s) { return s.reason !== "already on"; })) {
      msg += " Skipped bets you couldn’t post.";
    }
    toast(msg, "info");
  }

  function chipAmountFor(spot) {
    if (spot.kind === "horn") return selectedChip * 4;
    return selectedChip;
  }

  function onSpotClick(ev) {
    if (suppressSpotClick) {
      suppressSpotClick = false;
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    var btn = ev.target.closest(".spot");
    if (!btn || btn.disabled) return;
    var spot = parseSpot(btn);
    if (!spot.kind) return;

    if (takeDown) {
      var res = E.removeBet(state, spot, amountOn(spot));
      if (!res.ok) {
        toast(res.error, "lose");
        return;
      }
      applyResult(res.state);
      toast("Took down " + E.describeSpot(spot), "info");
      return;
    }

    var amt = chipAmountFor(spot);
    var res = E.placeBet(state, spot, amt);
    if (!res.ok) {
      toast(res.error, "lose");
      return;
    }
    if (spot.kind === "buy" || spot.kind === "place") {
      acrossKind = spot.kind;
    }
    applyResult(res.state);
    rememberWagers();
  }

  function confirmDialog(message, onOk) {
    els.confirmText.textContent = message;
    els.confirm.showModal();
    function done(ev) {
      els.confirm.removeEventListener("close", done);
      if (els.confirm.returnValue === "ok") onOk();
    }
    els.confirm.addEventListener("close", done);
  }

  function switchMode(mode) {
    if (mode === state.mode) return;
    var go = function () {
      applyResult(E.switchMode(state, mode));
      lastWagerSet = [];
      buildNumbers();
      render();
      toast(
        mode === "crapless"
          ? "Crapless: 2, 3, 11, 12 are points. Only 7 wins the come-out."
          : "Regular: 7/11 win Pass; 2, 3, 12 are craps.",
        "info"
      );
    };
    if (E.tableTotal(state.bets) > 0) {
      confirmDialog("Switching modes picks up all bets and keeps your bankroll. Continue?", go);
    } else {
      go();
    }
  }

  function rollButtons() {
    return document.querySelectorAll(".roll-btn");
  }

  function setRollDisabled(disabled) {
    rollButtons().forEach(function (btn) {
      btn.disabled = disabled;
    });
  }

  var LANDSCAPE_BOARD = "(orientation: landscape) and (max-height: 500px) and (max-width: 980px)";
  var PORTRAIT_BOARD = "(orientation: portrait) and (max-width: 700px)";

  function landscapeBoard() {
    return window.matchMedia(LANDSCAPE_BOARD).matches;
  }

  function portraitBoard() {
    return window.matchMedia(PORTRAIT_BOARD).matches;
  }

  function phonePager() {
    return landscapeBoard() || portraitBoard();
  }

  function boardMode() {
    if (portraitBoard()) return "portrait";
    if (landscapeBoard()) return "landscape";
    return "desktop";
  }

  function defaultPaneName() {
    return portraitBoard() ? "bubble" : "felt";
  }

  function fitFelt() {
    var screen = els.table;
    var fit = els.feltFit;
    if (!screen || !fit) return;
    screen.style.transform = "";
    screen.style.width = "";
    screen.style.transformOrigin = "";
    if (!landscapeBoard()) {
      screen.removeAttribute("data-fit");
      return;
    }
    var availH = fit.clientHeight;
    var availW = fit.clientWidth;
    if (availH < 40 || availW < 40) return;
    screen.style.width = availW + "px";
    var natural = screen.scrollHeight;
    if (!natural) return;
    var scale = Math.min(1, (availH - 1) / natural);
    if (scale < 0.995) {
      var layoutW = Math.ceil(availW / scale);
      screen.style.width = layoutW + "px";
      natural = screen.scrollHeight;
      var scaleH = (availH - 1) / natural;
      var scaleW = availW / layoutW;
      scale = Math.min(scaleH, scaleW, 1);
      if (scaleH > scale + 0.03) {
        layoutW = Math.ceil(availW / Math.min(1, scaleH));
        screen.style.width = layoutW + "px";
        natural = screen.scrollHeight;
        scaleH = (availH - 1) / natural;
        scaleW = availW / (screen.offsetWidth || layoutW);
        scale = Math.min(scaleH, scaleW, 1);
      }
    }
    screen.style.transformOrigin = "top left";
    if (scale < 0.995) screen.style.transform = "scale(" + Math.max(scale, 0.2).toFixed(4) + ")";
    screen.setAttribute("data-fit", scale.toFixed(3));
  }

  function activePaneName() {
    var pager = els.pager;
    if (!pager) return "felt";
    var width = pager.clientWidth || 1;
    var index = Math.round(pager.scrollLeft / width);
    if (index < 0) index = 0;
    var panes = pager.querySelectorAll(".board-pane");
    var pane = panes[index] || panes[0];
    return pane ? pane.getAttribute("data-pane") || "felt" : "felt";
  }

  function updatePaneDots() {
    if (!els.paneSwitch) return;
    var active = phonePager() ? activePaneName() : "felt";
    els.paneSwitch.querySelectorAll(".pane-dot").forEach(function (btn) {
      var on = btn.getAttribute("data-pane") === active;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    els.paneSwitch.classList.toggle("is-bubble", active === "bubble");
    document.body.setAttribute("data-board-pane", active);
    document.body.setAttribute("data-board-mode", boardMode());
    if (els.pager) {
      els.pager.querySelectorAll(".board-pane").forEach(function (pane) {
        var on = !phonePager() || pane.getAttribute("data-pane") === active;
        if (phonePager()) pane.setAttribute("aria-hidden", on ? "false" : "true");
        else pane.removeAttribute("aria-hidden");
      });
    }
  }

  function setPane(name, behavior) {
    var pager = els.pager;
    if (!pager || !phonePager()) return;
    var panes = pager.querySelectorAll(".board-pane");
    var index = 0;
    for (var i = 0; i < panes.length; i++) {
      if (panes[i].getAttribute("data-pane") === name) index = i;
    }
    var left = index * (pager.clientWidth || 0);
    if (behavior === "auto") {
      var previous = pager.style.scrollBehavior;
      pager.style.scrollBehavior = "auto";
      pager.scrollLeft = left;
      pager.style.scrollBehavior = previous;
      updatePaneDots();
    } else {
      pager.scrollTo({ left: left, behavior: "smooth" });
    }
  }

  function setupBoardPager() {
    if (!els.pager) return;
    var raf = 0;
    var gestureDepth = 0;
    var heldPane = null;
    var orientPending = false;
    var boardModeNow = "";

    function pagerSettled() {
      var width = els.pager.clientWidth || 1;
      var left = els.pager.scrollLeft;
      return Math.abs(left - Math.round(left / width) * width) < 2;
    }

    function snapOrientationDefault() {
      if (!phonePager()) {
        els.pager.scrollLeft = 0;
        updatePaneDots();
        return;
      }
      setPane(defaultPaneName(), "auto");
    }

    function finishGesture() {
      gestureDepth = Math.max(0, gestureDepth - 1);
      if (gestureDepth > 0) return;
      if (!orientPending) return;
      if (!pagerSettled()) return;
      orientPending = false;
      heldPane = null;
      snapOrientationDefault();
    }

    function syncBoardMode() {
      var next = boardMode();
      var changed = next !== boardModeNow;
      boardModeNow = next;
      fitFelt();
      if (!changed) {
        updatePaneDots();
        return;
      }
      var apply = function () {
        fitFelt();
        if (boardMode() === "desktop") {
          els.pager.scrollLeft = 0;
          orientPending = false;
          updatePaneDots();
          return;
        }
        if (gestureDepth > 0) {
          orientPending = true;
          if (heldPane) setPane(heldPane, "auto");
          else updatePaneDots();
          return;
        }
        orientPending = false;
        snapOrientationDefault();
      };
      apply();
      requestAnimationFrame(apply);
    }

    els.pager.addEventListener(
      "scroll",
      function () {
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = 0;
          updatePaneDots();
          if (orientPending && gestureDepth === 0 && pagerSettled()) finishGesture();
        });
      },
      { passive: true }
    );
    els.pager.addEventListener("scrollend", function () {
      if (!phonePager()) return;
      var width = els.pager.clientWidth || 1;
      var index = Math.round(els.pager.scrollLeft / width);
      var target = index * width;
      if (Math.abs(els.pager.scrollLeft - target) > 1) {
        els.pager.scrollTo({ left: target, behavior: "auto" });
      }
      updatePaneDots();
      if (orientPending && gestureDepth === 0) {
        orientPending = false;
        heldPane = null;
        snapOrientationDefault();
      }
    });
    els.pager.addEventListener("pointerdown", function () {
      gestureDepth += 1;
      heldPane = activePaneName();
    });
    window.addEventListener("pointerup", finishGesture);
    window.addEventListener("pointercancel", finishGesture);
    if (els.paneSwitch) {
      els.paneSwitch.addEventListener("click", function (ev) {
        var btn = ev.target.closest(".pane-dot");
        if (!btn) return;
        orientPending = false;
        setPane(btn.getAttribute("data-pane"), "smooth");
      });
    }
    window.addEventListener("resize", function () {
      if (boardMode() !== boardModeNow) syncBoardMode();
      else {
        fitFelt();
        updatePaneDots();
      }
    });
    window.addEventListener("orientationchange", syncBoardMode);
    window.matchMedia(PORTRAIT_BOARD).addEventListener("change", syncBoardMode);
    window.matchMedia(LANDSCAPE_BOARD).addEventListener("change", syncBoardMode);
    if (window.ResizeObserver && els.feltFit) {
      var observer = new ResizeObserver(function () {
        fitFelt();
      });
      observer.observe(els.feltFit);
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        fitFelt();
      });
    }
    syncBoardMode();
  }

  function doRoll() {
    if (rolling) return;
    rolling = true;
    setRollDisabled(true);
    rememberWagers();
    var dice = E.rollDice();
    paintLastRoll(dice);
    Dice.animateRoll([els.die1, els.die2], dice, 780, function () {
      var result = E.settle(state, dice.d1, dice.d2);
      rolling = false;
      applyResult(result.state);
      els.diceTotal.classList.remove("is-empty");
      els.diceTotal.textContent = String(dice.total);
      announceDecisions(result);
      if (state.bankroll <= 0 && E.tableTotal(state.bets) === 0) {
        toast("Busted. Start a new session when you're ready.", "lose");
      }
    });
  }

  function chipTier(cents) {
    if (cents >= 10000) return "100";
    if (cents >= 2500) return "25";
    if (cents >= 500) return "5";
    return "1";
  }

  function feltChipHtml(cents) {
    var wide = formatMoney(cents).length > 4 ? " is-wide" : "";
    return (
      '<span class="felt-chip is-' +
      chipTier(cents) +
      wide +
      '" title="Billy Bubs">' +
      '<span class="chip-rim" aria-hidden="true"></span>' +
      '<span class="chip-inset">' +
      '<span class="chip-mascot" aria-hidden="true"></span>' +
      '<span class="chip-bb">BB</span>' +
      '<span class="chip-core">' +
      formatMoney(cents) +
      "</span></span></span>"
    );
  }

  function buildChips() {
    els.chips.innerHTML = "";
    [
      { cents: 100, label: "$1" },
      { cents: 500, label: "$5" },
      { cents: 2500, label: "$25" },
      { cents: 10000, label: "$100" },
    ].forEach(function (chip) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.dataset.cents = String(chip.cents);
      btn.dataset.value = String(chip.cents / 100);
      btn.setAttribute("aria-label", "Billy Bubs " + chip.label + " chip");
      btn.innerHTML =
        '<span class="chip-rim" aria-hidden="true"></span>' +
        '<span class="chip-inset">' +
        '<span class="chip-mascot" aria-hidden="true"></span>' +
        '<span class="chip-bb">BB</span>' +
        '<span class="chip-core">' +
        chip.label +
        "</span></span>";
      btn.addEventListener("click", function () {
        selectedChip = chip.cents;
        takeDown = false;
        renderChips();
        renderSpots();
        updateMachineKeys();
      });
      els.chips.appendChild(btn);
    });
  }

  function pointInRect(x, y, rect) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function isOffTable(x, y) {
    if (els.dropOff && pointInRect(x, y, els.dropOff.getBoundingClientRect())) return true;
    if (!els.table) return true;
    return !pointInRect(x, y, els.table.getBoundingClientRect());
  }

  function endChipDrag(clientX, clientY, cancelled) {
    var spot = drag.spot;
    var source = drag.sourceChip;
    var ghost = drag.ghost;
    var moved = drag.active;
    drag.active = false;
    drag.pointerId = null;
    drag.spot = null;
    drag.sourceChip = null;
    drag.ghost = null;
    document.body.classList.remove("is-chip-drag");
    if (els.dropOff) els.dropOff.classList.remove("is-hot");
    if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
    if (source) source.classList.remove("is-source");
    if (!moved || cancelled || !spot) return false;
    if (!isOffTable(clientX, clientY)) return true;
    var res = E.removeBet(state, spot, amountOn(spot));
    if (!res.ok) {
      toast(res.error, "lose");
      return true;
    }
    applyResult(res.state);
    toast("Took down " + E.describeSpot(spot), "info");
    return true;
  }

  function onChipPointerDown(ev) {
    if (rolling) return;
    var chip = ev.target.closest(".felt-chip");
    if (!chip) return;
    var btn = chip.closest(".spot");
    if (!btn) return;
    var spot = parseSpot(btn);
    if (!spot.kind) return;
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    drag.pointerId = ev.pointerId;
    drag.startX = ev.clientX;
    drag.startY = ev.clientY;
    drag.spot = spot;
    drag.sourceChip = chip;
    drag.active = false;
    drag.ghost = null;
    try {
      chip.setPointerCapture(ev.pointerId);
    } catch (err) {
      /* ignore */
    }
  }

  function onChipPointerMove(ev) {
    if (drag.pointerId !== ev.pointerId || !drag.spot) return;
    var dx = ev.clientX - drag.startX;
    var dy = ev.clientY - drag.startY;
    if (!drag.active) {
      if (dx * dx + dy * dy < 64) return;
      drag.active = true;
      document.body.classList.add("is-chip-drag");
      if (drag.sourceChip) drag.sourceChip.classList.add("is-source");
      var ghost = document.createElement("div");
      ghost.className = "chip-ghost";
      ghost.innerHTML = drag.sourceChip ? drag.sourceChip.outerHTML : "";
      document.body.appendChild(ghost);
      drag.ghost = ghost;
    }
    if (drag.ghost) {
      drag.ghost.style.left = ev.clientX + "px";
      drag.ghost.style.top = ev.clientY + "px";
    }
    if (els.dropOff) {
      els.dropOff.classList.toggle("is-hot", isOffTable(ev.clientX, ev.clientY));
    }
    ev.preventDefault();
  }

  function onChipPointerUp(ev) {
    if (drag.pointerId !== ev.pointerId) return;
    var wasDrag = drag.active;
    var removed = endChipDrag(ev.clientX, ev.clientY, false);
    if (wasDrag || removed) {
      suppressSpotClick = true;
      ev.preventDefault();
    }
  }

  function onChipPointerCancel(ev) {
    if (drag.pointerId !== ev.pointerId) return;
    endChipDrag(ev.clientX, ev.clientY, true);
    suppressSpotClick = true;
  }

  function bind() {
    document.body.addEventListener("click", onSpotClick);
    document.body.addEventListener("pointerdown", onChipPointerDown);
    document.body.addEventListener("pointermove", onChipPointerMove);
    document.body.addEventListener("pointerup", onChipPointerUp);
    document.body.addEventListener("pointercancel", onChipPointerCancel);

    document.querySelectorAll(".mode-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        switchMode(btn.getAttribute("data-mode-target"));
      });
    });

    els.btnAdd.addEventListener("click", function () {
      takeDown = false;
      renderChips();
      renderSpots();
    });
    els.btnTake.addEventListener("click", function () {
      takeDown = true;
      renderChips();
      renderSpots();
    });
    rollButtons().forEach(function (btn) {
      btn.addEventListener("click", doRoll);
    });
    els.repeatBtn.addEventListener("click", doRepeat);
    els.betsOffBtn.addEventListener("click", doBetsOff);
    els.acrossBtn.addEventListener("click", doBillysWay);
    els.startBetBtn.addEventListener("click", doResetStarting);
    window.addEventListener("keydown", function (ev) {
      if (ev.target && (ev.target.tagName === "INPUT" || ev.target.tagName === "TEXTAREA")) return;
      if (phonePager() && (ev.key === "ArrowRight" || ev.key === "ArrowLeft")) {
        ev.preventDefault();
        setPane(ev.key === "ArrowRight" ? "bubble" : "felt");
        return;
      }
      if (ev.code !== "Space") return;
      if (ev.target && ev.target.tagName === "BUTTON") return;
      ev.preventDefault();
      doRoll();
    });

    els.placeComeout.addEventListener("change", function () {
      state = E.clone(state);
      state.placeWorkingOnComeOut = els.placeComeout.checked;
      render();
    });
    els.comeOdds.addEventListener("change", function () {
      state = E.clone(state);
      state.comeOddsOffOnComeOut = els.comeOdds.checked;
      render();
    });

    els.btnHelp.addEventListener("click", function () {
      els.help.showModal();
    });
    els.btnReset.addEventListener("click", function () {
      confirmDialog("Reset bankroll to $1,000 and clear this session?", function () {
        applyResult(E.resetSession(state, true));
        lastWagerSet = [];
        buildNumbers();
        render();
        toast("New session. Good luck — it's only practice.", "info");
      });
    });
  }

  function cacheEls() {
    els.numbers = $("numbers");
    els.puck = $("puck");
    els.phaseLabel = $("phase-label");
    els.pointLabel = $("point-label");
    els.die1 = $("die1");
    els.die2 = $("die2");
    els.diceTotal = $("dice-total");
    els.lastRoll = $("last-roll");
    els.lastRollBody = $("last-roll-body");
    els.history = $("history-rail");
    els.bankroll = $("bankroll");
    els.onTable = $("on-table");
    els.netPl = $("net-pl");
    els.chips = $("chips");
    els.chipHint = $("chip-hint");
    els.btnAdd = $("btn-add");
    els.btnTake = $("btn-take");
    els.rollBtn = $("roll-btn");
    els.repeatBtn = $("repeat-btn");
    els.betsOffBtn = $("bets-off-btn");
    els.betsOffKicker = $("bets-off-kicker");
    els.acrossBtn = $("across-btn");
    els.acrossKicker = $("across-kicker");
    els.handRollsCount = $("hand-rolls-count");
    els.handRollsCountShoot = $("hand-rolls-count-shoot");
    els.startBetBtn = $("start-bet-btn");
    els.dropOff = $("drop-off");
    els.table = $("table");
    els.betList = $("bet-list");
    els.stats = $("stats");
    els.log = $("log");
    els.toasts = $("toasts");
    els.help = $("help");
    els.confirm = $("confirm");
    els.confirmText = $("confirm-text");
    els.placeComeout = $("opt-place-comeout");
    els.comeOdds = $("opt-come-odds");
    els.btnHelp = $("btn-help");
    els.btnReset = $("btn-reset");
    els.rulesPill = $("rules-pill");
    els.pager = $("board-pager");
    els.feltFit = $("felt-fit");
    els.paneSwitch = $("pane-switch");
    els.handRollsCountBubble = $("hand-rolls-count-bubble");
  }

  var COACH_KEY = "bb-coach-dismissed-v1";

  function setupCoach() {
    var card = $("coach-card");
    var dismiss = $("coach-dismiss");
    if (!card) return;
    var seen = false;
    try { seen = localStorage.getItem(COACH_KEY) === "1"; } catch (_) {}
    if (seen) return;
    card.hidden = false;
    if (dismiss) {
      dismiss.addEventListener("click", function () {
        card.hidden = true;
        try { localStorage.setItem(COACH_KEY, "1"); } catch (_) {}
      });
    }
  }

  function start() {
    cacheEls();
    var saved = load();
    if (saved && saved.state && saved.state.bets) {
      state = E.normalizeState(saved.state);
      selectedChip = saved.selectedChip || 500;
      lastWagerSet = Array.isArray(saved.lastWagerSet) ? saved.lastWagerSet : E.snapshotWagers(state);
      acrossKind = saved.acrossKind === "buy" ? "buy" : "place";
    } else {
      state = E.createGame();
      lastWagerSet = [];
    }
    buildChips();
    buildNumbers();
    bind();
    render();
    setupBoardPager();
    setupCoach();
  }

  root.CrapsUI = { start: start };
})(typeof self !== "undefined" ? self : this);
