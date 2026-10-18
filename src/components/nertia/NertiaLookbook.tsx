"use client";

/* eslint-disable @next/next/no-img-element -- plain <img> so the same
   component also runs in the standalone page bundle, outside Next. */

import { useCallback, useEffect, useRef, useState } from "react";
import { lookbook, type Sheet, type Spot } from "@/lib/nertia";

type Props = {
  /** where the sheet images are served from */
  base?: string;
};

/**
 * Every Drop 001 product sheet in one rail. Each sheet opens full size
 * (they're dense with detail), and every figure on a sheet is a button:
 * into the AR prototype, or into the shop for pieces without AR.
 */
export default function NertiaLookbook({ base = "/images/nertia/" }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<number | null>(null);

  const show = useCallback((i: number) => {
    setOpen(i);
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);
  const close = useCallback(() => {
    dialogRef.current?.close();
  }, []);
  const step = useCallback((k: number) => {
    setOpen((i) => (i === null ? i : (i + k + lookbook.length) % lookbook.length));
  }, []);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const onClose = () => setOpen(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    d.addEventListener("close", onClose);
    d.addEventListener("keydown", onKey);
    return () => {
      d.removeEventListener("close", onClose);
      d.removeEventListener("keydown", onKey);
    };
  }, [step]);

  // the shop's "Product sheet" button lands here
  useEffect(() => {
    const onSheet = (e: Event) => {
      const i = lookbook.findIndex((s) => s.id === (e as CustomEvent<string>).detail);
      if (i >= 0) show(i);
    };
    window.addEventListener("nertia:sheet", onSheet);
    return () => window.removeEventListener("nertia:sheet", onSheet);
  }, [show]);

  const go = (sp: Spot) => {
    close();
    if (sp.product) window.dispatchEvent(new CustomEvent("nertia:product", { detail: sp.product }));
    else window.dispatchEvent(new CustomEvent("nertia:tap", { detail: sp.unit ?? sp.try }));
  };
  const shopIt = (s: Sheet) => {
    if (!s.product) return;
    close();
    window.dispatchEvent(new CustomEvent("nertia:product", { detail: s.product }));
  };

  const scrollRail = (k: number) => {
    const r = railRef.current;
    if (r) r.scrollBy({ left: k * r.clientWidth * 0.8, behavior: "smooth" });
  };

  /** every figure on a sheet is a button */
  const spots = (list: Spot[] | undefined) =>
    list?.map((sp, i) => (
      <button
        key={i}
        type="button"
        className="nx-spot"
        style={{ left: `${sp.x}%`, top: `${sp.y}%`, width: `${sp.w}%`, height: `${sp.h}%` }}
        onClick={() => go(sp)}
        aria-label={`${sp.label}: ${sp.product ? "open in the shop" : "see it in AR"}`}
      >
        <span className="nx-spot-mark" aria-hidden="true" />
        <span className="nx-spot-label">{sp.label}</span>
      </button>
    ));

  const cur = open === null ? null : lookbook[open];

  return (
    <section className="nx-look" aria-labelledby="nx-look-title">
      <header className="nx-look-head">
        <p className="micro">Product sheets · {lookbook.length}</p>
        <h2 id="nx-look-title">What the chips are sewn into.</h2>
        <div className="nx-look-side">
          <p className="nx-look-lede">
            Tap any garment to see it in AR, or open a sheet to read it full size.
          </p>
          <div className="nx-rail-nav">
            <button type="button" onClick={() => scrollRail(-1)} aria-label="Previous sheets">
              &#8592;
            </button>
            <button type="button" onClick={() => scrollRail(1)} aria-label="Next sheets">
              &#8594;
            </button>
          </div>
        </div>
      </header>

      <div className="nx-rail" ref={railRef}>
        {lookbook.map((s, i) => (
          <figure key={s.id} className={`nx-sheet is-${s.id}`}>
            <div className="nx-sheet-media">
              <button type="button" className="nx-sheet-img" onClick={() => show(i)} aria-label={`Open ${s.title} full size`}>
                <img src={base + s.file} alt={s.alt} width={1254} height={1254} loading="lazy" decoding="async" />
              </button>
              {spots(s.spots)}
              <button type="button" className="nx-sheet-zoom" onClick={() => show(i)} aria-label={`Open ${s.title} full size`}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="10.5" cy="10.5" r="6" />
                  <path d="M15 15l5 5M10.5 8v5M8 10.5h5" />
                </svg>
              </button>
            </div>
            <figcaption>
              <span className="nx-sheet-title">{s.title}</span>
              <span className="nx-sheet-kind">{s.kind}</span>
              <span className="nx-sheet-cap">{s.caption}</span>
              {s.product ? (
                <button type="button" className="nx-sheet-try" onClick={() => shopIt(s)}>
                  Shop it <span aria-hidden="true">&#8594;</span>
                </button>
              ) : null}
            </figcaption>
          </figure>
        ))}
      </div>

      <dialog
        ref={dialogRef}
        className="nx-lightbox"
        aria-label={cur ? cur.title : "Product sheet"}
        onClick={(e) => {
          // a click on the backdrop (the dialog itself) closes it
          if (e.target === e.currentTarget) close();
        }}
      >
        {cur ? (
          <div className="nx-lightbox-inner">
            <div className="nx-lightbox-media">
              <img src={base + cur.file} alt={cur.alt} width={1254} height={1254} />
              {spots(cur.spots)}
            </div>
            <div className="nx-lightbox-bar">
              <span>
                <b>{cur.title}</b> · {cur.kind}
              </span>
              <span className="nx-lightbox-tools">
                {cur.product ? (
                  <button type="button" onClick={() => shopIt(cur)}>
                    Shop it
                  </button>
                ) : null}
                <button type="button" onClick={() => step(-1)} aria-label="Previous sheet">
                  &#8592;
                </button>
                <button type="button" onClick={() => step(1)} aria-label="Next sheet">
                  &#8594;
                </button>
                <button type="button" onClick={close} aria-label="Close">
                  &#10005;
                </button>
              </span>
            </div>
          </div>
        ) : null}
      </dialog>
    </section>
  );
}
