/* ==========================================================================
   Orcane — the glyph field

   A full-bleed wall of Orcane phrases in monospace, with a shape revealed
   INSIDE the text — not drawn over it.

   The critical trick: the characters never change inside the shape. Every
   cell keeps its phrase letter; the shape exists only because cells inside
   it are painted in brighter tones. The wall and the figure are the same
   text, so the eye reads one continuous field with light moving through it.

   The shape is the Orcane mark: the open ring, tapering from its blunt top
   end around to a pointed tail, with the fin sweeping into the gap at the
   upper left. The fin's cells are painted in the site accent so the mark
   carries its brand blue. Geometry mirrors assets/orcane-mark.svg.

     model      a 128x128 luminance map of the mark (green = ring, red = fin)
     accent     which of those cells belong to the fin
     cellBand   per-cell tone index, recomputed every frame

   The stage is pinned (position: sticky, one viewport tall), so the field
   and the mark hold perfectly still while the copy scrolls over them. That
   is what keeps the entrance clean: the mark is never caught half-drawn at
   the edge of the section, it is simply revealed whole.

   Two things move:

     torch   an inverse flashlight. Wherever the pointer goes, the field
             DARKENS in a soft circle — the mark dissolves and the wall
             text sinks to almost nothing, leaving a black hole that
             follows the cursor.

     shimmer a fraction of a percent of cells re-roll their glyph a few
             times a second, so the wall never sits perfectly still.

   Clicking anywhere detonates a shockwave from the pointer: characters
   turn to noise inside the expanding front, then settle back. No button
   and no cursor hint — an easter egg.
   ========================================================================== */
