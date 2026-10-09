/**
 * Full-table craps rules. Amounts are integer cents.
 * Bonus bets (Low Rolls, High Rolls, Roll 'Em All, Hard Way All Day)
 * settle through CrapsEngine.settleBonusBets — the same code as bubble craps.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./engine.js"));
  } else {
    root.TableEngine = factory(root.CrapsEngine);
  }
})(typeof self !== "undefined" ? self : this, function (Bubble) {
  "use strict";

  var NUMS = [4, 5, 6, 8, 9, 10];
  var HARDWAYS = [4, 6, 8, 10];
  var PASS_EDGE = 7 / 495;
  var DONT_EDGE = 27 / 1980;

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function zeros() {
    return { 4: 0, 5: 0, 6: 0, 8: 0, 9: 0, 10: 0 };
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
      place: zeros(),
      buy: zeros(),
      lay: zeros(),
      big6: 0,
      big8: 0,
      hardways: { 4: 0, 6: 0, 8: 0, 10: 0 },
      any7: 0,
      anyCraps: 0,
      eleven: 0,
      horn: 0,
      ce: 0,
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

  function createGame(options) {
    options = options || {};
    var bank = options.bankroll != null ? options.bankroll : 100000;
    return {
      bankroll: bank,
      startingBankroll: options.startingBankroll != null ? options.startingBankroll : bank,
      phase: "come-out",
      point: null,
      bets: emptyBets(),
      progress: emptyProgress(),
      tableMin: options.tableMin != null ? options.tableMin : 1000,
      oddsPass: options.oddsPass || "345",
      oddsCome: options.oddsCome || "345",
      oddsDont: options.oddsDont || "345",
      oddsDontCome: options.oddsDontCome || "345",
      fieldMode: options.fieldMode || "double",
      vigBuy: options.vigBuy === "upfront" ? "upfront" : "win",
      vigLay: options.vigLay === "win" ? "win" : "upfront",
      hardwaysOffComeOut: !!options.hardwaysOffComeOut,
      placeOnComeOut: !!options.placeOnComeOut,
      comeOddsOffOnComeOut: options.comeOddsOffOnComeOut !== false,
      buyStyle: zeros(),
      layStyle: zeros(),
      vigBank: { buy: zeros(), lay: zeros() },
      control: {
        enabled: false,
        mode: "influence",
        influence: 0,
        srr: 6,
        set: { d1: 3, d2: 3 },
      },
      lastDice: null,
      history: [],
      log: [],
      quiet: !!options.quiet,
      stats: emptyStats(),
    };
  }

  function emptyStats() {
    return {
      rolls: 0,
      sevens: 0,
      sevenOuts: 0,
      pointsMade: 0,
      handRolls: 0,
      longestHand: 0,
      totals: { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0 },
    };
  }

  function dollars(cents) {
    var sign = cents < 0 ? "-" : "";
    var abs = Math.abs(Math.round(cents));
    return sign + "$" + (abs / 100).toFixed(abs % 100 === 0 ? 0 : 2);
  }

  function isComeOut(state) {
    return state.phase === "come-out";
  }

  function winProb(number) {
    if (number === 4 || number === 10) return 1 / 3;
    if (number === 5 || number === 9) return 2 / 5;
    if (number === 6 || number === 8) return 5 / 11;
    return 0;
  }

  function passMultiple(preset, point) {
    if (preset === "10") return 10;
    if (preset === "5") return 5;
    if (point === 4 || point === 10) return 3;
    if (point === 5 || point === 9) return 4;
    if (point === 6 || point === 8) return 5;
    return 0;
  }

  function maxPassOdds(line, point, preset) {
    if (!line || !point) return 0;
    return line * passMultiple(preset || "345", point);
  }

  /** Lay stake that wins the same multiple as the matching pass odds. */
  function maxLayOdds(line, point, preset) {
    if (!line || !point) return 0;
    var winM = passMultiple(preset || "345", point);
    if (point === 4 || point === 10) return winM * line * 2;
    if (point === 5 || point === 9) return Math.floor((winM * line * 3) / 2);
    if (point === 6 || point === 8) return Math.floor((winM * line * 6) / 5);
    return 0;
  }

  function oddsProfit(stake, point) {
    if (!stake) return 0;
    if (point === 4 || point === 10) return stake * 2;
    if (point === 5 || point === 9) return Math.floor((stake * 3) / 2);
    if (point === 6 || point === 8) return Math.floor((stake * 6) / 5);
    return 0;
  }

  function layProfit(stake, point) {
    if (!stake) return 0;
    if (point === 4 || point === 10) return Math.floor(stake / 2);
    if (point === 5 || point === 9) return Math.floor((stake * 2) / 3);
    if (point === 6 || point === 8) return Math.floor((stake * 5) / 6);
    return 0;
  }

  function placeProfit(stake, number) {
    if (number === 4 || number === 10) return Math.floor((stake * 9) / 5);
    if (number === 5 || number === 9) return Math.floor((stake * 7) / 5);
    if (number === 6 || number === 8) return Math.floor((stake * 7) / 6);
    return 0;
  }

  function buyVig(stake) {
    return Math.floor((stake * 5) / 100);
  }

  function layVig(stake, number) {
    return Math.floor((layProfit(stake, number) * 5) / 100);
  }

  function fieldProfit(stake, total, mode) {
    if (total === 2 || total === 12) {
      var mult = 2;
      if (mode === "triple") mult = 3;
      else if (mode === "twelveTriple" && total === 12) mult = 3;
      return stake * mult;
    }
    if (total === 3 || total === 4 || total === 9 || total === 10 || total === 11) return stake;
    return 0;
  }

  function hardwayProfit(stake, number) {
    if (number === 6 || number === 8) return stake * 9;
    if (number === 4 || number === 10) return stake * 7;
    return 0;
  }

  function tableTotal(bets) {
    var t = 0;
    t += bets.pass + bets.passOdds + bets.dontPass + bets.dontPassOdds;
    t += bets.come + bets.dontCome + bets.field + bets.big6 + bets.big8;
    t += bets.any7 + bets.anyCraps + bets.eleven + bets.horn + bets.ce;
    t += bets.small + bets.tall + bets.all + bets.hardAllDay;
    var n;
    for (n in bets.place) t += bets.place[n] + bets.buy[n] + bets.lay[n];
    for (n in bets.hardways) t += bets.hardways[n];
    for (n in bets.hop) t += bets.hop[n];
    for (n in bets.comeBets) t += bets.comeBets[n].amount + bets.comeBets[n].odds;
    for (n in bets.dontComeBets) t += bets.dontComeBets[n].amount + bets.dontComeBets[n].odds;
    return t;
  }

  function wealth(state) {
    return state.bankroll + tableTotal(state.bets);
  }

  function netPL(state) {
    return wealth(state) - state.startingBankroll;
  }

  function describeSpot(spot) {
    var k = spot.kind;
    var n = spot.number;
    if (k === "pass") return "Pass Line";
    if (k === "passOdds") return "Pass Odds";
    if (k === "dontPass") return "Don't Pass";
    if (k === "dontPassOdds") return "Lay Odds";
    if (k === "come") return "Come";
    if (k === "dontCome") return "Don't Come";
    if (k === "comeOdds") return "Come Odds " + n;
    if (k === "dontComeOdds") return "Don't Come Lay " + n;
    if (k === "field") return "Field";
    if (k === "place") return "Place " + n;
    if (k === "buy") return "Buy " + n;
    if (k === "lay") return "Lay " + n;
    if (k === "big6") return "Big 6";
    if (k === "big8") return "Big 8";
    if (k === "hardway") return "Hard " + n;
    if (k === "any7") return "Any Seven";
    if (k === "anyCraps") return "Any Craps";
    if (k === "eleven") return "Yo";
    if (k === "horn") return "Horn";
    if (k === "ce") return "C & E";
    if (k === "hop") return "Hop " + n;
    if (k === "small") return "Low Rolls";
    if (k === "tall") return "High Rolls";
    if (k === "all") return "Roll 'Em All";
    if (k === "hardAllDay") return "Hard Way All Day";
    if (k === "comePoint") return "Come " + n;
    if (k === "dontComePoint") return "Don't Come " + n;
    return k;
  }

  function getAmount(state, spot) {
    var b = state.bets;
    var k = spot.kind;
    var n = spot.number;
    if (k === "pass") return b.pass;
    if (k === "passOdds") return b.passOdds;
    if (k === "dontPass") return b.dontPass;
    if (k === "dontPassOdds") return b.dontPassOdds;
    if (k === "come") return b.come;
    if (k === "dontCome") return b.dontCome;
    if (k === "field") return b.field;
    if (k === "big6") return b.big6;
    if (k === "big8") return b.big8;
    if (k === "any7") return b.any7;
    if (k === "anyCraps") return b.anyCraps;
    if (k === "eleven") return b.eleven;
    if (k === "horn") return b.horn;
    if (k === "ce") return b.ce;
    if (k === "small") return b.small;
    if (k === "tall") return b.tall;
    if (k === "all") return b.all;
    if (k === "hardAllDay") return b.hardAllDay;
    if (k === "place") return b.place[n] || 0;
    if (k === "buy") return b.buy[n] || 0;
    if (k === "lay") return b.lay[n] || 0;
    if (k === "hardway") return b.hardways[n] || 0;
    if (k === "hop") return b.hop[n] || 0;
    if (k === "comeOdds") return (b.comeBets[n] && b.comeBets[n].odds) || 0;
    if (k === "dontComeOdds") return (b.dontComeBets[n] && b.dontComeBets[n].odds) || 0;
    if (k === "comePoint") return (b.comeBets[n] && b.comeBets[n].amount) || 0;
    if (k === "dontComePoint") return (b.dontComeBets[n] && b.dontComeBets[n].amount) || 0;
    return 0;
  }

  function canRemove(spot) {
    var k = spot.kind;
    if (k === "pass" || k === "dontPass" || k === "comePoint" || k === "dontComePoint") return false;
    return true;
  }

  function oddsPresetFor(state, kind) {
    if (kind === "passOdds") return state.oddsPass;
    if (kind === "comeOdds") return state.oddsCome;
    if (kind === "dontPassOdds") return state.oddsDont;
    if (kind === "dontComeOdds") return state.oddsDontCome;
    return "345";
  }

  function validate(state, spot, amount) {
    if (!amount || amount <= 0) return "Bet amount must be positive.";
    var k = spot.kind;
    var n = spot.number;
    var comeOut = isComeOut(state);
    var contract =
      k === "pass" ||
      k === "dontPass" ||
      k === "come" ||
      k === "dontCome" ||
      k === "field" ||
      k === "big6" ||
      k === "big8" ||
      k === "any7" ||
      k === "anyCraps" ||
      k === "eleven" ||
      k === "ce" ||
      k === "hardway" ||
      k === "hop" ||
      k === "small" ||
      k === "tall" ||
      k === "all" ||
      k === "hardAllDay" ||
      k === "place" ||
      k === "buy" ||
      k === "lay";
    if (contract && getAmount(state, spot) === 0 && amount < state.tableMin) {
      return "Table minimum is " + dollars(state.tableMin) + ".";
    }
    if (k === "horn" && getAmount(state, spot) === 0) {
      var hornMin = state.tableMin % 400 === 0 ? state.tableMin : Math.ceil(state.tableMin / 400) * 400;
      if (amount < hornMin) return "Horn minimum is " + dollars(hornMin) + ".";
    }
    if ((k === "place" || k === "buy" || k === "lay" || k === "hardway") && NUMS.indexOf(n) === -1 && HARDWAYS.indexOf(n) === -1) {
      if (k !== "hardway") {
        if (NUMS.indexOf(n) === -1) return "That number is not on the layout.";
      }
    }
    if (k === "place" || k === "buy" || k === "lay") {
      if (NUMS.indexOf(n) === -1) return "That number is not on the layout.";
    }
    if (k === "hardway" && HARDWAYS.indexOf(n) === -1) return "Hardways are 4, 6, 8, and 10.";
    if (k === "hop" && [2, 3, 11, 12].indexOf(n) === -1) return "Hop bets here are 2, 3, 11, and 12.";
    if (k === "pass") {
      if (!comeOut) return "Pass Line is only bet on the come-out.";
      return null;
    }
    if (k === "dontPass") {
      if (!comeOut) return "Don't Pass is only bet on the come-out.";
      return null;
    }
    if (k === "passOdds") {
      if (comeOut || !state.point) return "Odds wait until a point is on.";
      if (!state.bets.pass) return "Take a Pass Line bet before odds.";
      var maxP = maxPassOdds(state.bets.pass, state.point, state.oddsPass);
      if (state.bets.passOdds + amount > maxP) return "Max pass odds are " + dollars(maxP) + ".";
      return null;
    }
    if (k === "dontPassOdds") {
      if (comeOut || !state.point) return "Lay odds wait until a point is on.";
      if (!state.bets.dontPass) return "Take a Don't Pass bet before lay odds.";
      var maxD = maxLayOdds(state.bets.dontPass, state.point, state.oddsDont);
      if (state.bets.dontPassOdds + amount > maxD) return "Max lay odds are " + dollars(maxD) + ".";
      return null;
    }
    if (k === "come") {
      if (comeOut) return "Come is bet after a point is on.";
      return null;
    }
    if (k === "dontCome") {
      if (comeOut) return "Don't Come is bet after a point is on.";
      return null;
    }
    if (k === "comeOdds") {
      var cb = state.bets.comeBets[n];
      if (!cb || !cb.amount) return "No Come bet on " + n + ".";
      var maxC = maxPassOdds(cb.amount, n, state.oddsCome);
      if (cb.odds + amount > maxC) return "Max come odds are " + dollars(maxC) + ".";
      return null;
    }
    if (k === "dontComeOdds") {
      var db = state.bets.dontComeBets[n];
      if (!db || !db.amount) return "No Don't Come bet on " + n + ".";
      var maxDC = maxLayOdds(db.amount, n, state.oddsDontCome);
      if (db.odds + amount > maxDC) return "Max don't come lay odds are " + dollars(maxDC) + ".";
      return null;
    }
    if (k === "horn" && amount % 400 !== 0) return "Horn is posted in $4 units.";
    if (k === "ce" && amount % 2 !== 0) return "C & E splits evenly across the two bets.";
    if (
      k === "field" ||
      k === "big6" ||
      k === "big8" ||
      k === "place" ||
      k === "buy" ||
      k === "lay" ||
      k === "hardway" ||
      k === "any7" ||
      k === "anyCraps" ||
      k === "eleven" ||
      k === "hop" ||
      k === "small" ||
      k === "tall" ||
      k === "all" ||
      k === "hardAllDay" ||
      k === "horn" ||
      k === "ce"
    ) {
      return null;
    }
    return "Unknown bet.";
  }

  function extraCost(state, spot, amount) {
    var n = spot.number;
    if (spot.kind === "buy" && (state.bets.buy[n] ? state.buyStyle[n] : state.vigBuy) === "upfront") {
      if (!state.bets.buy[n] || state.buyStyle[n] === "upfront") return buyVig(amount);
    }
    if (spot.kind === "lay" && (state.bets.lay[n] ? state.layStyle[n] : state.vigLay) === "upfront") {
      if (!state.bets.lay[n] || state.layStyle[n] === "upfront") return layVig(amount, n);
    }
    return 0;
  }

  function applyDelta(state, spot, delta) {
    var b = state.bets;
    var k = spot.kind;
    var n = spot.number;
    if (k === "pass") b.pass += delta;
    else if (k === "passOdds") b.passOdds += delta;
    else if (k === "dontPass") b.dontPass += delta;
    else if (k === "dontPassOdds") b.dontPassOdds += delta;
    else if (k === "come") b.come += delta;
    else if (k === "dontCome") b.dontCome += delta;
    else if (k === "field") b.field += delta;
    else if (k === "big6") b.big6 += delta;
    else if (k === "big8") b.big8 += delta;
    else if (k === "any7") b.any7 += delta;
    else if (k === "anyCraps") b.anyCraps += delta;
    else if (k === "eleven") b.eleven += delta;
    else if (k === "horn") b.horn += delta;
    else if (k === "ce") b.ce += delta;
    else if (k === "small") b.small += delta;
    else if (k === "tall") b.tall += delta;
    else if (k === "all") b.all += delta;
    else if (k === "hardAllDay") b.hardAllDay += delta;
    else if (k === "place") b.place[n] += delta;
    else if (k === "buy") b.buy[n] += delta;
    else if (k === "lay") b.lay[n] += delta;
    else if (k === "hardway") b.hardways[n] += delta;
    else if (k === "hop") b.hop[n] += delta;
    else if (k === "comeOdds") b.comeBets[n].odds += delta;
    else if (k === "dontComeOdds") b.dontComeBets[n].odds += delta;
  }

  function placeBet(state, spot, amount) {
    var err = validate(state, spot, amount);
    if (err) return { ok: false, error: err, state: state, wagered: 0 };
    var vig = extraCost(state, spot, amount);
    var cost = amount + vig;
    if (cost > state.bankroll) return { ok: false, error: "Not enough bankroll.", state: state, wagered: 0 };
    var prior = getAmount(state, spot);
    var n = spot.number;
    if (spot.kind === "buy" && prior === 0) state.buyStyle[n] = state.vigBuy === "upfront" ? "upfront" : "win";
    if (spot.kind === "lay" && prior === 0) state.layStyle[n] = state.vigLay === "upfront" ? "upfront" : "win";
    if (spot.kind === "buy" && state.buyStyle[n] === "upfront") state.vigBank.buy[n] += vig;
    if (spot.kind === "lay" && state.layStyle[n] === "upfront") state.vigBank.lay[n] += vig;
    applyDelta(state, spot, amount);
    if (prior === 0 && (spot.kind === "small" || spot.kind === "tall" || spot.kind === "all" || spot.kind === "hardAllDay")) {
      state.progress[spot.kind] = {};
    }
    state.bankroll -= cost;
    return { ok: true, state: state, wagered: cost, vig: vig };
  }

  function removeBet(state, spot, amount) {
    if (!canRemove(spot)) return { ok: false, error: describeSpot(spot) + " stays until it wins or loses.", state: state };
    var current = getAmount(state, spot);
    if (current <= 0) return { ok: false, error: "Nothing there to take down.", state: state };
    var take = amount == null ? current : Math.min(amount, current);
    if (spot.kind === "horn" && take !== current && take % 400 !== 0) {
      take = Math.floor(take / 400) * 400;
      if (!take) return { ok: false, error: "Horn comes off in $4 units.", state: state };
    }
    var n = spot.number;
    var vigBack = 0;
    if (spot.kind === "buy" && state.vigBank.buy[n]) {
      vigBack = take === current ? state.vigBank.buy[n] : Math.floor((state.vigBank.buy[n] * take) / current);
      state.vigBank.buy[n] -= vigBack;
    }
    if (spot.kind === "lay" && state.vigBank.lay[n]) {
      vigBack = take === current ? state.vigBank.lay[n] : Math.floor((state.vigBank.lay[n] * take) / current);
      state.vigBank.lay[n] -= vigBack;
    }
    applyDelta(state, spot, -take);
    if (getAmount(state, spot) === 0) {
      if (spot.kind === "small" || spot.kind === "tall" || spot.kind === "all" || spot.kind === "hardAllDay") {
        state.progress[spot.kind] = {};
      }
      if (spot.kind === "buy") {
        state.buyStyle[n] = 0;
        state.vigBank.buy[n] = 0;
      }
      if (spot.kind === "lay") {
        state.layStyle[n] = 0;
        state.vigBank.lay[n] = 0;
      }
    }
    state.bankroll += take + vigBack;
    return { ok: true, state: state, returned: take + vigBack };
  }

  function pushLog(state, text) {
    if (state.quiet) return;
    state.log.unshift(text);
    if (state.log.length > 40) state.log.length = 40;
  }

  function slot(map, number) {
    if (!map[number]) map[number] = { amount: 0, odds: 0 };
    return map[number];
  }

  var bonusEvCache = {};

  function solveBonusEv(entries, p7, winProfit) {
    var n = entries.length;
    var N = 1 << n;
    var E = [];
    var i;
    for (i = 0; i < N; i++) E.push(0);
    var iter;
    for (iter = 0; iter < 600; iter++) {
      var next = E.slice();
      var mask;
      for (mask = 0; mask < N - 1; mask++) {
        var acc = p7 * -1;
        var accounted = p7;
        var b;
        for (b = 0; b < n; b++) {
          var p = entries[b].p;
          accounted += p;
          if (mask & (1 << b)) acc += p * E[mask];
          else {
            var nm = mask | (1 << b);
            acc += nm === N - 1 ? p * winProfit : p * next[nm] * 0 + p * E[nm];
          }
        }
        acc += (1 - accounted) * E[mask];
        next[mask] = acc;
      }
      E = next;
    }
    return E[0];
  }

  function bonusPlayerEv(kind) {
    if (bonusEvCache[kind] != null) return bonusEvCache[kind];
    var ev;
    if (kind === "small") {
      ev = solveBonusEv(
        [
          { p: 1 / 36 },
          { p: 2 / 36 },
          { p: 3 / 36 },
          { p: 4 / 36 },
          { p: 5 / 36 },
        ],
        6 / 36,
        30
      );
    } else if (kind === "tall") {
      ev = solveBonusEv(
        [
          { p: 5 / 36 },
          { p: 4 / 36 },
          { p: 3 / 36 },
          { p: 2 / 36 },
          { p: 1 / 36 },
        ],
        6 / 36,
        30
      );
    } else if (kind === "all") {
      ev = solveBonusEv(
        [
          { p: 1 / 36 },
          { p: 2 / 36 },
          { p: 3 / 36 },
          { p: 4 / 36 },
          { p: 5 / 36 },
          { p: 5 / 36 },
          { p: 4 / 36 },
          { p: 3 / 36 },
          { p: 2 / 36 },
          { p: 1 / 36 },
        ],
        6 / 36,
        155
      );
    } else if (kind === "hardAllDay") {
      ev = solveBonusEv(
        [
          { p: 1 / 36 },
          { p: 1 / 36 },
          { p: 1 / 36 },
          { p: 1 / 36 },
        ],
        6 / 36,
        164
      );
    } else ev = 0;
    bonusEvCache[kind] = ev;
    return ev;
  }

  function bonusEdge(kind) {
    return -bonusPlayerEv(kind);
  }

  function placeEdge(number) {
    if (number === 4 || number === 10) return 1 / 15;
    if (number === 5 || number === 9) return 1 / 25;
    if (number === 6 || number === 8) return 1 / 66;
    return 0;
  }

  function fieldEdge(mode) {
    if (mode === "triple") return 0;
    if (mode === "twelveTriple") return 1 / 36;
    return 1 / 18;
  }

  function settle(state, d1, d2) {
    var total = d1 + d2;
    var hard = d1 === d2;
    var comeOut = isComeOut(state);
    var point = state.point;
    var decisions = [];
    var b = state.bets;

    state.stats.rolls += 1;
    state.stats.totals[total] += 1;
    if (total === 7) state.stats.sevens += 1;
    state.stats.handRolls += 1;
    if (state.stats.handRolls > state.stats.longestHand) state.stats.longestHand = state.stats.handRolls;
    state.lastDice = { d1: d1, d2: d2, total: total, hard: hard };
    if (!state.quiet) {
      state.history.unshift(state.lastDice);
      if (state.history.length > 40) state.history.length = 40;
    }

    function note(d) {
      decisions.push(d);
    }

    function loseFlat(label, stake, edge) {
      note({ bet: label, result: "lose", stake: stake, profit: 0, net: -stake, expectedLoss: stake * edge });
    }
    function winFlat(label, stake, profit, edge, stays) {
      if (stays) state.bankroll += profit;
      else state.bankroll += stake + profit;
      note({
        bet: label,
        result: "win",
        stake: stake,
        profit: profit,
        net: profit,
        expectedLoss: stake * edge,
      });
    }

    if (b.any7) {
      if (total === 7) winFlat("Any Seven", b.any7, b.any7 * 4, 1 / 6, false);
      else loseFlat("Any Seven", b.any7, 1 / 6);
      b.any7 = 0;
    }
    if (b.anyCraps) {
      var craps = total === 2 || total === 3 || total === 12;
      if (craps) winFlat("Any Craps", b.anyCraps, b.anyCraps * 7, 1 / 9, false);
      else loseFlat("Any Craps", b.anyCraps, 1 / 9);
      b.anyCraps = 0;
    }
    if (b.eleven) {
      if (total === 11) winFlat("Yo", b.eleven, b.eleven * 15, 1 / 9, false);
      else loseFlat("Yo", b.eleven, 1 / 9);
      b.eleven = 0;
    }
    if (b.ce) {
      var half = b.ce / 2;
      var ceProfit = 0;
      var ceWin = false;
      if (total === 2 || total === 3 || total === 12) {
        ceProfit = half * 6;
        ceWin = true;
      } else if (total === 11) {
        ceProfit = half * 14;
        ceWin = true;
      }
      if (ceWin) winFlat("C & E", b.ce, ceProfit, 1 / 9, false);
      else loseFlat("C & E", b.ce, 1 / 9);
      b.ce = 0;
    }
    if (b.horn) {
      var unit = b.horn / 4;
      var hornProfit = 0;
      if (total === 2 || total === 12) hornProfit = unit * 27;
      else if (total === 3 || total === 11) hornProfit = unit * 12;
      if (hornProfit) winFlat("Horn", b.horn, hornProfit, 1 / 8, false);
      else loseFlat("Horn", b.horn, 1 / 8);
      b.horn = 0;
    }
    [2, 3, 11, 12].forEach(function (hn) {
      var hs = b.hop[hn];
      if (!hs) return;
      var hopEdge = hn === 2 || hn === 12 ? 5 / 36 : 1 / 9;
      var hopPay = hn === 2 || hn === 12 ? 30 : 15;
      if (total === hn) winFlat("Hop " + hn, hs, hs * hopPay, hopEdge, false);
      else loseFlat("Hop " + hn, hs, hopEdge);
      b.hop[hn] = 0;
    });

    if (b.field) {
      var fp = fieldProfit(b.field, total, state.fieldMode);
      var fe = fieldEdge(state.fieldMode);
      if (fp > 0) winFlat("Field", b.field, fp, fe, false);
      else loseFlat("Field", b.field, fe);
      b.field = 0;
    }

    var hardOn = !(comeOut && state.hardwaysOffComeOut);
    if (hardOn) {
      HARDWAYS.forEach(function (hn) {
        var hw = b.hardways[hn];
        if (!hw) return;
        var he = hn === 6 || hn === 8 ? 1 / 11 : 1 / 9;
        if (total === 7 || (total === hn && !hard)) {
          b.hardways[hn] = 0;
          loseFlat("Hard " + hn, hw, he);
        } else if (total === hn && hard) {
          var hp = hardwayProfit(hw, hn);
          state.bankroll += hp;
          note({ bet: "Hard " + hn, result: "win", stake: hw, profit: hp, net: hp, expectedLoss: hw * he });
        }
      });
    }

    if (b.big6) {
      if (total === 6) {
        state.bankroll += b.big6;
        note({ bet: "Big 6", result: "win", stake: b.big6, profit: b.big6, net: b.big6, expectedLoss: b.big6 / 11 });
      } else if (total === 7) {
        loseFlat("Big 6", b.big6, 1 / 11);
        b.big6 = 0;
      }
    }
    if (b.big8) {
      if (total === 8) {
        state.bankroll += b.big8;
        note({ bet: "Big 8", result: "win", stake: b.big8, profit: b.big8, net: b.big8, expectedLoss: b.big8 / 11 });
      } else if (total === 7) {
        loseFlat("Big 8", b.big8, 1 / 11);
        b.big8 = 0;
      }
    }

    var placeOn = !comeOut || state.placeOnComeOut;
    if (placeOn) {
      if (total === 7) {
        NUMS.forEach(function (pn) {
          if (b.place[pn]) {
            loseFlat("Place " + pn, b.place[pn], placeEdge(pn));
            b.place[pn] = 0;
          }
          if (b.buy[pn]) {
            var bs = b.buy[pn];
            var bev = buyResolutionEv(state, pn, bs);
            note({ bet: "Buy " + pn, result: "lose", stake: bs, profit: 0, net: -bs, expectedLoss: -bev });
            b.buy[pn] = 0;
            state.buyStyle[pn] = 0;
            state.vigBank.buy[pn] = 0;
          }
        });
      } else if (NUMS.indexOf(total) !== -1) {
        if (b.place[total]) {
          var pp = placeProfit(b.place[total], total);
          state.bankroll += pp;
          note({
            bet: "Place " + total,
            result: "win",
            stake: b.place[total],
            profit: pp,
            net: pp,
            expectedLoss: b.place[total] * placeEdge(total),
          });
        }
        if (b.buy[total]) {
          var ba = b.buy[total];
          var bp = oddsProfit(ba, total);
          var vig = state.buyStyle[total] === "win" ? buyVig(ba) : 0;
          state.bankroll += bp - vig;
          var bevW = buyResolutionEv(state, total, ba);
          note({
            bet: "Buy " + total,
            result: "win",
            stake: ba,
            profit: bp - vig,
            net: bp - vig,
            vig: vig,
            expectedLoss: -bevW,
          });
        }
      }
    }

    if (total === 7) {
      NUMS.forEach(function (pn) {
        if (!b.lay[pn]) return;
        var ls = b.lay[pn];
        var lp = layProfit(ls, pn);
        var lvig = state.layStyle[pn] === "win" ? layVig(ls, pn) : 0;
        state.bankroll += lp - lvig;
        note({
          bet: "Lay " + pn,
          result: "win",
          stake: ls,
          profit: lp - lvig,
          net: lp - lvig,
          vig: lvig,
          expectedLoss: -layResolutionEv(state, pn, ls),
        });
      });
    } else if (b.lay[total]) {
      var lost = b.lay[total];
      note({
        bet: "Lay " + total,
        result: "lose",
        stake: lost,
        profit: 0,
        net: -lost,
        expectedLoss: -layResolutionEv(state, total, lost),
      });
      b.lay[total] = 0;
      state.layStyle[total] = 0;
      state.vigBank.lay[total] = 0;
    }

    var bonusStart = decisions.length;
    Bubble.settleBonusBets(state, d1, d2, decisions);
    var bi;
    for (bi = bonusStart; bi < decisions.length; bi++) {
      var bd = decisions[bi];
      if (bd.result === "win" || bd.result === "lose") bd.expectedLoss = bd.stake * bonusEdge(bd.kind);
    }

    var comeOddsOn = !(comeOut && state.comeOddsOffOnComeOut);

    function payComePoint(number, s) {
      var oddsOn = comeOddsOn;
      var oProfit = oddsOn ? oddsProfit(s.odds, number) : 0;
      state.bankroll += s.amount * 2 + s.odds + oProfit;
      note({
        bet: "Come " + number,
        result: "win",
        stake: s.amount,
        profit: s.amount + oProfit,
        net: s.amount + oProfit,
        expectedLoss: s.amount * PASS_EDGE,
      });
      delete b.comeBets[number];
    }
    function loseComePoint(number, s) {
      var oddsOn = comeOddsOn;
      if (!oddsOn && s.odds) state.bankroll += s.odds;
      var loseOdds = oddsOn ? s.odds : 0;
      note({
        bet: "Come " + number,
        result: "lose",
        stake: s.amount,
        profit: 0,
        net: -(s.amount + loseOdds),
        expectedLoss: s.amount * PASS_EDGE,
      });
      delete b.comeBets[number];
    }
    function payDontComePoint(number, s) {
      var oProfit = layProfit(s.odds, number);
      state.bankroll += s.amount * 2 + s.odds + oProfit;
      note({
        bet: "Don't Come " + number,
        result: "win",
        stake: s.amount,
        profit: s.amount + oProfit,
        net: s.amount + oProfit,
        expectedLoss: s.amount * DONT_EDGE,
      });
      delete b.dontComeBets[number];
    }
    function loseDontComePoint(number, s) {
      note({
        bet: "Don't Come " + number,
        result: "lose",
        stake: s.amount,
        profit: 0,
        net: -(s.amount + s.odds),
        expectedLoss: s.amount * DONT_EDGE,
      });
      delete b.dontComeBets[number];
    }

    if (total === 7) {
      Object.keys(b.comeBets).forEach(function (key) {
        var s = b.comeBets[key];
        if (s && s.amount) loseComePoint(Number(key), s);
      });
      Object.keys(b.dontComeBets).forEach(function (key) {
        var s = b.dontComeBets[key];
        if (s && s.amount) payDontComePoint(Number(key), s);
      });
    } else {
      if (b.comeBets[total] && b.comeBets[total].amount) payComePoint(total, b.comeBets[total]);
      if (b.dontComeBets[total] && b.dontComeBets[total].amount) loseDontComePoint(total, b.dontComeBets[total]);
    }

    if (b.come) {
      var comeAmt = b.come;
      if (total === 7 || total === 11) {
        state.bankroll += comeAmt * 2;
        b.come = 0;
        note({ bet: "Come", result: "win", stake: comeAmt, profit: comeAmt, net: comeAmt, expectedLoss: comeAmt * PASS_EDGE });
      } else if (total === 2 || total === 3 || total === 12) {
        b.come = 0;
        loseFlat("Come", comeAmt, PASS_EDGE);
      } else {
        b.come = 0;
        slot(b.comeBets, total).amount += comeAmt;
        note({ bet: "Come", result: "move", stake: comeAmt, profit: 0, net: 0, expectedLoss: 0, note: "Moves to " + total });
      }
    }
    if (b.dontCome) {
      var dcAmt = b.dontCome;
      if (total === 7 || total === 11) {
        b.dontCome = 0;
        loseFlat("Don't Come", dcAmt, DONT_EDGE);
      } else if (total === 2 || total === 3) {
        state.bankroll += dcAmt * 2;
        b.dontCome = 0;
        note({
          bet: "Don't Come",
          result: "win",
          stake: dcAmt,
          profit: dcAmt,
          net: dcAmt,
          expectedLoss: dcAmt * DONT_EDGE,
        });
      } else if (total === 12) {
        note({ bet: "Don't Come", result: "push", stake: dcAmt, profit: 0, net: 0, expectedLoss: dcAmt * DONT_EDGE });
      } else {
        b.dontCome = 0;
        slot(b.dontComeBets, total).amount += dcAmt;
        note({ bet: "Don't Come", result: "move", stake: dcAmt, profit: 0, net: 0, expectedLoss: 0, note: "Moves to " + total });
      }
    }

    var narrative = total + ".";
    if (comeOut) {
      if (total === 7 || total === 11) {
        if (b.pass) {
          state.bankroll += b.pass;
          note({ bet: "Pass Line", result: "win", stake: b.pass, profit: b.pass, net: b.pass, expectedLoss: b.pass * PASS_EDGE });
        }
        if (b.dontPass) {
          var dpLose = b.dontPass;
          b.dontPass = 0;
          b.dontPassOdds = 0;
          loseFlat("Don't Pass", dpLose, DONT_EDGE);
        }
        narrative = "Come-out " + total + ". Pass wins.";
      } else if (total === 2 || total === 3 || total === 12) {
        if (b.pass) {
          var pLose = b.pass;
          b.pass = 0;
          loseFlat("Pass Line", pLose, PASS_EDGE);
        }
        if (b.dontPass) {
          if (total === 12) {
            note({
              bet: "Don't Pass",
              result: "push",
              stake: b.dontPass,
              profit: 0,
              net: 0,
              expectedLoss: b.dontPass * DONT_EDGE,
            });
            narrative = "Craps 12. Don't Pass bars, push.";
          } else {
            state.bankroll += b.dontPass;
            note({
              bet: "Don't Pass",
              result: "win",
              stake: b.dontPass,
              profit: b.dontPass,
              net: b.dontPass,
              expectedLoss: b.dontPass * DONT_EDGE,
            });
            narrative = "Craps " + total + ". Don't Pass wins.";
          }
        } else narrative = "Craps " + total + ". Pass loses.";
      } else {
        state.phase = "point";
        state.point = total;
        narrative = "Point is " + total + ".";
      }
    } else if (total === 7) {
      if (b.pass) {
        var lost = b.pass + b.passOdds;
        note({
          bet: "Pass Line",
          result: "lose",
          stake: b.pass,
          profit: 0,
          net: -lost,
          expectedLoss: b.pass * PASS_EDGE,
        });
        b.pass = 0;
        b.passOdds = 0;
      }
      if (b.dontPass) {
        var oProfit = layProfit(b.dontPassOdds, point);
        state.bankroll += b.dontPass + oProfit + b.dontPassOdds;
        note({
          bet: "Don't Pass",
          result: "win",
          stake: b.dontPass,
          profit: b.dontPass + oProfit,
          net: b.dontPass + oProfit,
          expectedLoss: b.dontPass * DONT_EDGE,
        });
        b.dontPassOdds = 0;
      }
      state.phase = "come-out";
      state.point = null;
      state.stats.sevenOuts += 1;
      state.stats.handRolls = 0;
      narrative = "Seven-out.";
    } else if (total === point) {
      if (b.pass) {
        var op = oddsProfit(b.passOdds, point);
        state.bankroll += b.pass + op + b.passOdds;
        note({
          bet: "Pass Line",
          result: "win",
          stake: b.pass,
          profit: b.pass + op,
          net: b.pass + op,
          expectedLoss: b.pass * PASS_EDGE,
        });
        b.passOdds = 0;
      }
      if (b.dontPass) {
        var dpl = b.dontPass + b.dontPassOdds;
        note({
          bet: "Don't Pass",
          result: "lose",
          stake: b.dontPass,
          profit: 0,
          net: -dpl,
          expectedLoss: b.dontPass * DONT_EDGE,
        });
        b.dontPass = 0;
        b.dontPassOdds = 0;
      }
      state.phase = "come-out";
      state.point = null;
      state.stats.pointsMade += 1;
      narrative = "Point " + total + ". Pass wins.";
    } else {
      narrative = total + " rolled. Point stays " + point + ".";
    }

    if (!state.quiet) {
      var bits = [];
      decisions.forEach(function (d) {
        if (d.result === "win") bits.push(d.bet + " +" + dollars(d.profit));
        else if (d.result === "lose") bits.push(d.bet + " " + dollars(d.net));
        else if (d.result === "push") bits.push(d.bet + " push");
        else if (d.result === "move") bits.push(d.bet + " to " + (d.note || "").replace("Moves to ", ""));
      });
      pushLog(state, d1 + "-" + d2 + " (" + total + "). " + narrative + (bits.length ? " " + bits.join(" · ") : ""));
    }

    state.lastDecisions = decisions;
    state.lastNarrative = narrative;
    var expectedLoss = 0;
    decisions.forEach(function (d) {
      if (d.expectedLoss) expectedLoss += d.expectedLoss;
    });
    return { state: state, decisions: decisions, narrative: narrative, dice: state.lastDice, expectedLoss: expectedLoss };
  }

  /** Player's expected net, in cents, for one resolution of this buy. */
  function buyResolutionEv(state, number, stake) {
    var p = winProb(number);
    var profit = oddsProfit(stake, number);
    var style = state.buyStyle[number] === "upfront" ? "upfront" : "win";
    if (style === "upfront") return p * profit + (1 - p) * -stake;
    var vig = buyVig(stake);
    return p * (profit - vig) + (1 - p) * -stake;
  }

  function layResolutionEv(state, number, stake) {
    var pWin = 1 - winProb(number);
    var profit = layProfit(stake, number);
    var style = state.layStyle[number] === "win" ? "win" : "upfront";
    if (style === "upfront") return pWin * profit + (1 - pWin) * -stake;
    var vig = layVig(stake, number);
    return pWin * (profit - vig) + (1 - pWin) * -stake;
  }

  function rollDie(rng) {
    if (typeof rng === "function") return Math.floor(rng() * 6) + 1;
    return Bubble.rollDie();
  }

  function unitRandom(rng) {
    if (typeof rng === "function") return rng();
    var c = typeof crypto !== "undefined" ? crypto : null;
    if (!c && typeof globalThis !== "undefined") c = globalThis.crypto;
    if (c && c.getRandomValues) {
      var buf = new Uint32Array(1);
      c.getRandomValues(buf);
      return buf[0] / 4294967296;
    }
    return Math.random();
  }

  function rollFair(rng) {
    var d1 = rollDie(rng);
    var d2 = rollDie(rng);
    return { d1: d1, d2: d2, total: d1 + d2, hard: d1 === d2 };
  }

  function rollSeven(rng) {
    var ways = [
      [1, 6],
      [2, 5],
      [3, 4],
      [4, 3],
      [5, 2],
      [6, 1],
    ];
    var i = Math.floor(unitRandom(rng) * 6);
    if (i > 5) i = 5;
    return { d1: ways[i][0], d2: ways[i][1], total: 7, hard: false };
  }

  function rollNonSeven(rng) {
    var d = rollFair(rng);
    var guard = 0;
    while (d.total === 7 && guard < 20) {
      d = rollFair(rng);
      guard += 1;
    }
    if (d.total === 7) return { d1: 1, d2: 1, total: 2, hard: true };
    return d;
  }

  /**
   * control: { mode: 'fair'|'influence'|'srr', influence: 0-1, srr: rolls per seven, set: {d1,d2} }
   * Fair mode ignores the set. Influence uses it. SRR changes how often a seven shows.
   */
  function rollDice(control, rng) {
    control = control || { mode: "fair" };
    var mode = control.mode || "fair";
    if (control.enabled === false) mode = "fair";
    var fair = rollFair(rng);
    if (mode === "influence") {
      var p = Number(control.influence) || 0;
      if (p <= 0) return fair;
      var set = control.set || {};
      if (set.d1 < 1 || set.d1 > 6 || set.d2 < 1 || set.d2 > 6) return fair;
      if (unitRandom(rng) < p) {
        return { d1: set.d1, d2: set.d2, total: set.d1 + set.d2, hard: set.d1 === set.d2, controlled: true };
      }
      return fair;
    }
    if (mode === "srr") {
      var srr = Number(control.srr) || 6;
      if (srr < 1.5) srr = 1.5;
      var target = 1 / srr;
      var natural = 1 / 6;
      if (Math.abs(target - natural) < 1e-9) return fair;
      if (fair.total === 7 && target < natural) {
        if (unitRandom(rng) < target / natural) return fair;
        return rollNonSeven(rng);
      }
      if (fair.total !== 7 && target > natural) {
        if (unitRandom(rng) < (target - natural) / (1 - natural)) return rollSeven(rng);
      }
      return fair;
    }
    return fair;
  }

  function rollForState(state, rng) {
    var c = state.control || { enabled: false };
    return rollDice(
      {
        enabled: !!c.enabled,
        mode: c.enabled ? c.mode : "fair",
        influence: c.influence,
        srr: c.srr,
        set: c.set,
      },
      rng
    );
  }

  function listActiveBets(state) {
    var list = [];
    function add(kind, number, amount) {
      if (!amount) return;
      list.push({ kind: kind, number: number, amount: amount, label: describeSpot({ kind: kind, number: number }) });
    }
    var b = state.bets;
    add("pass", null, b.pass);
    add("passOdds", state.point, b.passOdds);
    add("dontPass", null, b.dontPass);
    add("dontPassOdds", state.point, b.dontPassOdds);
    add("come", null, b.come);
    add("dontCome", null, b.dontCome);
    add("field", null, b.field);
    add("big6", null, b.big6);
    add("big8", null, b.big8);
    add("any7", null, b.any7);
    add("anyCraps", null, b.anyCraps);
    add("eleven", null, b.eleven);
    add("horn", null, b.horn);
    add("ce", null, b.ce);
    add("small", null, b.small);
    add("tall", null, b.tall);
    add("all", null, b.all);
    add("hardAllDay", null, b.hardAllDay);
    NUMS.forEach(function (n) {
      add("place", n, b.place[n]);
      add("buy", n, b.buy[n]);
      add("lay", n, b.lay[n]);
    });
    HARDWAYS.forEach(function (n) {
      add("hardway", n, b.hardways[n]);
    });
    [2, 3, 11, 12].forEach(function (n) {
      add("hop", n, b.hop[n]);
    });
    Object.keys(b.comeBets).forEach(function (n) {
      var s = b.comeBets[n];
      add("comePoint", Number(n), s.amount);
      add("comeOdds", Number(n), s.odds);
    });
    Object.keys(b.dontComeBets).forEach(function (n) {
      var s = b.dontComeBets[n];
      add("dontComePoint", Number(n), s.amount);
      add("dontComeOdds", Number(n), s.odds);
    });
    return list;
  }

  function applyOddsPreset(state, preset) {
    state.oddsPass = preset;
    state.oddsCome = preset;
    state.oddsDont = preset;
    state.oddsDontCome = preset;
    return state;
  }

  function measureLineEdge(which, rolls, wager, rng) {
    var game = createGame({ bankroll: 1000000000, tableMin: wager || 1000, quiet: true });
    var handle = 0;
    var net = 0;
    var i;
    for (i = 0; i < rolls; i++) {
      if (which === "pass") {
        if (!game.bets.pass && game.phase === "come-out") placeBet(game, { kind: "pass" }, wager || 1000);
      } else if (!game.bets.dontPass && game.phase === "come-out") {
        placeBet(game, { kind: "dontPass" }, wager || 1000);
      }
      var dice = rollDice({ mode: "fair" }, rng);
      var res = settle(game, dice.d1, dice.d2);
      res.decisions.forEach(function (d) {
        var want = which === "pass" ? "Pass Line" : "Don't Pass";
        if (d.bet === want && d.result !== "move") {
          handle += wager || 1000;
          net += d.net;
        }
      });
    }
    return { handle: handle, net: net, edge: handle ? -net / handle : 0, rolls: rolls };
  }

  return {
    NUMS: NUMS,
    HARDWAYS: HARDWAYS,
    PASS_EDGE: PASS_EDGE,
    DONT_EDGE: DONT_EDGE,
    createGame: createGame,
    clone: clone,
    dollars: dollars,
    isComeOut: isComeOut,
    passMultiple: passMultiple,
    maxPassOdds: maxPassOdds,
    maxLayOdds: maxLayOdds,
    oddsProfit: oddsProfit,
    layProfit: layProfit,
    placeProfit: placeProfit,
    buyVig: buyVig,
    layVig: layVig,
    fieldProfit: fieldProfit,
    hardwayProfit: hardwayProfit,
    tableTotal: tableTotal,
    wealth: wealth,
    netPL: netPL,
    describeSpot: describeSpot,
    getAmount: getAmount,
    canRemove: canRemove,
    validate: validate,
    placeBet: placeBet,
    removeBet: removeBet,
    settle: settle,
    rollDie: rollDie,
    rollDice: rollDice,
    rollForState: rollForState,
    listActiveBets: listActiveBets,
    applyOddsPreset: applyOddsPreset,
    measureLineEdge: measureLineEdge,
    bonusPlayerEv: bonusPlayerEv,
    bonusEdge: bonusEdge,
    placeEdge: placeEdge,
    fieldEdge: fieldEdge,
    winProb: winProb,
    oddsPresetFor: oddsPresetFor,
    buyResolutionEv: buyResolutionEv,
    layResolutionEv: layResolutionEv,
    Bubble: Bubble,
  };
});
