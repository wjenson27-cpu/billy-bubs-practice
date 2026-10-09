/**
 * Payouts, odds limits, bonuses, and a pass / don't pass edge check.
 * Run: node tests/table-engine.test.js
 */
var assert = require("assert");
var E = require("../js/table-engine.js");
var Bubble = require("../js/engine.js");
var Die = require("../js/die-geom.js");
var S = require("../js/strategies.js");

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("ok  " + name);
  } catch (err) {
    failed += 1;
    console.error("FAIL " + name);
    console.error("  " + (err && err.stack ? err.stack : err));
  }
}

function game(opts) {
  opts = opts || {};
  if (opts.quiet == null) opts.quiet = true;
  if (opts.bankroll == null) opts.bankroll = 100000;
  if (opts.tableMin == null) opts.tableMin = 1000;
  return E.createGame(opts);
}

function bet(g, kind, amount, number) {
  var res = E.placeBet(g, { kind: kind, number: number }, amount);
  assert.strictEqual(res.ok, true, res.error || "bet failed");
  return res;
}

function roll(g, d1, d2) {
  return E.settle(g, d1, d2);
}

test("come-out 7 wins pass and the bet stays", function () {
  var g = game();
  bet(g, "pass", 1000);
  var before = g.bankroll;
  roll(g, 3, 4);
  assert.strictEqual(g.bets.pass, 1000);
  assert.strictEqual(g.phase, "come-out");
  assert.strictEqual(g.bankroll, before + 1000);
});

test("come-out 11 wins pass", function () {
  var g = game();
  bet(g, "pass", 1000);
  roll(g, 5, 6);
  assert.strictEqual(g.bets.pass, 1000);
  assert.strictEqual(g.phase, "come-out");
});

test("come-out craps loses pass", function () {
  [ [1, 1], [1, 2], [6, 6] ].forEach(function (d) {
    var g = game();
    bet(g, "pass", 1000);
    var before = g.bankroll;
    roll(g, d[0], d[1]);
    assert.strictEqual(g.bets.pass, 0);
    assert.strictEqual(g.bankroll, before);
    assert.strictEqual(g.phase, "come-out");
  });
});

test("point then seven-out loses pass and odds", function () {
  var g = game();
  bet(g, "pass", 1000);
  roll(g, 3, 3);
  assert.strictEqual(g.point, 6);
  bet(g, "passOdds", 5000);
  var wealth = E.wealth(g);
  roll(g, 3, 4);
  assert.strictEqual(g.phase, "come-out");
  assert.strictEqual(g.bets.pass, 0);
  assert.strictEqual(g.bets.passOdds, 0);
  assert.strictEqual(E.wealth(g), wealth - 6000);
  assert.strictEqual(g.stats.sevenOuts, 1);
});

test("point hit pays pass odds 2:1, 3:2, and 6:5", function () {
  function check(pointDice, odds, profit) {
    var g = game();
    bet(g, "pass", 1000);
    roll(g, pointDice[0], pointDice[1]);
    bet(g, "passOdds", odds);
    var before = g.bankroll;
    roll(g, pointDice[0], pointDice[1]);
    assert.strictEqual(g.bankroll - before, 1000 + profit + odds);
    assert.strictEqual(g.bets.pass, 1000);
    assert.strictEqual(g.bets.passOdds, 0);
    assert.strictEqual(g.phase, "come-out");
  }
  check([2, 2], 3000, 6000);
  check([2, 3], 4000, 6000);
  check([3, 3], 5000, 6000);
});

test("don't pass: 7 loses, 2 and 3 win, 12 pushes", function () {
  var g = game();
  bet(g, "dontPass", 1000);
  var b = g.bankroll;
  roll(g, 3, 4);
  assert.strictEqual(g.bets.dontPass, 0);
  assert.strictEqual(g.bankroll, b);

  g = game();
  bet(g, "dontPass", 1000);
  b = g.bankroll;
  roll(g, 1, 1);
  assert.strictEqual(g.bets.dontPass, 1000);
  assert.strictEqual(g.bankroll, b + 1000);

  g = game();
  bet(g, "dontPass", 1000);
  b = g.bankroll;
  roll(g, 6, 6);
  assert.strictEqual(g.bets.dontPass, 1000);
  assert.strictEqual(g.bankroll, b);
});

