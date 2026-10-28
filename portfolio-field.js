(() => {
  const field = document.querySelector("[data-portfolio-field]");
  const canvas = field?.querySelector(".field-particles");
  const context = canvas?.getContext("2d", { alpha: true });
  const photos = [...(field?.querySelectorAll("[data-field-photo]") || [])].map((card, index) => ({
    card,
    index,
    light: 0,
    focused: false,
    center: { x: 0, y: 0 },
    particles: [],
  }));
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!field || !context || !photos.length || !finePointer || reducedMotion) return;

  const random = (min, max) => min + Math.random() * (max - min);
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const smoothstep = (edge0, edge1, value) => {
    const amount = clamp((value - edge0) / (edge1 - edge0));
    return amount * amount * (3 - 2 * amount);
  };

  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let frameId = 0;
  let lastFrame = 0;
  let inView = false;
  let active = false;
  let pointer = { x: -1000, y: -1000 };
  let pointerTarget = { x: -1000, y: -1000 };
  let revealRadius = 340;
  let dust = [];

  function buildDust() {
    dust = Array.from({ length: Math.min(300, Math.max(190, Math.round(width * height / 3100))) }, () => ({
      x: random(0, width),
      y: random(0, height),
      vx: random(-.1, .1),
      vy: random(-.1, .1),
      size: random(.45, 1.55),
      alpha: random(.08, .3),
      phase: random(0, Math.PI * 2),
      speed: random(.00035, .0012),
      warm: Math.random() > .88,
    }));
  }

  function buildPhotoParticles() {
    const fieldBox = field.getBoundingClientRect();
    photos.forEach((photo) => {
      const box = photo.card.getBoundingClientRect();
      photo.center = {
        x: box.left - fieldBox.left + box.width * .5,
        y: box.top - fieldBox.top + box.height * .5,
        width: box.width,
        height: box.height,
      };
      photo.particles = Array.from({ length: 25 }, () => {
        const targetX = photo.center.x + random(-box.width * .39, box.width * .39);
        const targetY = photo.center.y + random(-box.height * .4, box.height * .4);
        const angle = random(0, Math.PI * 2);
        const radius = random(20, Math.max(64, box.width * .66));
        return {
          x: targetX + Math.cos(angle) * radius,
          y: targetY + Math.sin(angle) * radius,
          targetX,
          targetY,
          size: random(.55, 1.65),
          phase: random(0, Math.PI * 2),
          speed: random(.0005, .0015),
          warm: Math.random() > .78,
        };
      });
    });
  }

  function resize() {
    const bounds = field.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    revealRadius = clamp(width * .29, 265, 420);
    buildDust();
    buildPhotoParticles();
    requestFrame();
  }

  function requestFrame() {
    if (inView && !frameId) frameId = window.requestAnimationFrame(render);
  }

  function drawParticle(x, y, size, alpha, warm = false) {
    if (alpha <= .015) return;
    context.globalAlpha = alpha * .18;
    context.fillStyle = warm ? "#e8c99d" : "#dce5f5";
    context.beginPath();
    context.arc(x, y, size * 2.7, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = alpha;
    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2);
    context.fill();
  }

  function updatePhoto(photo, delta, time) {
    const dx = pointer.x - photo.center.x;
    const dy = pointer.y - photo.center.y;
    const distance = Math.hypot(dx, dy);
    const proximity = active ? 1 - smoothstep(revealRadius * .12, revealRadius, distance) : 0;
    const target = photo.focused ? 1 : proximity;
    photo.light += (target - photo.light) * Math.min(1, delta * .0065);
    const light = clamp(photo.light);
    const depth = Number.parseFloat(getComputedStyle(photo.card).getPropertyValue("--photo-depth")) || .5;
    const driftX = active ? clamp((photo.center.x - pointer.x) / Math.max(width, 1) * depth * 48, -18, 18) : 0;
    const driftY = active ? clamp((photo.center.y - pointer.y) / Math.max(height, 1) * depth * 34, -13, 13) : 0;
    const breathe = Math.sin(time * .00045 + photo.index * 2.1) * .012;
    const opacity = .025 + Math.pow(light, 1.12) * .975;
    const caption = smoothstep(.48, .78, light) * .82;

    photo.card.style.setProperty("--photo-light", light.toFixed(3));
    photo.card.style.setProperty("--photo-opacity", (opacity + breathe).toFixed(3));
    photo.card.style.setProperty("--photo-brightness", (.18 + light * .82).toFixed(3));
    photo.card.style.setProperty("--photo-saturation", (.35 + light * .61).toFixed(3));
    photo.card.style.setProperty("--photo-blur", `${((1 - light) * 7).toFixed(2)}px`);
    photo.card.style.setProperty("--photo-scale", (.9 + light * .1).toFixed(3));
    photo.card.style.setProperty("--photo-drift-x", `${driftX.toFixed(2)}px`);
    photo.card.style.setProperty("--photo-drift-y", `${driftY.toFixed(2)}px`);
    photo.card.style.setProperty("--grain-opacity", (.015 + light * .37).toFixed(3));
    photo.card.style.setProperty("--caption-opacity", caption.toFixed(3));
    photo.card.style.setProperty("--photo-control-opacity", (smoothstep(.42, .7, light) * .94).toFixed(3));
    photo.card.style.setProperty("--photo-controls", light > .48 ? "auto" : "none");

    const formation = smoothstep(.08, .95, light);
    photo.particles.forEach((particle) => {
      const orbit = Math.sin(time * particle.speed + particle.phase) * 3.5;
      const x = particle.x + (particle.targetX - particle.x) * formation + orbit;
      const y = particle.y + (particle.targetY - particle.y) * formation + Math.cos(time * particle.speed + particle.phase) * 3.5;
      const alpha = (.025 + light * .7) * (.68 + .32 * Math.sin(time * .001 + particle.phase));
      drawParticle(x, y, particle.size * (.72 + light * .5), alpha, particle.warm);
    });
  }

  function render(time) {
    frameId = 0;
    if (!inView) return;
    const delta = lastFrame ? Math.min(48, time - lastFrame) : 16;
    lastFrame = time;
    pointer.x += (pointerTarget.x - pointer.x) * Math.min(1, delta * .018);
    pointer.y += (pointerTarget.y - pointer.y) * Math.min(1, delta * .018);
    context.clearRect(0, 0, width, height);
    context.globalCompositeOperation = "lighter";

    dust.forEach((particle) => {
      particle.x += particle.vx + Math.sin(time * particle.speed + particle.phase) * .08;
      particle.y += particle.vy + Math.cos(time * particle.speed + particle.phase) * .06;
      if (particle.x < -3) particle.x = width + 3;
      if (particle.x > width + 3) particle.x = -3;
      if (particle.y < -3) particle.y = height + 3;
      if (particle.y > height + 3) particle.y = -3;
      const distance = Math.hypot(pointer.x - particle.x, pointer.y - particle.y);
      const cursorGlow = active ? (1 - smoothstep(0, 220, distance)) * .42 : 0;
      const twinkle = .72 + .28 * Math.sin(time * .0012 + particle.phase);
      drawParticle(particle.x, particle.y, particle.size, (particle.alpha + cursorGlow) * twinkle, particle.warm);
    });

    photos.forEach((photo) => updatePhoto(photo, delta, time));
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    if (inView) frameId = window.requestAnimationFrame(render);
  }

  function movePointer(event) {
    const bounds = field.getBoundingClientRect();
    pointerTarget = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    active = true;
    field.style.setProperty("--field-x", `${pointerTarget.x}px`);
    field.style.setProperty("--field-y", `${pointerTarget.y}px`);
    field.style.setProperty("--field-active", ".94");
    field.style.setProperty("--nebula-x", `${((pointerTarget.x / width) - .5) * -22}px`);
    field.style.setProperty("--nebula-y", `${((pointerTarget.y / height) - .5) * -16}px`);
    requestFrame();
  }

  function leaveField() {
    active = false;
    field.style.setProperty("--field-active", "0");
    requestFrame();
  }

  field.addEventListener("pointermove", movePointer, { passive: true });
  field.addEventListener("pointerleave", leaveField);
  photos.forEach((photo) => {
    photo.card.addEventListener("focus", () => { photo.focused = true; requestFrame(); });
    photo.card.addEventListener("blur", () => { photo.focused = false; requestFrame(); });
  });

  const visibilityObserver = new IntersectionObserver((entries) => {
    inView = entries[0].isIntersecting;
    if (inView) requestFrame();
    else if (frameId) {
      window.cancelAnimationFrame(frameId);
      frameId = 0;
      lastFrame = 0;
    }
  }, { threshold: .01 });
  visibilityObserver.observe(field);

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(field);
  window.addEventListener("resize", resize, { passive: true });
  field.classList.add("is-enhanced");
  resize();
})();
