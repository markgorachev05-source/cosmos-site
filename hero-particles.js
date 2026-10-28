(() => {
  const title = document.querySelector(".hero h1");
  const hero = document.querySelector(".hero");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!title || !hero || reducedMotion.matches || !window.WebGLRenderingContext) return;

  const wordmark = title.querySelector(".hero-wordmark");
  if (!wordmark) return;

  const vertexSource = `
    precision highp float;
    attribute vec2 aTarget;
    attribute vec3 aIntroOffset;
    attribute vec3 aBreakOffset;
    attribute float aSeed;
    attribute float aAlpha;
    attribute float aSize;
    attribute float aWarm;
    uniform vec2 uResolution;
    uniform float uDpr;
    uniform float uIntro;
    uniform float uScatter;
    uniform float uTime;
    uniform vec2 uPointer;
    uniform float uPointerStrength;
    varying float vAlpha;
    varying float vWarm;

    void main() {
      float localIntro = clamp((uIntro - aSeed * 0.24) / 0.76, 0.0, 1.0);
      float gathered = localIntro * localIntro * (3.0 - 2.0 * localIntro);
      vec2 center = uResolution * 0.5;
      vec2 point = aTarget + aIntroOffset.xy * (1.0 - gathered) + aBreakOffset.xy * uScatter;
      float depth = aIntroOffset.z * (1.0 - gathered) + aBreakOffset.z * uScatter;
      float perspective = 1.0 / (1.0 + depth / 820.0);
      point = center + (point - center) * perspective;

      float pointerDistance = distance(point, uPointer);
      float pointerInfluence = (1.0 - smoothstep(0.0, 118.0, pointerDistance)) * uPointerStrength;
      vec2 pointerDirection = (point - uPointer) / max(pointerDistance, 0.001);
      point += pointerDirection * pointerInfluence * 27.0;
      point += aIntroOffset.xy * sin(uTime * 0.0013 + aSeed * 24.0) * gathered * (1.0 - uScatter) * 0.22;

      vec2 clipPosition = point / uResolution * 2.0 - 1.0;
      clipPosition.y *= -1.0;
      gl_Position = vec4(clipPosition, 0.0, 1.0);
      gl_PointSize = max(1.0, aSize * uDpr * perspective * (0.92 + gathered * 0.12));
      vAlpha = aAlpha * mix(0.18, 0.96, gathered) * (1.0 - uScatter * 0.18);
      vAlpha *= 0.88 + 0.12 * sin(uTime * 0.0018 + aSeed * 41.0);
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
      float core = 1.0 - smoothstep(0.24, 0.82, distanceFromCenter);
      float halo = 1.0 - smoothstep(0.30, 1.0, distanceFromCenter);
      vec3 warm = vec3(0.91, 0.79, 0.63);
      vec3 color = mix(uColor, warm, vWarm * 0.36);
      gl_FragColor = vec4(color, vAlpha * (core * 0.92 + halo * 0.12));
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

  const attributeLocations = {
    target: gl.getAttribLocation(program, "aTarget"),
    introOffset: gl.getAttribLocation(program, "aIntroOffset"),
    breakOffset: gl.getAttribLocation(program, "aBreakOffset"),
    seed: gl.getAttribLocation(program, "aSeed"),
    alpha: gl.getAttribLocation(program, "aAlpha"),
    size: gl.getAttribLocation(program, "aSize"),
    warm: gl.getAttribLocation(program, "aWarm"),
  };
  const uniforms = {
    resolution: gl.getUniformLocation(program, "uResolution"),
    dpr: gl.getUniformLocation(program, "uDpr"),
    intro: gl.getUniformLocation(program, "uIntro"),
    scatter: gl.getUniformLocation(program, "uScatter"),
    time: gl.getUniformLocation(program, "uTime"),
    pointer: gl.getUniformLocation(program, "uPointer"),
    pointerStrength: gl.getUniformLocation(program, "uPointerStrength"),
    color: gl.getUniformLocation(program, "uColor"),
  };
  const buffers = Object.fromEntries(Object.keys(attributeLocations).map((name) => [name, gl.createBuffer()]));
  const colorCanvas = document.createElement("canvas");
  const colorContext = colorCanvas.getContext("2d");
  let color = [0.95, 0.95, 0.94];
  let pixelRatio = 1;
  let particleCount = 0;
  let frameId = 0;
  let intro = 0;
  let scatter = 0;
  let scatterTarget = 0;
  let pointer = [0, 0];
  let pointerTarget = [0, 0];
  let pointerStrength = 0;
  let pointerStrengthTarget = 0;
  let startedAt = 0;
  let lastFrameAt = 0;
  let heroIsVisible = true;
  let hasInitialized = false;

  function getCurrentColor() {
    if (!colorContext) return;
    colorContext.fillStyle = getComputedStyle(document.body).color;
    const match = colorContext.fillStyle.match(/[\d.]+/g);
    if (match && match.length >= 3) color = match.slice(0, 3).map((value) => Number(value) / 255);
  }

  function uploadAttribute(name, data, size) {
    const location = attributeLocations[name];
    if (location < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers[name]);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  }

  function rebuildParticles(isFirstBuild = false) {
    const box = title.getBoundingClientRect();
    if (box.width < 20 || box.height < 20) return false;

    pixelRatio = Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.25 : 1.55);
    canvas.width = Math.max(1, Math.round(box.width * pixelRatio));
    canvas.height = Math.max(1, Math.round(box.height * pixelRatio));
    gl.viewport(0, 0, canvas.width, canvas.height);

    const mask = document.createElement("canvas");
    mask.width = canvas.width;
    mask.height = canvas.height;
    const maskContext = mask.getContext("2d", { willReadFrequently: true });
    if (!maskContext) return false;
    maskContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    maskContext.clearRect(0, 0, box.width, box.height);

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
    const textX = textBox.left - box.left;
    const baseline = textBox.top - box.top + (textBox.height - fontSize) / 2 + fontSize * 0.79;
    maskContext.fillText(text, textX, baseline, Math.max(1, textBox.width));

    let pixels;
    try { pixels = maskContext.getImageData(0, 0, mask.width, mask.height).data; }
    catch { return false; }

    const step = Math.max(3, Math.round(pixelRatio * (window.innerWidth < 760 ? 2.8 : 3.2)));
    const target = [];
    const introOffset = [];
    const breakOffset = [];
    const seeds = [];
    const alphas = [];
    const sizes = [];
    const warm = [];
    const centerX = box.width * 0.5;
    const centerY = box.height * 0.5;
    const random = (seed) => {
      const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
      return value - Math.floor(value);
    };

    for (let y = 0; y < mask.height; y += step) {
      for (let x = 0; x < mask.width; x += step) {
        const pixelAlpha = pixels[(y * mask.width + x) * 4 + 3] / 255;
        if (pixelAlpha < 0.12) continue;

        const index = target.length / 2 + 1;
        const px = x / pixelRatio + 0.5 / pixelRatio;
        const py = y / pixelRatio + 0.5 / pixelRatio;
        const seed = random(index + x * 0.13 + y * 0.29);
        const introAngle = random(index * 1.7 + 5) * Math.PI * 2;
        const introDistance = 45 + random(index * 2.3 + 9) * 150;
        const radialX = px - centerX;
        const radialY = py - centerY;
        const radialLength = Math.hypot(radialX, radialY) || 1;
        const twist = (random(index * 3.1 + 13) - 0.5) * 0.8;
        const angle = Math.atan2(radialY, radialX) + twist;
        const breakDistance = 100 + random(index * 4.9 + 17) * 185;

        target.push(px, py);
        introOffset.push(
          Math.cos(introAngle) * introDistance,
          Math.sin(introAngle) * introDistance,
          30 + random(index * 6.2 + 21) * 170,
        );
        breakOffset.push(
          Math.cos(angle) * breakDistance + (random(index * 7.1 + 25) - 0.5) * 34,
          Math.sin(angle) * breakDistance + (random(index * 8.3 + 29) - 0.5) * 34,
          45 + random(index * 9.7 + 33) * 190 + radialLength * 0.08,
        );
        seeds.push(seed);
        alphas.push(0.42 + pixelAlpha * 0.5);
        sizes.push(1.25 + random(index * 10.9 + 37) * 1.05);
        warm.push(random(index * 12.1 + 41) > 0.985 ? 1 : 0);
      }
    }

    particleCount = seeds.length;
    if (particleCount < 100) return false;
    uploadAttribute("target", new Float32Array(target), 2);
    uploadAttribute("introOffset", new Float32Array(introOffset), 3);
    uploadAttribute("breakOffset", new Float32Array(breakOffset), 3);
    uploadAttribute("seed", new Float32Array(seeds), 1);
    uploadAttribute("alpha", new Float32Array(alphas), 1);
    uploadAttribute("size", new Float32Array(sizes), 1);
    uploadAttribute("warm", new Float32Array(warm), 1);
    getCurrentColor();

    if (isFirstBuild) {
      title.appendChild(canvas);
      title.classList.add("particle-ready");
      hasInitialized = true;
      startedAt = performance.now();
      scatterTarget = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.46)));
      requestFrame();
    }
    return true;
  }

  function requestFrame() {
    if (hasInitialized && !frameId && heroIsVisible) frameId = window.requestAnimationFrame(renderFrame);
  }

  function renderFrame(now) {
    frameId = 0;
    const delta = lastFrameAt ? Math.min(48, now - lastFrameAt) : 16;
    lastFrameAt = now;
    intro = Math.min(1, (now - startedAt) / 1650);
    scatter += (scatterTarget - scatter) * Math.min(1, delta * 0.009);
    pointer[0] += (pointerTarget[0] - pointer[0]) * Math.min(1, delta * 0.018);
    pointer[1] += (pointerTarget[1] - pointer[1]) * Math.min(1, delta * 0.018);
    pointerStrength += (pointerStrengthTarget - pointerStrength) * Math.min(1, delta * 0.014);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniform2f(uniforms.resolution, canvas.width / pixelRatio, canvas.height / pixelRatio);
    gl.uniform1f(uniforms.dpr, pixelRatio);
    gl.uniform1f(uniforms.intro, intro);
    gl.uniform1f(uniforms.scatter, scatter);
    gl.uniform1f(uniforms.time, now);
    gl.uniform2f(uniforms.pointer, pointer[0], pointer[1]);
    gl.uniform1f(uniforms.pointerStrength, pointerStrength);
    gl.uniform3f(uniforms.color, color[0], color[1], color[2]);
    title.style.setProperty("--particle-word-opacity", Math.max(0.84, Math.min(1, 0.9 + intro * 0.09 - scatter * 0.14)).toFixed(3));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.POINTS, 0, particleCount);

    const stillMoving = intro < 1 || Math.abs(scatter - scatterTarget) > 0.002 ||
      Math.hypot(pointerTarget[0] - pointer[0], pointerTarget[1] - pointer[1]) > 0.6 ||
      Math.abs(pointerStrengthTarget - pointerStrength) > 0.01;
    if (stillMoving && heroIsVisible) requestFrame();
    else lastFrameAt = 0;
  }

  function updateScrollState() {
    scatterTarget = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.46)));
    requestFrame();
  }

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (!rebuildParticles(false)) return;
      if (!frameId && heroIsVisible) requestFrame();
    }, 120);
  }, { passive: true });
  window.addEventListener("scroll", updateScrollState, { passive: true });

  hero.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    const box = canvas.getBoundingClientRect();
    pointerTarget = [event.clientX - box.left, event.clientY - box.top];
    pointerStrengthTarget = 1;
    requestFrame();
  }, { passive: true });
  hero.addEventListener("pointerleave", () => {
    pointerTarget = [canvas.width / pixelRatio / 2, canvas.height / pixelRatio / 2];
    pointerStrengthTarget = 0;
    requestFrame();
  });

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
    canvas.remove();
    hasInitialized = false;
  });

  const fontsReady = document.fonts?.ready || Promise.resolve();
  Promise.race([fontsReady, new Promise((resolve) => window.setTimeout(resolve, 850))]).then(() => {
    if (!rebuildParticles(true)) {
      canvas.remove();
      title.classList.remove("particle-ready");
    }
  });
})();
