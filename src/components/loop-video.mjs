// The site's one loop player (#94, SITE-REDESIGN.md section 5.6).
//
// A loop is a short, silent, muted clip of the real product that repeats beside its text. It
// renders as its poster with no source in the HTML, so the page asks for no video byte until a
// reader presses its play control, or, where its manifest entry's autoplay policy is
// `idle-hint`, until the page is idle. Neither happens under reduced motion or data saver: the
// poster is all the reader gets, with no control to start it. A loop that plays pauses while it
// is scrolled away or its page is hidden, and comes back when both return. A loop that fails
// keeps its poster and says it could not play. Nothing removes a source once it is attached,
// so no media request is ever aborted (tests/browser/support.ts fails on any failed request).
//
// One file holds both halves, so the markup a page renders and the markup the playback spec
// drives cannot drift: `loopVideoMarkup` writes it (src/components/LoopVideo.astro, and the
// System Window's tabs through `manifestLoopMarkup`), and `mountLoopVideos` makes every loop on
// the page play by these rules. Its look is ./loop-video.css.

/** Every loop on a page carries this attribute. */
export const LOOP_SELECTOR = "[data-loop-video]";

/** The policies a manifest entry may name (marketing/screenshots.schema.json, `autoplay`). */
export const AUTOPLAY = Object.freeze(["none", "idle-hint"]);

const escape = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * The markup of one loop.
 *
 * A loop shows its rendered poster until it plays. A page may give it a `still` instead, an
 * image of its own (its HTML): the loop then shows that still, and its video has no poster and
 * shows only once it has played. That keeps a page's own image where it matters, such as Home's
 * largest paint in the System Window, or a capture below the fold that loads after the page.
 *
 * @param {{ src: string, poster?: string, still?: string, width: number, height: number,
 *   label: string, autoplay?: string, fallback: string }} loop
 * @returns {string}
 */
export function loopVideoMarkup({ src, poster, still, width, height, label, autoplay = "none", fallback }) {
  if (!AUTOPLAY.includes(autoplay)) throw new Error(`a loop's autoplay policy is one of ${AUTOPLAY.join(", ")}, not ${autoplay}`);
  if (!(width > 0 && height > 0)) throw new Error("a loop has a width and a height, so its box never moves");
  if (!still && !poster) throw new Error("a loop shows its poster or a still until it plays");
  return (
    `<figure class="loop-video" data-loop-video data-src="${escape(src)}" data-autoplay="${escape(autoplay)}"` +
    `${still ? " data-still" : ""} data-state="poster" style="aspect-ratio: ${width} / ${height}">` +
    (still ?? "") +
    `<video muted playsinline loop preload="none"${still ? "" : ` poster="${escape(poster)}"`} width="${width}" height="${height}"` +
    ` aria-label="${escape(label)}"></video>` +
    `<button type="button" class="loop-toggle" data-loop-toggle aria-pressed="false">` +
    `<span data-loop-word>Play</span><span class="sr-only"> ${escape(label)}</span></button>` +
    `<figcaption class="loop-fallback" data-loop-fallback hidden>${escape(fallback)}</figcaption>` +
    `</figure>`
  );
}

/**
 * The markup of the manifest's loop *id*. It must be a shipping loop, so a page cannot play a
 * loop the manifest does not declare, or one it has retired; the files, the box and the autoplay
 * policy are the entry's.
 *
 * @param {{ id: string, kind: string, status: string, output: string, poster: string,
 *   width: number, height: number, autoplay: string, fallback: string }[]} videos the manifest's
 *   `videos` (marketing/screenshots.manifest.json)
 * @param {string} id
 * @param {string} label what the loop shows, for a screen reader
 * @param {string} [still] the page's own image to show until the loop plays (`loopVideoMarkup`)
 * @returns {string}
 */
export function manifestLoopMarkup(videos, id, label, still) {
  const entry = videos.find((video) => video.id === id);
  if (!entry) throw new Error(`no video "${id}" in marketing/screenshots.manifest.json`);
  if (entry.kind !== "loop") throw new Error(`video "${id}" is a ${entry.kind} video, not a loop`);
  if (entry.status !== "shipping") throw new Error(`video "${id}" is ${entry.status}, not shipping`);
  const url = (rel) => `/${rel.replace(/^public\//, "")}`;
  return loopVideoMarkup({
    src: url(entry.output),
    poster: url(entry.poster),
    still,
    width: entry.width,
    height: entry.height,
    label,
    autoplay: entry.autoplay,
    fallback: entry.fallback
  });
}

