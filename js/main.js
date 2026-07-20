/* Scroll-scrubbed frame player + theme toggle + sand background. */
(function () {
  const S = window.SITE;
  // frame-sequence config (technical; not user-edited)
  const F = { ext: ".webp", pad: 4, total: 436, n2d: 396 };
  const total = F.total, FPX = 32;
  const pad = (n) => String(n).padStart(F.pad, "0");
  const path = (theme, i) => `frames-${theme}/f_${pad(i)}${F.ext}`;

  document.getElementById("hero-title").textContent = S.hero.title;
  document.getElementById("hero-sub").textContent = S.hero.subtitle;
  document.getElementById("c-title").textContent = S.current.title;
  document.getElementById("c-body").textContent = S.current.body;
  const cLabel = document.getElementById("c-label");
  if (cLabel) cLabel.textContent = S.current.label || "";
  const specsEl = document.getElementById("specs");
  if (specsEl && Array.isArray(S.current.specs)) {
    specsEl.innerHTML = S.current.specs
      .map((s) => `<div class="row"><dt>${s.label}</dt><dd>${s.value}</dd></div>`)
      .join("");
  }

  /* ---------- theme ---------- */
  let theme = localStorage.getItem("tank-theme") || "dark";
  const root = document.documentElement;
  const icon = document.getElementById("theme-icon");
  function applyTheme() {
    root.setAttribute("data-theme", theme);
    icon.textContent = theme === "dark" ? "☾" : "☀";
  }
  applyTheme();

  /* ---------- frame preload (per theme) ---------- */
  const imgs = { dark: new Array(total), light: new Array(total) };
  const frameEl = document.getElementById("frame");
  const loadingEl = document.getElementById("loading");
  let curIdx = -1;
  frameEl.src = path(theme, 0);

  function preloadTheme(t, onFirst) {
    let loaded = 0;
    function next(i) {
      if (i >= total) return;
      const im = new Image();
      im.onload = im.onerror = () => {
        loaded++;
        if (loaded === 1 && onFirst) onFirst();
        next(i + 8);
      };
      im.src = path(t, i);
      imgs[t][i] = im;
    }
    for (let c = 0; c < 8; c++) next(c);
  }
  preloadTheme(theme, () => { loadingEl.style.display = "none"; });
  // load the other theme in the background so toggling is instant
  setTimeout(() => preloadTheme(theme === "dark" ? "light" : "dark"), 1500);

  function showFrame(idx) {
    const im = imgs[theme][idx];
    frameEl.src = (im && im.complete) ? im.src : path(theme, idx);
  }

  document.getElementById("theme-toggle").addEventListener("click", () => {
    theme = theme === "dark" ? "light" : "dark";
    localStorage.setItem("tank-theme", theme);
    applyTheme();
    if (!imgs[theme].some(Boolean)) preloadTheme(theme);
    showFrame(curIdx < 0 ? 0 : curIdx);
    sand.recolor();
  });

  /* ---------- panel (with staggered word reveal) ---------- */
  const iters = S.iterations;
  const dotsEl = document.getElementById("dots");
  iters.forEach((it, i) => {
    const d = document.createElement("button");
    d.className = "dot"; d.title = it.label;
    d.addEventListener("click", () => scrollToFrame(it.hold));
    dotsEl.appendChild(d);
  });
  const dots = Array.from(dotsEl.children);
  const pLabel = document.getElementById("p-label");
  const pTitle = document.getElementById("p-title");
  const pBody = document.getElementById("p-body");
  let shown = -1;

  function reveal(el, text, base) {
    el.className = "reveal";
    el.innerHTML = "";
    const words = text.split(/\s+/);
    words.forEach((w, i) => {
      const s = document.createElement("span");
      s.textContent = w;
      s.style.animationDelay = (base + i * 0.028).toFixed(3) + "s";
      el.appendChild(s);
      if (i < words.length - 1) el.appendChild(document.createTextNode(" "));
    });
  }
  function showPanel(idx) {
    let ai = iters.length - 1;
    for (let i = 0; i < iters.length - 1; i++)
      if (idx < (iters[i].hold + iters[i + 1].hold) / 2) { ai = i; break; }
    if (ai === shown) return;
    shown = ai;
    const it = iters[ai];
    pLabel.textContent = it.label;
    reveal(pTitle, it.reason.title, 0.02);
    reveal(pBody, it.reason.body, 0.16);
    dots.forEach((d, i) => d.classList.toggle("on", i === ai));
  }

  /* ---------- scroll -> frame ---------- */
  const story = document.getElementById("story");
  story.style.height = (total * FPX) + "px";
  const scrollable = () => story.offsetHeight - window.innerHeight;
  let ticking = false;
  function render() {
    ticking = false;
    const p = Math.min(1, Math.max(0, -story.getBoundingClientRect().top / scrollable()));
    const idx = Math.min(total - 1, Math.round(p * (total - 1)));
    if (idx !== curIdx) { curIdx = idx; showFrame(idx); showPanel(idx); }
  }

  /* ---------- hard keyframe lock through the iterations ----------
     Inside the story section the native scroll is taken over: the smallest
     scroll gesture steps you to the NEXT iteration (or the previous one when
     scrolling up) and plays that morph slowly. Input is ignored until it
     lands. The lock releases at both ends — scroll up past iteration 1 to
     the hero, and down past iteration 6 to scrub the 3D rotate-out and reach
     the specs section normally.
     TUNING: SNAP_MS_* = morph length. COOLDOWN_MS = pause before the next
     gesture is accepted; 0 = takes over instantly on the next scroll.     */
  const HOLDS = iters.map((it) => it.hold);          // frame index of each iteration
  const SNAP_MS_SHORT = 2000;   // iterations 1->2 .. 4->5
  const SNAP_MS_LONG = 3500;    // the longer 5->6 consolidation
  const COOLDOWN_MS = 0;

  let locked = false, cooldownUntil = 0;
  const frameToY = (f) => story.offsetTop + (f / (total - 1)) * scrollable();
  const cancelSnap = () => { locked = false; };

  // is the sticky story section currently filling the viewport?
  const inStory = () => {
    const r = story.getBoundingClientRect();
    return r.top <= 0 && r.bottom >= window.innerHeight;
  };

  function nearestIter() {
    let best = 0, bd = Infinity;
    HOLDS.forEach((h, i) => { const d = Math.abs(h - curIdx); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  // next iteration in direction d, or null if we should release the scroll
  function stepTarget(d) {
    const last = HOLDS.length - 1;
    if (d < 0 && curIdx > HOLDS[last] + 2) return HOLDS[last];  // back from the 3D spin
    const i = nearestIter() + d;
    if (i < 0 || i > last) return null;
    return HOLDS[i];
  }

  function snapDuration(from, to) {
    let seg = 70;
    const lo = Math.min(from, to), hi = Math.max(from, to);
    for (let i = 1; i < HOLDS.length; i++)
      if (hi <= HOLDS[i] && lo >= HOLDS[i - 1]) { seg = HOLDS[i] - HOLDS[i - 1]; break; }
    const full = seg >= 90 ? SNAP_MS_LONG : SNAP_MS_SHORT;
    return Math.max(420, Math.round(full * Math.min(1, Math.abs(to - from) / seg)));
  }

  function lockTo(y, dur) {
    const start = window.scrollY, dist = y - start;
    if (Math.abs(dist) < 2) return;
    locked = true;
    const t0 = performance.now();
    const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
    (function step(ts) {
      if (!locked) return;
      const p = Math.min(1, (ts - t0) / dur);
      window.scrollTo(0, start + dist * ease(p));
      if (p < 1) requestAnimationFrame(step);
      else { locked = false; cooldownUntil = performance.now() + COOLDOWN_MS; }
    })(performance.now());
  }

  // one gesture = one iteration
  function drive(d, e) {
    if (!inStory()) return;
    const t = stepTarget(d);
    if (t == null) return;                 // at an end -> let the page scroll
    e.preventDefault();                    // hard lock
    if (locked || performance.now() < cooldownUntil) return;
    lockTo(frameToY(t), snapDuration(curIdx, t));
  }

  window.addEventListener("wheel", (e) => {
    if (Math.abs(e.deltaY) < 1) return;
    drive(e.deltaY > 0 ? 1 : -1, e);
  }, { passive: false });

  let touchY = null;
  window.addEventListener("touchstart", (e) => { touchY = e.touches[0].clientY; }, { passive: true });
  window.addEventListener("touchmove", (e) => {
    if (touchY == null) return;
    const dy = touchY - e.touches[0].clientY;
    if (Math.abs(dy) < 8) return;
    touchY = e.touches[0].clientY;
    drive(dy > 0 ? 1 : -1, e);
  }, { passive: false });

  const KEYS = { ArrowDown: 1, PageDown: 1, " ": 1, ArrowUp: -1, PageUp: -1 };
  window.addEventListener("keydown", (e) => {
    const d = KEYS[e.key];
    if (d) drive(d, e);
  }, { passive: false });

  window.addEventListener("scroll", () => {
    if (!ticking) { ticking = true; requestAnimationFrame(render); }
  }, { passive: true });
  window.addEventListener("resize", render);
  showPanel(0); render();

  /* ---------- click dot -> smooth scroll to iteration ---------- */
  function scrollToFrame(frame) {
    cancelSnap();                             // a dot click overrides the lock
    const target = story.offsetTop + (frame / (total - 1)) * scrollable();
    const start = window.scrollY, dist = target - start;
    const dur = Math.min(900, 320 + Math.abs(dist) * 0.35);
    let t0 = null;
    const ease = (p) => p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    (function step(ts) {
      if (t0 === null) t0 = ts;
      const p = Math.min(1, (ts - t0) / dur);
      window.scrollTo(0, start + dist * ease(p));
      if (p < 1) requestAnimationFrame(step);
    })(performance.now());
  }

  /* ---------- model ---------- */
  const viewer = document.getElementById("viewer");
  // Update the model by swapping the file at S.current.model (js/content.js).
  // Needs to be served over http(s) (GitHub Pages, the iGEM wiki, live-server) —
  // not the raw htmlpreview link, which can't serve a binary .glb.
  if (viewer) viewer.src = S.current.model;

  /* ---------- custom cursor (circle, theme-coloured) ----------
     TOGGLE: set to false for an invisible cursor (hidden), true for the
     visible themed circle cursor.                                        */
  const CURSOR_VISIBLE = true;

  if (window.matchMedia && matchMedia("(pointer:fine)").matches) {
    document.documentElement.classList.add("has-cursor");   // hides the default cursor
  }
  if (CURSOR_VISIBLE && window.matchMedia && matchMedia("(pointer:fine)").matches) {
    const ring = document.createElement("div"); ring.id = "cursor";
    const dot = document.createElement("div"); dot.id = "cursor-dot";
    document.body.append(ring, dot);
    let rx = innerWidth/2, ry = innerHeight/2, tx = rx, ty = ry, down = false;
    addEventListener("mousemove", (e) => {
      tx = e.clientX; ty = e.clientY;
      dot.style.transform = `translate(${tx}px,${ty}px) translate(-50%,-50%)`;
      ring.style.opacity = "1";
    });
    addEventListener("mouseout", (e) => { if (!e.relatedTarget) ring.style.opacity = "0"; });
    addEventListener("mousedown", () => { down = true; ring.classList.add("down"); });
    addEventListener("mouseup", () => { down = false; ring.classList.remove("down"); });
    document.querySelectorAll("button,.dot,a,model-viewer").forEach((el) => {
      el.addEventListener("mouseenter", () => ring.classList.add("big"));
      el.addEventListener("mouseleave", () => ring.classList.remove("big"));
    });
    (function loop() {
      rx += (tx - rx) * 0.18; ry += (ty - ry) * 0.18;
      ring.style.transform = `translate(${rx}px,${ry}px) translate(-50%,-50%)`;
      requestAnimationFrame(loop);
    })();
  }

  /* ---------- sand background (mouse + scroll reactive) ---------- */
  const sand = (function () {
    const cv = document.getElementById("sand"), ctx = cv.getContext("2d");
    let W, H, parts = [], color = "#9a5f33", color2 = "#a5737d";
    let mx = -999, my = -999, boost = 0, lastY = window.scrollY;
    const R = 130;                       // mouse influence radius
    function mk() { const x = Math.random()*W, y = Math.random()*H;
      return { x, y, r: Math.random()*1.9+0.5,
        vx: Math.random()*0.22+0.04, vy: (Math.random()-0.5)*0.1,
        a: Math.random()*0.4+0.16, rose: Math.random() < 0.34 }; }  // ~1/3 rose grains
    function resize() { W = cv.width = innerWidth; H = cv.height = innerHeight;
      parts = Array.from({ length: Math.round(W*H/11000) }, mk); }
    function recolor() {
      const cs = getComputedStyle(root);
      color = cs.getPropertyValue("--sand").trim() || "#9a5f33";
      color2 = cs.getPropertyValue("--sand2").trim() || "#a5737d";
    }
    window.addEventListener("mousemove", (e) => { mx = e.clientX; my = e.clientY; });
    window.addEventListener("mouseout", () => { mx = -999; my = -999; });
    window.addEventListener("scroll", () => {
      boost = Math.min(7, boost + Math.abs(window.scrollY - lastY) * 0.05);
      lastY = window.scrollY;
    }, { passive: true });
    function loop() {
      ctx.clearRect(0, 0, W, H);
      boost *= 0.92;
      const speed = 1 + boost;
      for (const p of parts) {
        p.x += p.vx * speed;
        p.y += p.vy * speed * 0.7;
        // mouse repulsion -> a bulge/void that follows the cursor
        const dx = p.x - mx, dy = p.y - my, d2 = dx*dx + dy*dy;
        let near = 0;
        if (d2 < R*R) {
          const d = Math.sqrt(d2) || 1; near = 1 - d/R;
          const f = near * near * 6;
          p.x += (dx/d)*f; p.y += (dy/d)*f;
        }
        if (p.x > W+4) p.x = -4; else if (p.x < -4) p.x = W+4;
        if (p.y > H+4) p.y = -4; else if (p.y < -4) p.y = H+4;
        ctx.globalAlpha = Math.min(1, p.a * (1 + near*1.1));
        ctx.fillStyle = p.rose ? color2 : color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + near*0.9), 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(loop);
    }
    resize(); recolor(); loop();
    window.addEventListener("resize", resize);
    return { recolor };
  })();
})();
