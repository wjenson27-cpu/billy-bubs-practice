/**
 * 3D dice faces and roll animation. No game rules.
 */
(function (root) {
  "use strict";

  var PIP_MAP = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };

  var FACE_ROT = {
    1: "rotateX(0deg) rotateY(0deg)",
    2: "rotateX(0deg) rotateY(-90deg)",
    3: "rotateX(-90deg) rotateY(0deg)",
    4: "rotateX(90deg) rotateY(0deg)",
    5: "rotateX(0deg) rotateY(90deg)",
    6: "rotateX(0deg) rotateY(180deg)",
  };

  function pipHtml(value) {
    var pips = PIP_MAP[value] || [];
    var html = "";
    var i;
    for (i = 0; i < 9; i++) {
      html += '<span class="pip' + (pips.indexOf(i) >= 0 ? " on" : "") + '"></span>';
    }
    return html;
  }

  function ensureCube(el) {
    if (el.querySelector(".die-cube")) return el.querySelector(".die-cube");
    el.classList.add("die-scene");
    var cube = document.createElement("div");
    cube.className = "die-cube";
    var faces = [1, 2, 3, 4, 5, 6];
    faces.forEach(function (n) {
      var face = document.createElement("div");
      face.className = "die-face face-" + n;
      face.innerHTML = pipHtml(n);
      cube.appendChild(face);
    });
    el.innerHTML = "";
    el.appendChild(cube);
    return cube;
  }

  function renderDie(el, value) {
    var cube = ensureCube(el);
    cube.style.transform = FACE_ROT[value] || FACE_ROT[1];
    el.setAttribute("data-face", String(value));
    el.setAttribute("aria-label", "Die showing " + value);
  }

  function animateRoll(dieEls, finalDice, duration, onDone) {
    duration = duration || 780;
    var start = performance.now();
    var cubes = dieEls.map(function (el) {
      el.classList.add("is-rolling");
      return ensureCube(el);
    });

    function tick(now) {
      var t = now - start;
      if (t < duration) {
        cubes.forEach(function (cube) {
          var x = Math.floor(Math.random() * 4) * 90;
          var y = Math.floor(Math.random() * 4) * 90;
          cube.style.transform = "rotateX(" + x + "deg) rotateY(" + y + "deg)";
        });
        requestAnimationFrame(tick);
      } else {
        renderDie(dieEls[0], finalDice.d1);
        renderDie(dieEls[1], finalDice.d2);
        dieEls.forEach(function (el) {
          el.classList.remove("is-rolling");
          el.classList.add("is-landed");
        });
        setTimeout(function () {
          dieEls.forEach(function (el) {
            el.classList.remove("is-landed");
          });
        }, 420);
        if (onDone) onDone();
      }
    }
    requestAnimationFrame(tick);
  }

  root.CrapsDice = {
    renderDie: renderDie,
    animateRoll: animateRoll,
  };
})(typeof self !== "undefined" ? self : this);