/** Whether motion is off for this reader: reduced motion, or data saver. */
function motionOff(win) {
  const reduced = win.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  return reduced || win.navigator.connection?.saveData === true;
}

function typeOf(src) {
  return src.endsWith(".webm") ? "video/webm" : "video/mp4";
}

/**
 * Make every loop under *root* play by the rules above. Returns a function that stops
 * watching them.
 *
 * @param {ParentNode} [root]
 * @returns {() => void}
 */
export function mountLoopVideos(root = document) {
  const win = window;
  const stops = [];
  for (const figure of root.querySelectorAll(LOOP_SELECTOR)) {
    if (figure.dataset.mounted === "true") continue;
    figure.dataset.mounted = "true";
    const video = figure.querySelector("video");
    const toggle = figure.querySelector("[data-loop-toggle]");
    const word = figure.querySelector("[data-loop-word]");
    const fallback = figure.querySelector("[data-loop-fallback]");
    if (!video || !toggle || !word || !fallback) continue;

    if (motionOff(win)) {
      figure.dataset.state = "still";
      toggle.hidden = true;
      continue;
    }

    let wanted = false;
    let inView = false;
    let failed = false;

    // The control says what the reader asked for; the state says what the video is doing
    // (`held` is a loop the reader started that is paused offscreen or while the page is hidden).
    const show = () => {
      // Once it has played, a loop with a still keeps showing its video, paused or not.
      if (!video.paused) figure.dataset.started = "";
      toggle.setAttribute("aria-pressed", String(wanted));
      word.textContent = wanted ? "Pause" : "Play";
      figure.dataset.state = failed ? "failed" : !video.paused ? "playing" : wanted ? "held" : "poster";
    };
    const fail = () => {
      failed = true;
      wanted = false;
      toggle.hidden = true;
      fallback.hidden = false;
      show();
    };
    const attach = () => {
      if (video.querySelector("source")) return;
      const source = document.createElement("source");
      source.src = figure.dataset.src ?? "";
      source.type = typeOf(source.src);
      source.addEventListener("error", fail);
      video.append(source);
    };
    const run = () => {
      if (failed || !wanted || !inView || document.visibilityState !== "visible") return;
      video.play().catch(() => {
        if (video.error) fail();
      });
    };
    const start = () => {
      if (failed || motionOff(win)) return;
      wanted = true;
      attach();
      show();
      run();
    };
    const stop = () => {
      wanted = false;
      video.pause();
      show();
    };

    video.addEventListener("error", fail);
    video.addEventListener("playing", show);
    video.addEventListener("pause", show);
    toggle.addEventListener("click", () => (wanted ? stop() : start()));

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        inView = entry.isIntersecting;
        if (inView) run();
        else video.pause();
      }
    });
    observer.observe(figure);

    const onVisibility = () => (document.visibilityState === "visible" ? run() : video.pause());
    document.addEventListener("visibilitychange", onVisibility);

    // A reader who turns reduced motion on mid-play gets the still frame back.
    const reduce = win.matchMedia?.("(prefers-reduced-motion: reduce)");
    const onReduce = () => {
      if (reduce?.matches) stop();
    };
    reduce?.addEventListener?.("change", onReduce);

    let idle = 0;
    if (figure.dataset.autoplay === "idle-hint") {
      const hint = () => {
        idle = (win.requestIdleCallback ?? ((fn) => win.setTimeout(fn, 1)))(() => {
          if (!wanted && !failed) start();
        });
      };
      if (document.readyState === "complete") hint();
      else win.addEventListener("load", hint, { once: true });
    }

    stops.push(() => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      reduce?.removeEventListener?.("change", onReduce);
      if (idle) (win.cancelIdleCallback ?? win.clearTimeout)(idle);
    });
  }
  return () => {
    for (const stop of stops) stop();
  };
}