test("don't pass lay odds pay on seven-out and lose when the point hits", function () {
  var g = game();
  bet(g, "dontPass", 1000);
  roll(g, 2, 2);
  bet(g, "dontPassOdds", 6000);
  var before = g.bankroll;
  roll(g, 1, 6);
  assert.strictEqual(g.phase, "come-out");
  assert.strictEqual(g.bets.dontPass, 1000);
  assert.strictEqual(g.bets.dontPassOdds, 0);
  assert.strictEqual(g.bankroll - before, 1000 + 3000 + 6000);

  g = game();
  bet(g, "dontPass", 1000);
  roll(g, 2, 2);
  bet(g, "dontPassOdds", 6000);
  var wealth = E.wealth(g);
  roll(g, 2, 2);
  assert.strictEqual(g.bets.dontPass, 0);
  assert.strictEqual(E.wealth(g), wealth - 7000);
});

test("max odds limits for 3-4-5x, 5x, and 10x", function () {
  function limits(preset, point, passX, layStake) {
    assert.strictEqual(E.maxPassOdds(1000, point, preset), passX);
    assert.strictEqual(E.maxLayOdds(1000, point, preset), layStake);
  }
  limits("345", 4, 3000, 6000);
  limits("345", 10, 3000, 6000);
  limits("345", 5, 4000, 6000);
  limits("345", 9, 4000, 6000);
  limits("345", 6, 5000, 6000);
  limits("345", 8, 5000, 6000);
  limits("5", 4, 5000, 10000);
  limits("5", 5, 5000, 7500);
  limits("5", 6, 5000, 6000);
  limits("10", 4, 10000, 20000);
  limits("10", 5, 10000, 15000);
  limits("10", 6, 10000, 12000);
});

test("odds payouts match each multiple", function () {
  assert.strictEqual(E.oddsProfit(10000, 4), 20000);
  assert.strictEqual(E.oddsProfit(7500, 5), 11250);
  assert.strictEqual(E.layProfit(10000, 4), 5000);
  assert.strictEqual(E.layProfit(7500, 5), 5000);
  assert.strictEqual(E.layProfit(6000, 6), 5000);
  assert.strictEqual(E.layProfit(20000, 4), 10000);
  assert.strictEqual(E.layProfit(15000, 5), 10000);
  assert.strictEqual(E.layProfit(12000, 6), 10000);
});

test("pass and come odds caps are independent", function () {
  var g = game({ oddsPass: "345", oddsCome: "10", oddsDont: "5", oddsDontCome: "10" });
  bet(g, "pass", 1000);
  roll(g, 1, 5);
  assert.strictEqual(g.point, 6);
  var over = E.placeBet(g, { kind: "passOdds" }, 6000);
  assert.strictEqual(over.ok, false);
  bet(g, "passOdds", 5000);
  bet(g, "come", 1000);
  roll(g, 4, 2);
  assert.ok(g.bets.comeBets[6]);
  bet(g, "comeOdds", 10000, 6);
  var too = E.placeBet(g, { kind: "comeOdds", number: 6 }, 100);
  assert.strictEqual(too.ok, false);
});

test("don't come lay odds use their own cap", function () {
  var g = game({ oddsDontCome: "10" });
  bet(g, "pass", 1000);
  roll(g, 2, 2);
  bet(g, "dontCome", 1000);
  roll(g, 1, 3);
  assert.strictEqual(E.maxLayOdds(1000, 4, g.oddsDontCome), 20000);
  bet(g, "dontComeOdds", 20000, 4);
  var over = E.placeBet(g, { kind: "dontComeOdds", number: 4 }, 100);
  assert.strictEqual(over.ok, false);
});

