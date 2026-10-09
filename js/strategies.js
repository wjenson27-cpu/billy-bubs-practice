/**
 * Strategy library, coach/auto actions, and the session simulator.
 * The simulator calls TableEngine — the same rules as the live table.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./table-engine.js"));
  } else {
    root.CrapsStrategies = factory(root.TableEngine);
  }
})(typeof self !== "undefined" ? self : this, function (E) {
  "use strict";

  function place68(min) {
    var unit = 600;
    return Math.max(1, Math.ceil(min / unit)) * unit;
  }

  function level(min) {
    return Math.max(1, Math.ceil(min / 500));
  }

  function comePointCount(state) {
    var n = 0;
    var k;
    for (k in state.bets.comeBets) {
      if (state.bets.comeBets[k] && state.bets.comeBets[k].amount) n += 1;
    }
    return n;
  }

  function established(state) {
    return (state.bets.pass ? 1 : 0) + comePointCount(state);
  }

  function place(kind, amount, number) {
    return { op: "place", kind: kind, number: number, amount: amount };
  }

  function remove(kind, amount, number) {
    return { op: "remove", kind: kind, number: number, amount: amount };
  }

  function line(state, kind) {
    if (state.phase === "come-out" && !state.bets[kind]) return [place(kind, state.tableMin)];
    return [];
  }

  function fillPassOdds(state) {
    if (state.phase !== "point" || !state.bets.pass) return [];
    var max = E.maxPassOdds(state.bets.pass, state.point, state.oddsPass);
    var need = max - state.bets.passOdds;
    if (need > state.bankroll) need = state.bankroll;
    if (need > 0) return [place("passOdds", need)];
    return [];
  }

  function fillDontOdds(state) {
    if (state.phase !== "point" || !state.bets.dontPass) return [];
    var max = E.maxLayOdds(state.bets.dontPass, state.point, state.oddsDont);
    var need = max - state.bets.dontPassOdds;
    if (need > state.bankroll) need = state.bankroll;
    if (need > 0) return [place("dontPassOdds", need)];
    return [];
  }

  function fillComeOdds(state) {
    var out = [];
    var k;
    for (k in state.bets.comeBets) {
      var s = state.bets.comeBets[k];
      if (!s || !s.amount) continue;
      var n = Number(k);
      var max = E.maxPassOdds(s.amount, n, state.oddsCome);
      var need = max - s.odds;
      if (need > state.bankroll) need = state.bankroll;
      if (need > 0) out.push(place("comeOdds", need, n));
    }
    return out;
  }

  function ensurePlace(state, number, amount) {
    var have = state.bets.place[number] || 0;
    if (have === amount) return [];
    if (have > amount) return [remove("place", have - amount, number)];
    return [place("place", amount - have, number)];
  }

  function lostBet(state, name) {
    var list = state.lastDecisions || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].bet === name && list[i].result === "lose") return list[i];
    }
    return null;
  }

  function wonBet(state, name) {
    var list = state.lastDecisions || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].bet === name && list[i].result === "win") return list[i];
    }
    return null;
  }

  var STRATEGIES = [
    {
      id: "passMax",
      name: "Pass line + max odds",
      risk: "Medium",
      summary:
        "Bet the pass line. When a point is on, take the full odds this table allows. Odds are a fair bet, so the more you take, the less of your total action the edge applies to.",
      edges: [
        { bet: "Pass line", edge: "1.41%" },
        { bet: "Odds", edge: "0%" },
      ],
      decide: function (state) {
        return line(state, "pass").concat(fillPassOdds(state));
      },
    },
    {
      id: "dontMax",
      name: "Don't pass + lay odds",
      risk: "Medium",
      summary:
        "Bet against the shooter. A come-out 12 is a push. After a point, lay the full odds. You win when the seven shows before the point.",
      edges: [
        { bet: "Don't pass", edge: "1.36%" },
        { bet: "Lay odds", edge: "0%" },
      ],
      decide: function (state) {
        return line(state, "dontPass").concat(fillDontOdds(state));
      },
    },
    {
      id: "comeBet",
      name: "Come betting",
      risk: "Medium",
      summary:
        "Pass line, then keep two come bets working, each with full odds. When one come bet wins, put another in its place.",
      edges: [
        { bet: "Pass and come", edge: "1.41%" },
        { bet: "Odds", edge: "0%" },
      ],
      decide: function (state) {
        var acts = line(state, "pass").concat(fillPassOdds(state));
        if (state.phase === "point" && !state.bets.come && comePointCount(state) < 2) {
          acts.push(place("come", state.tableMin));
        }
        return acts.concat(fillComeOdds(state));
      },
    },
    {
      id: "ironCross",
      name: "Iron Cross",
      risk: "High",
      summary:
        "Place the 5, 6, and 8, and bet the field. Most numbers pay something. A 7 takes the whole layout down.",
      edges: [
        { bet: "Place 6 and 8", edge: "1.52%" },
        { bet: "Place 5", edge: "4%" },
        { bet: "Field, 2 and 12 pay double", edge: "5.56%" },
      ],
      decide: function (state) {
        var min = state.tableMin;
        var six = place68(min);
        var five = Math.max(min, 500 * level(min));
        return []
          .concat(ensurePlace(state, 5, five))
          .concat(ensurePlace(state, 6, six))
          .concat(ensurePlace(state, 8, six))
          .concat(state.bets.field ? [] : [place("field", min)]);
      },
    },
    {
      id: "inside32",
      name: "$32 Inside",
      risk: "Medium",
      summary:
        "Place the inside numbers: 5, 6, 8, and 9. At a $5 table that is $10, $6, $6, and $10. It scales so every bet meets the table minimum.",
      edges: [
        { bet: "Place 6 and 8", edge: "1.52%" },
        { bet: "Place 5 and 9", edge: "4%" },
      ],
      decide: function (state) {
        var lv = level(state.tableMin);
        return []
          .concat(ensurePlace(state, 5, 1000 * lv))
          .concat(ensurePlace(state, 6, 600 * lv))
          .concat(ensurePlace(state, 8, 600 * lv))
          .concat(ensurePlace(state, 9, 1000 * lv));
      },
    },
    {
      id: "across44",
      name: "$44 Across",
      risk: "Medium",
      summary:
        "Place 4, 5, 6, 8, 9, and 10. The $44 shape is a $5 table: $5 on the outside and $12 on 6 and 8. It scales with the table minimum.",
      edges: [
        { bet: "Place 6 and 8", edge: "1.52%" },
        { bet: "Place 5 and 9", edge: "4%" },
        { bet: "Place 4 and 10", edge: "6.67%" },
      ],
      decide: function (state) {
        var lv = level(state.tableMin);
        var out = 500 * lv;
        var six = 1200 * lv;
        return []
          .concat(ensurePlace(state, 4, out))
          .concat(ensurePlace(state, 5, out))
          .concat(ensurePlace(state, 6, six))
          .concat(ensurePlace(state, 8, six))
          .concat(ensurePlace(state, 9, out))
          .concat(ensurePlace(state, 10, out));
      },
    },
    {
      id: "place68",
      name: "Place 6 and 8",
      risk: "Low",
      summary: "The place bets with the smallest edge. They stay up, pay 7 to 6, and lose on a 7.",
      edges: [{ bet: "Place 6 and 8", edge: "1.52%" }],
      decide: function (state) {
        var six = place68(state.tableMin);
        return [].concat(ensurePlace(state, 6, six)).concat(ensurePlace(state, 8, six));
      },
    },
    {
      id: "molly",
      name: "3-Point Molly",
      risk: "Medium",
      summary:
        "Pass line with odds, then come bets with odds until three points are working. After that, let the hand finish. A new hand starts after a seven-out.",
      edges: [
        { bet: "Pass and come", edge: "1.41%" },
        { bet: "Odds", edge: "0%" },
      ],
      onRoll: function (state, memory) {
        if (state.phase === "come-out" && !state.bets.pass && comePointCount(state) === 0) memory.locked = false;
      },
      decide: function (state, memory) {
        var acts = line(state, "pass").concat(fillPassOdds(state));
        var points = established(state);
        if (points >= 3) memory.locked = true;
        if (!memory.locked && state.phase === "point" && !state.bets.come && points < 3) {
          acts.push(place("come", state.tableMin));
        }
        return acts.concat(fillComeOdds(state));
      },
    },
    {
      id: "hedge",
      name: "Hedge / darkside",
      risk: "Medium",
      summary:
        "Don't pass with lay odds, plus place bets on 6 and 8. The place bets pay when those numbers hit, which is when the don't bet is under pressure. A 7 wins the don't and takes the place bets.",
      edges: [
        { bet: "Don't pass", edge: "1.36%" },
        { bet: "Lay odds", edge: "0%" },
        { bet: "Place 6 and 8", edge: "1.52%" },
      ],
      decide: function (state) {
        var six = place68(state.tableMin);
        return line(state, "dontPass")
          .concat(fillDontOdds(state))
          .concat(ensurePlace(state, 6, six))
          .concat(ensurePlace(state, 8, six));
      },
    },
    {
      id: "martingale",
      name: "Martingale on the pass line",
      risk: "Extreme",
      warning:
        "A short losing run can wipe the bankroll. Doubling does not change the 1.41% house edge. Pass line bets cannot be taken down, so a larger bet stays up after a win until it loses.",
      summary:
        "Start at the table minimum. After a loss, double the next pass line bet. After a win, plan to go back to the minimum. The chips already on the pass line have to stay until that bet loses.",
      edges: [{ bet: "Pass line", edge: "1.41%" }],
      onRoll: function (state, memory) {
        var lost = lostBet(state, "Pass Line");
        if (lost) {
          var next = Math.abs(lost.net) * 2;
          var cap = state.tableMin * 32;
          memory.stake = Math.min(next, cap);
        } else if (wonBet(state, "Pass Line")) {
          memory.stake = state.tableMin;
        }
      },
      decide: function (state, memory) {
        if (!memory.stake) memory.stake = state.tableMin;
        if (state.phase !== "come-out" || state.bets.pass) return [];
        var amt = memory.stake;
        if (amt > state.bankroll) amt = state.bankroll;
        if (amt < state.tableMin) return [];
        return [place("pass", amt)];
      },
    },
    {
      id: "pressCollect",
      name: "Press and collect",
      risk: "Medium",
      summary:
        "Place 6 and 8 for two units. The first time a number hits, take one unit down and keep the win. After that, press one unit each time it hits.",
      edges: [{ bet: "Place 6 and 8", edge: "1.52%" }],
      onRoll: function (state, memory) {
        if (!memory.hits) memory.hits = { 6: 0, 8: 0 };
        [6, 8].forEach(function (n) {
          if (wonBet(state, "Place " + n)) memory.hits[n] += 1;
          if (lostBet(state, "Place " + n)) memory.hits[n] = 0;
        });
      },
      decide: function (state, memory) {
        if (!memory.hits) memory.hits = { 6: 0, 8: 0 };
        var unit = place68(state.tableMin);
        function want(n) {
          var hits = memory.hits[n] || 0;
          return hits === 0 ? unit * 2 : unit * hits;
        }
        return [].concat(ensurePlace(state, 6, want(6))).concat(ensurePlace(state, 8, want(8)));
      },
    },
    {
      id: "hardPlace",
      name: "Hardways with place",
      risk: "High",
      summary:
        "Place 6 and 8, and bet the hard 6 and hard 8 beside them. The place bets grind. The hardways pay more and lose on an easy number or a 7.",
      edges: [
        { bet: "Place 6 and 8", edge: "1.52%" },
        { bet: "Hard 6 and 8", edge: "9.09%" },
      ],
      decide: function (state) {
        var six = place68(state.tableMin);
        var hard = state.tableMin;
        var acts = [].concat(ensurePlace(state, 6, six)).concat(ensurePlace(state, 8, six));
        [6, 8].forEach(function (n) {
          if (!state.bets.hardways[n]) acts.push(place("hardway", hard, n));
        });
        return acts;
      },
    },
  ];

  var BY_ID = {};
  STRATEGIES.forEach(function (s) {
    BY_ID[s.id] = s;
  });

  function bonusActions(state, bonuses) {
    if (!bonuses) return [];
    var out = [];
    ["small", "tall", "all", "hardAllDay"].forEach(function (kind) {
      if (bonuses[kind] && !state.bets[kind]) out.push(place(kind, state.tableMin));
    });
    return out;
  }

  function applyActions(state, actions) {
    var wagered = 0;
    var vig = 0;
    var applied = [];
    var skipped = [];
    (actions || []).forEach(function (a) {
      var spot = { kind: a.kind, number: a.number };
      var res;
      if (a.op === "remove") res = E.removeBet(state, spot, a.amount);
      else res = E.placeBet(state, spot, a.amount);
      if (!res.ok) {
        skipped.push({ kind: a.kind, number: a.number, error: res.error });
        return;
      }
      if (a.op !== "remove") {
        wagered += res.wagered || 0;
        vig += res.vig || 0;
      }
      applied.push(a);
    });
    return { wagered: wagered, vig: vig, applied: applied, skipped: skipped };
  }

  function prepareRoll(state, spec, memory) {
    var strategy = BY_ID[spec.id];
    if (!strategy) return { wagered: 0, vig: 0, applied: [], skipped: [] };
    if (strategy.onRoll) strategy.onRoll(state, memory);
    var actions = (strategy.decide(state, memory) || []).concat(bonusActions(state, spec.bonuses));
    return applyActions(state, actions);
  }

  function coach(state, spec, memory) {
    var strategy = BY_ID[spec.id];
    if (!strategy) return [];
    var scratch = E.clone(state);
    var mem = E.clone(memory || {});
    if (strategy.onRoll) strategy.onRoll(scratch, mem);
    return (strategy.decide(scratch, mem) || []).concat(bonusActions(scratch, spec.bonuses));
  }

  function isBust(state) {
    return E.wealth(state) < state.tableMin;
  }

  function makeGame(config, spec) {
    var game = E.createGame({
      bankroll: config.bankroll,
      tableMin: config.tableMin,
      fieldMode: config.fieldMode || "double",
      vigBuy: config.vigBuy || "win",
      vigLay: config.vigLay || "upfront",
      hardwaysOffComeOut: !!config.hardwaysOffComeOut,
      placeOnComeOut: !!config.placeOnComeOut,
      quiet: true,
    });
    var odds = spec.odds || config.odds || "345";
    if (typeof odds === "string") E.applyOddsPreset(game, odds);
    else {
      game.oddsPass = odds.pass || "345";
      game.oddsCome = odds.come || odds.pass || "345";
      game.oddsDont = odds.dont || odds.pass || "345";
      game.oddsDontCome = odds.dontCome || odds.dont || odds.pass || "345";
    }
    return game;
  }

  function percentile(sorted, p) {
    if (!sorted.length) return 0;
    var idx = (sorted.length - 1) * p;
    var lo = Math.floor(idx);
    var hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
  }

  function bandIndexes(rolls) {
    var maxPoints = 240;
    var idx = [];
    if (rolls <= maxPoints) {
      var r;
      for (r = 0; r <= rolls; r++) idx.push(r);
      return idx;
    }
    var s;
    var last = -1;
    for (s = 0; s <= maxPoints; s++) {
      var at = Math.round((s * rolls) / maxPoints);
      if (at !== last) {
        idx.push(at);
        last = at;
      }
    }
    return idx;
  }

  function simulateSpec(spec, config, rng) {
    var trials = config.trials;
    var rolls = config.rolls;
    var indexes = bandIndexes(rolls);
    var store = new Float64Array(trials * indexes.length);
    var ends = new Float64Array(trials);
    var drawdowns = new Float64Array(trials);
    var wagered = new Float64Array(trials);
    var expected = new Float64Array(trials);
    var busts = 0;
    var wins = 0;
    var best = -Infinity;
    var worst = Infinity;
    var t;
    for (t = 0; t < trials; t++) {
      var game = makeGame(config, spec);
      var memory = {};
      var peak = E.wealth(game);
      var maxDD = 0;
      var handle = 0;
      var exp = 0;
      var r = 0;
      var bi = 0;
      store[t * indexes.length] = peak;
      for (r = 0; r < rolls; r++) {
        if (isBust(game)) break;
        var prep = prepareRoll(game, spec, memory);
        handle += prep.wagered;
        exp += prep.vig || 0;
        var dice = E.rollForState(game, rng);
        var res = E.settle(game, dice.d1, dice.d2);
        exp += res.expectedLoss || 0;
        var w = E.wealth(game);
        if (w > peak) peak = w;
        var dd = peak - w;
        if (dd > maxDD) maxDD = dd;
        while (bi < indexes.length && indexes[bi] === r + 1) {
          store[t * indexes.length + bi] = w;
          bi += 1;
        }
      }
      var end = E.wealth(game);
      while (bi < indexes.length) {
        store[t * indexes.length + bi] = end;
        bi += 1;
      }
      ends[t] = end;
      drawdowns[t] = maxDD;
      wagered[t] = handle;
      expected[t] = exp;
      if (end > config.bankroll) wins += 1;
      if (end < config.tableMin) busts += 1;
      if (end > best) best = end;
      if (end < worst) worst = end;
    }
    var endSorted = Array.prototype.slice.call(ends).sort(function (a, b) {
      return a - b;
    });
    function avg(arr) {
      var s = 0;
      var i;
      for (i = 0; i < arr.length; i++) s += arr[i];
      return s / arr.length;
    }
    var bands = { rolls: indexes, p10: [], p50: [], p90: [] };
    var sample = [];
    var p;
    for (p = 0; p < indexes.length; p++) {
      var col = [];
      for (t = 0; t < trials; t++) col.push(store[t * indexes.length + p]);
      col.sort(function (a, b) {
        return a - b;
      });
      bands.p10.push(percentile(col, 0.1));
      bands.p50.push(percentile(col, 0.5));
      bands.p90.push(percentile(col, 0.9));
      sample.push(store[p]);
    }
    var strategy = BY_ID[spec.id];
    var oddsLabel = typeof spec.odds === "string" ? spec.odds : "custom";
    return {
      id: spec.id,
      name: strategy ? strategy.name : spec.id,
      odds: oddsLabel,
      risk: strategy ? strategy.risk : "",
      trials: trials,
      rolls: rolls,
      avgEnd: avg(ends),
      medianEnd: percentile(endSorted, 0.5),
      winPct: wins / trials,
      bustPct: busts / trials,
      best: best,
      worst: worst,
      avgDrawdown: avg(drawdowns),
      avgWagered: avg(wagered),
      avgExpectedLoss: avg(expected),
      avgActualLoss: config.bankroll - avg(ends),
      bands: bands,
      sample: sample,
    };
  }

  function runSim(config, rng) {
    var list = config.strategies || [];
    return list.map(function (spec) {
      return simulateSpec(spec, config, rng);
    });
  }

  function buildWatch(spec, config, rng) {
    var game = makeGame(config, spec);
    var memory = {};
    var frames = [];
    var rolls = config.rolls;
    var r;
    for (r = 0; r < rolls; r++) {
      if (isBust(game)) break;
      var prep = prepareRoll(game, spec, memory);
      var dice = E.rollForState(game, rng);
      frames.push({
        actions: prep.applied,
        d1: dice.d1,
        d2: dice.d2,
      });
      E.settle(game, dice.d1, dice.d2);
    }
    return {
      frames: frames,
      bankroll: config.bankroll,
      tableMin: config.tableMin,
      odds: spec.odds || config.odds || "345",
      fieldMode: config.fieldMode || "double",
      vigBuy: config.vigBuy || "win",
      vigLay: config.vigLay || "upfront",
    };
  }

  return {
    STRATEGIES: STRATEGIES,
    BY_ID: BY_ID,
    place68: place68,
    level: level,
    prepareRoll: prepareRoll,
    applyActions: applyActions,
    coach: coach,
    runSim: runSim,
    simulateSpec: simulateSpec,
    buildWatch: buildWatch,
    isBust: isBust,
  };
});
