(() => {
  const title = document.querySelector(".hero h1");
  const hero = document.querySelector(".hero");
  const wordmark = title?.querySelector(".hero-wordmark");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (!title || !hero || !wordmark || reducedMotion.matches || !window.WebGLRenderingContext) return;

  const vertexSource = `
    precision highp float;
    attribute vec2 aTarget;
    attribute vec3 aIdlePosition;
    attribute vec3 aBreakOffset;
    attribute float aSeed;
    attribute float aAlpha;
    attribute float aSize;
    attribute float aWarm;
    uniform vec2 uResolution;
    uniform float uDpr;
    uniform float uHover;
    uniform float uTime;
    uniform vec2 uPointer;
    uniform float uPointerStrength;
    varying float vAlpha;
    varying float vWarm;

    void main() {
      float formation = smoothstep(0.0, 0.34, uHover);
      float burst = smoothstep(0.32, 0.96, uHover);
      float interactive = smoothstep(0.04, 0.22, uHover);
      vec2 center = uResolution * 0.5;
      vec2 point = mix(aIdlePosition.xy, aTarget, formation) + aBreakOffset.xy * burst;
      float depth = mix(aIdlePosition.z, 0.0, formation) + aBreakOffset.z * burst;
      point += vec2(
        sin(uTime * 0.00072 + aSeed * 29.0) * 2.8,
        cos(uTime * 0.00061 + aSeed * 43.0) * 2.2
      ) * (1.0 - interactive);

      float perspective = 1.0 / (1.0 + depth / 820.0);
      point = center + (point - center) * perspective;
      float pointerDistance = distance(point, uPointer);
      float pointerInfluence = (1.0 - smoothstep(0.0, 118.0, pointerDistance)) * uPointerStrength * interactive;
      vec2 pointerDirection = (point - uPointer) / max(pointerDistance, 0.001);
      point += pointerDirection * pointerInfluence * 28.0;

      vec2 clipPosition = point / uResolution * 2.0 - 1.0;
      clipPosition.y *= -1.0;
      gl_Position = vec4(clipPosition, 0.0, 1.0);
      gl_PointSize = max(1.0, aSize * uDpr * perspective * (0.76 + interactive * 0.34));
      float ambientParticle = step(0.88, aSeed) * 0.58;
      float visible = mix(ambientParticle, 1.0, smoothstep(0.03, 0.22, uHover));
      vAlpha = aAlpha * visible * (0.84 + 0.16 * sin(uTime * 0.0016 + aSeed * 37.0));
      vWarm = aWarm;
    }
  `;

  const fragmentSource = `
    precision mediump float;
    uniform vec3 uColor;
    varying float vAlpha;
    varying float vWarm;
    void main() {
      float distanceFromCenter = length(gl_PointCoord - vec2(0.5)) * 2.0;
      float core = 1.0 - smoothstep(0.22, 0.8, distanceFromCenter);
      float halo = 1.0 - smoothstep(0.32, 1.0, distanceFromCenter);
      vec3 warm = vec3(0.91, 0.79, 0.63);
      vec3 color = mix(uColor, warm, vWarm * 0.36);
      gl_FragColor = vec4(color, vAlpha * (core * 0.92 + halo * 0.14));
    }
  `;

  const canvas = document.createElement("canvas");
  canvas.className = "hero-particle-canvas";
  canvas.setAttribute("aria-hidden", "true");
  const gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false });
  if (!gl) return;

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertexShader || !fragmentShader) return;

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);

  const attributes = {
    target: gl.getAttribLocation(program, "aTarget"),
    idlePosition: gl.getAttribLocation(program, "aIdlePosition"),
    breakOffset: gl.getAttribLocation(program, "aBreakOffset"),
    seed: gl.getAttribLocation(program, "aSeed"),
    alpha: gl.getAttribLocation(program, "aAlpha"),
    size: gl.getAttribLocation(program, "aSize"),
    warm: gl.getAttribLocation(program, "aWarm"),
  };
  const uniforms = {
    resolution: gl.getUniformLocation(program, "uResolution"),
    dpr: gl.getUniformLocation(program, "uDpr"),
    hover: gl.getUniformLocation(program, "uHover"),
    time: gl.getUniformLocation(program, "uTime"),
    pointer: gl.getUniformLocation(program, "uPointer"),
    pointerStrength: gl.getUniformLocation(program, "uPointerStrength"),
    color: gl.getUniformLocation(program, "uColor"),
  };
  const buffers = Object.fromEntries(Object.keys(attributes).map((name) => [name, gl.createBuffer()]));
  const colorContext = document.createElement("canvas").getContext("2d");
  let color = [0.95, 0.95, 0.94];
  let pixelRatio = 1;
  let bleedX = 0;
  let bleedY = 0;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let particleCount = 0;
  let frameId = 0;
  let hover = 0;
  let hoverTarget = 0;
  let pointer = [0, 0];
  let pointerTarget = [0, 0];
  let pointerStrength = 0;
  let pointerStrengthTarget = 0;
  let lastFrameAt = 0;
  let heroIsVisible = true;
  let initialized = false;

  function getCurrentColor() {
    if (!colorContext) return;
    colorContext.fillStyle = getComputedStyle(document.body).color;
    const match = colorContext.fillStyle.match(/[\d.]+/g);
    if (match && match.length >= 3) color = match.slice(0, 3).map((value) => Number(value) / 255);
  }

  function uploadAttribute(name, data, size) {
    const location = attributes[name];
    if (location < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers[name]);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  }

  function rebuildParticles() {
    const box = title.getBoundingClientRect();
    if (box.width < 20 || box.height < 20) return false;

    pixelRatio = Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.12 : 1.38);
    bleedX = Math.min(76, Math.max(36, box.width * 0.13));
    bleedY = Math.min(56, Math.max(28, box.height * 0.38));
    canvasWidth = box.width + bleedX * 2;
    canvasHeight = box.height + bleedY * 2;
    canvas.style.left = `${-bleedX}px`;
    canvas.style.top = `${-bleedY}px`;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
    canvas.width = Math.max(1, Math.round(canvasWidth * pixelRatio));
    canvas.height = Math.max(1, Math.round(canvasHeight * pixelRatio));
    gl.viewport(0, 0, canvas.width, canvas.height);

    const mask = document.createElement("canvas");
    mask.width = canvas.width;
    mask.height = canvas.height;
    const maskContext = mask.getContext("2d", { willReadFrequently: true });
    if (!maskContext) return false;
    maskContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    maskContext.clearRect(0, 0, canvasWidth, canvasHeight);

    const style = getComputedStyle(title);
    const range = document.createRange();
    range.selectNodeContents(wordmark);
    const textBox = range.getBoundingClientRect();
    const text = wordmark.textContent.trim();
    maskContext.font = style.font;
    if ("letterSpacing" in maskContext) maskContext.letterSpacing = style.letterSpacing;
    maskContext.textBaseline = "alphabetic";
    maskContext.fillStyle = "#fff";
    const fontSize = Number.parseFloat(style.fontSize) || box.height;
    const textX = textBox.left - box.left + bleedX;
    const baseline = textBox.top - box.top + bleedY + (textBox.height - fontSize) / 2 + fontSize * 0.79;
    maskContext.fillText(text, textX, baseline, Math.max(1, textBox.width));

    let pixels;
    try { pixels = maskContext.getImageData(0, 0, mask.width, mask.height).data; }
    catch { return false; }

    const step = Math.max(3, Math.round(pixelRatio * 3.35));
    const target = [];
    const idlePosition = [];
    const breakOffset = [];
    const seeds = [];
    const alphas = [];
    const sizes = [];
    const warm = [];
    const centerX = canvasWidth * 0.5;
    const centerY = canvasHeight * 0.5;
    const random = (seed) => {
      const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
      return value - Math.floor(value);
    };

    for (let y = 0; y < mask.height; y += step) {
      for (let x = 0; x < mask.width; x += step) {
        const pixelAlpha = pixels[(y * mask.width + x) * 4 + 3] / 255;
        if (pixelAlpha < 0.11) continue;

        const index = target.length / 2 + 1;
        const px = x / pixelRatio + 0.5 / pixelRatio;
        const py = y / pixelRatio + 0.5 / pixelRatio;
        const seed = random(index + x * 0.13 + y * 0.29);
        const orbitAngle = random(index * 1.7 + 5) * Math.PI * 2;
        const orbitX = box.width * 0.5 + 16 + random(index * 2.3 + 9) * Math.max(6, bleedX - 26);
        const orbitY = box.height * 0.5 + 9 + random(index * 3.1 + 13) * Math.max(6, bleedY - 18);
        const radialX = px - centerX;
        const radialY = py - centerY;
        const radialLength = Math.hypot(radialX, radialY) || 1;
        const twist = (random(index * 4.3 + 17) - 0.5) * 0.92;
        const breakAngle = Math.atan2(radialY, radialX) + twist;
        const breakDistance = 115 + random(index * 5.9 + 21) * 195;

        target.push(px, py);
        idlePosition.push(
          centerX + Math.cos(orbitAngle) * orbitX,
          centerY + Math.sin(orbitAngle) * orbitY,
          12 + random(index * 7.1 + 25) * 110,
        );
        breakOffset.push(
          Math.cos(breakAngle) * breakDistance + (random(index * 8.3 + 29) - 0.5) * 42,
          Math.sin(breakAngle) * breakDistance + (random(index * 9.7 + 33) - 0.5) * 42,
          35 + random(index * 10.9 + 37) * 180 + radialLength * 0.06,
        );
        seeds.push(seed);
        alphas.push(0.48 + pixelAlpha * 0.48);
        sizes.push(0.8 + random(index * 12.1 + 41) * 1.35);
        warm.push(random(index * 13.7 + 45) > 0.985 ? 1 : 0);
      }
    }

    particleCount = seeds.length;
    if (particleCount < 100) return false;
    uploadAttribute("target", new Float32Array(target), 2);
    uploadAttribute("idlePosition", new Float32Array(idlePosition), 3);
    uploadAttribute("breakOffset", new Float32Array(breakOffset), 3);
    uploadAttribute("seed", new Float32Array(seeds), 1);
    uploadAttribute("alpha", new Float32Array(alphas), 1);
    uploadAttribute("size", new Float32Array(sizes), 1);
    uploadAttribute("warm", new Float32Array(warm), 1);
    getCurrentColor();
    return true;
  }

  function requestFrame() {
    if (initialized && !frameId && heroIsVisible) frameId = window.requestAnimationFrame(renderFrame);
  }

  function renderFrame(now) {
    frameId = 0;
    if (!heroIsVisible) return;
    const delta = lastFrameAt ? Math.min(48, now - lastFrameAt) : 16;
    lastFrameAt = now;
    hover += (hoverTarget - hover) * Math.min(1, delta * 0.0042);
    pointer[0] += (pointerTarget[0] - pointer[0]) * Math.min(1, delta * 0.018);
    pointer[1] += (pointerTarget[1] - pointer[1]) * Math.min(1, delta * 0.018);
    pointerStrength += (pointerStrengthTarget - pointerStrength) * Math.min(1, delta * 0.014);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniform2f(uniforms.resolution, canvasWidth, canvasHeight);
    gl.uniform1f(uniforms.dpr, pixelRatio);
    gl.uniform1f(uniforms.hover, hover);
    gl.uniform1f(uniforms.time, now);
    gl.uniform2f(uniforms.pointer, pointer[0], pointer[1]);
    gl.uniform1f(uniforms.pointerStrength, pointerStrength);
    gl.uniform3f(uniforms.color, color[0], color[1], color[2]);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.POINTS, 0, particleCount);

    const wordFade = smoothstep(0.38, 0.78, hover);
    title.style.setProperty("--particle-word-opacity", (1 - wordFade * 0.95).toFixed(3));
    if (heroIsVisible) frameId = window.requestAnimationFrame(renderFrame);
  }

  function smoothstep(edge0, edge1, value) {
    const x = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
    return x * x * (3 - 2 * x);
  }

  function setPointer(event) {
    const box = canvas.getBoundingClientRect();
    pointerTarget = [event.clientX - box.left, event.clientY - box.top];
    pointerStrengthTarget = 1;
  }

  if (finePointer) {
    title.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "touch") return;
      hero.classList.add("title-hovered");
      hoverTarget = 1;
      setPointer(event);
      requestFrame();
    }, { passive: true });
    title.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") return;
      setPointer(event);
      requestFrame();
    }, { passive: true });
    title.addEventListener("pointerleave", () => {
      hero.classList.remove("title-hovered");
      hoverTarget = 0;
      pointerStrengthTarget = 0;
      requestFrame();
    });
  }

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (rebuildParticles() && heroIsVisible) requestFrame();
    }, 120);
  }, { passive: true });

  const visibilityObserver = new IntersectionObserver((entries) => {
    heroIsVisible = entries[0].isIntersecting;
    if (heroIsVisible) requestFrame();
  }, { threshold: 0.01 });
  visibilityObserver.observe(hero);

  const themeObserver = new MutationObserver(() => {
    getCurrentColor();
    requestFrame();
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    title.classList.remove("particle-ready");
    title.style.removeProperty("--particle-word-opacity");
    canvas.remove();
    initialized = false;
    if (frameId) window.cancelAnimationFrame(frameId);
  });

  const fontsReady = document.fonts?.ready || Promise.resolve();
  Promise.race([fontsReady, new Promise((resolve) => window.setTimeout(resolve, 850))]).then(() => {
    title.appendChild(canvas);
    title.classList.add("particle-ready");
    if (!rebuildParticles()) {
      title.classList.remove("particle-ready");
      canvas.remove();
      return;
    }
    initialized = true;
    pointer = [canvasWidth * 0.5, canvasHeight * 0.5];
    pointerTarget = [...pointer];
    requestFrame();
  });
})();
