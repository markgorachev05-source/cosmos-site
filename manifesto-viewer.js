(() => {
  const viewer = document.querySelector("[data-manifesto-viewer]");
  const openers = [...document.querySelectorAll("[data-manifesto-open]")];
  const photo = viewer?.querySelector("[data-viewer-photo]");
  const title = viewer?.querySelector("#viewer-title");
  const description = viewer?.querySelector("#viewer-description");
  const count = viewer?.querySelector("[data-viewer-count]");
  const canvas = viewer?.querySelector("[data-viewer-particles]");
  const backButton = viewer?.querySelector(".viewer-back");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (!viewer || !photo || !title || !description || !canvas || !backButton || !openers.length) return;

  let activeTrigger = null;
  let flight = null;
  let flightAnimation = null;
  let pointerHoverSuppressed = false;
  const hoverTimers = new WeakMap();
  let spritePromise = null;

  const nextFrame = () => new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

  function spriteSource() {
    if (!spritePromise) {
      spritePromise = new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = new URL("assets/editorial-sprite.png", document.baseURI).href;
        if (image.complete && image.naturalWidth) resolve(image);
      });
    }
    return spritePromise;
  }

  function makeFlight(source, startRect, endRect) {
    const style = getComputedStyle(source);
    const layer = document.createElement("div");
    layer.className = "viewer-flight";
    Object.assign(layer.style, {
      left: `${startRect.left}px`,
      top: `${startRect.top}px`,
      width: `${startRect.width}px`,
      height: `${startRect.height}px`,
      backgroundImage: style.backgroundImage,
      backgroundPosition: style.backgroundPosition,
      backgroundSize: style.backgroundSize,
      backgroundRepeat: style.backgroundRepeat,
      filter: "brightness(.84) saturate(.72)",
    });
    document.body.append(layer);
    flight = layer;

    try {
      flightAnimation = layer.animate([
        { left: `${startRect.left}px`, top: `${startRect.top}px`, width: `${startRect.width}px`, height: `${startRect.height}px`, borderRadius: "1px", filter: "brightness(.82) saturate(.7)" },
        { left: `${endRect.left}px`, top: `${endRect.top}px`, width: `${endRect.width}px`, height: `${endRect.height}px`, borderRadius: "2px", filter: "brightness(1) saturate(.88)" },
      ], { duration: 780, easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards" });
      return flightAnimation.finished.catch(() => {});
    } catch {
      return Promise.resolve();
    }
  }

  function clearFlight() {
    if (flightAnimation) flightAnimation.cancel();
    if (flight) flight.remove();
    flightAnimation = null;
    flight = null;
  }

  async function openViewer(trigger) {
    if (activeTrigger || viewer.classList.contains("is-closing")) return;
    activeTrigger = trigger;
    const index = Number(trigger.dataset.sprite) || 0;
    title.textContent = trigger.dataset.viewerTitle || "A thing worth keeping";
    description.textContent = trigger.dataset.viewerDescription || "A small detail can open up a whole new world of ideas.";
    count.textContent = `${String([...openers].indexOf(trigger) + 1).padStart(2, "0")} / ${String(openers.length).padStart(2, "0")}`;
    photo.className = `viewer-photo sprite sprite-${index}`;
    photo.setAttribute("aria-label", `${title.textContent}. ${description.textContent}`);
    viewer.hidden = false;
    viewer.inert = false;
    viewer.setAttribute("aria-hidden", "false");
    document.body.classList.add("manifesto-viewer-open");

    await nextFrame();
    viewer.classList.add("is-open");
    await nextFrame();

    if (!reducedMotion.matches) {
      const startRect = trigger.getBoundingClientRect();
      const endRect = viewer.querySelector(".viewer-media").getBoundingClientRect();
      if (startRect.width && startRect.height && endRect.width && endRect.height) {
        await makeFlight(trigger, startRect, endRect);
      }
    }
    if (flight) clearFlight();
    if (activeTrigger === trigger) photo.classList.add("is-visible");
    backButton.focus({ preventScroll: true });
  }

  function imagePalette(image, spriteIndex) {
    const sample = document.createElement("canvas");
    sample.width = 120;
    sample.height = 92;
    const sampleContext = sample.getContext("2d", { willReadFrequently: true });
    if (!sampleContext) return null;
    const tileWidth = image.naturalWidth / 3;
    const tileHeight = image.naturalHeight / 2;
    const column = spriteIndex % 3;
    const row = Math.floor(spriteIndex / 3);
    sampleContext.drawImage(image, column * tileWidth, row * tileHeight, tileWidth, tileHeight, 0, 0, sample.width, sample.height);
    return { pixels: sampleContext.getImageData(0, 0, sample.width, sample.height).data, width: sample.width, height: sample.height };
  }

  async function animateCosmicReturn(trigger) {
    const image = await spriteSource();
    if (!image || !image.naturalWidth) return;
    const spriteIndex = Number(trigger.dataset.sprite) || 0;
    let palette;
    try { palette = imagePalette(image, spriteIndex); } catch { return; }
    if (!palette) return;

    const from = photo.getBoundingClientRect();
    const to = trigger.getBoundingClientRect();
    if (!from.width || !from.height || !to.width || !to.height) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 1.6);
    const width = window.innerWidth;
    const height = window.innerHeight;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const particles = Array.from({ length: 430 }, () => {
      const u = Math.random();
      const v = Math.random();
      const pixelX = Math.min(palette.width - 1, Math.floor(u * palette.width));
      const pixelY = Math.min(palette.height - 1, Math.floor(v * palette.height));
      const offset = (pixelY * palette.width + pixelX) * 4;
      const lift = 1.12 + Math.random() * .42;
      const rgb = [0, 1, 2].map((channel) => Math.min(255, Math.round(palette.pixels[offset + channel] * lift + 10)));
      return {
        startX: from.left + u * from.width,
        startY: from.top + v * from.height,
        endX: to.left + u * to.width,
        endY: to.top + v * to.height,
        color: rgb.join(","),
        size: .65 + Math.random() * 1.7,
        delay: Math.random() * .16,
        driftX: (Math.random() - .5) * 46,
        driftY: (Math.random() - .5) * 38,
        phase: Math.random() * Math.PI * 2,
        previousX: from.left + u * from.width,
        previousY: from.top + v * from.height,
      };
    });

    const start = performance.now();
    const duration = 1120;
    return new Promise((resolve) => {
      function draw(now) {
        const overall = clamp((now - start) / duration);
        context.clearRect(0, 0, width, height);
        context.globalCompositeOperation = "lighter";

        for (const particle of particles) {
          const progress = clamp((overall - particle.delay) / (1 - particle.delay));
          const eased = 1 - Math.pow(1 - progress, 2.4);
          const arc = Math.sin(progress * Math.PI);
          const x = particle.startX + (particle.endX - particle.startX) * eased + particle.driftX * arc;
          const y = particle.startY + (particle.endY - particle.startY) * eased + particle.driftY * arc;
          const twinkle = .68 + .32 * Math.sin(now * .014 + particle.phase);
          const alpha = (.2 + .8 * Math.sin(progress * Math.PI * .5)) * twinkle;
          const size = particle.size * (1 - progress * .48);

          context.globalAlpha = alpha * .24;
          context.strokeStyle = `rgb(${particle.color})`;
          context.lineWidth = Math.max(.45, size * .68);
          context.beginPath();
          context.moveTo(particle.previousX, particle.previousY);
          context.lineTo(x, y);
          context.stroke();

          context.globalAlpha = alpha;
          context.fillStyle = `rgb(${particle.color})`;
          context.shadowColor = `rgba(${particle.color},.78)`;
          context.shadowBlur = size * 5;
          context.beginPath();
          context.arc(x, y, size, 0, Math.PI * 2);
          context.fill();
          particle.previousX = x;
          particle.previousY = y;
        }

        context.shadowBlur = 0;
        context.globalAlpha = 1;
        context.globalCompositeOperation = "source-over";
        if (overall < 1) window.requestAnimationFrame(draw);
        else {
          context.clearRect(0, 0, width, height);
          resolve();
        }
      }
      window.requestAnimationFrame(draw);
    });
  }

  async function closeViewer() {
    if (!activeTrigger || viewer.classList.contains("is-closing")) return;
    const trigger = activeTrigger;
    activeTrigger = null;
    clearFlight();
    viewer.inert = true;
    viewer.setAttribute("aria-hidden", "true");
    viewer.classList.remove("is-open");
    viewer.classList.add("is-closing");
    trigger.setAttribute("aria-expanded", "false");
    photo.classList.remove("is-visible");
    photo.classList.add("is-dissolving");
    pointerHoverSuppressed = true;

    if (!reducedMotion.matches) await animateCosmicReturn(trigger);
    else await new Promise((resolve) => window.setTimeout(resolve, 60));

    viewer.classList.remove("is-closing");
    photo.classList.remove("is-dissolving");
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    viewer.hidden = true;
    document.body.classList.remove("manifesto-viewer-open");
    trigger.classList.remove("particle-reform");
    void trigger.offsetWidth;
    trigger.classList.add("particle-reform");
    window.setTimeout(() => trigger.classList.remove("particle-reform"), 820);
    trigger.focus({ preventScroll: true });
  }

  openers.forEach((trigger) => {
    trigger.setAttribute("aria-expanded", "false");
    trigger.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "mouse" || pointerHoverSuppressed) return;
      const timer = window.setTimeout(() => openViewer(trigger), 150);
      hoverTimers.set(trigger, timer);
    });
    trigger.addEventListener("pointerleave", () => {
      window.clearTimeout(hoverTimers.get(trigger));
      hoverTimers.delete(trigger);
    });
    trigger.addEventListener("click", () => openViewer(trigger));
    trigger.addEventListener("animationend", (event) => {
      if (event.animationName === "particle-image-reform") trigger.classList.remove("particle-reform");
    });
  });

  viewer.querySelectorAll("[data-viewer-close]").forEach((control) => control.addEventListener("click", closeViewer));
  viewer.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      event.preventDefault();
      backButton.focus();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && activeTrigger) {
      event.preventDefault();
      closeViewer();
    }
  });
  document.addEventListener("pointermove", (event) => {
    if (pointerHoverSuppressed && !event.target.closest?.("[data-manifesto-open]")) pointerHoverSuppressed = false;
  }, true);
})();
