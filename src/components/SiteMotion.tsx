"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * The whole motion system, mounted once on the homepage.
 *
 * Two things here are easy to get wrong and silent when you do.
 *
 * 1. Lenis <-> ScrollTrigger. They do not talk by default: Lenis
 *    takes over scrolling with its own RAF loop, ScrollTrigger keeps
 *    reading native scroll position, and triggers fire in the wrong
 *    place with no error. Three lines fix it — the on("scroll"),
 *    the ticker.add, and lagSmoothing(0).
 *
 * 2. Start states. CSS hides the animated elements under html.js to
 *    avoid a flash. That means .from() would animate 0 -> 0, because
 *    .from() treats the *current* computed style as the end state.
 *    So we set start states explicitly with gsap.set(), drop the
 *    class, and animate with .to(). Never .from() here.
 */
export default function SiteMotion() {
  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      root.classList.remove("js");
      return;
    }

    // ── Start states, then hand control from CSS to GSAP. ─────────
    gsap.set(".manifesto .line-inner", { yPercent: 110 });
    gsap.set("[data-anim='fade']", { opacity: 0, y: 16 });
    gsap.set("[data-reveal]", { opacity: 0, y: 28 });
    gsap.set(".tile", { opacity: 0, yPercent: 22 });
    gsap.set(".rail > *", { opacity: 0, y: 10 });
    // CSS owns the translateZ/scale on .veil and .plate — those
    // establish the depth planes. GSAP must never write to those
    // elements' transforms or it flattens the 3D stage. So globe
    // motion targets the inner canvas instead.
    //
    // And it never scales the canvas: scaling a bitmap resamples it,
    // which is exactly the softness we rendered at devicePixelRatio
    // to avoid. Opacity and translation only.
    gsap.set(".veil", { opacity: 0 });
    gsap.set(".earth-canvas", { yPercent: 3 });
    gsap.set(".meridian", { scaleY: 0, transformOrigin: "top" });
    gsap.set(".monogram", { opacity: 0, y: -14 });

    root.classList.remove("js");

    /**
     * Watchdog.
     *
     * The gsap.set() calls above hide the wordmark by writing an
     * inline transform. The html.js CSS failsafe cannot undo that —
     * an inline style outlives a class removal. So if anything below
     * throws before the intro timeline runs, the name stays
     * invisible forever and the page just looks broken, with nothing
     * in the console to say why.
     *
     * That is exactly what happened. This clears every start state
     * if the intro hasn't reported completion in time. A site that
     * hides its own headline is worse than one with no animation.
     */
    const ANIMATED = [
      ".manifesto .line-inner",
      "[data-anim='fade']",
      "[data-reveal]",
      ".tile",
      ".rail > *",
      ".veil",
      ".meridian",
      ".monogram",
      ".earth-canvas",
    ].join(", ");

    let introDone = false;
    const revealEverything = () => {
      if (introDone) return;
      introDone = true;
      gsap.set(ANIMATED, { clearProps: "all" });
    };

    const watchdog = window.setTimeout(revealEverything, 5000);

    const lenis = new Lenis({
      duration: 1.1,
      // Exponential ease-out: heavy at the start, long glide at the
      // end. That glide is what reads as expensive rather than laggy.
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      wheelMultiplier: 0.9,
      touchMultiplier: 1.6,
    });

    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    let onPointer: ((e: PointerEvent) => void) | null = null;
    const finePointer = window.matchMedia("(pointer: fine)").matches;

    const ctx = gsap.context(() => {
      // ── 1. Entrance. One orchestrated sequence. ─────────────────
      const intro = gsap.timeline({
        defaults: { ease: "expo.out", duration: 1.4 },
        onComplete: () => {
          introDone = true;
          window.clearTimeout(watchdog);
        },
      });

      intro
        // The planet resolves out of black over two and a half
        // seconds. This is the one moment on the page; nothing else
        // competes with it.
        .to(".veil", { opacity: 1, duration: 2.5, ease: "power2.out" }, 0)
        .to(".earth-canvas", { yPercent: 0, duration: 2.6, ease: "power2.out" }, 0)
        .to(".monogram", { opacity: 1, y: 0, duration: 1 }, 0.1)
        .to(".meridian", { scaleY: 1, duration: 1.6 }, 0.3)
        .to("[data-anim='fade']", { opacity: 1, y: 0, stagger: 0.07, duration: 1.1 }, 0.6)
        .to(".tile", { opacity: 1, yPercent: 0, stagger: 0.08, duration: 1.2 }, 0.85)
        .to(".rail > *", { opacity: 1, y: 0, stagger: 0.05, duration: 0.9 }, 1.0);

      // ── 2. Hero drifts and dims as you leave it. ────────────────
      gsap.to(".hero-inner", {
        yPercent: -14,
        opacity: 0.25,
        ease: "none",
        scrollTrigger: { trigger: ".stage", start: "top top", end: "bottom top", scrub: true },
      });

      gsap.to(".earth-canvas", {
        yPercent: 9,
        ease: "none",
        scrollTrigger: { trigger: ".stage", start: "top top", end: "bottom top", scrub: true },
      });

      // ── 3. Manifesto arrives line by line. ──────────────────────
      gsap.to(".manifesto .line-inner", {
        yPercent: 0,
        stagger: 0.12,
        duration: 1.3,
        ease: "expo.out",
        scrollTrigger: { trigger: ".manifesto", start: "top 72%" },
      });

      // ── 4. Centrepiece: pin the case section, move it sideways. ─
      const track = document.querySelector<HTMLElement>(".case-track");

      if (track && window.innerWidth > 760) {
        const horizontal = gsap.to(track, {
          x: () => -(track.scrollWidth - window.innerWidth),
          ease: "none",
          scrollTrigger: {
            trigger: ".cases",
            pin: true,
            scrub: 1,
            // Scroll distance equals horizontal travel, so wheel and
            // sideways motion feel 1:1.
            end: () => "+=" + (track.scrollWidth - window.innerWidth),
            invalidateOnRefresh: true,
            anticipatePin: 1,
          },
        });

        gsap.utils.toArray<HTMLElement>(".case-panel").forEach((panel) => {
          /**
           * Each panel rises as it reaches the middle of the screen
           * and settles back as it leaves. Scrubbed against the
           * horizontal tween, not the page, so the peak lands
           * exactly when the panel is centred.
           *
           * This is what stops the run reading as one flat texture
           * sliding past: at any moment one panel is clearly the
           * subject and the others have receded.
           */
          const focus = gsap.timeline({
            scrollTrigger: {
              trigger: panel,
              containerAnimation: horizontal,
              start: "left right",
              end: "right left",
              scrub: true,
            },
          });

          focus
            .fromTo(
              panel,
              { scale: 0.9, opacity: 0.4, filter: "brightness(0.55)" },
              {
                scale: 1,
                opacity: 1,
                filter: "brightness(1)",
                ease: "power2.out",
                duration: 0.5,
              },
            )
            .to(panel, {
              scale: 0.9,
              opacity: 0.4,
              filter: "brightness(0.55)",
              ease: "power2.in",
              duration: 0.5,
            });

          // Art lags its frame. Cheap depth, large effect.
          const art = panel.querySelector(".case-art");
          if (art) {
            gsap.fromTo(
              art,
              { xPercent: -6 },
              {
                xPercent: 6,
                ease: "none",
                scrollTrigger: {
                  trigger: panel,
                  containerAnimation: horizontal,
                  start: "left right",
                  end: "right left",
                  scrub: true,
                },
              },
            );
          }

          // The copy inside travels a little further than its panel,
          // so text arrives after the frame it sits in.
          const copy = panel.querySelector(".case-body, .case-intro-inner");
          if (copy) {
            gsap.fromTo(
              copy,
              { y: 46 },
              {
                y: -46,
                ease: "none",
                scrollTrigger: {
                  trigger: panel,
                  containerAnimation: horizontal,
                  start: "left right",
                  end: "right left",
                  scrub: true,
                },
              },
            );
          }
        });
      }

      // ── 5. Timeline rule draws itself. ──────────────────────────
      gsap.fromTo(
        ".decade-rule span",
        { scaleX: 0 },
        {
          scaleX: 1,
          transformOrigin: "left",
          ease: "none",
          scrollTrigger: { trigger: ".decade", start: "top 80%", end: "bottom 60%", scrub: true },
        },
      );

      // ── 6. Everything marked [data-reveal] rises once. ──────────
      ScrollTrigger.batch("[data-reveal]", {
        start: "top 88%",
        onEnter: (batch) =>
          gsap.to(batch, {
            opacity: 1,
            y: 0,
            stagger: 0.09,
            duration: 1.1,
            ease: "expo.out",
            overwrite: true,
          }),
      });

      // ── 7. Bottom rail progress marker. ─────────────────────────
      gsap.to(".rail-dot", {
        left: "100%",
        xPercent: -100,
        ease: "none",
        scrollTrigger: { start: 0, end: "max", scrub: 0.3 },
      });

      // ── 8. Pointer perspective.
      //
      // This rotates the whole 3D stage rather than sliding layers.
      // Because .depth is preserve-3d and its children sit at
      // different translateZ, one rotation produces correct
      // foreshortening on every plane at once — the far veil barely
      // shifts, the near plate sweeps. Sliding layers at different
      // speeds approximates this; rotating the space *is* it.
      //
      // Angles stay under 2.5deg. Past that it stops reading as depth
      // and starts reading as a gimmick.
      const stage = document.querySelector(".depth");

      if (finePointer && stage && window.innerWidth > 1100) {
        const rotY = gsap.quickTo(stage, "rotationY", { duration: 1.3, ease: "power3.out" });
        const rotX = gsap.quickTo(stage, "rotationX", { duration: 1.3, ease: "power3.out" });

        onPointer = (event: PointerEvent) => {
          const x = event.clientX / window.innerWidth - 0.5;
          const y = event.clientY / window.innerHeight - 0.5;
          rotY(x * 2.4);
          rotX(y * -1.7);
        };

        window.addEventListener("pointermove", onPointer, { passive: true });
      }
    });

    // Fonts change text metrics, which moves every trigger position.
    document.fonts?.ready.then(() => ScrollTrigger.refresh());

    return () => {
      window.clearTimeout(watchdog);
      if (onPointer) window.removeEventListener("pointermove", onPointer);
      ctx.revert();
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);

  return null;
}
