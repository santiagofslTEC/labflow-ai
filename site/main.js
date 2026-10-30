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

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const smoothstep = (edge0, edge1, value) => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

// Desktop: a sticky stage beside the steps. Everything follows one continuous scroll position
// (0 when the first step sits in the middle of the screen, 1 at the second, and so on): each
// visual holds steady near its step and hands over around the midpoint, the outgoing one lifting
// away as the next rises in; step text brightens as it nears the middle and the rail fills.
// The visuals live inside each step (the phone layout shows them inline); the stage gets copies.
const setupSteps = () => {
  const steps = $$(".step");
  const stage = $("#stage");
  const railFill = $("#rail-fill");
  const visuals = steps.map((step) => step.querySelector(".step-visual").cloneNode(true));
  stage.append(...visuals);
  const desktop = matchMedia("(min-width: 961px)");
  const lift = reducedMotion ? 0 : 1;
  const last = steps.length - 1;

  const scrollPosition = () => {
    const middle = window.innerHeight / 2;
    const offsets = steps.map((step) => {
      const box = step.getBoundingClientRect();
      return box.top + box.height / 2 - middle;
    });
    if (offsets[0] >= 0) return 0;
    const i = offsets.findIndex((offset, k) => k < last && offset <= 0 && offsets[k + 1] > 0);
    return i === -1 ? last : i + -offsets[i] / (offsets[i + 1] - offsets[i]);
  };

  const render = () => {
    if (!desktop.matches) return;
    const position = scrollPosition();
    steps.forEach((step, i) => {
      const distance = Math.abs(position - i);
      const shown = 1 - smoothstep(0.2, 0.5, distance);
      step.style.opacity = String(0.3 + 0.7 * (1 - smoothstep(0.15, 0.6, distance)));
      step.classList.toggle("active", distance < 0.5);
      visuals[i].style.opacity = String(shown);
      visuals[i].style.transform = `translateY(${Math.sign(i - position) * (1 - shown) * 28 * lift}px) scale(${0.97 + 0.03 * shown})`;
      visuals[i].style.pointerEvents = shown > 0.5 ? "auto" : "none";
    });
    railFill.style.transform = `scaleY(${position / last})`;
  };

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      render();
    });
  };
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule);
  desktop.addEventListener("change", () => {
    steps.forEach((step) => (step.style.opacity = ""));
    schedule();
  });
  render();
};

// Problem cards: the toggle switches all three between today and with LabFlow, a tap flips one.
// Once the cards are on screen they turn to the fix by themselves, unless the visitor chose first.
const setupProblem = () => {
  const cards = $$(".pcard");
  const options = $$(".toggle-opt");
  const thumb = $(".toggle-thumb");
  let mode = "before";
  let touched = false;

  const setCard = (card, state) => {
    card.dataset.state = state;
    card.setAttribute("aria-pressed", String(state === "after"));
    card.querySelector(".pt-before").setAttribute("aria-hidden", String(state === "after"));
    card.querySelector(".pt-after").setAttribute("aria-hidden", String(state !== "after"));
  };
  const setToggle = (next) => {
    mode = next;
    options.forEach((option) => option.setAttribute("aria-pressed", String(option.dataset.mode === next)));
    const active = options.find((option) => option.dataset.mode === next);
    thumb.style.width = `${active.offsetWidth}px`;
    thumb.style.transform = `translateX(${active.offsetLeft - 4}px)`;
  };
  const setAll = (next) => {
    cards.forEach((card, i) => setTimeout(() => setCard(card, next), reducedMotion ? 0 : i * 110));
    setToggle(next);
  };

  options.forEach((option) =>
    option.addEventListener("click", () => {
      touched = true;
      setAll(option.dataset.mode);
    }),
  );
  cards.forEach((card) => {
    card.setAttribute("role", "button");
    const flip = () => {
      touched = true;
      const next = card.dataset.state === "after" ? "before" : "after";
      setCard(card, next);
      if (cards.every((other) => other.dataset.state === next)) setToggle(next);
    };
    card.addEventListener("click", flip);
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      flip();
    });
    setCard(card, "before");
  });

  setToggle("before");
  addEventListener("resize", () => setToggle(mode));
  document.fonts?.ready.then(() => setToggle(mode));

  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      setTimeout(() => !touched && setAll("after"), 3200);
    },
    { threshold: 0.6 },
  );
  observer.observe($("#pcards"));
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
        { opacity: 1, y: [10, 0] },
        { duration: 1.1, ease: EASE, delay: siblings.indexOf(element) * 0.1 },
      );
    },
    { amount: 0.3 },
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
setupProblem();

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
