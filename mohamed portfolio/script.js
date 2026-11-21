/* ============ الإعدادات ============
   frames = 0  → يرسم المشهد الافتراضي (غروب ← نهار ← ليل) برمجيًا.
   frames > 0  → يستخدم تسلسل صورك من مجلد frames/ (انظر README.md). */
const CONFIG = {
  frames: 0,
  path: (n) => `frames/frame_${String(n).padStart(4, "0")}.webp`, // frame_0001.webp ...
  smooth: 0.075, // 1 = بدون نعومة، أقل = أنعم
};

(() => {
  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d");
  const chapters = [...document.querySelectorAll(".chapter")].map((el) => ({
    el,
    range: el.dataset.range.split(",").map(Number),
  }));
  const bar = document.querySelector(".progress i");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 0, H = 0, target = 0, cur = 0, dirty = true;

  /* ---------- ألوان المراحل ---------- */
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const css = (c, a = 1) => `rgba(${c.map(Math.round)},${a})`;
  const ease = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

  const STAGES = [
    { top: "#2B2358", bot: "#F09A74", sun: "#FFD08A", far: "#6A4A8C", near: "#2A1F4A", arch: "#1B1538" }, // غروب
    { top: "#1E5A8C", bot: "#A7DCD3", sun: "#FFF3C4", far: "#4C8FA8", near: "#1F4E63", arch: "#12384C" }, // نهار
    { top: "#0A0E26", bot: "#3A3A7C", sun: "#E8ECFF", far: "#1F2252", near: "#0C0F2B", arch: "#080B20" }, // ليل
  ].map((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, rgb(v)])));

  function palette(p) {
    const [a, b, t] = p < 0.5 ? [STAGES[0], STAGES[1], p / 0.5] : [STAGES[1], STAGES[2], (p - 0.5) / 0.5];
    return Object.fromEntries(Object.keys(a).map((k) => [k, mix(a[k], b[k], t)]));
  }

  /* ---------- المشهد الافتراضي ---------- */
  const stars = Array.from({ length: 140 }, () => ({
    x: Math.random(), y: Math.random() * 0.58, r: Math.random() * 1.2 + 0.3, a: Math.random() * 0.6 + 0.4,
  }));

  function ridge(color, base, amp, freq, phase) {
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) {
      const u = (x / W) * Math.PI * 2;
      ctx.lineTo(x, base + amp * Math.sin(u * freq + phase) + amp * 0.5 * Math.sin(u * freq * 2.3 + phase * 1.7));
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = css(color);
    ctx.fill();
  }

  function arch(cx, baseY, u, color) {
    const ow = H * 0.22 * u;              // نصف عرض الفتحة
    const springY = baseY - H * 0.38 * u; // بداية القوس
    ctx.beginPath();
    ctx.rect(cx - ow * 1.8, springY - ow * 1.5, ow * 3.6, baseY - springY + ow * 1.5);
    ctx.moveTo(cx - ow, baseY);
    ctx.lineTo(cx - ow, springY);
    ctx.arc(cx, springY, ow, Math.PI, Math.PI * 2);
    ctx.lineTo(cx + ow, baseY);
    ctx.closePath();
    ctx.fillStyle = css(color);
    ctx.fill("evenodd");
  }

  function drawScene(p) {
    const c = palette(p);
    const hz = H * 0.62;

    const sky = ctx.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, css(c.top));
    sky.addColorStop(1, css(c.bot));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    const sa = ease((p - 0.62) / 0.3);
    if (sa > 0) {
      ctx.fillStyle = "#fff";
      for (const s of stars) {
        ctx.globalAlpha = sa * s.a;
        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H, s.r, 0, 7);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // الشمس ثم القمر
    const sx = W * (0.72 - 0.4 * p);
    const sy = hz - H * (0.04 + 0.34 * Math.sin(Math.PI * Math.min(1, p * 1.05)));
    const r = H * 0.055;
    const glow = ctx.createRadialGradient(sx, sy, r * 0.2, sx, sy, r * 5);
    glow.addColorStop(0, css(c.sun, 0.55));
    glow.addColorStop(1, css(c.sun, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = css(c.sun);
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, 7);
    ctx.fill();

    // كثبان بعيدة ومتوسطة
    ridge(c.far, hz - H * 0.02, H * 0.035, 1, p * 2);
    ridge(mix(c.far, c.near, 0.5), hz + H * 0.035, H * 0.04, 1.3, p * 4 + 2);

    // الأقواس: الكاميرا تتحرك للأمام وتعبر كل قوس
    const N = 6, cam = p * (N + 0.4);
    for (let i = N - 1; i >= 0; i--) {
      const z = i + 1.8 - cam;
      if (z < 0.12) continue;
      const u = 1 / z;
      const alpha = Math.min(1, (z - 0.12) / 0.25);
      const col = mix(c.arch, c.bot, Math.min(0.75, (z - 1) / 7));
      ctx.globalAlpha = alpha;
      arch(W / 2 + Math.sin(i * 1.9) * H * 0.05 * u, hz + H * 0.1 * u, u, col);
    }
    ctx.globalAlpha = 1;

    // كثبان أمامية
    ridge(c.near, hz + H * 0.17, H * 0.05, 1.1, p * 6 + 5);
  }

  /* ---------- وضع تسلسل الصور ---------- */
  const imgs = [];
  if (CONFIG.frames > 0) {
    for (let i = 1; i <= CONFIG.frames; i++) {
      const im = new Image();
      im.onload = () => { dirty = true; };
      im.src = CONFIG.path(i);
      imgs.push(im);
    }
  }

  function drawFrame(p) {
    const im = imgs[Math.round(p * (CONFIG.frames - 1))];
    if (!im || !im.complete || !im.naturalWidth) return false;
    const s = Math.max(W / im.naturalWidth, H / im.naturalHeight); // cover
    const w = im.naturalWidth * s, h = im.naturalHeight * s;
    ctx.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
    return true;
  }

  /* ---------- النصوص والتقدّم ---------- */
  function updateChapters(p) {
    const f = 0.035;
    for (const { el, range: [a, b] } of chapters) {
      const o = ease((p - a) / f) * ease((b - p) / f);
      el.style.opacity = o;
      el.style.transform = `translateY(${(1 - o) * 24}px)`;
      el.classList.toggle("is-on", o > 0.05);
    }
    bar.style.transform = `scaleY(${p})`;
  }

  /* ---------- الحلقة الرئيسية ---------- */
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    readScroll();
  }
  function readScroll() {
    const max = document.documentElement.scrollHeight - innerHeight;
    target = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
    dirty = true;
  }

  function tick() {
    if (cur !== target || dirty) {
      cur += (target - cur) * (reduce ? 1 : CONFIG.smooth);
      if (Math.abs(target - cur) < 0.0002) cur = target;
      if (!(CONFIG.frames > 0 && drawFrame(cur))) drawScene(cur);
      updateChapters(cur);
      dirty = false;
    }
    requestAnimationFrame(tick);
  }

  /* ---------- اللغة (عربي / English) ---------- */
  const langBtn = document.getElementById("lang");
  const i18n = [...document.querySelectorAll("[data-ar]")];
  i18n.forEach((el) => (el.dataset.en = el.textContent));

  function setLang(l) {
    const ar = l === "ar";
    document.documentElement.lang = l;
    document.documentElement.dir = ar ? "rtl" : "ltr";
    i18n.forEach((el) => (el.textContent = ar ? el.dataset.ar : el.dataset.en));
    langBtn.textContent = ar ? "English" : "العربية";
    document.title = ar ? "محمد — مطوّر منتجات الجوال" : "Mohamed — Mobile product builder";
    try { localStorage.setItem("lang", l); } catch (e) {}
  }
  let saved = null;
  try { saved = localStorage.getItem("lang"); } catch (e) {}
  langBtn.addEventListener("click", () => setLang(document.documentElement.lang === "ar" ? "en" : "ar"));
  setLang(saved || ((navigator.language || "").startsWith("ar") ? "ar" : "en"));

  addEventListener("scroll", readScroll, { passive: true });
  addEventListener("resize", resize);
  resize();
  tick();
})();
