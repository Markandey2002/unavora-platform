"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Labels = { prev: string; next: string; goTo?: string; pause?: string; play?: string };

/**
 * Horizontal card carousel with optional calm right-to-left auto-scroll (docs/CAROUSEL_BEHAVIOUR.md).
 *  - Layout (container-query units, so widths follow the carousel itself): phones 1 card + a peek of the next,
 *    36rem+ two cards, 60rem+ three, 88rem+ four.
 *  - Auto-scroll moves the track's own scroll position (native swipe, arrows, keyboard and mouse drag keep working).
 *    Seamless loop: a duplicate set of the cards follows the originals (aria-hidden + inert, so screen readers and
 *    keyboards never meet it); when the position passes one full set it is shifted back by exactly that width.
 *  - Pauses: pointer hover, keyboard focus inside, touch/drag/wheel (resumes after 4 s of inactivity), off-screen
 *    (IntersectionObserver), hidden tab, the pause button; never runs with prefers-reduced-motion.
 *  - Phones get position dots; arrows from 640 px. The page itself never scrolls sideways.
 * Children must be <li> elements.
 */
export function Carousel({ label, prev, next, goTo = "Go to card {n} of {total}", pause = "Pause automatic scrolling", play = "Resume automatic scrolling",
  children, testId, header, extra, autoplay = false }: {
  label: string; children: React.ReactNode; testId?: string; header?: React.ReactNode; extra?: React.ReactNode; autoplay?: boolean;
} & Labels) {
  const scroller = useRef<HTMLDivElement>(null);
  const originals = useRef<HTMLUListElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [pos, setPos] = useState({ index: 0, count: 0 });
  const [edges, setEdges] = useState({ start: true, end: true });
  const [paused, setPaused] = useState(false);          // the visitor's pause button
  const [reduced, setReduced] = useState(true);         // assume reduced motion until known: no motion on first paint
  const holds = useRef({ hover: false, focus: false, touch: false, offscreen: true, hidden: false });
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [, force] = useState(0);
  const loop = autoplay && overflowing;
  const running = loop && !paused && !reduced;

  // ---------- measurements ----------
  const gapOf = (el: Element | null) => (el ? parseFloat(getComputedStyle(el).columnGap || "0") || 0 : 0);
  const setLength = useCallback(() => {
    const ul = originals.current;
    return ul ? ul.offsetWidth + gapOf(ul.parentElement) : 0;
  }, []);
  const cardStep = () => {
    const li = originals.current?.querySelector("li");
    return li ? li.getBoundingClientRect().width + gapOf(originals.current) : scroller.current?.clientWidth ?? 300;
  };
  const update = useCallback(() => {
    const sc = scroller.current, ul = originals.current;
    if (!sc || !ul) return;
    const over = ul.offsetWidth > sc.clientWidth + 2;
    setOverflowing((o) => (o === over ? o : over));
    const start = sc.scrollLeft <= 2, end = sc.scrollLeft + sc.clientWidth >= sc.scrollWidth - 2;
    setEdges((e) => (e.start === start && e.end === end ? e : { start, end }));
    const cards = [...ul.children] as HTMLElement[];
    const L = setLength();
    const x = L > 0 ? sc.scrollLeft % L : sc.scrollLeft;
    let index = 0, best = Infinity;
    cards.forEach((c, i) => { const d = Math.abs(c.offsetLeft - ul.offsetLeft - x); if (d < best) { best = d; index = i; } });
    setPos((p) => (p.index === index && p.count === cards.length ? p : { index, count: cards.length }));
  }, [setLength]);

  useEffect(() => { update(); });   // children may change (filters): re-measure after every render (state setters bail out when unchanged)
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    const ro = new ResizeObserver(update);
    ro.observe(sc);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMq = () => setReduced(mq.matches);
    onMq(); mq.addEventListener("change", onMq);
    const io = new IntersectionObserver(([e]) => { holds.current.offscreen = !e.isIntersecting; force((n) => n + 1); }, { threshold: 0.15 });
    io.observe(sc);
    const onVis = () => { holds.current.hidden = document.hidden; force((n) => n + 1); };
    document.addEventListener("visibilitychange", onVis);
    return () => { ro.disconnect(); io.disconnect(); mq.removeEventListener("change", onMq); document.removeEventListener("visibilitychange", onVis); clearTimeout(resumeTimer.current); };
  }, [update]);

  // ---------- auto-scroll ----------
  const h = holds.current;
  const moving = running && !h.hover && !h.focus && !h.touch && !h.offscreen && !h.hidden;
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    if (!moving) { sc.style.scrollSnapType = ""; return; }
    sc.style.scrollSnapType = "none";
    const speed = window.innerWidth < 640 ? 18 : 28;   // px per second: calm
    let x = sc.scrollLeft, last = performance.now(), raf = 0;
    const tick = (t: number) => {
      const dt = Math.min(64, t - last); last = t;
      if (Math.abs(sc.scrollLeft - Math.round(x)) > 2) x = sc.scrollLeft;   // moved by someone else (arrows, dots)
      x += (speed * dt) / 1000;
      const L = setLength();
      if (L > 0 && x >= L) x -= L;                                            // seamless wrap onto identical cards
      sc.scrollLeft = x;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [moving, setLength]);

  // manual scrolling past the duplicated set wraps silently too
  const onScroll = () => {
    const sc = scroller.current;
    if (loop && sc && !moving) { const L = setLength(); if (L > 0 && sc.scrollLeft >= L + 1) sc.scrollLeft -= L; }
    update();
  };

  const hold = (k: "hover" | "focus" | "touch", v: boolean) => {
    if (k === "touch") {
      clearTimeout(resumeTimer.current);
      if (v) { h.touch = true; force((n) => n + 1); }
      else resumeTimer.current = setTimeout(() => { h.touch = false; force((n) => n + 1); }, 4000);
      return;
    }
    h[k] = v; force((n) => n + 1);
  };

  // ---------- manual controls ----------
  const behavior = (): ScrollBehavior => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");
  const step = (dir: 1 | -1) => {
    const sc = scroller.current;
    if (!sc) return;
    hold("touch", true); hold("touch", false);   // a manual step pauses auto-scroll for a moment
    if (loop && dir === -1 && sc.scrollLeft < cardStep() - 1) sc.scrollLeft += setLength();
    sc.scrollBy({ left: dir * cardStep(), behavior: behavior() });
  };
  const jump = (i: number) => {
    const sc = scroller.current, ul = originals.current, card = ul?.children[i] as HTMLElement | undefined;
    if (!sc || !ul || !card) return;
    hold("touch", true); hold("touch", false);
    sc.scrollTo({ left: card.offsetLeft - ul.offsetLeft, behavior: behavior() });
  };

  // mouse drag (touch and pens keep native scrolling); a drag never triggers the card link underneath
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") { hold("touch", true); return; }
    if (e.button !== 0 || !scroller.current) return;
    drag.current = { x: e.clientX, left: scroller.current.scrollLeft, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current, sc = scroller.current;
    if (!d || !sc) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 5) { d.moved = true; sc.setPointerCapture(e.pointerId); hold("touch", true); }
    if (d.moved) { sc.style.scrollSnapType = "none"; sc.scrollLeft = d.left - dx; }
  };
  const endPointer = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || drag.current?.moved) hold("touch", false);
    if (scroller.current && !moving) scroller.current.style.scrollSnapType = "";
    setTimeout(() => { drag.current = null; }, 0);
  };
  const onClickCapture = (e: React.MouseEvent) => { if (drag.current?.moved) { e.preventDefault(); e.stopPropagation(); } };

  const btn = "grid size-11 place-items-center border border-navy/25 bg-white text-navy transition-colors hover:border-navy hover:bg-navy hover:text-ivory disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-600";
  const widths = "[&_li]:w-[85cqw] [&_li]:shrink-0 [&_li]:snap-start @min-[36rem]:[&_li]:w-[calc((100cqw-1.25rem)/2)] @min-[60rem]:[&_li]:w-[calc((100cqw-3rem)/3)] @min-[88rem]:[&_li]:w-[calc((100cqw-4.5rem)/4)]";
  const showPause = loop && !reduced;
  const pauseIcon = paused
    ? <svg aria-hidden viewBox="0 0 20 20" className="size-4"><path d="M6 4l10 6-10 6z" fill="currentColor" /></svg>
    : <svg aria-hidden viewBox="0 0 20 20" className="size-4"><path d="M6 4h3v12H6zM11 4h3v12h-3z" fill="currentColor" /></svg>;

  return (
    <div data-testid={testId} data-autoplay={autoplay ? (moving ? "running" : "paused") : "off"}
      onMouseEnter={() => hold("hover", true)} onMouseLeave={() => hold("hover", false)}
      onFocus={() => hold("focus", true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) hold("focus", false); }}>
      <div className="flex items-end justify-between gap-4">
        {header}
        <div className="flex shrink-0 items-center gap-3">
          {extra}
          {showPause && (
            <button type="button" className={`${btn} hidden sm:grid`} aria-pressed={paused} aria-label={paused ? play : pause}
              onClick={() => setPaused((p) => !p)} data-testid="carousel-pause">{pauseIcon}</button>
          )}
          <div className={`hidden gap-2 sm:flex ${overflowing ? "" : "sm:!hidden"}`}>
            <button type="button" className={btn} aria-label={prev} disabled={!loop && edges.start} onClick={() => step(-1)} data-testid="carousel-prev">
              <svg aria-hidden viewBox="0 0 20 20" className="size-5"><path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
            </button>
            <button type="button" className={btn} aria-label={next} disabled={!loop && edges.end} onClick={() => step(1)} data-testid="carousel-next">
              <svg aria-hidden viewBox="0 0 20 20" className="size-5"><path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
            </button>
          </div>
        </div>
      </div>
      <div ref={scroller} role="region" aria-roledescription="carousel" aria-label={label} tabIndex={0} onScroll={onScroll}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endPointer} onPointerCancel={endPointer} onClickCapture={onClickCapture}
        onWheel={(e) => { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { hold("touch", true); hold("touch", false); } }}
        onDragStart={(e) => e.preventDefault()}
        className={`@container -mx-4 mt-6 flex snap-x snap-mandatory gap-5 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 pb-3 [scrollbar-width:none] [touch-action:pan-x_pan-y] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-600 sm:mx-0 sm:scroll-px-0 sm:px-0 lg:gap-6 [&::-webkit-scrollbar]:hidden ${widths}`}
        data-testid="carousel-track">
        <ul ref={originals} aria-label={label} className="flex shrink-0 gap-5 lg:gap-6">{children}</ul>
        {loop && (
          <ul aria-hidden="true" inert className="flex shrink-0 gap-5 lg:gap-6" data-testid="carousel-clones">{children}</ul>
        )}
      </div>
      {pos.count > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1 sm:hidden" data-testid="carousel-dots">
          {Array.from({ length: pos.count }, (_, i) => (
            <button key={i} type="button" onClick={() => jump(i)} aria-label={goTo.replace("{n}", String(i + 1)).replace("{total}", String(pos.count))}
              aria-current={i === pos.index ? "true" : undefined} className="grid size-6 place-items-center">
              <span aria-hidden className={`block h-1.5 rounded-full transition-all ${i === pos.index ? "w-5 bg-navy" : "w-1.5 bg-navy/25"}`} />
            </button>
          ))}
          {showPause && (
            <button type="button" aria-pressed={paused} aria-label={paused ? play : pause} onClick={() => setPaused((p) => !p)}
              className="ml-2 grid size-8 place-items-center text-navy" data-testid="carousel-pause-mobile">{pauseIcon}</button>
          )}
        </div>
      )}
    </div>
  );
}
