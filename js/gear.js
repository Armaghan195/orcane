/* ==========================================================================
   Orcane — the half gear

   A real gear wheel, turning continuously, drawn entirely in characters. Its
   centre sits ON the bottom edge of the band, so only the top half is ever in
   frame — the machine runs half-buried under the footer.

   It is not a sprite and not an image. Every frame each cell of the character
   grid is converted to polar coordinates about that centre, and the radius
   decides which PART of the gear the cell belongs to:

       u >= ROOT     the teeth   — cut by angle against the tooth pitch,
                                   tapering as they approach the tip
       u >= RIM      the rim     — a solid annulus
       u >= HUB_O    the spokes  — measured by perpendicular distance from
                                   each spoke axis, so they stay parallel-sided
                                   bars rather than fanning wedges
       u >= HUB_I    the hub     — a solid annulus
       below that    the bore    — empty

   Two details do the real work of making the rotation read:

     The tooth and spoke angles are measured in the gear's OWN frame
     (angle - rotation), so the teeth genuinely travel round.

     The character at each cell is hashed from those same rotating-frame
     coordinates, so the code texture rides along with the metal instead of
     sitting still while a silhouette sweeps over it.

   A fixed light sits off to one side. Because the gear turns under it and the
   light does not, the sheen sweeps across the teeth — which is what sells the
   motion at a glance.
   ========================================================================== */
