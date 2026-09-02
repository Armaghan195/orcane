/* ==========================================================================
   Orcane — the card rail

   Drives any [data-rail] block: a horizontal rail you can swipe, drag, arrow
   through, or tab into. Everything is scoped INSIDE the [data-rail] element,
   so a second rail can be dropped on the page later and just work.

   The scrolling itself is native — CSS scroll-snap does it — which means
   touch swipe, trackpad, keyboard and screen readers all behave correctly for
   free. This file only adds what CSS cannot: the arrows, the dots, the
   disabled states, and pointer-drag for people on a mouse.

   Positions are always measured RELATIVE to the first card, never absolutely,
   so the rail's inline padding (which aligns card one with the page shell)
   never has to be accounted for twice.
   ========================================================================== */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  Array.prototype.forEach.call(document.querySelectorAll("[data-rail]"), function (root) {
    var track = root.querySelector("[data-rail-track]");
    if (!track) return;

    var cards = track.children;
    if (!cards.length) return;

    var dotsWrap = root.querySelector("[data-rail-dots]");
    var arrows = root.querySelectorAll("[data-rail-arrow]");

    function offsetOf(i) { return cards[i].offsetLeft - cards[0].offsetLeft; }

    function nearest() {
      var x = track.scrollLeft, best = 0, bd = Infinity;
      for (var i = 0; i < cards.length; i++) {
        var d = Math.abs(offsetOf(i) - x);
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }

    function goTo(i) {
      i = Math.max(0, Math.min(cards.length - 1, i));
      track.scrollTo({ left: offsetOf(i), behavior: reduce ? "auto" : "smooth" });
    }

    /* ---- dots ---- */
    var dots = [];
    if (dotsWrap) {
      for (var d = 0; d < cards.length; d++) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "rail-dot";
        b.setAttribute("role", "tab");
        b.setAttribute("aria-label", cards[d].getAttribute("data-name") || ("Item " + (d + 1)));
        b.addEventListener("click", (function (n) {
          return function () { goTo(n); };
        })(d));
        dotsWrap.appendChild(b);
        dots.push(b);
      }
    }

    /* ---- arrows ---- */
    Array.prototype.forEach.call(arrows, function (btn) {
      btn.addEventListener("click", function () {
        goTo(nearest() + (parseInt(btn.getAttribute("data-dir"), 10) || 1));
      });
    });

    /* ---- state ---- */
    var ticking = false;

    function sync() {
      ticking = false;
      var i = nearest();
      var maxX = track.scrollWidth - track.clientWidth;

      for (var k = 0; k < dots.length; k++) {
        var on = k === i;
        dots[k].classList.toggle("is-on", on);
        dots[k].setAttribute("aria-selected", on ? "true" : "false");
      }
      Array.prototype.forEach.call(arrows, function (btn) {
        var dir = parseInt(btn.getAttribute("data-dir"), 10) || 1;
        /* the 2px slack keeps the end arrow from flickering on sub-pixel scroll */
        var atEnd = dir > 0 ? track.scrollLeft >= maxX - 2 : track.scrollLeft <= 2;
        btn.disabled = atEnd;
      });
    }

    track.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(sync);
    }, { passive: true });

    /* ---- drag to slide, for anyone on a mouse ----
       Touch is left alone: the browser's own momentum scrolling beats anything
       re-implemented here. */
    var down = false, startX = 0, startL = 0, moved = 0;

    track.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "touch") return;
      if (e.target.closest("a, button")) return;
      down = true;
      startX = e.clientX;
      startL = track.scrollLeft;
      moved = 0;
      track.classList.add("is-drag");
    });

    window.addEventListener("pointermove", function (e) {
      if (!down) return;
      var dx = e.clientX - startX;
      if (Math.abs(dx) > moved) moved = Math.abs(dx);
      track.scrollLeft = startL - dx;
    });

    function endDrag() {
      if (!down) return;
      down = false;
      track.classList.remove("is-drag");
      if (moved > 8) goTo(nearest());
    }
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);

    /* a drag that ends on top of a link must not also count as a click */
    track.addEventListener("click", function (e) {
      if (moved > 8) { e.preventDefault(); e.stopPropagation(); moved = 0; }
    }, true);

    var rt = 0;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(sync, 150);
    });

    sync();
  });
})();
