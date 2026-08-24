// Ambient network — a slow-drifting graph of dots and edges behind the whole
// page, plus soft drifting nebula glows and the occasional shooting star.
// Same visual language as the live graph view (dots + lines), just quieter,
// so the "backdrop" of the app literally is the thing it's about.
(function () {
  const canvas = document.getElementById('bgCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let w, h, dpr;
  let nodes = [];
  let blobs = [];
  let shootingStars = [];
  let t = 0;
  const LINK_DIST = 175;
  const MOUSE_RADIUS = 210;

  const mouse = { x: -9999, y: -9999 };
  window.addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
  window.addEventListener('pointerleave', () => { mouse.x = -9999; mouse.y = -9999; });

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const targetCount = Math.min(110, Math.max(40, Math.round((w * h) / 14000)));
    nodes = Array.from({ length: targetCount }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.22,
      r: Math.random() < 0.14 ? 2.6 : 1.4,
      amber: Math.random() < 0.12,
      phase: Math.random() * Math.PI * 2, // for the gentle size "breathing"
    }));

    blobs = [
      { x: w * 0.18, y: h * 0.22, r: Math.max(w, h) * 0.32, hue: '167,123,218', vx: 0.08, vy: 0.05, phase: 0 },
      { x: w * 0.82, y: h * 0.7, r: Math.max(w, h) * 0.28, hue: '232,163,61', vx: -0.06, vy: 0.07, phase: 2 },
      { x: w * 0.55, y: h * 0.15, r: Math.max(w, h) * 0.22, hue: '127,182,158', vx: 0.05, vy: -0.06, phase: 4 },
    ];
  }

  function maybeSpawnShootingStar() {
    if (prefersReducedMotion) return;
    if (Math.random() < 0.0035 && shootingStars.length < 2) {
      const fromLeft = Math.random() < 0.5;
      const y0 = Math.random() * h * 0.5;
      shootingStars.push({
        x: fromLeft ? -40 : w + 40,
        y: y0,
        vx: (fromLeft ? 1 : -1) * (5 + Math.random() * 3),
        vy: 2.2 + Math.random() * 1.4,
        life: 1,
      });
    }
  }

  function step() {
    t += 1;
    for (const n of nodes) {
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < -20) n.x = w + 20; else if (n.x > w + 20) n.x = -20;
      if (n.y < -20) n.y = h + 20; else if (n.y > h + 20) n.y = -20;
    }
    for (const b of blobs) {
      b.x += b.vx;
      b.y += b.vy;
      if (b.x < -b.r * 0.4 || b.x > w + b.r * 0.4) b.vx *= -1;
      if (b.y < -b.r * 0.4 || b.y > h + b.r * 0.4) b.vy *= -1;
    }
    maybeSpawnShootingStar();
    shootingStars = shootingStars.filter((s) => s.life > 0);
    for (const s of shootingStars) {
      s.x += s.vx * 3;
      s.y += s.vy * 3;
      s.life -= 0.012;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);

    // drifting nebula glows — the "more background animation" ask, kept soft
    // enough to stay behind the content rather than compete with it
    for (const b of blobs) {
      const pulse = 0.85 + 0.15 * Math.sin(t * 0.008 + b.phase);
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * pulse);
      g.addColorStop(0, `rgba(${b.hue},0.10)`);
      g.addColorStop(1, `rgba(${b.hue},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // shooting stars
    for (const s of shootingStars) {
      ctx.strokeStyle = `rgba(244,196,112,${Math.max(s.life, 0)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 10, s.y - s.vy * 10);
      ctx.stroke();
    }

    // edges
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < LINK_DIST) {
          const o = (1 - dist / LINK_DIST) * 0.2;
          ctx.strokeStyle = `rgba(125,132,168,${o})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      // link to cursor, like the live graph reacting to a hovered node
      const dxm = nodes[i].x - mouse.x, dym = nodes[i].y - mouse.y;
      const dm = Math.sqrt(dxm * dxm + dym * dym);
      if (dm < MOUSE_RADIUS) {
        const o = (1 - dm / MOUSE_RADIUS) * 0.45;
        ctx.strokeStyle = `rgba(232,163,61,${o})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(mouse.x, mouse.y);
        ctx.stroke();
      }
    }

    // nodes — gently breathing size so the field doesn't feel static
    for (const n of nodes) {
      const breathe = 1 + 0.35 * Math.sin(t * 0.02 + n.phase);
      ctx.beginPath();
      ctx.fillStyle = n.amber ? 'rgba(232,163,61,0.65)' : 'rgba(228,231,247,0.45)';
      ctx.arc(n.x, n.y, n.r * breathe, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  let running = true;
  function loop() {
    if (!running) return;
    if (!prefersReducedMotion) step();
    draw();
    requestAnimationFrame(loop);
  }

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) requestAnimationFrame(loop);
  });

  window.addEventListener('resize', resize);
  resize();
  draw();
  if (!prefersReducedMotion) requestAnimationFrame(loop);
})();
