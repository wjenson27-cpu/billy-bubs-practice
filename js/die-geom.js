/**
 * Real die geometry. Opposite faces sum to 7.
 * Orientation is the face on top, the face pointing away from the shooter,
 * and the face on the right. Front (toward the shooter) is 7 minus away.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DieGeom = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var OPP = [0, 6, 5, 4, 3, 2, 1];

  function die(top, away, right) {
    return { top: top, away: away, right: right };
  }

  function front(d) {
    return OPP[d.away];
  }
  function left(d) {
    return OPP[d.right];
  }
  function bottom(d) {
    return OPP[d.top];
  }

  function rotate(d, dir) {
    var t = d.top;
    var a = d.away;
    var r = d.right;
    if (dir === "up") return die(OPP[a], t, r);
    if (dir === "down") return die(a, OPP[t], r);
    if (dir === "left") return die(r, a, OPP[t]);
    if (dir === "right") return die(OPP[r], a, t);
    return die(t, a, r);
  }

  function key(d) {
    return d.top + "-" + d.away + "-" + d.right;
  }

  function legal(d) {
    if (!d) return false;
    var faces = [d.top, d.away, d.right, bottom(d), front(d), left(d)];
    var seen = {};
    var i;
    for (i = 0; i < faces.length; i++) {
      if (faces[i] < 1 || faces[i] > 6 || seen[faces[i]]) return false;
      seen[faces[i]] = true;
    }
    return d.top + bottom(d) === 7 && d.away + front(d) === 7 && d.right + left(d) === 7;
  }

  var _all = null;
  function allOrientations() {
    if (_all) return _all;
    var start = die(1, 2, 3);
    var seen = {};
    var q = [start];
    seen[key(start)] = start;
    var dirs = ["up", "down", "left", "right"];
    while (q.length) {
      var cur = q.pop();
      var i;
      for (i = 0; i < dirs.length; i++) {
        var n = rotate(cur, dirs[i]);
        var k = key(n);
        if (!seen[k]) {
          seen[k] = n;
          q.push(n);
        }
      }
    }
    _all = Object.keys(seen).map(function (k) {
      return seen[k];
    });
    return _all;
  }

  function withTopFront(top, frontFace) {
    var all = allOrientations();
    var i;
    for (i = 0; i < all.length; i++) {
      if (all[i].top === top && front(all[i]) === frontFace) return die(all[i].top, all[i].away, all[i].right);
    }
    return null;
  }

  function cloneDie(d) {
    return die(d.top, d.away, d.right);
  }

  /** Two same-chirality dice whose forward tumble (up) stays a seven. */
  function findAllSevens() {
    var all = allOrientations();
    var i;
    var j;
    for (i = 0; i < all.length; i++) {
      var a = all[i];
      if (a.top !== 6) continue;
      for (j = 0; j < all.length; j++) {
        var b = all[j];
        if (a.top + b.top !== 7) continue;
        var x = a;
        var y = b;
        var k;
        var ok = true;
        for (k = 0; k < 4; k++) {
          if (x.top + y.top !== 7) ok = false;
          x = rotate(x, "up");
          y = rotate(y, "up");
        }
        if (ok) return [cloneDie(a), cloneDie(b)];
      }
    }
    return null;
  }

  function spec(top, frontFace) {
    var d = withTopFront(top, frontFace);
    if (!d) throw new Error("No die with top " + top + " and front " + frontFace);
    return d;
  }

  var sevens = findAllSevens();

  var SETS = [
    {
      id: "3v",
      name: "3-V",
      blurb: "Threes on top, turned so the faces point into a V.",
      d1: spec(3, 2),
      d2: spec(3, 5),
    },
    {
      id: "2v",
      name: "2-V",
      blurb: "Deuces on top, turned into a V.",
      d1: spec(2, 3),
      d2: spec(2, 4),
    },
    {
      id: "hardway",
      name: "Hardway set",
      blurb: "Fives on top, aces toward you. A quarter turn is a hardway.",
      d1: spec(5, 1),
      d2: spec(5, 1),
    },
    {
      id: "all7",
      name: "All Sevens",
      blurb: "Every quarter turn still totals seven.",
      d1: sevens[0],
      d2: sevens[1],
    },
    {
      id: "crossed6",
      name: "Crossed Sixes",
      blurb: "Sixes on top, one die spun a quarter turn from the other.",
      d1: spec(6, 5),
      d2: spec(6, 3),
    },
    {
      id: "straight6",
      name: "Straight Sixes",
      blurb: "Both sixes parallel, same way up.",
      d1: spec(6, 5),
      d2: spec(6, 5),
    },
    {
      id: "yo",
      name: "Yo",
      blurb: "Six and five on top.",
      d1: spec(6, 2),
      d2: spec(5, 1),
    },
    {
      id: "aces",
      name: "Aces",
      blurb: "Both aces on top.",
      d1: spec(1, 2),
      d2: spec(1, 5),
    },
  ];

  return {
    OPP: OPP,
    die: die,
    front: front,
    left: left,
    bottom: bottom,
    rotate: rotate,
    legal: legal,
    key: key,
    allOrientations: allOrientations,
    withTopFront: withTopFront,
    findAllSevens: findAllSevens,
    SETS: SETS,
    identity: function () {
      return die(1, 2, 3);
    },
  };
});
