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
  window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(render); } }, { passive: true });
  window.addEventListener("resize", render);
  showPanel(0); render();

  /* ---------- click dot -> smooth scroll to iteration ---------- */
  function scrollToFrame(frame) {
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
