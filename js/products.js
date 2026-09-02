/* ==========================================================================
   Orcane — the product rail

   A horizontal card rail you can swipe, drag, arrow through, or tab into.

   The scrolling itself is native: CSS scroll-snap does the work, which means
   touch swipe, trackpad, keyboard and screen readers all behave correctly for
   free. This file only adds what CSS cannot: the arrows, the dots, the
   disabled states, and pointer-drag for people on a mouse.

   Positions are always measured RELATIVE to the first card, never absolutely,
   so the rail's inline padding (which aligns card one with the page shell)
   never has to be accounted for twice.
   ========================================================================== */
(function () {
  "use strict";

  var rail = document.getElementById("prod-rail");
  if (!rail) return;

  var cards = rail.querySelectorAll(".prod-card");
  if (cards.length < 1) return;

  var dotsWrap = document.getElementById("prod-dots");
  var arrows = document.querySelectorAll(".prod-arrow");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function offsetOf(i) { return cards[i].offsetLeft - cards[0].offsetLeft; }

  function nearest() {
    var x = rail.scrollLeft, best = 0, bd = Infinity;
    for (var i = 0; i < cards.length; i++) {
      var d = Math.abs(offsetOf(i) - x);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function goTo(i) {
    i = Math.max(0, Math.min(cards.length - 1, i));
    rail.scrollTo({ left: offsetOf(i), behavior: reduce ? "auto" : "smooth" });
  }

  /* ---- dots ---- */
  var dots = [];
  if (dotsWrap) {
    for (var d = 0; d < cards.length; d++) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "prod-dot";
      b.setAttribute("role", "tab");
      var label = cards[d].getAttribute("data-name") || ("Product " + (d + 1));
      b.setAttribute("aria-label", label);
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
    var maxX = rail.scrollWidth - rail.clientWidth;

    for (var k = 0; k < dots.length; k++) {
      var on = k === i;
      dots[k].classList.toggle("is-on", on);
      dots[k].setAttribute("aria-selected", on ? "true" : "false");
    }
    Array.prototype.forEach.call(arrows, function (btn) {
      var dir = parseInt(btn.getAttribute("data-dir"), 10) || 1;
      /* the 2px slack keeps the end arrow from flickering on sub-pixel scroll */
      var atEnd = dir > 0 ? rail.scrollLeft >= maxX - 2 : rail.scrollLeft <= 2;
      btn.disabled = atEnd;
    });
  }

  rail.addEventListener("scroll", function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(sync);
  }, { passive: true });

  /* ---- drag to slide, for anyone on a mouse ----
     Touch is left alone: the browser's own momentum scrolling beats anything
     re-implemented here. */
  var down = false, startX = 0, startL = 0, moved = 0;

  rail.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "touch") return;
    if (e.target.closest("a, button")) return;
    down = true;
    startX = e.clientX;
    startL = rail.scrollLeft;
    moved = 0;
    rail.classList.add("is-drag");
  });

  window.addEventListener("pointermove", function (e) {
    if (!down) return;
    var dx = e.clientX - startX;
    if (Math.abs(dx) > moved) moved = Math.abs(dx);
    rail.scrollLeft = startL - dx;
  });

  function endDrag() {
    if (!down) return;
    down = false;
    rail.classList.remove("is-drag");
    if (moved > 8) goTo(nearest());
  }
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);

  /* a drag that ends on top of a link must not also count as a click */
  rail.addEventListener("click", function (e) {
    if (moved > 8) { e.preventDefault(); e.stopPropagation(); moved = 0; }
  }, true);

  var rt = 0;
  window.addEventListener("resize", function () {
    clearTimeout(rt);
    rt = setTimeout(sync, 150);
  });

  sync();
})();
