/* ==========================================================================
   Orcane — hero background waves

   Bands of fine parallel lines sweeping across the hero. Each line in a band
   is the same pair of sine waves at a slightly shifted phase, and because the
   two waves take DIFFERENT shares of that shift, the per-line spread cancels
   at certain points along x — the band pinches to a node there and fans wide
   between nodes. That is what produces the woven, moiré look.

   Drawn additively, so the converging nodes brighten while the open fans stay
   dark. Leans toward the pointer via window.OrcanePointer.
   ========================================================================== */
(function () {
  "use strict";

  var canvas = document.getElementById("hero-waves");
  if (!canvas || !canvas.getContext) return;

  var ctx = canvas.getContext("2d");
  var TAU = Math.PI * 2;

  var narrow = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0) < 700;
  var LINES = narrow ? 18 : 26;   // lines per band
  var SAMPLES = narrow ? 40 : 56; // points across the width

  /* Each band: vertical centre (fraction of height), the two sine waves that
     shape it (amplitude as a fraction of height, frequency in cycles across
     the canvas, drift speed, starting phase), how much phase each successive
     line adds, and the colour ramp painted across x. */
  var BANDS = [
    {
      y: 0.26, spread: 0.055, share: 0.35,
      a1: 0.150, f1: 1.05, s1: 0.055, p1: 0.0,
      a2: 0.070, f2: 2.10, s2: -0.038, p2: 1.1,
      stops: [[0, "oklch(0.72 0.17 232)"], [0.55, "oklch(0.64 0.20 252)"], [1, "oklch(0.60 0.21 264)"]]
    },
    {
      y: 0.44, spread: 0.048, share: 0.62,
      a1: 0.135, f1: 0.85, s1: -0.041, p1: 2.4,
      a2: 0.062, f2: 1.85, s2: 0.052, p2: 0.3,
      stops: [[0, "oklch(0.78 0.13 205)"], [0.5, "oklch(0.74 0.16 222)"], [1, "oklch(0.66 0.20 248)"]]
    },
    {
      y: 0.53, spread: 0.062, share: 0.28,
      a1: 0.170, f1: 1.25, s1: 0.034, p1: 4.1,
      a2: 0.055, f2: 2.55, s2: -0.049, p2: 2.0,
      stops: [[0, "oklch(0.62 0.21 262)"], [0.5, "oklch(0.70 0.18 236)"], [1, "oklch(0.80 0.12 200)"]]
    },
    {
      y: 0.68, spread: 0.044, share: 0.72,
      a1: 0.125, f1: 0.95, s1: -0.029, p1: 1.3,
      a2: 0.075, f2: 2.30, s2: 0.044, p2: 3.4,
      stops: [[0, "oklch(0.58 0.22 266)"], [0.5, "oklch(0.72 0.17 230)"], [1, "oklch(0.64 0.20 254)"]]
    },
    {
      y: 0.80, spread: 0.058, share: 0.45,
      a1: 0.110, f1: 1.45, s1: 0.047, p1: 5.2,
      a2: 0.050, f2: 2.85, s2: -0.031, p2: 1.7,
      stops: [[0, "oklch(0.66 0.20 250)"], [0.5, "oklch(0.79 0.13 208)"], [1, "oklch(0.74 0.15 220)"]]
    }
  ];

  var W = 0, H = 0;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* eased pointer influence — main.js publishes the raw value */
  var leanX = 0, leanY = 0;

  function resize() {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    /* this covers the whole viewport, so it is by far the most expensive
       surface on the page — 1 device pixel per CSS pixel is plenty for a
       soft background and costs 36% less fill than 1.25 */
    var dpr = Math.min(window.devicePixelRatio || 1, 1);
    W = rect.width;
    H = rect.height;

    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    for (var b = 0; b < BANDS.length; b++) {
      var band = BANDS[b];
      var g = ctx.createLinearGradient(0, 0, W, 0);
      for (var k = 0; k < band.stops.length; k++) {
        g.addColorStop(band.stops[k][0], band.stops[k][1]);
      }
      band.grad = g;
    }
  }

  function draw(time) {
    var p = window.OrcanePointer;
    if (p && p.active) {
      leanX += (p.x - leanX) * 0.05;
      leanY += (p.y - leanY) * 0.05;
    } else {
      leanX += (0 - leanX) * 0.03;
      leanY += (0 - leanY) * 0.03;
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, W, H);

    ctx.globalCompositeOperation = "lighter";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = 0.8;

    var step = W / SAMPLES;

    for (var b = 0; b < BANDS.length; b++) {
      var band = BANDS[b];

      /* Amplitude keys off the SMALLER dimension. On a tall narrow phone the
         hero is far taller than it is wide, and scaling off height alone made
         the bands rear up almost vertically instead of flowing across. */
      var ampBase = Math.min(H, W);

      var cy = band.y * H;
      var A1 = band.a1 * ampBase;
      var A2 = band.a2 * ampBase;
      var w1 = band.f1 * TAU / W;
      var w2 = band.f2 * TAU / W;
      /* pointer pushes the phases apart and swells the amplitude a touch, so
         the weave visibly reacts to the cursor without losing its rhythm */
      var t1 = band.p1 + time * band.s1 * TAU + leanX * 0.9 * (1 + b * 0.12);
      var t2 = band.p2 + time * band.s2 * TAU - leanX * 0.6;
      A1 *= 1 + leanY * 0.22;
      A2 *= 1 - leanY * 0.16;

      ctx.strokeStyle = band.grad;

      for (var i = 0; i < LINES; i++) {
        /* the two waves take different shares of this line's phase offset,
           which is exactly what creates the pinch nodes */
        var ph = i * band.spread;
        var ph1 = ph;
        var ph2 = ph * band.share;

        /* fade the outermost lines of each band so it dissolves at its edges */
        var u = i / (LINES - 1);
        var edge = Math.sin(u * Math.PI);
        ctx.globalAlpha = 0.14 + 0.32 * edge;

        ctx.beginPath();
        for (var j = 0; j <= SAMPLES; j++) {
          var x = j * step;
          var y = cy
            + A1 * Math.sin(x * w1 + t1 + ph1)
            + A2 * Math.sin(x * w2 + t2 + ph2);

          if (j === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  /* ---------------------------------------------------------------------
     Loop — only while the hero is on screen
     --------------------------------------------------------------------- */
  var raf = 0, running = false, start = 0, last = 0;

  /* These bands drift at well under a tenth of a cycle per second, so redrawing
     them 60 times a second buys nothing the eye can see. Half rate halves the
     cost of what is the largest painted surface on the page. */
  var FRAME_MS = 1000 / 30;

  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (!start) start = now;
    if (now - last < FRAME_MS) return;
    last = now;
    draw((now - start) / 1000);
  }

  function play() {
    if (running || reduce) return;
    running = true;
    raf = requestAnimationFrame(tick);
  }

  function pause() {
    running = false;
    cancelAnimationFrame(raf);
  }

  resize();
  draw(0);

  var resizeTimer = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resize();
      if (!running) draw(0);
    }, 150);
  });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      entries[0].isIntersecting ? play() : pause();
    }, { threshold: 0 }).observe(canvas);
  } else {
    play();
  }

  document.addEventListener("visibilitychange", function () {
    document.hidden ? pause() : play();
  });
})();
