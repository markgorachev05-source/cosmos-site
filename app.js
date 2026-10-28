(() => {
  const root = document.documentElement;
  const body = document.body;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const themeButton = document.querySelector(".theme-toggle");
  const toast = document.querySelector(".toast");
  const signInDialog = document.querySelector(".signin-dialog");
  let rafPending = false;
  let toastTimer = 0;

  try {
    const savedTheme = localStorage.getItem("cosmos-theme");
    if (savedTheme === "light" || savedTheme === "dark") root.dataset.theme = savedTheme;
  } catch {}

  function setTheme(theme) {
    root.dataset.theme = theme;
    const light = theme === "light";
    themeButton.setAttribute("aria-pressed", String(light));
    themeButton.setAttribute("aria-label", light ? "Switch to dark theme" : "Switch to light theme");
    try { localStorage.setItem("cosmos-theme", theme); } catch {}
  }
  setTheme(root.dataset.theme || "dark");
  themeButton.addEventListener("click", () => setTheme(root.dataset.theme === "dark" ? "light" : "dark"));

  function updateScrollState() {
    const scrollY = window.scrollY;
    const viewport = window.innerHeight || 1;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - viewport);
    const progress = Math.min(1, Math.max(0, scrollY / maxScroll));
    const heroProgress = Math.min(1, Math.max(0, scrollY / (viewport * 0.82)));
    root.style.setProperty("--page-progress", progress.toFixed(4));
    root.style.setProperty("--hero-progress", heroProgress.toFixed(4));
    root.style.setProperty("--hero-opacity", (1 - heroProgress * 0.44).toFixed(4));
    root.style.setProperty("--hero-offset", (heroProgress * 7) + "vh");
    root.style.setProperty("--hero-scale", (1 + heroProgress * 0.16).toFixed(4));
    body.classList.toggle("is-scrolled", scrollY > viewport * 0.28);
    body.classList.toggle("in-app", scrollY > viewport * 3.1);
    rafPending = false;
  }
  function requestScrollUpdate() {
    if (rafPending) return;
    rafPending = true;
    window.requestAnimationFrame(updateScrollState);
  }
  window.addEventListener("scroll", requestScrollUpdate, { passive: true });
  window.addEventListener("resize", requestScrollUpdate, { passive: true });
  updateScrollState();

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -5% 0px" });
  document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));

  document.querySelectorAll(".save-button").forEach((button) => {
    button.addEventListener("click", () => {
      const saved = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(saved));
      button.querySelector("span").textContent = saved ? "✓" : "＋";
      button.setAttribute("aria-label", saved ? "Remove saved item" : "Save item");
      showToast(saved ? "Saved to your collection" : "Removed from your collection");
    });
  });

  document.querySelectorAll("[data-waitlist]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const email = form.elements.email;
      if (!email.reportValidity()) return;
      const note = form.querySelector(".form-note");
      if (note) note.textContent = "Thanks for joining.";
      const button = form.querySelector("button[type='submit']");
      button.textContent = "You're on the list";
      button.disabled = true;
      email.value = "";
      showToast("Thanks — you’re on the list.");
    });
  });

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2400);
  }
  document.querySelector("[data-open-signin]").addEventListener("click", () => {
    if (typeof signInDialog.showModal === "function") signInDialog.showModal();
  });
  document.querySelectorAll("[data-close-signin], .dialog-close").forEach((button) => {
    button.addEventListener("click", () => signInDialog.close());
  });
  signInDialog.addEventListener("click", (event) => {
    if (event.target === signInDialog) signInDialog.close();
  });

  if (reducedMotion.matches) {
    body.classList.add("motion-reduced");
    document.querySelectorAll(".reveal").forEach((element) => element.classList.add("is-visible"));
  }
})();
