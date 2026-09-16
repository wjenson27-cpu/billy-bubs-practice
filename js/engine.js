/**
 * Craps game engine — pure state + rules, no DOM.
 * Works in the browser (window.CrapsEngine) and in Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CrapsEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var STARTING_BANKROLL = 100000; // cents
  var CHIP_VALUES = [100, 500, 2500, 10000]; // cents: $1, $5, $25, $100
  var PLACE_REGULAR = [4, 5, 6, 8, 9, 10];
  var PLACE_CRAPLESS = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
  var HARDWAYS = [4, 6, 8, 10];
  var SMALL_SET = [2, 3, 4, 5, 6];
  var TALL_SET = [8, 9, 10, 11, 12];
  var ALL_SET = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
  /** Practice pays as "X for 1" (total return including stake). Profit is X-1 to 1. */
  var MAKE_EM_FOR = { small: 31, tall: 31, all: 156, hardAllDay: 165 };
  var LOG_LIMIT = 80;

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function emptyBets() {
    return {
      pass: 0,
      passOdds: 0,
      dontPass: 0,
      dontPassOdds: 0,
      come: 0,
      dontCome: 0,
      comeBets: {},
      dontComeBets: {},
      field: 0,
      place: { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0 },
      buy: { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0 },
      hardways: { 4: 0, 6: 0, 8: 0, 10: 0 },
      any7: 0,
      anyCraps: 0,
      horn: 0,
      eleven: 0,
      hop: { 2: 0, 3: 0, 11: 0, 12: 0 },
      small: 0,
      tall: 0,
      all: 0,
      hardAllDay: 0,
    };
  }

  function emptyProgress() {
    return { small: {}, tall: {}, all: {}, hardAllDay: {} };
  }

  function makeEmSet(kind) {
    if (kind === "small") return SMALL_SET;
    if (kind === "tall") return TALL_SET;
    if (kind === "all") return ALL_SET;
    if (kind === "hardAllDay") return HARDWAYS.slice();
    return [];
  }

  function progressCount(hits, set) {
    var n = 0;
    var i;
    for (i = 0; i < set.length; i++) {
      if (hits && hits[set[i]]) n += 1;
    }
    return n;
  }

  function progressComplete(hits, set) {
    return progressCount(hits, set) === set.length;
  }

  function normalizeState(state) {
    if (!state || !state.bets) return createGame();
    var b = state.bets;
    if (b.small == null) b.small = 0;
    if (b.tall == null) b.tall = 0;
    if (b.all == null) b.all = 0;
    if (b.hardAllDay == null) b.hardAllDay = 0;
    if (b.eleven == null) b.eleven = 0;
    if (!b.hop) b.hop = { 2: 0, 3: 0, 11: 0, 12: 0 };
    [2, 3, 11, 12].forEach(function (n) {
      if (b.hop[n] == null) b.hop[n] = 0;
    });
    if (!b.buy) b.buy = { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0 };
    [2, 3, 4, 5, 6, 8, 9, 10, 11, 12].forEach(function (n) {
      if (b.buy[n] == null) b.buy[n] = 0;
      if (b.place[n] == null) b.place[n] = 0;
    });
    if (!state.progress) state.progress = emptyProgress();
    if (!state.progress.small) state.progress.small = {};
    if (!state.progress.tall) state.progress.tall = {};
    if (!state.progress.all) state.progress.all = {};
    if (!state.progress.hardAllDay) state.progress.hardAllDay = {};
    return state;
  }

  function createGame(options) {
    options = options || {};
    return {
      mode: options.mode === "crapless" ? "crapless" : "regular",
      bankroll: options.bankroll != null ? options.bankroll : STARTING_BANKROLL,
      startingBankroll: options.bankroll != null ? options.bankroll : STARTING_BANKROLL,
      phase: "come-out",
      point: null,
      bets: emptyBets(),
      placeWorkingOnComeOut: false,
      comeOddsOffOnComeOut: true,
      lastDice: null,
      progress: emptyProgress(),
      history: [],
      log: [],
      stats: {
        rolls: 0,
        wins: 0,
        losses: 0,
        pushes: 0,
        currentWinStreak: 0,
        longestWinStreak: 0,
        currentLoseStreak: 0,
        longestLoseStreak: 0,
      },
    };
  }

  function isCrapless(state) {
    return state.mode === "crapless";
  }

  function isComeOut(state) {
    return state.phase === "come-out";
  }

  function tableTotal(bets) {
    var t = bets.pass + bets.passOdds + bets.dontPass + bets.dontPassOdds;
    t += bets.come + bets.dontCome + bets.field;
    t += bets.any7 + bets.anyCraps + bets.horn + (bets.eleven || 0);
    if (bets.hop) {
      t += (bets.hop[2] || 0) + (bets.hop[3] || 0) + (bets.hop[11] || 0) + (bets.hop[12] || 0);
    }
    t += (bets.small || 0) + (bets.tall || 0) + (bets.all || 0) + (bets.hardAllDay || 0);
    var n;
    for (n in bets.place) t += bets.place[n];
    if (bets.buy) {
      for (n in bets.buy) t += bets.buy[n];
    }
    for (n in bets.hardways) t += bets.hardways[n];
    for (n in bets.comeBets) {
      t += bets.comeBets[n].amount + bets.comeBets[n].odds;
    }
    for (n in bets.dontComeBets) {
      t += bets.dontComeBets[n].amount + bets.dontComeBets[n].odds;
    }
    return t;
  }

  function netPL(state) {
    return state.bankroll + tableTotal(state.bets) - state.startingBankroll;
  }

  function dollars(cents) {
    var sign = cents < 0 ? "-" : "";
    var abs = Math.abs(cents);
    return sign + "$" + (abs / 100).toFixed(abs % 100 === 0 ? 0 : 2);
  }

  function placeNumbers(state) {
    return isCrapless(state) ? PLACE_CRAPLESS.slice() : PLACE_REGULAR.slice();
  }

  function passOddsMultiplierProfit(cents, point) {
    switch (point) {
      case 4:
      case 10:
        return cents * 2;
      case 5:
      case 9:
        return Math.floor((cents * 3) / 2);
      case 6:
      case 8:
        return Math.floor((cents * 6) / 5);
      case 2:
      case 12:
        return cents * 6;
      case 3:
      case 11:
        return cents * 3;
      default:
        return 0;
    }
  }

  function dontOddsProfit(cents, point) {
    switch (point) {
      case 4:
      case 10:
        return Math.floor(cents / 2);
      case 5:
      case 9:
        return Math.floor((cents * 2) / 3);
      case 6:
      case 8:
        return Math.floor((cents * 5) / 6);
      default:
        return 0;
    }
  }

  function buyNumbers(state) {
    return placeNumbers(state);
  }

  /** True-odds profit before 5% vig. Same schedule as pass odds. */
  function buyProfit(cents, number) {
    return passOddsMultiplierProfit(cents, number);
  }

  /** 5% of the buy stake, in cents, taken on a win only. */
  function buyVig(cents) {
    return Math.floor((cents * 5) / 100);
  }

  function placeProfit(cents, number) {
    switch (number) {
      case 4:
      case 10:
        return Math.floor((cents * 9) / 5);
      case 5:
      case 9:
        return Math.floor((cents * 7) / 5);
      case 6:
      case 8:
        return Math.floor((cents * 7) / 6);
      case 2:
      case 12:
        return Math.floor((cents * 11) / 2);
      case 3:
      case 11:
        return Math.floor((cents * 11) / 4);
      default:
        return 0;
    }
  }

  function fieldProfit(cents, total) {
    if (total === 2 || total === 12) return cents * 2;
    if (total === 3 || total === 4 || total === 9 || total === 10 || total === 11) {
      return cents;
    }
    return 0;
  }

  function hardwayProfit(cents, number) {
    if (number === 4 || number === 10) return cents * 7;
    if (number === 6 || number === 8) return cents * 9;
    return 0;
  }

  function maxPassOdds(lineAmount, point) {
    var multiple = 3;
    if (point === 4 || point === 10) multiple = 3;
    else if (point === 5 || point === 9) multiple = 4;
    else if (point === 6 || point === 8) multiple = 5;
    else multiple = 3; // 2, 3, 11, 12 in crapless
    return lineAmount * multiple;
  }

  function maxDontOdds(lineAmount, point) {
    // 3-4-5x equivalent lay: cap at 6x the don't line bet.
    if (!point) return 0;
    return lineAmount * 6;
  }

  function comeOutResult(mode, total, isDont) {
    if (mode === "crapless") {
      if (isDont) return { type: "illegal" };
      if (total === 7) return { type: "win" };
      return { type: "point" };
    }
    if (!isDont) {
      if (total === 7 || total === 11) return { type: "win" };
      if (total === 2 || total === 3 || total === 12) return { type: "lose" };
      return { type: "point" };
    }
    if (total === 7 || total === 11) return { type: "lose" };
    if (total === 2 || total === 3) return { type: "win" };
    if (total === 12) return { type: "push" };
    return { type: "point" };
  }

  function pushLog(state, entry) {
    state.log.unshift(entry);
    if (state.log.length > LOG_LIMIT) state.log.length = LOG_LIMIT;
  }

  function recordDecision(state, decisions) {
    var net = 0;
    var i;
    for (i = 0; i < decisions.length; i++) {
      var d = decisions[i];
      net += d.net || 0;
      if (d.result === "win") state.stats.wins += 1;
      else if (d.result === "lose") state.stats.losses += 1;
      else if (d.result === "push") state.stats.pushes += 1;
    }
    if (net > 0) {
      state.stats.currentWinStreak += 1;
      state.stats.currentLoseStreak = 0;
      if (state.stats.currentWinStreak > state.stats.longestWinStreak) {
        state.stats.longestWinStreak = state.stats.currentWinStreak;
      }
    } else if (net < 0) {
      state.stats.currentLoseStreak += 1;
      state.stats.currentWinStreak = 0;
      if (state.stats.currentLoseStreak > state.stats.longestLoseStreak) {
        state.stats.longestLoseStreak = state.stats.currentLoseStreak;
      }
    }
  }

  function canRemove(state, spot) {
    var kind = spot.kind;
    if (kind === "pass" || kind === "dontPass") return false;
    if (kind === "comePoint") return false;
    if (kind === "dontComePoint") return false;
    return true;
  }

  function describeSpot(spot) {
    switch (spot.kind) {
      case "pass":
        return "Pass Line";
      case "passOdds":
        return "Pass Odds";
      case "dontPass":
        return "Don't Pass";
      case "dontPassOdds":
        return "Don't Pass Odds";
      case "come":
        return "Come";
      case "dontCome":
        return "Don't Come";
      case "comeOdds":
        return "Come Odds " + spot.number;
      case "dontComeOdds":
        return "Don't Come Odds " + spot.number;
      case "field":
        return "Field";
      case "place":
        return "Place " + spot.number;
      case "buy":
        return "Buy " + spot.number;
      case "hardway":
        return "Hard " + spot.number;
      case "any7":
        return "Any Seven";
      case "anyCraps":
        return "Any Craps";
      case "eleven":
        return "Eleven (Yo)";
      case "horn":
        return "Horn";
      case "hop":
        if (spot.number === 2) return "Aces";
        if (spot.number === 12) return "Midnight";
        if (spot.number === 3) return "Ace-deuce";
        if (spot.number === 11) return "Yo";
        return "Hop " + spot.number;
      case "small":
        return "Low Rolls";
      case "tall":
        return "High Rolls";
      case "all":
        return "Roll 'Em All";
      case "hardAllDay":
        return "Hard Way All Day";
      default:
        return spot.kind;
    }
  }

  function validatePlace(state, spot, amount, removing) {
    if (amount <= 0) return "Bet amount must be positive.";
    if (!removing && amount > state.bankroll) return "Not enough bankroll.";

    var kind = spot.kind;
    var crapless = isCrapless(state);
    var comeOut = isComeOut(state);

    if (crapless && (kind === "dontPass" || kind === "dontPassOdds" || kind === "dontCome" || kind === "dontComeOdds")) {
      return "Don't bets are not offered in crapless.";
    }

    if (kind === "pass") {
      if (!comeOut) return "Pass Line can only be bet on the come-out.";
      return null;
    }
    if (kind === "dontPass") {
      if (!comeOut) return "Don't Pass can only be bet on the come-out.";
      return null;
    }
    if (kind === "passOdds") {
      if (comeOut || !state.point) return "Odds are only available once a point is on.";
      if (!state.bets.pass) return "Need a Pass Line bet before taking odds.";
      if (!removing) {
        var maxP = maxPassOdds(state.bets.pass, state.point);
        if (state.bets.passOdds + amount > maxP) {
          return "Max pass odds are " + dollars(maxP) + " (3-4-5x).";
        }
      }
      return null;
    }
    if (kind === "dontPassOdds") {
      if (comeOut || !state.point) return "Odds are only available once a point is on.";
      if (!state.bets.dontPass) return "Need a Don't Pass bet before laying odds.";
      if (!removing) {
        var maxD = maxDontOdds(state.bets.dontPass, state.point);
        if (state.bets.dontPassOdds + amount > maxD) {
          return "Max don't odds are " + dollars(maxD) + " (6x lay).";
        }
      }
      return null;
    }
    if (kind === "come") {
      if (comeOut) return "Come is only available when a point is on.";
      return null;
    }
    if (kind === "dontCome") {
      if (comeOut) return "Don't Come is only available when a point is on.";
      return null;
    }
    if (kind === "comeOdds") {
      var cb = state.bets.comeBets[spot.number];
      if (!cb || !cb.amount) return "No Come bet on " + spot.number + ".";
      if (!removing) {
        var maxC = maxPassOdds(cb.amount, spot.number);
        if (cb.odds + amount > maxC) return "Max come odds are " + dollars(maxC) + ".";
      }
      return null;
    }
    if (kind === "dontComeOdds") {
      var db = state.bets.dontComeBets[spot.number];
      if (!db || !db.amount) return "No Don't Come bet on " + spot.number + ".";
      if (!removing) {
        var maxDC = maxDontOdds(db.amount, spot.number);
        if (db.odds + amount > maxDC) return "Max don't come odds are " + dollars(maxDC) + ".";
      }
      return null;
    }
    if (kind === "place") {
      var allowed = placeNumbers(state);
      if (allowed.indexOf(spot.number) === -1) {
        return "Place " + spot.number + " is not offered in this mode.";
      }
      return null;
    }
    if (kind === "buy") {
      var buyAllowed = buyNumbers(state);
      if (buyAllowed.indexOf(spot.number) === -1) {
        return "Buy " + spot.number + " is not offered in this mode.";
      }
      return null;
    }
    if (kind === "hardway") {
      if (HARDWAYS.indexOf(spot.number) === -1) return "Invalid hardway.";
      return null;
    }
    if (kind === "hop") {
      if ([2, 3, 11, 12].indexOf(spot.number) === -1) return "Hop is only 2, 3, 11, or 12.";
      return null;
    }
    if (kind === "horn") {
      if (!removing && amount % 400 !== 0) {
        return "Horn must be in $4 units (one chip on each of 2, 3, 11, 12).";
      }
      return null;
    }
    if (
      kind === "field" ||
      kind === "any7" ||
      kind === "anyCraps" ||
      kind === "eleven" ||
      kind === "small" ||
      kind === "tall" ||
      kind === "all" ||
      kind === "hardAllDay"
    ) {
      return null;
    }
    return "Unknown bet.";
  }

  function applyBetDelta(state, spot, delta) {
    var kind = spot.kind;
    if (kind === "pass") state.bets.pass += delta;
    else if (kind === "passOdds") state.bets.passOdds += delta;
    else if (kind === "dontPass") state.bets.dontPass += delta;
    else if (kind === "dontPassOdds") state.bets.dontPassOdds += delta;
    else if (kind === "come") state.bets.come += delta;
    else if (kind === "dontCome") state.bets.dontCome += delta;
    else if (kind === "field") state.bets.field += delta;
    else if (kind === "any7") state.bets.any7 += delta;
    else if (kind === "anyCraps") state.bets.anyCraps += delta;
    else if (kind === "eleven") state.bets.eleven += delta;
    else if (kind === "horn") state.bets.horn += delta;
    else if (kind === "hop") state.bets.hop[spot.number] += delta;
    else if (kind === "small") state.bets.small += delta;
    else if (kind === "tall") state.bets.tall += delta;
    else if (kind === "all") state.bets.all += delta;
    else if (kind === "hardAllDay") state.bets.hardAllDay += delta;
    else if (kind === "place") state.bets.place[spot.number] += delta;
    else if (kind === "buy") state.bets.buy[spot.number] += delta;
    else if (kind === "hardway") state.bets.hardways[spot.number] += delta;
    else if (kind === "comeOdds") {
      state.bets.comeBets[spot.number].odds += delta;
    } else if (kind === "dontComeOdds") {
      state.bets.dontComeBets[spot.number].odds += delta;
    }
  }

  function getSpotAmount(state, spot) {
    var kind = spot.kind;
    if (kind === "pass") return state.bets.pass;
    if (kind === "passOdds") return state.bets.passOdds;
    if (kind === "dontPass") return state.bets.dontPass;
    if (kind === "dontPassOdds") return state.bets.dontPassOdds;
    if (kind === "come") return state.bets.come;
    if (kind === "dontCome") return state.bets.dontCome;
    if (kind === "field") return state.bets.field;
    if (kind === "any7") return state.bets.any7;
    if (kind === "anyCraps") return state.bets.anyCraps;
    if (kind === "eleven") return state.bets.eleven || 0;
    if (kind === "horn") return state.bets.horn;
    if (kind === "hop") return (state.bets.hop && state.bets.hop[spot.number]) || 0;
    if (kind === "small") return state.bets.small || 0;
    if (kind === "tall") return state.bets.tall || 0;
    if (kind === "all") return state.bets.all || 0;
    if (kind === "hardAllDay") return state.bets.hardAllDay || 0;
    if (kind === "place") return state.bets.place[spot.number] || 0;
    if (kind === "buy") return (state.bets.buy && state.bets.buy[spot.number]) || 0;
    if (kind === "hardway") return state.bets.hardways[spot.number] || 0;
    if (kind === "comeOdds") {
      return (state.bets.comeBets[spot.number] && state.bets.comeBets[spot.number].odds) || 0;
    }
    if (kind === "dontComeOdds") {
      return (state.bets.dontComeBets[spot.number] && state.bets.dontComeBets[spot.number].odds) || 0;
    }
    if (kind === "comePoint") {
      return (state.bets.comeBets[spot.number] && state.bets.comeBets[spot.number].amount) || 0;
    }
    if (kind === "dontComePoint") {
      return (state.bets.dontComeBets[spot.number] && state.bets.dontComeBets[spot.number].amount) || 0;
    }
    return 0;
  }

  function placeBet(state, spot, amount) {
    var next = clone(state);
    var err = validatePlace(next, spot, amount, false);
    if (err) return { ok: false, error: err, state: state };
    var prior = getSpotAmount(next, spot);
    applyBetDelta(next, spot, amount);
    if (prior === 0 && (spot.kind === "small" || spot.kind === "tall" || spot.kind === "all" || spot.kind === "hardAllDay")) {
      next.progress[spot.kind] = {};
    }
    next.bankroll -= amount;
    pushLog(next, {
      type: "bet",
      text: "Bet " + dollars(amount) + " on " + describeSpot(spot) + ".",
    });
    return { ok: true, state: next };
  }

  function removeBet(state, spot, amount) {
    var next = clone(state);
    if (!canRemove(next, spot)) {
      return { ok: false, error: describeSpot(spot) + " cannot be taken down.", state: state };
    }
    var current = getSpotAmount(next, spot);
    if (current <= 0) return { ok: false, error: "No bet to take down.", state: state };
    var take = amount == null ? current : Math.min(amount, current);
    if (spot.kind === "horn" && take % 400 !== 0 && take !== current) {
      take = Math.floor(take / 400) * 400;
      if (!take) return { ok: false, error: "Horn comes down in $4 units.", state: state };
    }
    applyBetDelta(next, spot, -take);
    if (
      getSpotAmount(next, spot) === 0 &&
      (spot.kind === "small" || spot.kind === "tall" || spot.kind === "all" || spot.kind === "hardAllDay")
    ) {
      next.progress[spot.kind] = {};
    }
    next.bankroll += take;
    pushLog(next, {
      type: "bet",
      text: "Took down " + dollars(take) + " from " + describeSpot(spot) + ".",
    });
    return { ok: true, state: next };
  }

  function pickupAllBets(state) {
    var next = clone(state);
    var returned = tableTotal(next.bets);
    next.bankroll += returned;
    next.bets = emptyBets();
    next.progress = emptyProgress();
    if (returned) {
      pushLog(next, { type: "info", text: "Picked up " + dollars(returned) + " from the table." });
    }
    return { state: next, returned: returned };
  }

  function resetSession(state, keepMode) {
    var mode = keepMode ? state.mode : "regular";
    var next = createGame({ mode: mode });
    next.placeWorkingOnComeOut = state.placeWorkingOnComeOut;
    next.comeOddsOffOnComeOut = state.comeOddsOffOnComeOut;
    pushLog(next, { type: "info", text: "New session. Bankroll reset to $1,000." });
    return next;
  }

  function switchMode(state, mode) {
    var picked = pickupAllBets(state);
    var next = picked.state;
    next.mode = mode === "crapless" ? "crapless" : "regular";
    next.phase = "come-out";
    next.point = null;
    next.lastDice = null;
    pushLog(next, {
      type: "info",
      text:
        "Switched to " +
        (next.mode === "crapless" ? "Crapless rules" : "Regular rules") +
        ". Table cleared; bankroll kept.",
    });
    return next;
  }

  function oneRollRepeat() {
    return true;
  }

  function payOneRoll(state, decisions, key, label, stake, profit) {
    if (oneRollRepeat(state)) {
      state.bankroll += profit;
      decisions.push({ bet: label, result: "win", stake: stake, profit: profit, net: profit });
    } else {
      state.bankroll += stake + profit;
      state.bets[key] = 0;
      decisions.push({ bet: label, result: "win", stake: stake, profit: profit, net: profit });
    }
  }

  function loseOneRoll(state, decisions, key, label, stake) {
    state.bets[key] = 0;
    decisions.push({ bet: label, result: "lose", stake: stake, profit: 0, net: -stake });
  }

  function settleHorn(state, decisions, total) {
    var stake = state.bets.horn;
    if (!stake) return;
    var unit = stake / 4;
    var winMult = 0;
    if (total === 2 || total === 12) winMult = 30;
    else if (total === 3 || total === 11) winMult = 15;
    if (winMult) {
      var profit = unit * winMult - unit * 3;
      if (oneRollRepeat(state)) {
        state.bankroll += profit;
      } else {
        state.bankroll += stake + profit;
        state.bets.horn = 0;
      }
      decisions.push({ bet: "Horn", result: "win", stake: stake, profit: profit, net: profit });
    } else {
      loseOneRoll(state, decisions, "horn", "Horn", stake);
    }
  }

  function ensureComeSlot(map, number) {
    if (!map[number]) map[number] = { amount: 0, odds: 0 };
    return map[number];
  }

  function loseLine(state, decisions, label, stake, oddsStake) {
    decisions.push({
      bet: label,
      result: "lose",
      stake: stake + oddsStake,
      profit: 0,
      net: -(stake + oddsStake),
    });
  }

  function payContract(state, decisions, label, lineStake, oddsStake, oddsProfit, stays) {
    var profit = lineStake + oddsProfit;
    if (stays) {
      state.bankroll += profit + oddsStake;
    } else {
      state.bankroll += lineStake + profit + oddsStake;
    }
    decisions.push({
      bet: label,
      result: "win",
      stake: lineStake + oddsStake,
      profit: profit,
      net: profit,
    });
  }

  function settle(state, d1, d2) {
    var next = clone(state);
    var total = d1 + d2;
    var hard = d1 === d2;
    var decisions = [];
    var comeOut = isComeOut(next);
    var crapless = isCrapless(next);
    var point = next.point;

    next.stats.rolls += 1;
    next.lastDice = { d1: d1, d2: d2, total: total, hard: hard };
    next.history.unshift({ d1: d1, d2: d2, total: total });
    if (next.history.length > 16) next.history.length = 16;

    if (next.bets.any7) {
      if (total === 7) payOneRoll(next, decisions, "any7", "Any Seven", next.bets.any7, next.bets.any7 * 4);
      else loseOneRoll(next, decisions, "any7", "Any Seven", next.bets.any7);
    }
    if (next.bets.anyCraps) {
      if (total === 2 || total === 3 || total === 12) {
        payOneRoll(next, decisions, "anyCraps", "Any Craps", next.bets.anyCraps, next.bets.anyCraps * 7);
      } else {
        loseOneRoll(next, decisions, "anyCraps", "Any Craps", next.bets.anyCraps);
      }
    }
    if (next.bets.eleven) {
      if (total === 11) payOneRoll(next, decisions, "eleven", "Eleven (Yo)", next.bets.eleven, next.bets.eleven * 15);
      else loseOneRoll(next, decisions, "eleven", "Eleven (Yo)", next.bets.eleven);
    }
    settleHorn(next, decisions, total);
    if (next.bets.hop) {
      [2, 3, 11, 12].forEach(function (n) {
        var hs = next.bets.hop[n];
        if (!hs) return;
        var hopLabel = describeSpot({ kind: "hop", number: n });
        if (total === n) {
          var hopPay = n === 2 || n === 12 ? 30 : 15;
          var hopProfit = hs * hopPay;
          next.bankroll += hopProfit;
          decisions.push({ bet: hopLabel, result: "win", stake: hs, profit: hopProfit, net: hopProfit });
        } else {
          next.bets.hop[n] = 0;
          decisions.push({ bet: hopLabel, result: "lose", stake: hs, profit: 0, net: -hs });
        }
      });
    }

    if (next.bets.field) {
      var fp = fieldProfit(next.bets.field, total);
      if (fp > 0) payOneRoll(next, decisions, "field", "Field", next.bets.field, fp);
      else loseOneRoll(next, decisions, "field", "Field", next.bets.field);
    }

    HARDWAYS.forEach(function (n) {
      var hw = next.bets.hardways[n];
      if (!hw) return;
      if (total === 7) {
        next.bets.hardways[n] = 0;
        decisions.push({ bet: "Hard " + n, result: "lose", stake: hw, profit: 0, net: -hw });
      } else if (total === n && hard) {
        var hp = hardwayProfit(hw, n);
        next.bankroll += hp;
        decisions.push({
          bet: "Hard " + n,
          result: "win",
          stake: hw,
          profit: hp,
          net: hp,
          note: "All day — bet stays up",
        });
      } else if (total === n && !hard) {
        next.bets.hardways[n] = 0;
        decisions.push({ bet: "Hard " + n, result: "lose", stake: hw, profit: 0, net: -hw });
      }
    });

    function settleMakeEm() {
      var kinds = ["small", "tall", "all"];
      kinds.forEach(function (kind) {
        var stake = next.bets[kind];
        if (!stake) return;
        var set = makeEmSet(kind);
        var label = describeSpot({ kind: kind });
        if (total === 7) {
          next.bets[kind] = 0;
          next.progress[kind] = {};
          decisions.push({ bet: label, result: "lose", stake: stake, profit: 0, net: -stake });
          return;
        }
        if (set.indexOf(total) >= 0) next.progress[kind][total] = true;
        if (progressComplete(next.progress[kind], set)) {
          var forPay = MAKE_EM_FOR[kind];
          var profit = stake * (forPay - 1);
          next.bankroll += stake + profit;
          next.bets[kind] = 0;
          next.progress[kind] = {};
          decisions.push({ bet: label, result: "win", stake: stake, profit: profit, net: profit });
        }
      });
    }
    settleMakeEm();

    (function settleHardAllDay() {
      var stake = next.bets.hardAllDay;
      if (!stake) return;
      if (total === 7) {
        next.bets.hardAllDay = 0;
        next.progress.hardAllDay = {};
        decisions.push({ bet: "Hard Way All Day", result: "lose", stake: stake, profit: 0, net: -stake });
        return;
      }
      if (hard && HARDWAYS.indexOf(total) >= 0) {
        next.progress.hardAllDay[total] = true;
      }
      if (progressComplete(next.progress.hardAllDay, HARDWAYS)) {
        var profit = stake * (MAKE_EM_FOR.hardAllDay - 1);
        next.bankroll += stake + profit;
        next.bets.hardAllDay = 0;
        next.progress.hardAllDay = {};
        decisions.push({ bet: "Hard Way All Day", result: "win", stake: stake, profit: profit, net: profit });
      }
    })();

    var placeWorking = !comeOut || next.placeWorkingOnComeOut;
    var pn, pa;
    if (placeWorking) {
      if (total === 7) {
        for (pn in next.bets.place) {
          pa = next.bets.place[pn];
          if (pa) {
            next.bets.place[pn] = 0;
            decisions.push({ bet: "Place " + pn, result: "lose", stake: pa, profit: 0, net: -pa });
          }
        }
        if (next.bets.buy) {
          for (pn in next.bets.buy) {
            pa = next.bets.buy[pn];
            if (pa) {
              next.bets.buy[pn] = 0;
              decisions.push({ bet: "Buy " + pn, result: "lose", stake: pa, profit: 0, net: -pa });
            }
          }
        }
      } else {
        if (next.bets.place[total]) {
          pa = next.bets.place[total];
          var pp = placeProfit(pa, total);
          next.bankroll += pp;
          decisions.push({ bet: "Place " + total, result: "win", stake: pa, profit: pp, net: pp });
        }
        if (next.bets.buy && next.bets.buy[total]) {
          pa = next.bets.buy[total];
          var bp = buyProfit(pa, total);
          var vig = buyVig(pa);
          var buyNet = bp - vig;
          next.bankroll += buyNet;
          decisions.push({
            bet: "Buy " + total,
            result: "win",
            stake: pa,
            profit: buyNet,
            net: buyNet,
            vig: vig,
          });
        }
      }
    }

    function comeOddsWorking() {
      return !comeOut || !next.comeOddsOffOnComeOut;
    }

    function resolveComePointHit(number) {
      var slot = next.bets.comeBets[number];
      if (slot && slot.amount) {
        var oddsWork = comeOddsWorking();
        var oddsStake = oddsWork ? slot.odds : 0;
        var parkedOdds = oddsWork ? 0 : slot.odds;
        var line = slot.amount;
        var oProfit = passOddsMultiplierProfit(oddsStake, number);
        next.bankroll += line * 2 + oddsStake + oProfit + parkedOdds;
        decisions.push({
          bet: "Come " + number,
          result: "win",
          stake: line + oddsStake,
          profit: line + oProfit,
          net: line + oProfit,
        });
        delete next.bets.comeBets[number];
      }
      var dslot = next.bets.dontComeBets[number];
      if (dslot && dslot.amount) {
        var oddsWorkD = comeOddsWorking();
        var loseOdds = oddsWorkD ? dslot.odds : 0;
        if (!oddsWorkD && dslot.odds) next.bankroll += dslot.odds;
        decisions.push({
          bet: "Don't Come " + number,
          result: "lose",
          stake: dslot.amount + loseOdds,
          profit: 0,
          net: -(dslot.amount + loseOdds),
        });
        delete next.bets.dontComeBets[number];
      }
    }

    function sevenOutComePoints() {
      var key;
      for (key in next.bets.comeBets) {
        var slot = next.bets.comeBets[key];
        if (!slot || !slot.amount) continue;
        var oddsWork = comeOddsWorking();
        var loseOdds = oddsWork ? slot.odds : 0;
        if (!oddsWork && slot.odds) next.bankroll += slot.odds;
        decisions.push({
          bet: "Come " + key,
          result: "lose",
          stake: slot.amount + loseOdds,
          profit: 0,
          net: -(slot.amount + loseOdds),
        });
      }
      next.bets.comeBets = {};
      for (key in next.bets.dontComeBets) {
        var ds = next.bets.dontComeBets[key];
        if (!ds || !ds.amount) continue;
        var oddsW = comeOddsWorking();
        var oddsAmt = oddsW ? ds.odds : 0;
        var parked = oddsW ? 0 : ds.odds;
        var oProfit = dontOddsProfit(oddsAmt, Number(key));
        next.bankroll += ds.amount * 2 + oddsAmt + oProfit + parked;
        decisions.push({
          bet: "Don't Come " + key,
          result: "win",
          stake: ds.amount + oddsAmt,
          profit: ds.amount + oProfit,
          net: ds.amount + oProfit,
        });
      }
      next.bets.dontComeBets = {};
    }

    function moveCome(amount, number) {
      if (!amount) return;
      var slot = ensureComeSlot(next.bets.comeBets, number);
      slot.amount += amount;
      decisions.push({
        bet: "Come",
        result: "move",
        stake: amount,
        profit: 0,
        net: 0,
        note: "Moves to " + number,
      });
    }

    function moveDontCome(amount, number) {
      if (!amount) return;
      var slot = ensureComeSlot(next.bets.dontComeBets, number);
      slot.amount += amount;
      decisions.push({
        bet: "Don't Come",
        result: "move",
        stake: amount,
        profit: 0,
        net: 0,
        note: "Moves to " + number,
      });
    }

    function resolveNewCome() {
      var comeAmt = next.bets.come;
      var dcAmt = next.bets.dontCome;
      if (comeAmt) {
        var cr = comeOutResult(crapless ? "crapless" : "regular", total, false);
        if (cr.type === "win") {
          next.bankroll += comeAmt * 2;
          decisions.push({ bet: "Come", result: "win", stake: comeAmt, profit: comeAmt, net: comeAmt });
          next.bets.come = 0;
        } else if (cr.type === "lose") {
          decisions.push({ bet: "Come", result: "lose", stake: comeAmt, profit: 0, net: -comeAmt });
          next.bets.come = 0;
        } else if (cr.type === "point") {
          next.bets.come = 0;
          moveCome(comeAmt, total);
        }
      }
      if (dcAmt) {
        if (crapless) {
          next.bankroll += dcAmt;
          next.bets.dontCome = 0;
          decisions.push({
            bet: "Don't Come",
            result: "push",
            stake: dcAmt,
            profit: 0,
            net: 0,
            note: "Returned (not offered).",
          });
        } else {
          var dr = comeOutResult("regular", total, true);
          if (dr.type === "win") {
            next.bankroll += dcAmt * 2;
            decisions.push({ bet: "Don't Come", result: "win", stake: dcAmt, profit: dcAmt, net: dcAmt });
            next.bets.dontCome = 0;
          } else if (dr.type === "lose") {
            decisions.push({ bet: "Don't Come", result: "lose", stake: dcAmt, profit: 0, net: -dcAmt });
            next.bets.dontCome = 0;
          } else if (dr.type === "push") {
            decisions.push({ bet: "Don't Come", result: "push", stake: dcAmt, profit: 0, net: 0 });
          } else {
            next.bets.dontCome = 0;
            moveDontCome(dcAmt, total);
          }
        }
      }
    }

    // Come-point numbers resolve on every roll (including a new come-out).
    if (total === 7) sevenOutComePoints();
    else resolveComePointHit(total);
    resolveNewCome();

    var narrative = "";
    var pr = comeOutResult(crapless ? "crapless" : "regular", total, false);
    var dpr = crapless ? { type: "illegal" } : comeOutResult("regular", total, true);

    if (comeOut) {
      if (pr.type === "win") {
        if (next.bets.pass) {
          payContract(next, decisions, "Pass Line", next.bets.pass, 0, 0, true);
        }
        if (next.bets.dontPass) {
          loseLine(next, decisions, "Don't Pass", next.bets.dontPass, 0);
          next.bets.dontPass = 0;
          next.bets.dontPassOdds = 0;
        }
        narrative = crapless
          ? "Come-out 7. Pass wins. Puck stays OFF."
          : "Come-out " + total + ". Winner. Pass wins.";
      } else if (pr.type === "lose") {
        if (next.bets.pass) {
          loseLine(next, decisions, "Pass Line", next.bets.pass, 0);
          next.bets.pass = 0;
        }
        if (dpr.type === "win" && next.bets.dontPass) {
          payContract(next, decisions, "Don't Pass", next.bets.dontPass, 0, 0, true);
        } else if (dpr.type === "push" && next.bets.dontPass) {
          decisions.push({ bet: "Don't Pass", result: "push", stake: next.bets.dontPass, profit: 0, net: 0 });
        }
        narrative = "Craps " + total + ". Pass loses." + (total === 12 ? " Don't Pass bars 12 (push)." : "");
      } else {
        next.phase = "point";
        next.point = total;
        narrative = "Point is " + total + ". Puck ON. Hit " + total + " before 7.";
      }
    } else if (total === 7) {
      if (next.bets.pass) {
        loseLine(next, decisions, "Pass Line", next.bets.pass, next.bets.passOdds);
        next.bets.pass = 0;
        next.bets.passOdds = 0;
      }
      if (next.bets.dontPass) {
        var dpOddsProfit = dontOddsProfit(next.bets.dontPassOdds, point);
        payContract(next, decisions, "Don't Pass", next.bets.dontPass, next.bets.dontPassOdds, dpOddsProfit, true);
        next.bets.dontPassOdds = 0;
      }
      next.phase = "come-out";
      next.point = null;
      next.bets.passOdds = 0;
      next.bets.dontPassOdds = 0;
      narrative = "Seven-out. Line down. Puck OFF.";
    } else if (total === point) {
      if (next.bets.pass) {
        var pOddsProfit = passOddsMultiplierProfit(next.bets.passOdds, point);
        payContract(next, decisions, "Pass Line", next.bets.pass, next.bets.passOdds, pOddsProfit, true);
        next.bets.passOdds = 0;
      }
      if (next.bets.dontPass) {
        loseLine(next, decisions, "Don't Pass", next.bets.dontPass, next.bets.dontPassOdds);
        next.bets.dontPass = 0;
        next.bets.dontPassOdds = 0;
      }
      next.phase = "come-out";
      next.point = null;
      narrative = "Point " + total + " hit. Pass wins. New come-out.";
    } else {
      narrative = total + " rolled. Point remains " + point + ".";
    }

    recordDecision(next, decisions);

    var summaryParts = [];
    decisions.forEach(function (d) {
      if (d.result === "win") summaryParts.push(d.bet + " +" + dollars(d.profit));
      else if (d.result === "lose") summaryParts.push(d.bet + " " + dollars(d.net));
      else if (d.result === "push") summaryParts.push(d.bet + " push");
      else if (d.result === "move") summaryParts.push(d.bet + " → " + (d.note || ""));
    });

    pushLog(next, {
      type: decisions.some(function (d) { return d.result === "win"; })
        ? "win"
        : decisions.some(function (d) { return d.result === "lose"; })
          ? "lose"
          : "info",
      text: "Roll " + d1 + "-" + d2 + " (" + total + "). " + narrative + (summaryParts.length ? " " + summaryParts.join(" · ") : ""),
      dice: { d1: d1, d2: d2, total: total },
      decisions: decisions,
    });

    return { state: next, decisions: decisions, narrative: narrative, dice: next.lastDice };
  }

  function getRandomCrypto() {
    if (typeof globalThis !== "undefined" && globalThis.crypto && globalThis.crypto.getRandomValues) {
      return globalThis.crypto;
    }
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      return crypto;
    }
    if (typeof require === "function") {
      try {
        var nodeCrypto = require("crypto");
        if (nodeCrypto.webcrypto && nodeCrypto.webcrypto.getRandomValues) return nodeCrypto.webcrypto;
      } catch (err) {
        /* browser */
      }
    }
    return null;
  }

  /** One independent fair 1–6. Optional rng() is only for tests; live rolls use crypto. */
  function rollDie(rng) {
    if (typeof rng === "function") {
      return Math.floor(rng() * 6) + 1;
    }
    var c = getRandomCrypto();
    if (c) {
      var buf = new Uint32Array(1);
      var limit = 4294967296 - (4294967296 % 6);
      var n;
      do {
        c.getRandomValues(buf);
        n = buf[0];
      } while (n >= limit);
      return (n % 6) + 1;
    }
    return Math.floor(Math.random() * 6) + 1;
  }

  function rollDice(rng) {
    var d1 = rollDie(rng);
    var d2 = rollDie(rng);
    return { d1: d1, d2: d2, total: d1 + d2, hard: d1 === d2 };
  }

  function snapshotWagers(state) {
    return listActiveBets(state)
      .filter(function (b) {
        return b.kind !== "comePoint" && b.kind !== "dontComePoint";
      })
      .map(function (b) {
        return { kind: b.kind, number: b.number, amount: b.amount };
      });
  }

  function repeatWagers(state, wagerList) {
    var placed = [];
    var skipped = [];
    if (!wagerList || !wagerList.length) {
      return { ok: true, state: state, placed: placed, skipped: skipped };
    }
    var next = state;
    var i;
    for (i = 0; i < wagerList.length; i++) {
      var w = wagerList[i];
      var spot = { kind: w.kind, number: w.number };
      var current = getSpotAmount(next, spot);
      var need = w.amount - current;
      if (need <= 0) {
        skipped.push({ kind: w.kind, number: w.number, reason: "already on" });
        continue;
      }
      var res = placeBet(next, spot, need);
      if (!res.ok) {
        skipped.push({ kind: w.kind, number: w.number, reason: res.error || "skipped" });
        continue;
      }
      next = res.state;
      placed.push({ kind: w.kind, number: w.number, amount: need });
    }
    return { ok: true, state: next, placed: placed, skipped: skipped };
  }

  function listActiveBets(state) {
    var list = [];
    var b = state.bets;
    function add(kind, number, amount, extra) {
      if (amount) list.push({ kind: kind, number: number, amount: amount, label: extra || describeSpot({ kind: kind, number: number }) });
    }
    add("pass", null, b.pass);
    add("passOdds", state.point, b.passOdds);
    add("dontPass", null, b.dontPass);
    add("dontPassOdds", state.point, b.dontPassOdds);
    add("come", null, b.come);
    add("dontCome", null, b.dontCome);
    add("field", null, b.field);
    add("any7", null, b.any7);
    add("anyCraps", null, b.anyCraps);
    add("eleven", null, b.eleven);
    add("horn", null, b.horn);
    if (b.hop) {
      [2, 3, 11, 12].forEach(function (n) {
        add("hop", n, b.hop[n]);
      });
    }
    ["small", "tall", "all", "hardAllDay"].forEach(function (kind) {
      if (!b[kind]) return;
      var set = makeEmSet(kind);
      var got = progressCount(state.progress[kind], set);
      add(kind, null, b[kind], describeSpot({ kind: kind }) + " " + got + "/" + set.length);
    });
    Object.keys(b.place).forEach(function (n) {
      add("place", Number(n), b.place[n]);
    });
    if (b.buy) {
      Object.keys(b.buy).forEach(function (n) {
        add("buy", Number(n), b.buy[n]);
      });
    }
    Object.keys(b.hardways).forEach(function (n) {
        add("hardway", Number(n), b.hardways[n], "Hard " + n + " (all day)");
    });
    Object.keys(b.comeBets).forEach(function (n) {
      var s = b.comeBets[n];
      add("comePoint", Number(n), s.amount, "Come " + n);
      add("comeOdds", Number(n), s.odds);
    });
    Object.keys(b.dontComeBets).forEach(function (n) {
      var s = b.dontComeBets[n];
      add("dontComePoint", Number(n), s.amount, "Don't Come " + n);
      add("dontComeOdds", Number(n), s.odds);
    });
    return list;
  }

  function spotAvailable(state, spot) {
    return validatePlace(state, spot, 100, false) == null;
  }

  return {
    STARTING_BANKROLL: STARTING_BANKROLL,
    CHIP_VALUES: CHIP_VALUES,
    PLACE_REGULAR: PLACE_REGULAR,
    PLACE_CRAPLESS: PLACE_CRAPLESS,
    SMALL_SET: SMALL_SET,
    TALL_SET: TALL_SET,
    ALL_SET: ALL_SET,
    MAKE_EM_FOR: MAKE_EM_FOR,
    HARDWAYS: HARDWAYS,
    normalizeState: normalizeState,
    emptyProgress: emptyProgress,
    makeEmSet: makeEmSet,
    progressCount: progressCount,
    createGame: createGame,
    clone: clone,
    dollars: dollars,
    tableTotal: tableTotal,
    netPL: netPL,
    placeNumbers: placeNumbers,
    buyNumbers: buyNumbers,
    maxPassOdds: maxPassOdds,
    maxDontOdds: maxDontOdds,
    placeProfit: placeProfit,
    buyProfit: buyProfit,
    buyVig: buyVig,
    fieldProfit: fieldProfit,
    passOddsProfit: passOddsMultiplierProfit,
    dontOddsProfit: dontOddsProfit,
    comeOutResult: comeOutResult,
    canRemove: canRemove,
    describeSpot: describeSpot,
    validatePlace: validatePlace,
    placeBet: placeBet,
    removeBet: removeBet,
    pickupAllBets: pickupAllBets,
    resetSession: resetSession,
    switchMode: switchMode,
    settle: settle,
    rollDie: rollDie,
    rollDice: rollDice,
    snapshotWagers: snapshotWagers,
    repeatWagers: repeatWagers,
    listActiveBets: listActiveBets,
    getSpotAmount: getSpotAmount,
    spotAvailable: spotAvailable,
    isComeOut: isComeOut,
    isCrapless: isCrapless,
  };
});
