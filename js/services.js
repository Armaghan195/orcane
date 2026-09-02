/* ==========================================================================
   Orcane — services: the capability card grid

   Three behaviours, and nothing else:

   1. Reveal.   Cards rise in as the grid enters the viewport, staggered by
                the --i each card already carries in its style attribute.

   2. Spotlight. Each card tracks the cursor and writes --mx/--my, which the
                stylesheet turns into a soft accent wash under the content.
                Positions are read from one shared rAF tick, never inside the
                pointermove handler, so moving across twelve cards costs one
                layout read per frame rather than twelve.

   3. Expand.   The face is a real <button>, so click, Enter and Space all
                work for free. This only flips a class and keeps aria-expanded
                honest — the height animation is CSS (0fr -> 1fr).

   Opening one card closes the others: twelve open panels is a wall of text,
   and the grid's row heights would jump around while you read.
   ========================================================================== */
(function () {
  "use strict";

  var grid = document.getElementById("cap-grid");
  if (!grid) return;

  var cards = Array.prototype.slice.call(grid.querySelectorAll(".cap-card"));
  if (!cards.length) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ---------------------------------------------------------------------
     1. Reveal
     --------------------------------------------------------------------- */
  (function reveal() {
    if (reduce || !("IntersectionObserver" in window)) {
      cards.forEach(function (c) { c.classList.add("in-view"); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in-view");
        io.unobserve(entry.target);
      });
    }, { threshold: 0.2, rootMargin: "0px 0px -6% 0px" });

    cards.forEach(function (c) { io.observe(c); });
  })();

  /* ---------------------------------------------------------------------
     2. Cursor spotlight

     One pointermove listener on the grid, one rAF, one getBoundingClientRect
     per frame — for the card under the cursor only.
     --------------------------------------------------------------------- */
  if (fine && !reduce) {
    var px = 0, py = 0, queued = false, hot = null;

    grid.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      var card = e.target.closest(".cap-card");
      if (!card) return;
      hot = card;
      px = e.clientX;
      py = e.clientY;
      if (queued) return;
      queued = true;
      requestAnimationFrame(paint);
    }, { passive: true });

    grid.addEventListener("pointerleave", function () { hot = null; }, { passive: true });

    function paint() {
      queued = false;
      if (!hot) return;
      var r = hot.getBoundingClientRect();
      hot.style.setProperty("--mx", (px - r.left) + "px");
      hot.style.setProperty("--my", (py - r.top) + "px");
    }
  }

  /* ---------------------------------------------------------------------
     3. Expand / collapse
     --------------------------------------------------------------------- */
  var open = null;

  function setOpen(card, state) {
    var face = card.querySelector(".cap-face");
    card.classList.toggle("is-open", state);
    if (face) face.setAttribute("aria-expanded", state ? "true" : "false");
  }

  cards.forEach(function (card) {
    var face = card.querySelector(".cap-face");
    var panel = card.querySelector(".cap-panel");
    if (!face || !panel) return;

    /* A collapsed panel must be out of the tab order and out of the
       accessibility tree — inert would be ideal but is not everywhere yet,
       and hidden="until-found" is likewise young, so this stays explicit. */
    panel.setAttribute("aria-hidden", "true");

    face.addEventListener("click", function () {
      var isOpen = card.classList.contains("is-open");

      if (open && open !== card) {
        setOpen(open, false);
        open.querySelector(".cap-panel").setAttribute("aria-hidden", "true");
      }

      setOpen(card, !isOpen);
      panel.setAttribute("aria-hidden", isOpen ? "true" : "false");
      open = isOpen ? null : card;
    });
  });

  /* Escape closes whatever is open, from anywhere in the section. */
  grid.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || !open) return;
    var face = open.querySelector(".cap-face");
    setOpen(open, false);
    open.querySelector(".cap-panel").setAttribute("aria-hidden", "true");
    open = null;
    if (face) face.focus();
  });
})();