test("place, buy, and lay payouts with vig options", function () {
  assert.strictEqual(E.placeProfit(1000, 4), 1800);
  assert.strictEqual(E.placeProfit(1000, 5), 1400);
  assert.strictEqual(E.placeProfit(1200, 6), 1400);

  function withPoint(opts) {
    var g = game(opts);
    bet(g, "pass", 1000);
    roll(g, 3, 3);
    return g;
  }

  var g = withPoint({ vigBuy: "win" });
  bet(g, "buy", 2000, 4);
  var before = g.bankroll;
  roll(g, 1, 3);
  assert.strictEqual(g.bankroll - before, 4000 - 100);
  assert.strictEqual(g.bets.buy[4], 2000);

  g = withPoint({ vigBuy: "upfront" });
  var res = bet(g, "buy", 2000, 4);
  assert.strictEqual(res.vig, 100);
  before = g.bankroll;
  roll(g, 2, 2);
  assert.strictEqual(g.bankroll - before, 4000);

  g = game({ vigLay: "upfront" });
  res = bet(g, "lay", 4000, 4);
  assert.strictEqual(res.vig, 100);
  before = g.bankroll;
  roll(g, 3, 4);
  assert.strictEqual(g.bankroll - before, 2000);
  assert.strictEqual(g.bets.lay[4], 4000);

  g = game({ vigLay: "win" });
  bet(g, "lay", 4000, 4);
  before = g.bankroll;
  roll(g, 3, 4);
  assert.strictEqual(g.bankroll - before, 2000 - 100);
});

test("a 7 takes place and buy, and wins a lay", function () {
  var g = game();
  bet(g, "pass", 1000);
  roll(g, 2, 2);
  bet(g, "place", 1200, 6);
  bet(g, "buy", 1000, 4);
  bet(g, "lay", 2000, 5);
  roll(g, 3, 4);
  assert.strictEqual(g.bets.place[6], 0);
  assert.strictEqual(g.bets.buy[4], 0);
  assert.strictEqual(g.bets.lay[5], 2000);
});

test("place bets are off on the come-out unless asked", function () {
  var g = game();
  bet(g, "place", 1200, 6);
  roll(g, 3, 4);
  assert.strictEqual(g.phase, "come-out");
  assert.strictEqual(g.bets.place[6], 1200);
  roll(g, 1, 5);
  assert.strictEqual(g.point, 6);
  assert.strictEqual(g.bets.place[6], 1200);
  var before = g.bankroll;
  roll(g, 2, 4);
  assert.strictEqual(g.bankroll - before, 1400);
  assert.strictEqual(g.bets.place[6], 1200);

  g = game({ placeOnComeOut: true });
  bet(g, "place", 1200, 6);
  roll(g, 3, 4);
  assert.strictEqual(g.bets.place[6], 0);
});

test("field pays double, triple, or 12-only triple", function () {
  function pay(mode, d1, d2) {
    var g = game({ fieldMode: mode });
    bet(g, "field", 1000);
    var before = g.bankroll;
    var res = roll(g, d1, d2);
    return { delta: g.bankroll - before, win: res.decisions.some(function (d) { return d.bet === "Field" && d.result === "win"; }) };
  }
  assert.strictEqual(pay("double", 1, 1).delta, 1000 + 2000);
  assert.strictEqual(pay("triple", 6, 6).delta, 1000 + 3000);
  assert.strictEqual(pay("twelveTriple", 1, 1).delta, 1000 + 2000);
  assert.strictEqual(pay("twelveTriple", 6, 6).delta, 1000 + 3000);
  assert.strictEqual(pay("double", 1, 2).delta, 1000 + 1000);
  assert.strictEqual(pay("double", 3, 4).win, false);
});

