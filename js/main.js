/* ==========================================================================
   Orcane — interaction layer
   ========================================================================== */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(pointer: fine)").matches;

  /* Shared pointer state, in -0.5..0.5 across the viewport. hero-waves.js
     reads this to lean the bands toward the cursor. */
  var pointer = window.OrcanePointer = { x: 0, y: 0, active: false };

  /* ---------------------------------------------------------------------
     Header — solid once you leave the top
     --------------------------------------------------------------------- */
  (function header() {
    var el = document.getElementById("site-header");
    if (!el) return;
    var ticking = false;

    function apply() {
      el.classList.toggle("is-stuck", window.scrollY > 12);
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    }, { passive: true });
    apply();
  })();

  /* ---------------------------------------------------------------------
     Mobile menu
     --------------------------------------------------------------------- */
  (function mobileMenu() {
    var toggle = document.getElementById("nav-toggle");
    var panel = document.getElementById("mobile-nav");
    if (!toggle || !panel) return;

    var links = panel.querySelectorAll(".mobile-nav-inner > a");
    for (var i = 0; i < links.length; i++) links[i].style.setProperty("--i", i);

    var open = false;

    function setOpen(next) {
      open = next;
      toggle.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      document.body.style.overflow = open ? "hidden" : "";

      if (open) {
        panel.hidden = false;
        /* let the browser paint the hidden->shown flip before transitioning */
        requestAnimationFrame(function () { panel.classList.add("is-open"); });
      } else {
        panel.classList.remove("is-open");
        setTimeout(function () { if (!open) panel.hidden = true; }, 300);
      }
    }

    toggle.addEventListener("click", function () { setOpen(!open); });

    panel.addEventListener("click", function (e) {
      if (e.target.closest("a")) setOpen(false);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && open) { setOpen(false); toggle.focus(); }
    });

    /* if the viewport grows past the breakpoint, drop the overlay */
    window.matchMedia("(min-width: 1000px)").addEventListener("change", function (e) {
      if (e.matches && open) setOpen(false);
    });
  })();

  /* ---------------------------------------------------------------------
     Headline — split to characters, fade each up, then run a short
     monospace "decode" scramble over the accent words.
     --------------------------------------------------------------------- */
  (function headline() {
    var el = document.getElementById("hero-title");
    if (!el) return;

    var l1 = el.dataset.l1 || "";
    var l2 = el.dataset.l2 || "";
    var accent = el.dataset.accent || "";

    el.setAttribute("aria-label", (l1 + " " + l2).trim());
    el.textContent = "";

    var index = 0;
    var scrambleTargets = [];

    function buildLine(text, accentPart) {
      var line = document.createElement("span");
      line.className = "ln";

      /* where the accent run starts in this line, or -1 */
      var aStart = accentPart ? text.indexOf(accentPart) : -1;
      var aEnd = aStart > -1 ? aStart + accentPart.length : -1;

      /* Characters are individually animated, so each one is its own
         inline-block — which lets the browser break a line mid-word. Wrapping
         every word keeps breaks on spaces where they belong. */
      var words = text.split(" ");
      var pos = 0;

      words.forEach(function (word, wi) {
        var wd = document.createElement("span");
        wd.className = "wd";

        for (var i = 0; i < word.length; i++) {
          var ch = document.createElement("span");
          ch.className = "ch";
          ch.textContent = word[i];
          ch.style.setProperty("--cd", index * 22 + "ms");

          if (aStart > -1 && pos >= aStart && pos < aEnd) {
            ch.classList.add("is-accent");
            scrambleTargets.push({ el: ch, real: word[i], at: index });
          }
          wd.appendChild(ch);
          index++;
          pos++;
        }

        line.appendChild(wd);

        if (wi < words.length - 1) {
          line.appendChild(document.createTextNode(" "));
          pos++;   /* the space counts in the source string */
          index++; /* keep the stagger cadence even across spaces */
        }
      });

      el.appendChild(line);
    }

    buildLine(l1, null);
    /* keeps copied/selected text reading "to engineer", not "toengineer" —
       between two block-level lines the space itself renders as nothing */
    el.appendChild(document.createTextNode(" "));
    buildLine(l2, accent);

    if (reduce || !scrambleTargets.length) return;

    var GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\<>[]{}*#%$@";

    /* The headline is a proportional grotesk now, so a scrambled "W" is wider
       than the "t" it replaced and the line would jitter on every tick. Pin
       each cell to the width of its real character first. */
    function lockWidths() {
      scrambleTargets.forEach(function (t) {
        t.el.textContent = t.real;
        t.el.style.width = "";
      });
      scrambleTargets.forEach(function (t) {
        t.w = t.el.getBoundingClientRect().width;
      });
      scrambleTargets.forEach(function (t) {
        t.el.style.width = t.w.toFixed(2) + "px";
        t.el.style.textAlign = "center";
      });
    }

    var timers = [];
    function clearTimers() {
      timers.forEach(function (id) { clearInterval(id); });
      timers.length = 0;
    }

    /* run the decode over the accent run; `stagger` spreads the start times */
    function runScramble(stagger) {
      clearTimers();
      scrambleTargets.forEach(function (t, i) {
        var ticks = 7 + Math.floor(Math.random() * 6);
        var n = 0;
        var delay = stagger ? t.at * 22 + 60 : i * 32;

        var startId = setTimeout(function () {
          var id = setInterval(function () {
            if (n >= ticks) {
              clearInterval(id);
              t.el.textContent = t.real;
              return;
            }
            t.el.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
            n++;
          }, 34);
          timers.push(id);
        }, delay);
        timers.push(startId);
      });
    }

    function start() {
      lockWidths();
      runScramble(true);

      /* keep replaying it so the hero never goes fully static */
      var REPLAY_MS = 6500;
      var loop = setInterval(function () {
        if (document.hidden) return;
        if (el.getBoundingClientRect().bottom < 0) return;  /* scrolled past */
        runScramble(false);
      }, REPLAY_MS);

      var rt = 0;
      window.addEventListener("resize", function () {
        clearTimeout(rt);
        rt = setTimeout(lockWidths, 180);
      });

      window.addEventListener("pagehide", function () {
        clearInterval(loop);
        clearTimers();
      });
    }

    /* widths must be measured with the real webfont, not the fallback */
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(start);
    else start();
  })();

  /* ---------------------------------------------------------------------
     Magnetic buttons — the element leans toward the cursor
     --------------------------------------------------------------------- */
  (function magnetic() {
    if (reduce || !finePointer) return;

    var els = document.querySelectorAll("[data-magnetic]");

    Array.prototype.forEach.call(els, function (el) {
      var raf = 0, tx = 0, ty = 0, cx = 0, cy = 0;

      function loop() {
        cx += (tx - cx) * 0.18;
        cy += (ty - cy) * 0.18;
        el.style.transform = "translate(" + cx.toFixed(2) + "px," + cy.toFixed(2) + "px)";
        if (Math.abs(tx - cx) > 0.1 || Math.abs(ty - cy) > 0.1) {
          raf = requestAnimationFrame(loop);
        } else {
          raf = 0;
          if (tx === 0 && ty === 0) el.style.transform = "";
        }
      }
      function kick() { if (!raf) raf = requestAnimationFrame(loop); }

      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        tx = (e.clientX - (r.left + r.width / 2)) * 0.28;
        ty = (e.clientY - (r.top + r.height / 2)) * 0.42;
        kick();
      });
      el.addEventListener("pointerleave", function () { tx = 0; ty = 0; kick(); });
    });
  })();

  /* ---------------------------------------------------------------------
     Pointer tracking — feeds the neon glow and the wave background
     --------------------------------------------------------------------- */
  (function pointerTrack() {
    var glow = document.getElementById("hero-glow");
    var hero = document.querySelector(".hero");
    if (!hero) return;

    var gx = 0, gy = 0, tx = 0, ty = 0, raf = 0, live = false;

    function loop() {
      gx += (tx - gx) * 0.12;
      gy += (ty - gy) * 0.12;
      if (glow) glow.style.transform = "translate3d(" + gx.toFixed(1) + "px," + gy.toFixed(1) + "px,0)";
      raf = Math.abs(tx - gx) > 0.5 || Math.abs(ty - gy) > 0.5 ? requestAnimationFrame(loop) : 0;
    }

    window.addEventListener("pointermove", function (e) {
      pointer.x = e.clientX / window.innerWidth - 0.5;
      pointer.y = e.clientY / window.innerHeight - 0.5;
      pointer.active = true;

      if (reduce || !finePointer || !glow) return;

      var r = hero.getBoundingClientRect();
      tx = e.clientX - r.left;
      ty = e.clientY - r.top;

      if (!live) { live = true; glow.classList.add("is-live"); gx = tx; gy = ty; }
      if (!raf) raf = requestAnimationFrame(loop);
    }, { passive: true });

    window.addEventListener("pointerleave", function () {
      pointer.active = false;
      if (glow) glow.classList.remove("is-live");
      live = false;
    });
  })();

  /* ---------------------------------------------------------------------
     Stat counters — run up once the bar is in view
     --------------------------------------------------------------------- */
  (function counters() {
    var nums = document.querySelectorAll(".stat-num[data-count]");
    if (!nums.length) return;

    if (reduce || !("IntersectionObserver" in window)) return;

    function run(el) {
      var target = parseFloat(el.dataset.count);
      var suffix = el.dataset.suffix || "";
      var dur = 1100;
      var t0 = 0;

      function step(now) {
        if (!t0) t0 = now;
        var p = Math.min((now - t0) / dur, 1);
        /* ease-out so it decelerates into the final number */
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased) + suffix;
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        run(entry.target);
        io.unobserve(entry.target);
      });
    }, { threshold: 0.6 });

    Array.prototype.forEach.call(nums, function (n) { io.observe(n); });
  })();

  /* ---------------------------------------------------------------------
     Section reveals — numbered lists rise as they enter. The cost rows carry
     a --i so they cascade in one after another rather than all at once.
     --------------------------------------------------------------------- */
  (function sectionReveal() {
    var items = document.querySelectorAll(".why-item, .cost-panel, .proc-step");
    if (!items.length) return;

    if (reduce || !("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(items, function (n) { n.classList.add("in-view"); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in-view");
        io.unobserve(entry.target);
      });
    }, { threshold: 0.25, rootMargin: "0px 0px -8% 0px" });

    Array.prototype.forEach.call(items, function (n) { io.observe(n); });
  })();

  /* ---------------------------------------------------------------------
     Placeholder anchors — the sections they point at do not exist yet
     --------------------------------------------------------------------- */
  (function pendingLinks() {
    var ids = ["services", "why", "product", "projects", "process", "stack", "book"];
    document.addEventListener("click", function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute("href").slice(1);
      if (ids.indexOf(id) > -1 && !document.getElementById(id)) e.preventDefault();
    });
  })();

  /* ---------------------------------------------------------------------
     Process tracker — light the step the reader is on, and leave the ones
     behind it marked as passed so the rail fills in as progress.
     --------------------------------------------------------------------- */
  (function procSpy() {
    var list = document.querySelector(".proc-list");
    if (!list) return;
    var steps = list.querySelectorAll(".proc-step");
    if (!steps.length) return;

    /* Only dim the inactive steps once this is actually running. Without it
       a JS failure would leave every step permanently dimmed. */
    list.classList.add("has-spy");

    var ticking = false;

    function apply() {
      ticking = false;
      var line = window.scrollY + window.innerHeight * 0.42;
      var active = -1;

      /* steps are in document order top to bottom, so the last one whose top
         the reading line has passed is the one being read */
      for (var i = 0; i < steps.length; i++) {
        if (steps[i].getBoundingClientRect().top + window.scrollY <= line) active = i;
      }

      for (var j = 0; j < steps.length; j++) {
        steps[j].classList.toggle("is-active", j === active);
        steps[j].classList.toggle("is-done", j < active);
      }
    }

    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    }, { passive: true });
    window.addEventListener("resize", apply);
    apply();
  })();

  /* ---------------------------------------------------------------------
     Nav highlight — mark which section the reader is actually in.

     The test is a reading line a third of the way down the viewport rather
     than the very top, so a section counts as "current" once it is properly
     on screen instead of the instant its first pixel appears.
     --------------------------------------------------------------------- */
  (function navSpy() {
    var byId = {};
    var links = document.querySelectorAll('.nav-link[href^="#"], .mobile-nav-inner a[href^="#"]');

    Array.prototype.forEach.call(links, function (a) {
      var id = a.getAttribute("href").slice(1);
      if (!id || !document.getElementById(id)) return;
      if (!byId[id]) byId[id] = [];
      byId[id].push(a);
    });

    var ids = Object.keys(byId);
    if (!ids.length) return;

    var ticking = false;

    function apply() {
      ticking = false;
      var line = window.scrollY + window.innerHeight * 0.34;
      var current = null, currentTop = -Infinity;

      for (var i = 0; i < ids.length; i++) {
        var top = document.getElementById(ids[i]).getBoundingClientRect().top + window.scrollY;
        /* the lowest section whose start the reading line has already passed */
        if (top <= line && top > currentTop) { currentTop = top; current = ids[i]; }
      }

      for (var j = 0; j < ids.length; j++) {
        var on = ids[j] === current;
        var group = byId[ids[j]];
        for (var k = 0; k < group.length; k++) group[k].classList.toggle("is-current", on);
      }
    }

    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    }, { passive: true });
    window.addEventListener("resize", apply);
    apply();
  })();
})();
