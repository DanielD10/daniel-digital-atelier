"use client";

/* eslint-disable @next/next/no-img-element -- plain <img> so the same
   component also runs in the standalone page bundle, outside Next. */

import { useCallback, useEffect, useRef, useState } from "react";
import { lookbook, type Sheet } from "@/lib/nertia";

type Props = {
  /** where the sheet images are served from */
  base?: string;
};

/**
 * The real product, next to the prototype. Each sheet opens full size
 * (they're dense with detail), and sheets tied to a unit can jump the
 * prototype straight to it.
 */
export default function NertiaLookbook({ base = "/images/nertia/" }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<number | null>(null);

  const show = (i: number) => {
    setOpen(i);
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  };
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

  const tryOn = (s: Sheet) => {
    if (!s.unit) return;
    close();
    window.dispatchEvent(new CustomEvent("nertia:tap", { detail: s.unit }));
  };

  const cur = open === null ? null : lookbook[open];

  return (
    <section className="nx-look" aria-labelledby="nx-look-title">
      <header className="nx-look-head">
        <p className="micro">The line</p>
        <h2 id="nx-look-title">What the chips are sewn into.</h2>
        <p className="nx-look-lede">
          Drop 001 product sheets. Open any sheet to read it full size; the
          singlets jump straight to their unit in the prototype above.
        </p>
      </header>

      <div className="nx-look-grid">
        {lookbook.map((s, i) => (
          <figure key={s.id} className={`nx-sheet is-${s.id}`}>
            <button type="button" className="nx-sheet-img" onClick={() => show(i)} aria-label={`Open ${s.title} full size`}>
              <img src={base + s.file} alt={s.alt} width={1254} height={1254} loading="lazy" decoding="async" />
              <span className="nx-sheet-zoom" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <circle cx="10.5" cy="10.5" r="6" />
                  <path d="M15 15l5 5M10.5 8v5M8 10.5h5" />
                </svg>
              </span>
            </button>
            <figcaption>
              <span className="nx-sheet-title">{s.title}</span>
              <span className="nx-sheet-kind">{s.kind}</span>
              <span className="nx-sheet-cap">{s.caption}</span>
              {s.unit ? (
                <button type="button" className="nx-sheet-try" onClick={() => tryOn(s)}>
                  See it in AR <span aria-hidden="true">&#8594;</span>
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
            <img src={base + cur.file} alt={cur.alt} width={1254} height={1254} />
            <div className="nx-lightbox-bar">
              <span>
                <b>{cur.title}</b> · {cur.kind}
              </span>
              <span className="nx-lightbox-tools">
                {cur.unit ? (
                  <button type="button" onClick={() => tryOn(cur)}>
                    See it in AR
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