test("hardways stay on a hard win, lose easy, and can be off on the come-out", function () {
  var g = game();
  bet(g, "hardway", 1000, 6);
  var before = g.bankroll;
  roll(g, 3, 3);
  assert.strictEqual(g.bets.hardways[6], 1000);
  assert.strictEqual(g.bankroll - before, 9000);
  roll(g, 1, 5);
  assert.strictEqual(g.bets.hardways[6], 0);

  g = game({ hardwaysOffComeOut: true });
  bet(g, "hardway", 1000, 8);
  before = g.bankroll;
  roll(g, 4, 4);
  assert.strictEqual(g.phase, "point");
  assert.strictEqual(g.point, 8);
  assert.strictEqual(g.bets.hardways[8], 1000);
  assert.strictEqual(g.bankroll, before);
  roll(g, 2, 6);
  assert.strictEqual(g.bets.hardways[8], 0);
});

test("props: any seven, any craps, yo, horn, C and E", function () {
  var g = game();
  bet(g, "any7", 1000);
  var b = g.bankroll;
  roll(g, 3, 4);
  assert.strictEqual(g.bankroll - b, 1000 + 4000);
  assert.strictEqual(g.bets.any7, 0);

  g = game();
  bet(g, "anyCraps", 1000);
  b = g.bankroll;
  roll(g, 1, 1);
  assert.strictEqual(g.bankroll - b, 1000 + 7000);

  g = game();
  bet(g, "eleven", 1000);
  b = g.bankroll;
  roll(g, 5, 6);
  assert.strictEqual(g.bankroll - b, 1000 + 15000);

  g = game();
  bet(g, "horn", 1200);
  b = g.bankroll;
  roll(g, 1, 1);
  assert.strictEqual(g.bankroll - b, 1200 + 8100);

  g = game();
  bet(g, "ce", 2000);
  b = g.bankroll;
  roll(g, 5, 6);
  assert.strictEqual(g.bankroll - b, 2000 + 14000);
  g = game();
  bet(g, "ce", 2000);
  b = g.bankroll;
  roll(g, 1, 2);
  assert.strictEqual(g.bankroll - b, 2000 + 6000);
});

test("big 6 and big 8 pay even money and lose on 7", function () {
  var g = game();
  bet(g, "pass", 1000);
  roll(g, 2, 2);
  bet(g, "big6", 1000);
  bet(g, "big8", 1000);
  var b = g.bankroll;
  roll(g, 1, 5);
  assert.strictEqual(g.bankroll - b, 1000);
  assert.strictEqual(g.bets.big6, 1000);
  roll(g, 3, 4);
  assert.strictEqual(g.bets.big6, 0);
  assert.strictEqual(g.bets.big8, 0);
});

test("come moves, wins, and odds are off on the come-out", function () {
  var g = game();
  bet(g, "pass", 1000);
  roll(g, 3, 3);
  bet(g, "come", 1000);
  roll(g, 4, 4);
  assert.strictEqual(g.bets.come, 0);
  assert.strictEqual(g.bets.comeBets[8].amount, 1000);
  bet(g, "comeOdds", 5000, 8);
  roll(g, 3, 3);
  assert.strictEqual(g.phase, "come-out");
  assert.strictEqual(g.bets.comeBets[8].amount, 1000);
  assert.strictEqual(g.bets.comeBets[8].odds, 5000);
  var res = roll(g, 3, 4);
  assert.ok(!g.bets.comeBets[8]);
  var comeLoss = res.decisions.filter(function (d) { return d.bet === "Come 8"; })[0];
  assert.strictEqual(comeLoss.result, "lose");
  assert.strictEqual(comeLoss.net, -1000);
});

test("don't come odds are working on the come-out", function () {
  var g = game();
  bet(g, "pass", 1000);
  roll(g, 3, 3);
  bet(g, "dontCome", 1000);
  roll(g, 4, 4);
  bet(g, "dontComeOdds", 6000, 8);
  roll(g, 3, 3);
  assert.strictEqual(g.phase, "come-out");
  var res = roll(g, 2, 5);
  assert.ok(!g.bets.dontComeBets[8]);
  var win = res.decisions.filter(function (d) { return d.bet === "Don't Come 8"; })[0];
  assert.strictEqual(win.result, "win");
  assert.strictEqual(win.net, 1000 + 5000);
});