(function () {
  "use strict";

  var canvas = document.getElementById("why-field");
  var section = document.getElementById("why");
  if (!canvas || !canvas.getContext || !section) return;

  var ctx = canvas.getContext("2d");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var PHRASES = [
    "TAILORED NOT TEMPLATED", "SOFTWARE THAT SPEAKS YOUR LANGUAGE",
    "FULL STACK UNDER ONE ROOF", "BUILT AROUND YOUR WORKFLOW",
    "AI NATIVE ENGINEERING", "NO BLACK BOXES", "WEEKLY CHECK INS",
    "FULL SOURCE CODE OWNERSHIP", "DOCUMENTATION BY DEFAULT",
    "SECURITY BY DESIGN", "TESTED AGAINST REAL DATA",
    "CLOUD NATIVE ARCHITECTURE", "AI AUTOMATION PIPELINES",
    "MULTI TENANT SAAS", "CUSTOM ERP AND POS", "ORCANE",
    "A TECHNOLOGY PARTNER NOT A VENDOR", "WE DONT DISAPPEAR AFTER LAUNCH",
    "SHIP THEN IMPROVE", "ZERO RETRAINING"
  ];
  var STREAM = PHRASES.join(" · ") + " · ";

  var MODEL_N = 128;                /* the model is square: the art region is
                                       laid out square in pixels, so no aspect
                                       correction is needed anywhere */
  var model = null;                 /* Uint8Array 0..255 luminance */
  var accent = null;                /* Uint8Array 0/1 — fin cells */

  /* Tone bands. 0 is the wall, 1..4 the mark, 5 the fin in accent blue,
     6 and 7 the torch shadow — dimmer than the wall, which is what turns
     the pointer into a hole rather than a highlight. */
  var TONES = [
    "rgba(148,166,192,0.11)",
    "rgba(170,186,208,0.30)",
    "rgba(196,210,228,0.55)",
    "rgba(222,234,246,0.78)",
    "rgba(248,251,255,0.97)",
    "rgba(88,196,244,0.95)",
    "rgba(150,170,198,0.045)",
    "rgba(150,170,198,0.014)"
  ];
  var TONES_SOFT = [
    "rgba(148,166,192,0.12)",
    "rgba(164,180,202,0.22)",
    "rgba(186,200,218,0.34)",
    "rgba(208,222,238,0.46)",
    "rgba(236,244,252,0.58)",
    "rgba(88,196,244,0.60)",
    "rgba(150,170,198,0.050)",
    "rgba(150,170,198,0.016)"
  ];
  var BANDS = TONES.length;
  var FIN = 5, SHADE_1 = 6, SHADE_2 = 7;
  /* luminance thresholds into bands 1..4; below the first is the wall */
  var CUTS = [52, 100, 152, 205];

  var W = 0, H = 0, cols = 0, rows = 0, cellW = 0, cellH = 0, fontSize = 12;
  var artC0 = 0, artR0 = 0, artCols = 0, artRows = 0, artSide = 0;

  /* per-cell, rebuilt only on resize */
  var baseChars = null;   /* the phrase letter */
  var glyphAlt = null;    /* the glitch letter this cell shows when lit */
  var jitter = null;      /* per-word-run brightness wobble */
  var mcOf = null;        /* column -> model column, -1 outside the art */
  /* shimmer overrides, re-rolled a few times a second */
  var ovOn = null, ovCh = null, ovList = null;

  var cache = null;

  /* shockwave */
  var blastX = 0, blastY = 0, blastT = -1, energy = 0;
  var WAVE_SPEED = 2600;

  /* torch */
  var ptrX = -1e4, ptrY = -1e4, torchAmt = 0, torchWant = 0, TORCH_R = 260;

  var animate = false;              /* on screen, visible, motion allowed */
  var FLICKER = 0.006;
  var NOISE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/+*#@";
  /* what a corrupted cell becomes — digits and slashes, like the reference */
  var GLITCH = "0123456789//++**##";

  /* ---------------------------------------------------------------------
     Rasterise the Orcane mark into the model.
     Same geometry as assets/orcane-mark.svg, composed in 0..100 space:
     a circle of radius 35 around (50,50), stroked clockwise from its blunt
     top end down the right side and back up the left to a pointed tail,
     leaving the gap at the upper left where the fin sweeps in.
     Ring goes in the green channel, fin in the red channel, so the fin
     cells can be told apart and painted in the accent blue.
     --------------------------------------------------------------------- */
  function buildModel() {
    var cv = document.createElement("canvas");
    cv.width = MODEL_N;
    cv.height = MODEL_N;
    var g = cv.getContext("2d");
    g.setTransform(MODEL_N / 100, 0, 0, MODEL_N / 100, 0, 0);
    g.lineCap = "round";

    /* --- the ring, as many short arc segments so the width can taper ---
       svg arc: from (39.18,16.71) clockwise to (15.34,54.87) on r=35.
       Those endpoints are at -1.885 rad and 3.002 rad from the centre. */
    var A0 = -1.885, A1 = 3.002;
    var SWEEP = A1 - A0;                  /* ~4.89 rad, leaves an 80° gap */
    var STEPS = 90;
    g.strokeStyle = "#0f0";
    for (var s = 0; s < STEPS; s++) {
      var t0 = s / STEPS, t1 = (s + 1) / STEPS;
      /* blunt at the start, fattest along the bottom, then thinning to a
         point at the tail below the gap — the taper is the mark */
      var t = (t0 + t1) / 2;
      var w = 7.5 + 5.5 * Math.sin(Math.min(t * 1.45, 1) * Math.PI);
      if (t > 0.78) w *= Math.max(0, (1 - t) / 0.22);
      if (w < 0.4) continue;
      g.lineWidth = w;
      g.beginPath();
      g.arc(50, 50, 35, A0 + SWEEP * t0, A0 + SWEEP * t1 + 0.01);
      g.stroke();
    }

    /* --- the fin, filled, slightly fattened from the svg's crescent --- */
    g.fillStyle = "#f00";
    g.beginPath();
    g.moveTo(44, 25);
    g.bezierCurveTo(29, 27, 19.5, 36, 14.5, 55.5);
    g.bezierCurveTo(25.5, 40, 34, 31.5, 44, 25);
    g.closePath();
    g.fill();

    /* soften the edges so the falloff into the wall is ragged, not a rule */
    var cv2 = document.createElement("canvas");
    cv2.width = MODEL_N;
    cv2.height = MODEL_N;
    var g2 = cv2.getContext("2d");
    g2.filter = "blur(1px)";
    g2.drawImage(cv, 0, 0);

    var d = g2.getImageData(0, 0, MODEL_N, MODEL_N).data;
    var n = MODEL_N * MODEL_N;
    model = new Uint8Array(n);
    accent = new Uint8Array(n);
    for (var i = 0; i < n; i++) {
      var rr = d[i * 4], gg = d[i * 4 + 1], aa = d[i * 4 + 3];
      model[i] = Math.round(Math.max(rr, gg) * (aa / 255));
      accent[i] = rr > gg ? 1 : 0;
    }
  }

  /* ---------------------------------------------------------------------
     Layout — rebuild the character grid
     --------------------------------------------------------------------- */
  function resize() {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = rect.width;
    H = rect.height;

    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    fontSize = W < 700 ? 9 : 12;
    ctx.font = "500 " + fontSize + "px 'JetBrains Mono', ui-monospace, monospace";
    ctx.textBaseline = "top";

    cellW = ctx.measureText("M").width || fontSize * 0.6;
    cellH = Math.round(cellW / 0.55);
    cols = Math.ceil(W / cellW) + 1;
    rows = Math.ceil(H / cellH) + 1;

    TORCH_R = Math.max(120, Math.min(W * 0.135, 225));

    /* The stage is pinned and exactly one viewport tall, so the mark simply
       sits still in it — no scroll maths. It hugs the right edge, clear of
       the copy column; on a phone it spans the width and sits behind it.
       Square, so it is bounded by the height as well as the width. */
    var narrow = W < 760;
    artSide = narrow ? W * 0.86 : Math.min(W * 0.42, 900, H * 0.76);
    var leftPx = narrow ? W * 0.07 : W - artSide - Math.max(20, Math.min(W * 0.03, 64));

    artC0 = Math.round(leftPx / cellW);
    artCols = Math.round(artSide / cellW);
    artRows = Math.round(artSide / cellH);   /* square in pixels */
    artR0 = Math.round((H - artSide) * (narrow ? 0.44 : 0.5) / cellH);

    if (!model) buildModel();

    var n = cols * rows;
    baseChars = new Array(n);
    glyphAlt = new Array(n);
    jitter = new Float32Array(n);
    ovOn = new Uint8Array(n);
    ovCh = new Array(n);
    ovList = [];

    /* column -> model column, once: the art's horizontal span never moves */
    mcOf = new Int16Array(cols);
    for (var c0 = 0; c0 < cols; c0++) {
      mcOf[c0] = (c0 >= artC0 && c0 < artC0 + artCols)
        ? Math.min(MODEL_N - 1, Math.floor((c0 - artC0) / artCols * MODEL_N))
        : -1;
    }

    for (var r = 0; r < rows; r++) {
      var p = (r * 41) % STREAM.length;
      /* one wobble per word-run: whole words drop or gain a band together,
         which gives the mark a ragged edge instead of an airbrushed one */
      var jit = 1;
      for (var c = 0; c < cols; c++) {
        var i = r * cols + c;
        var ch = STREAM[(p + c) % STREAM.length];
        if (ch === " " || ch === "·") jit = 0.84 + Math.random() * 0.34;

        baseChars[i] = ch;
        jitter[i] = jit;
        /* the glitch texture: a few percent of cells show a digit or slash
           instead of their letter, but only once they are lit */
        if (ch === " " || ch === "·") {
          glyphAlt[i] = Math.random() < 0.03 ? GLITCH[(Math.random() * GLITCH.length) | 0] : ch;
        } else {
          glyphAlt[i] = Math.random() < 0.045 ? GLITCH[(Math.random() * GLITCH.length) | 0] : ch;
        }
      }
    }

    cache = null;
    lines = null;
  }

  /* ---------------------------------------------------------------------
     Shimmer — pick a new handful of cells to misprint. Held for ~80ms so
     the wall breathes rather than boils.
     --------------------------------------------------------------------- */
  function rollShimmer() {
    var k;
    for (k = 0; k < ovList.length; k++) ovOn[ovList[k]] = 0;
    ovList.length = 0;

    var n = cols * rows;
    var target = Math.round(n * FLICKER);
    for (k = 0; k < target; k++) {
      var i = (Math.random() * n) | 0;
      var ch = baseChars[i];
      if (ch === " " || ch === "·" || ovOn[i]) continue;
      ovOn[i] = 1;
      ovCh[i] = NOISE[(Math.random() * NOISE.length) | 0];
      ovList.push(i);
    }
  }

  /* ---------------------------------------------------------------------
     Compose one string per row per tone band
     --------------------------------------------------------------------- */
  var lines = null, used = null;

  function compose(now) {
    var live = energy > 0.02;
    var torch = torchAmt > 0.005;

    /* Nothing moving and nothing to re-roll — hand back the settled frame. */
    if (!live && !torch && !animate && cache) return cache;

    var waveR = live ? (now - blastT) / 1000 * WAVE_SPEED : 0;
    var R2 = TORCH_R * TORCH_R;

    var b, z;
    /* The band buffers are kept between frames and start out all spaces;
       each row only has to wipe the bands it actually wrote to. Most bands
       are empty on most rows, so that is a fraction of the work. */
    if (!lines) {
      lines = [];
      used = [];
      for (b = 0; b < BANDS; b++) {
        var fresh = new Array(cols);
        for (z = 0; z < cols; z++) fresh[z] = " ";
        lines.push(fresh);
        used.push(false);
      }
    }

    var out = [];
    for (b = 0; b < BANDS; b++) out.push(new Array(rows));

    for (var r = 0; r < rows; r++) {
      var y = r * cellH + cellH * 0.5;
      var base = r * cols;
      var inR = r >= artR0 && r < artR0 + artRows;
      var mrow = inR ? Math.min(MODEL_N - 1, ((r - artR0) / artRows * MODEL_N) | 0) * MODEL_N : -1;
      var dy = y - ptrY;
      var dy2 = dy * dy;
      var rowLit = torch && dy2 < R2;

      for (b = 0; b < BANDS; b++) {
        if (!used[b]) continue;
        var ln = lines[b];
        for (z = 0; z < cols; z++) ln[z] = " ";
        used[b] = false;
      }

      for (var c = 0; c < cols; c++) {
        var i = base + c;
        var ch = ovOn[i] ? ovCh[i] : baseChars[i];

        /* --- how bright is this cell's model sample --- */
        var lum = 0, fin = 0;
        if (mrow >= 0) {
          var mc = mcOf[c];
          if (mc >= 0) {
            var mi = mrow + mc;
            lum = model[mi] * jitter[i];
            fin = accent[mi];
          }
        }

        /* --- the torch: a soft circle that drains light out of the field --- */
        var shadow = 0;
        if (rowLit) {
          var dx = c * cellW + cellW * 0.5 - ptrX;
          var d2 = dx * dx + dy2;
          if (d2 < R2) {
            var u = Math.sqrt(d2) / TORCH_R;
            var g = 1 - u;
            g = g * g * (3 - 2 * g) * torchAmt;   /* smooth, 1 at the centre */
            lum *= 1 - 0.96 * g;
            shadow = g;
          }
        }

        var band = 0;
        if (lum >= CUTS[0]) {
          band = 1;
          if (lum >= CUTS[1]) band = 2;
          if (lum >= CUTS[2]) band = 3;
          if (lum >= CUTS[3]) band = 4;
          if (fin) band = FIN;                  /* the fin, in accent blue */
          ch = ovOn[i] ? ovCh[i] : glyphAlt[i]; /* lit cells may be corrupted */
        } else if (shadow > 0.5) {
          band = SHADE_2;
        } else if (shadow > 0.22) {
          band = SHADE_1;
        }

        if (live) {
          var wx = c * cellW + cellW * 0.5 - blastX;
          var wy = y - blastY;
          var d = Math.sqrt(wx * wx + wy * wy);
          if (d < waveR) {
            var pr = energy * (0.35 + 0.65 * Math.max(0, 1 - (waveR - d) / 460));
            if (Math.random() < pr) ch = NOISE[(Math.random() * NOISE.length) | 0];
          }
        }

        lines[band][c] = ch;
        used[band] = true;
      }

      /* An empty row for a band costs a fillText that draws nothing, and
         most bands are empty on most rows — so only keep the ones used. */
      for (b = 0; b < BANDS; b++) out[b][r] = used[b] ? lines[b].join("") : null;
    }

    if (!live && !torch && !animate) cache = out;
    return out;
  }

  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    /* On a phone the copy sits directly on top of the field, so the mark
       drops back to being texture instead of competing for attention. */
    var tones = W < 760 ? TONES_SOFT : TONES;
    ctx.font = "500 " + fontSize + "px 'JetBrains Mono', ui-monospace, monospace";
    ctx.textBaseline = "top";

    var band = compose(now);
    for (var b = 0; b < BANDS; b++) {
      ctx.fillStyle = tones[b];
      var ln = band[b];
      for (var r = 0; r < rows; r++) {
        if (ln[r]) ctx.fillText(ln[r], 0, r * cellH);
      }
    }
  }

  /* ---------------------------------------------------------------------
     Pointer — the torch follows it, a click detonates
     --------------------------------------------------------------------- */
  function movePointer(e) {
    var rect = canvas.getBoundingClientRect();
    ptrX = e.clientX - rect.left;
    ptrY = e.clientY - rect.top;
    torchWant = 1;
    play();
  }

  section.addEventListener("pointermove", movePointer);
  section.addEventListener("pointerenter", movePointer);
  section.addEventListener("pointerleave", function () { torchWant = 0; });
  /* touch never fires pointerleave, so the torch would stick on after a drag */
  section.addEventListener("pointerup", function (e) { if (e.pointerType !== "mouse") torchWant = 0; });
  section.addEventListener("pointercancel", function () { torchWant = 0; });

  section.addEventListener("pointerdown", function (e) {
    if (e.target.closest("a, button")) return;
    var rect = canvas.getBoundingClientRect();
    blastX = e.clientX - rect.left;
    blastY = e.clientY - rect.top;
    blastT = performance.now();
    energy = 1;
    cache = null;
    play();
  });

  /* ---------------------------------------------------------------------
     Loop — runs while the section is on screen. It steps up to 30fps
     whenever the torch, the drift or a shockwave needs smoothness, and
     falls back to a lazy 13fps for the ambient shimmer alone.
     --------------------------------------------------------------------- */
  var raf = 0, running = false, last = 0, shimAt = 0;
  var inView = false;
  var IDLE_MS = 1000 / 13;
  var BUSY_MS = 1000 / 30;
  var SHIM_MS = 80;

  function frame(now) {
    var busy = energy > 0 || torchAmt > 0.005 || torchWant > 0;
    var step = busy ? BUSY_MS : IDLE_MS;

    if (!last || now - last >= step) {
      last = now;

      if (energy > 0) {
        energy *= 0.955;
        if (energy < 0.02) energy = 0;
      }
      /* the torch eases in and out so it never pops */
      torchAmt += (torchWant - torchAmt) * (torchWant > torchAmt ? 0.30 : 0.14);
      if (torchAmt < 0.004) torchAmt = 0;

      if (animate && now - shimAt >= SHIM_MS) {
        shimAt = now;
        rollShimmer();
      }
      draw(now);
    }

    if (animate || energy > 0 || torchAmt > 0.005) raf = requestAnimationFrame(frame);
    else { running = false; raf = 0; }
  }

  function play() {
    if (running || reduce) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  function sync() {
    animate = !reduce && inView && !document.hidden;
    if (!inView) torchWant = 0;
    if (animate || energy > 0) play();
  }

  function boot() {
    resize();
    draw(performance.now());
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(boot);
  boot();

  var rt = 0;
  window.addEventListener("resize", function () {
    clearTimeout(rt);
    lines = null;
    rt = setTimeout(boot, 160);
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      animate = false;
      if (raf) { cancelAnimationFrame(raf); running = false; raf = 0; }
    } else {
      sync();
    }
  });

  /* Only burn frames while the section is actually on screen. */
  if (!reduce && "IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      sync();
    }, { threshold: 0, rootMargin: "120px 0px" }).observe(section);
  } else if (!reduce) {
    inView = true;
    sync();
  }
})();