(function () {
  "use strict";

  var canvas = document.getElementById("gear-field");
  if (!canvas || !canvas.getContext) return;

  var ctx = canvas.getContext("2d");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* 0 dust dim · 1 dust blue · 2 dust warm · 3-6 the gear, faint to hot */
  var TONES = [
    "rgba(150,170,198,0.12)",
    "rgba(88,196,244,0.26)",
    "rgba(214,158,108,0.22)",
    "rgba(180,198,220,0.42)",
    "rgba(206,222,240,0.70)",
    "rgba(232,242,252,0.90)",
    "rgba(250,253,255,1)"
  ];
  var BANDS = TONES.length;
  var CUTS = [0.10, 0.34, 0.60, 0.85];

  var DUST = ".,:;'`-~^\"01";
  var CODE = "01010101010101%#$!=&@*+";   /* weighted toward binary */

  /* --- gear proportions, as fractions of the tip radius --- */
  var TEETH  = 13;
  var ROOT   = 0.780;   /* tooth root / outside of the rim */
  var RIM    = 0.640;   /* inside of the rim */
  var HUB_O  = 0.280;   /* outside of the hub */
  var HUB_I  = 0.150;   /* the bore */
  var SPOKES = 6;
  var SPEED  = 0.34;    /* radians per second */

  var W = 0, H = 0, cols = 0, rows = 0, cellW = 0, cellH = 0, fontSize = 11;
  var dustCh = null, dustTone = null, lines = null, used = null;

  /* stable per-cell scramble that depends only on where a cell sits on the
     gear, so the texture turns with the teeth */
  function hash(a, b) {
    var h = (a * 73856093) ^ (b * 19349663);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function build() {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;

    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    fontSize = W < 700 ? 9 : 11;
    ctx.font = "500 " + fontSize + "px 'JetBrains Mono', ui-monospace, monospace";
    ctx.textBaseline = "top";

    cellW = ctx.measureText("M").width || fontSize * 0.6;
    cellH = Math.round(cellW / 0.55);
    cols = Math.ceil(W / cellW) + 2;
    rows = Math.ceil(H / cellH) + 1;

    var n = cols * rows;
    dustCh = new Array(n);
    dustTone = new Uint8Array(n);
    for (var i = 0; i < n; i++) {
      /* kept thin on purpose — the dust is there to stop the band reading as
         empty, not to become texture competing with the gear */
      if (Math.random() < 0.040) {
        dustCh[i] = DUST[(Math.random() * DUST.length) | 0];
        var q = Math.random();
        dustTone[i] = q < 0.04 ? 1 : (q < 0.07 ? 2 : 0);
      } else {
        dustCh[i] = null;
      }
    }

    lines = [];
    used = [];
    for (var b = 0; b < BANDS; b++) {
      var row = new Array(cols);
      for (var z = 0; z < cols; z++) row[z] = " ";
      lines.push(row);
      used.push(false);
    }
    return true;
  }

  /* ---------------------------------------------------------------------
     Glitch slices — short-lived horizontal tears
     --------------------------------------------------------------------- */
  var slices = [], nextTear = 0;

  function tears(now) {
    if (now > nextTear) {
      /* Deliberately faint: one thin line, displaced a couple of characters,
         gone in a blink, and seconds apart. Enough to keep the metal reading
         as signal rather than a drawing — not enough to become an effect of
         its own and turn the band into a separate section. */
      nextTear = now + 6000 + Math.random() * 8000;
      var r0 = (Math.random() * rows) | 0;
      slices.push({
        r0: r0,
        r1: r0 + 1,
        dx: (((Math.random() * 5) | 0) - 2),
        hot: Math.random() < 0.25,
        until: now + 50 + Math.random() * 110
      });
    }
    for (var j = slices.length - 1; j >= 0; j--) {
      if (now > slices[j].until) slices.splice(j, 1);
    }
  }

  /* ---------------------------------------------------------------------
     Draw
     --------------------------------------------------------------------- */
  var TAU = Math.PI * 2;

  function draw(now) {
    var t = now / 1000;
    tears(now);

    ctx.clearRect(0, 0, W, H);
    ctx.font = "500 " + fontSize + "px 'JetBrains Mono', ui-monospace, monospace";
    ctx.textBaseline = "top";

    var cx = W * 0.5;
    var cy = H;                                   /* centre on the bottom edge */
    /* kept just inside the band height so the crown of teeth is fully in frame */
    var R = Math.min(H * 0.94, W * 0.32);
    var rot = t * SPEED;
    var PITCH = TAU / TEETH;
    var spokeHalf = R * 0.07;
    var spokeStep = TAU / SPOKES;

    var b, z, c, s;

    for (var r = 0; r < rows; r++) {
      var dx = 0, hot = false;
      for (s = 0; s < slices.length; s++) {
        if (r >= slices[s].r0 && r < slices[s].r1) { dx += slices[s].dx; hot = hot || slices[s].hot; }
      }

      for (b = 0; b < BANDS; b++) {
        if (!used[b]) continue;
        var ln = lines[b];
        for (z = 0; z < cols; z++) ln[z] = " ";
        used[b] = false;
      }

      var py = r * cellH + cellH * 0.5;
      var oy = py - cy;

      for (c = 0; c < cols; c++) {
        var sc = c + dx;
        if (sc < 0) sc += cols;
        if (sc >= cols) sc -= cols;
        var i = r * cols + sc;

        var ox = sc * cellW + cellW * 0.5 - cx;
        var band = -1, ch = null;

        var rad = Math.sqrt(ox * ox + oy * oy);
        var u = rad / R;

        if (u < 1) {
          var th = Math.atan2(oy, ox);
          var loc = th - rot;                     /* the gear's own frame */
          var part = 0, base = 0;

          if (u >= ROOT) {
            var kk = loc / PITCH;
            var frac = kk - Math.floor(kk);
            var tip = (u - ROOT) / (1 - ROOT);
            /* the tooth narrows toward its tip, the way a real one does */
            if (Math.abs(frac - 0.5) < 0.5 * (0.56 - 0.24 * tip)) { part = 1; base = 0.98; }
          } else if (u >= RIM) {
            part = 2; base = 0.88;
          } else if (u >= HUB_O) {
            for (s = 0; s < SPOKES; s++) {
              var a = rot + s * spokeStep;
              var da = th - a;
              /* perpendicular distance keeps the spoke a parallel-sided bar */
              if (Math.cos(da) > 0 && Math.abs(rad * Math.sin(da)) < spokeHalf) {
                part = 3; base = 0.62; break;
              }
            }
          } else if (u >= HUB_I) {
            part = 4; base = 0.94;
          }

          if (part) {
            /* the light does not turn, so the sheen sweeps across the teeth */
            var lit = 0.5 + 0.5 * Math.cos(th + 0.8);
            var lum = base * (0.30 + 0.70 * lit);
            if (u > 0.97) lum *= (1 - u) / 0.03;  /* only the very tips soften */
            if (lum > CUTS[0]) {
              band = 3;
              if (lum > CUTS[1]) band = 4;
              if (lum > CUTS[2]) band = 5;
              if (lum > CUTS[3]) band = 6;
              ch = CODE[hash((loc / PITCH * 6) | 0, (u * 46) | 0) % CODE.length];
            }
          }
        }

        if (band < 0 && dustCh[i]) { band = dustTone[i]; ch = dustCh[i]; }
        if (band < 0) continue;

        if (hot && Math.random() < 0.10) {
          ch = CODE[(Math.random() * CODE.length) | 0];
          if (band > 2 && band < 6) band++;
        }

        lines[band][c] = ch;
        used[band] = true;
      }

      for (b = 0; b < BANDS; b++) {
        if (!used[b]) continue;
        ctx.fillStyle = TONES[b];
        ctx.fillText(lines[b].join(""), 0, r * cellH);
      }
    }
  }

  /* ---------------------------------------------------------------------
     Loop — only while the band is on screen
     --------------------------------------------------------------------- */
  var raf = 0, running = false, last = 0, live = false;
  var STEP = 1000 / 24;

  function frame(now) {
    if (now - last >= STEP) {
      last = now;
      draw(now);
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
    draw(performance.now());
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