test("table minimum blocks a short new bet and allows odds under the minimum", function () {
  var g = game({ tableMin: 1000 });
  var res = E.placeBet(g, { kind: "pass" }, 500);
  assert.strictEqual(res.ok, false);
  bet(g, "pass", 1000);
  roll(g, 2, 2);
  bet(g, "passOdds", 100);
});

test("bonus bets match the bubble table", function () {
  function script(engine, place, settle) {
    var g = engine.createGame({ bankroll: 100000, quiet: true });
    if (engine === E) g.tableMin = 100;
    place(g, "small", 100);
    [ [1, 1], [1, 2], [1, 3], [1, 4], [1, 5] ].forEach(function (d) {
      settle(g, d[0], d[1]);
    });
    return g;
  }
  var bubble = script(Bubble, function (g, kind, amount) {
    var res = Bubble.placeBet(g, { kind: kind }, amount);
    assert.strictEqual(res.ok, true, res.error);
    g = res.state;
    return g;
  }, function () {});
  // Bubble placeBet returns a new state. Replay explicitly.
  var bg = Bubble.createGame();
  bg = Bubble.placeBet(bg, { kind: "small" }, 100).state;
  [ [1, 1], [1, 2], [1, 3], [1, 4] ].forEach(function (d) {
    bg = Bubble.settle(bg, d[0], d[1]).state;
    assert.strictEqual(bg.bets.small, 100);
  });
  var bBefore = bg.bankroll;
  bg = Bubble.settle(bg, 2, 4).state;
  assert.strictEqual(bg.bets.small, 0);
  assert.strictEqual(bg.bankroll - bBefore, 100 + 3000);

  var tg = game({ tableMin: 100 });
  bet(tg, "small", 100);
  [ [1, 1], [1, 2], [1, 3], [1, 4] ].forEach(function (d) {
    roll(tg, d[0], d[1]);
    assert.strictEqual(tg.bets.small, 100);
  });
  var tBefore = tg.bankroll;
  roll(tg, 2, 4);
  assert.strictEqual(tg.bets.small, 0);
  assert.strictEqual(tg.bankroll - tBefore, bg.bankroll - bBefore);

  tg = game({ tableMin: 100 });
  bet(tg, "small", 100);
  roll(tg, 1, 1);
  roll(tg, 3, 4);
  assert.strictEqual(tg.bets.small, 0);

  tg = game({ tableMin: 100 });
  bet(tg, "tall", 100);
  [ [2, 6], [3, 6], [4, 6], [5, 6] ].forEach(function (d) {
    roll(tg, d[0], d[1]);
  });
  tBefore = tg.bankroll;
  roll(tg, 6, 6);
  assert.strictEqual(tg.bankroll - tBefore, 3100);

  tg = game({ tableMin: 100 });
  bet(tg, "all", 100);
  [ [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [2, 6], [3, 6], [4, 6], [5, 6] ].forEach(function (d) {
    roll(tg, d[0], d[1]);
    assert.strictEqual(tg.bets.all, 100);
  });
  tBefore = tg.bankroll;
  roll(tg, 6, 6);
  assert.strictEqual(tg.bankroll - tBefore, 100 + 15500);

  tg = game({ tableMin: 100 });
  bet(tg, "hardAllDay", 100);
  roll(tg, 1, 5);
  assert.strictEqual(tg.bets.hardAllDay, 100);
  assert.ok(!tg.progress.hardAllDay[6]);
  [ [2, 2], [3, 3], [4, 4] ].forEach(function (d) {
    roll(tg, d[0], d[1]);
  });
  tBefore = tg.bankroll;
  roll(tg, 5, 5);
  assert.strictEqual(tg.bets.hardAllDay, 0);
  assert.strictEqual(tg.bankroll - tBefore, 100 + 16400);

  assert.ok(E.bonusEdge("small") > 0 && E.bonusEdge("small") < 1);
  assert.ok(E.bonusEdge("hardAllDay") > 0);
  assert.strictEqual(Bubble.MAKE_EM_FOR.small, 31);
  assert.strictEqual(Bubble.MAKE_EM_FOR.all, 156);
  assert.strictEqual(Bubble.MAKE_EM_FOR.hardAllDay, 165);
});

test("a dice set does nothing until controlled shooter is on", function () {
  var rolls = [];
  var i;
  for (i = 0; i < 50; i++) {
    rolls.push(E.rollDice({ enabled: false, mode: "influence", influence: 1, set: { d1: 6, d2: 1 } }, function () {
      return 0;
    }));
  }
  assert.ok(rolls.some(function (r) { return r.total !== 7; }));

  for (i = 0; i < 20; i++) {
    var hit = E.rollDice({ enabled: true, mode: "influence", influence: 1, set: { d1: 6, d2: 1 } }, Math.random);
    assert.strictEqual(hit.d1, 6);
    assert.strictEqual(hit.d2, 1);
  }
});

test("SRR above 6 throws fewer sevens than a fair table", function () {
  function rate(srr) {
    var sevens = 0;
    var n = 20000;
    var i;
    var rng = (function () {
      var x = 123456789;
      return function () {
        x = (1664525 * x + 1013904223) >>> 0;
        return x / 4294967296;
      };
    })();
    for (i = 0; i < n; i++) {
      var d = E.rollDice({ enabled: true, mode: "srr", srr: srr }, rng);
      if (d.total === 7) sevens += 1;
    }
    return sevens / n;
  }
  var fair = rate(6);
  var hot = rate(12);
  assert.ok(Math.abs(fair - 1 / 6) < 0.02, "fair " + fair);
  assert.ok(hot < fair - 0.04, "hot " + hot + " fair " + fair);
});

test("die faces stay legal and a swipe reverses", function () {
  var all = Die.allOrientations();
  assert.strictEqual(all.length, 24);
  all.forEach(function (d) {
    assert.ok(Die.legal(d));
    assert.strictEqual(d.top + Die.bottom(d), 7);
    ["up", "down", "left", "right"].forEach(function (dir) {
      assert.ok(Die.legal(Die.rotate(d, dir)));
    });
  });
  var id = Die.identity();
  assert.strictEqual(Die.key(Die.rotate(Die.rotate(id, "up"), "down")), Die.key(id));
  assert.strictEqual(Die.key(Die.rotate(Die.rotate(id, "left"), "right")), Die.key(id));
  var pair = Die.findAllSevens();
  assert.ok(pair);
  var a = pair[0];
  var b = pair[1];
  var k;
  for (k = 0; k < 4; k++) {
    assert.strictEqual(a.top + b.top, 7);
    a = Die.rotate(a, "up");
    b = Die.rotate(b, "up");
  }
  Die.SETS.forEach(function (set) {
    assert.ok(Die.legal(set.d1) && Die.legal(set.d2), set.name);
  });
});

test("pass line strategy takes max odds for the selected multiple", function () {
  var g = game();
  E.applyOddsPreset(g, "10");
  var memory = {};
  S.prepareRoll(g, { id: "passMax" }, memory);
  assert.strictEqual(g.bets.pass, 1000);
  roll(g, 2, 2);
  S.prepareRoll(g, { id: "passMax", odds: "10" }, memory);
  assert.strictEqual(g.bets.passOdds, 10000);
});

test("100k rolls: pass line near 1.41% and don't pass near 1.36%", function () {
  var pass = E.measureLineEdge("pass", 100000, 1000);
  var dont = E.measureLineEdge("dont", 100000, 1000);
  console.log("  pass edge " + (pass.edge * 100).toFixed(3) + "% on " + pass.handle / 100 + " resolved dollars");
  console.log("  don't edge " + (dont.edge * 100).toFixed(3) + "% on " + dont.handle / 100 + " resolved dollars");
  assert.ok(Math.abs(pass.edge - E.PASS_EDGE) < 0.008, "pass " + pass.edge);
  assert.ok(Math.abs(dont.edge - E.DONT_EDGE) < 0.008, "dont " + dont.edge);
});

console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
