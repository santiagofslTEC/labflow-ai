// LabFlow product site: nav state, the scroll-driven steps, and the hero demo (Motion, motion.dev).
// Without Motion or with reduced motion, every element shows its final state.

const TRANSCRIPT = "Ensayo cuatro: cincuenta grados, quince minutos, rendimiento setenta y tres por ciento.";
const EASE = [0.22, 1, 0.36, 1];
const NEW_LINE_LENGTH = 74.3; // from (320, 65) to (390, 40) in the chart's viewBox

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const setupNav = () => {
  const nav = $(".nav");
  const update = () => nav.classList.toggle("scrolled", window.scrollY > 8);
  addEventListener("scroll", update, { passive: true });
  update();
};

// Desktop: one sticky stage shows the visual of the step crossing the middle of the screen.
// The visuals live inside each step (the phone layout shows them inline); the stage gets copies.
const setupSteps = () => {
  const steps = $$(".step");
  const stage = $("#stage");
  const visuals = steps.map((step) => step.querySelector(".step-visual").cloneNode(true));
  stage.append(...visuals);

  const activate = (index) => {
    steps.forEach((step, i) => step.classList.toggle("active", i === index));
    visuals.forEach((visual, i) => visual.classList.toggle("on", i === index));
  };
  activate(0);

  const observer = new IntersectionObserver(
    (entries) =>
      entries
        .filter((entry) => entry.isIntersecting)
        .forEach((entry) => activate(Number(entry.target.dataset.step))),
    { rootMargin: "-45% 0px -45% 0px" },
  );
  steps.forEach((step) => observer.observe(step));
};

const showFinalDemo = () => {
  $("#transcript").textContent = TRANSCRIPT;
  $(".demo-status").lastChild.textContent = "Guardado";
  $("#toast").style.opacity = "0";
};

const setupReveals = ({ animate, inView }) => {
  document.documentElement.classList.add("motion-ready");
  inView(
    ".reveal",
    (element) => {
      const siblings = [...element.parentElement.children].filter((child) => child.classList.contains("reveal"));
      animate(
        element,
        { opacity: 1, y: [16, 0] },
        { duration: 0.7, ease: EASE, delay: siblings.indexOf(element) * 0.08 },
      );
    },
    { amount: 0.25 },
  );
};

const heroEntrance = ({ animate, stagger }) => {
  animate(
    ".hero-copy > *",
    { opacity: [0, 1], y: [14, 0] },
    { duration: 0.8, ease: EASE, delay: stagger(0.07) },
  );
  animate(
    ".demo",
    { opacity: [0, 1], y: [32, 0], scale: [0.985, 1] },
    { duration: 1, ease: EASE, delay: 0.35 },
  );
};

// The hero loop: hear the phrase, show said vs understood, save the row, plot the point.
const runDemo = async ({ animate }) => {
  const transcript = $("#transcript");
  const status = $(".demo-status").lastChild;
  const chips = $$("#chips li");
  const cells = [...$("#new-row").cells];
  const line = $("#line-new");
  const point = $("#pt-new");
  const toast = $("#toast");
  const levels = $$(".levels i");
  line.style.strokeDasharray = String(NEW_LINE_LENGTH);

  const reset = () => {
    transcript.innerHTML = '<span class="text"></span><span class="caret"></span>';
    chips.forEach((chip) => (chip.style.opacity = "0"));
    cells.forEach((cell) => {
      cell.style.opacity = "0";
      cell.style.backgroundColor = "#e7f3ec";
    });
    line.style.strokeDashoffset = String(NEW_LINE_LENGTH);
    point.style.transform = "scale(0)";
    point.style.opacity = "0";
    toast.style.opacity = "0";
  };

  for (;;) {
    reset();
    status.textContent = "Escuchando";
    const text = transcript.querySelector(".text");
    const caret = transcript.querySelector(".caret");
    const blink = animate(caret, { opacity: [1, 0] }, { duration: 0.5, repeat: Infinity, repeatType: "reverse" });
    const talking = levels.map((bar, i) =>
      animate(
        bar,
        { scaleY: [0.2, 0.55 + (i % 3) * 0.2] },
        { duration: 0.28 + (i % 4) * 0.07, repeat: Infinity, repeatType: "reverse", delay: i * 0.05 },
      ),
    );

    await sleep(700);
    for (const word of TRANSCRIPT.split(" ")) {
      text.textContent += (text.textContent ? " " : "") + word;
      await sleep(150);
    }

    talking.forEach((animation) => animation.stop());
    animate(levels, { scaleY: 0.2 }, { duration: 0.3 });
    blink.stop();
    caret.style.opacity = "0";
    status.textContent = "Entendiendo";
    await sleep(450);

    for (const chip of chips) {
      animate(chip, { opacity: [0, 1], y: [6, 0] }, { duration: 0.45, ease: EASE });
      await sleep(220);
    }
    await sleep(600);

    status.textContent = "Guardado";
    animate(cells, { opacity: [0, 1] }, { duration: 0.5, ease: EASE });
    animate(cells, { backgroundColor: "rgba(231, 243, 236, 0)" }, { duration: 1.2, delay: 1.8 });
    await sleep(250);
    animate(line, { strokeDashoffset: 0 }, { duration: 0.6, ease: EASE });
    animate(point, { scale: [0, 1], opacity: [0, 1] }, { type: "spring", stiffness: 420, damping: 18, delay: 0.45 });
    animate(toast, { opacity: [0, 1], y: [10, 0] }, { duration: 0.45, ease: EASE, delay: 0.3 });

    await sleep(3600);
    animate(toast, { opacity: 0 }, { duration: 0.3 });
    await sleep(1200);
  }
};

setupNav();
setupSteps();

if (reducedMotion) {
  showFinalDemo();
} else {
  try {
    const motion = await import("https://cdn.jsdelivr.net/npm/motion@12/+esm");
    setupReveals(motion);
    heroEntrance(motion);
    runDemo(motion);
  } catch (error) {
    console.error("Motion did not load; showing the static page.", error);
    showFinalDemo();
  }
}
