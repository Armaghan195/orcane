/* ==========================================================================
   Orcane — the living quotation mark

   The same trick as the glyph field in the Why Us section, except it never
   settles: the quotation mark is a region of characters that re-roll several
   times a second, permanently. No click, no trigger, no resting state.

   The mark itself is rasterised from a real serif quote glyph at exactly one
   pixel per character cell, so the silhouette is the typeface's, not a shape
   approximated by hand. Its alpha becomes the tone ramp.
   ========================================================================== */
(function () {
  "use strict";

  var canvas = document.getElementById("quote-glyph");
  if (!canvas || !canvas.getContext) return;

  var ctx = canvas.getContext("2d");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var NOISE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\+*#@%$&=<>?!";
  var TONES = [
    "rgba(176,192,214,0.34)",
    "rgba(214,228,244,0.68)",
    "rgba(246,250,255,0.97)",
    "rgba(88,196,244,0.95)"      /* the sparkle */
  ];
  var CUTS = [40, 120, 205];

  var W = 0, H = 0, cols = 0, rows = 0, cellW = 0, cellH = 0, fontSize = 10;
  var model = null, lines = null, used = null;

  function build() {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    fontSize = W < 130 ? 7 : 8;
    ctx.font = "500 " + fontSize + "px 'JetBrains Mono', ui-monospace, monospace";
    ctx.textBaseline = "top";
    cellW = ctx.measureText("M").width || fontSize * 0.6;
    cellH = Math.round(cellW / 0.55);
    cols = Math.max(2, Math.floor(W / cellW));
    rows = Math.max(2, Math.floor(H / cellH));

    /* --- rasterise the glyph at one pixel per cell --- */
    var off = document.createElement("canvas");
    off.width = cols;
    off.height = rows;
    var g = off.getContext("2d");

    var BASE = 100;
    g.font = "700 " + BASE + "px Georgia, 'Times New Roman', serif";
    g.textAlign = "left";
    g.textBaseline = "alphabetic";

    var m = g.measureText("“");
    var gl = m.actualBoundingBoxLeft || 0;
    var gr = m.actualBoundingBoxRight || BASE * 0.8;
    var ga = m.actualBoundingBoxAscent || BASE * 0.7;
    var gd = m.actualBoundingBoxDescent || 0;
    var gw = gl + gr, gh = ga + gd;
    if (gw <= 0 || gh <= 0) return false;

    /* Fit the glyph without distorting it. One grid step is cellW wide but
       cellH tall, so a single PHYSICAL scale has to become two different grid
       scales — otherwise the mark stretches to fill the square grid and stops
       looking like the typeface's own quote. */
    var s = Math.min(cols * cellW / gw, rows * cellH / gh) * 0.94;
    var sx = s / cellW;
    var sy = s / cellH;
    g.setTransform(sx, 0, 0, sy, 0, 0);
    g.fillStyle = "#fff";
    g.fillText("“", (cols / sx - gw) / 2 + gl, (rows / sy - gh) / 2 + ga);

    var d = g.getImageData(0, 0, cols, rows).data;
    var n = cols * rows;
    model = new Uint8Array(n);
    for (var i = 0; i < n; i++) model[i] = d[i * 4 + 3];

    lines = [];
    used = [];
    for (var b = 0; b < TONES.length; b++) {
      var row = new Array(cols);
      for (var z = 0; z < cols; z++) row[z] = " ";
      lines.push(row);
      used.push(false);
    }
    return true;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.font = "500 " + fontSize + "px 'JetBrains Mono', ui-monospace, monospace";
    ctx.textBaseline = "top";

    var b, z;
    for (var r = 0; r < rows; r++) {
      for (b = 0; b < TONES.length; b++) {
        if (!used[b]) continue;
        var ln = lines[b];
        for (z = 0; z < cols; z++) ln[z] = " ";
        used[b] = false;
      }

      var base = r * cols;
      for (var c = 0; c < cols; c++) {
        var a = model[base + c];
        if (a < CUTS[0]) continue;
        var band = a >= CUTS[2] ? 2 : (a >= CUTS[1] ? 1 : 0);
        if (Math.random() < 0.09) band = 3;
        lines[band][c] = NOISE[(Math.random() * NOISE.length) | 0];
        used[band] = true;
      }

      for (b = 0; b < TONES.length; b++) {
        if (!used[b]) continue;
        ctx.fillStyle = TONES[b];
        ctx.fillText(lines[b].join(""), 0, r * cellH);
      }
    }
  }

  /* ---------------------------------------------------------------------
     Loop — slow enough to read as churning type rather than a blur
     --------------------------------------------------------------------- */
  var raf = 0, running = false, last = 0, live = false;
  var STEP = 1000 / 15;

  function frame(now) {
    if (now - last >= STEP) {
      last = now;
      draw();
    }
    if (live) raf = requestAnimationFrame(frame);
    else { running = false; raf = 0; }
  }

  function play() {
    if (running || reduce || !live) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  function boot() {
    if (!build()) return;
    draw();
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(boot);
  boot();

  if (!reduce && "IntersectionObserver" in window) {
    new IntersectionObserver(function (e) {
      live = e[0].isIntersecting;
      if (live) play();
    }, { rootMargin: "100px 0px" }).observe(canvas);
  } else if (!reduce) {
    live = true;
    play();
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      if (raf) { cancelAnimationFrame(raf); raf = 0; running = false; }
    } else {
      play();
    }
  });

  var rt = 0;
  window.addEventListener("resize", function () {
    clearTimeout(rt);
    rt = setTimeout(boot, 160);
  });
})();
