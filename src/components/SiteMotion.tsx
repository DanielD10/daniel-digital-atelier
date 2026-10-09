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
    gsap.set(".wordmark .line-inner", { yPercent: 118 });
    gsap.set(".manifesto .line-inner", { yPercent: 110 });
    gsap.set("[data-anim='fade']", { opacity: 0, y: 16 });
    gsap.set("[data-reveal]", { opacity: 0, y: 28 });
    gsap.set(".tile", { opacity: 0, yPercent: 22 });
    gsap.set(".rail > *", { opacity: 0, y: 10 });
    gsap.set(".veil", { opacity: 0, scale: 1.08 });
    gsap.set(".meridian", { scaleY: 0, transformOrigin: "top" });
    gsap.set(".monogram", { opacity: 0, y: -14 });

    root.classList.remove("js");

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
      const intro = gsap.timeline({ defaults: { ease: "expo.out", duration: 1.4 } });

      intro
        .to(".veil", { opacity: 1, scale: 1, duration: 2.2, ease: "power2.out" }, 0)
        .to(".monogram", { opacity: 1, y: 0, duration: 1 }, 0.1)
        .to(".wordmark .line-inner", { yPercent: 0, stagger: 0.09, duration: 1.5 }, 0.25)
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

      gsap.to(".veil", {
        yPercent: 10,
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

        // Art lags its frame. Cheap depth, large effect.
        gsap.utils.toArray<HTMLElement>(".case-panel").forEach((panel) => {
          const art = panel.querySelector(".case-art");
          if (!art) return;

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

      // ── 8. Pointer parallax on the hero. A few pixels only. ─────
      if (finePointer) {
        const veil = gsap.quickTo(".veil", "x", { duration: 1.2, ease: "power3.out" });
        const veilY = gsap.quickTo(".veil", "y", { duration: 1.2, ease: "power3.out" });
        const mark = gsap.quickTo(".wordmark", "x", { duration: 1.4, ease: "power3.out" });

        onPointer = (event: PointerEvent) => {
          const x = event.clientX / window.innerWidth - 0.5;
          const y = event.clientY / window.innerHeight - 0.5;
          veil(x * -26);
          veilY(y * -18);
          mark(x * 9);
        };

        window.addEventListener("pointermove", onPointer, { passive: true });
      }
    });

    // Fonts change text metrics, which moves every trigger position.
    document.fonts?.ready.then(() => ScrollTrigger.refresh());

    return () => {
      if (onPointer) window.removeEventListener("pointermove", onPointer);
      ctx.revert();
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);

  return null;
}
