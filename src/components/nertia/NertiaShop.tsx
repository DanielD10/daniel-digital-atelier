"use client";

/* eslint-disable @next/next/no-img-element -- plain <img> so the same
   component also runs in the standalone page bundle, outside Next. */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { finishes, type FinishId } from "@/lib/nertia";
import {
  catalog,
  finishMadeIn,
  fitsOf,
  priceLabel,
  shopCategories,
  shotFor,
  type Fit,
  type Product,
  type Shot,
  type ShopCategory,
} from "@/lib/nertia-shop";

type Props = { base?: string };
type FitFilter = "all" | Fit;

const swatch = (id: FinishId) => `linear-gradient(135deg, ${finishes[id].ramp.join(", ")})`;

/** the finishes a product comes in for a fit filter, in sheet order */
const finishesFor = (p: Product, fit: FitFilter) =>
  p.finishes.filter((f) => fit === "all" || finishMadeIn(f, fit));

/** which fit to show first: the filter, else men's if it's made in men's */
const fitFor = (p: Product, fit: FitFilter, finish: FinishId): Fit => {
  if (fit !== "all") return fit;
  const pf = p.finishes.find((x) => x.id === finish);
  return pf && finishMadeIn(pf, "M") ? "M" : "W";
};

export default function NertiaShop({ base = "/images/nertia/shop/" }: Props) {
  const [cat, setCat] = useState<ShopCategory | "all">("all");
  const [fit, setFit] = useState<FitFilter>("all");
  const [open, setOpen] = useState<Product | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const list = useMemo(
    () => catalog.filter((p) => (cat === "all" || p.cat === cat) && (fit === "all" || fitsOf(p).includes(fit))),
    [cat, fit],
  );
  const count = (c: ShopCategory | "all") =>
    catalog.filter((p) => (c === "all" || p.cat === c) && (fit === "all" || fitsOf(p).includes(fit))).length;

  const show = (p: Product) => {
    setOpen(p);
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  };

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const onClose = () => setOpen(null);
    d.addEventListener("close", onClose);
    // product sheets open a product here
    const onProduct = (e: Event) => {
      const p = catalog.find((x) => x.id === (e as CustomEvent<string>).detail);
      if (!p) return;
      setOpen(p);
      if (!d.open) d.showModal();
    };
    window.addEventListener("nertia:product", onProduct);
    return () => {
      d.removeEventListener("close", onClose);
      window.removeEventListener("nertia:product", onProduct);
    };
  }, []);

  return (
    <section className="nx-shop" aria-labelledby="nx-shop-title">
      <header className="nx-shop-head">
        <p className="micro">Shop · Drop 001</p>
        <h2 id="nx-shop-title">The Liquid Series.</h2>
        <p className="nx-shop-lede">
          Six styles and the women&rsquo;s line, every piece numbered and chipped. Open anything to see
          it in every finish, or try it on in AR.
        </p>
      </header>

      <div className="nx-shop-bar">
        <div className="nx-chips" role="group" aria-label="Category">
          {shopCategories.map((c) => (
            <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
              {c.label}
              <span>{count(c.id)}</span>
            </button>
          ))}
        </div>
        <div className="nx-fit" role="group" aria-label="Fit">
          {(["all", "M", "W"] as FitFilter[]).map((f) => (
            <button key={f} type="button" aria-pressed={fit === f} onClick={() => setFit(f)}>
              {f === "all" ? "All" : f === "M" ? "Men" : "Women"}
            </button>
          ))}
        </div>
      </div>

      <div className="nx-grid">
        {list.map((p) => (
          <Card key={p.id} p={p} fit={fit} base={base} onOpen={() => show(p)} />
        ))}
        {list.length === 0 ? <p className="nx-empty">Nothing in this category for that fit yet.</p> : null}
      </div>

      <dialog
        ref={dialogRef}
        className="nx-pdp"
        aria-label={open ? open.name : "Product"}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialogRef.current?.close();
        }}
      >
        {open ? (
          <Detail key={open.id} p={open} startFit={fit} base={base} onClose={() => dialogRef.current?.close()} />
        ) : null}
      </dialog>
    </section>
  );
}

/* ───────────────────── card ───────────────────── */

function Card({ p, fit, base, onOpen }: { p: Product; fit: FitFilter; base: string; onOpen: () => void }) {
  const fins = finishesFor(p, fit);
  const [active, setActive] = useState<FinishId>(fins[0]?.id ?? p.finishes[0].id);
  // a fit filter can remove the finish being shown
  const cur = fins.some((f) => f.id === active) ? active : (fins[0]?.id ?? p.finishes[0].id);
  const shownFit = fitFor(p, fit, cur);
  const { shot } = shotFor(p, cur, shownFit);
  const fits = fitsOf(p);

  return (
    <article className="nx-card">
      <button type="button" className="nx-card-hit" onClick={onOpen} aria-label={`${p.name}, ${finishes[cur].name}`}>
        <span
          className={`nx-card-img${shot.contain ? " is-contain" : ""}${shot.h / shot.w > 1.9 ? " is-tall" : ""}`}
          // wide product shots zoom in until the product fills the card
          style={shot.contain ? ({ "--z": Math.max(1, Math.min(1.55, (shot.w / shot.h) * 0.47)) } as CSSProperties) : undefined}
        >
          <img src={`${base}${shot.src}.webp`} alt="" width={shot.w} height={shot.h} loading="lazy" decoding="async" />
          {p.badge ? <span className="nx-badge">{p.badge}</span> : null}
          <span className="nx-card-cta" aria-hidden="true">
            View
          </span>
        </span>
      </button>
      <div className="nx-card-body">
        <div className="nx-card-sw" role="group" aria-label={`${p.name} finishes`}>
          {fins.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={cur === f.id}
              aria-label={finishes[f.id].name}
              title={finishes[f.id].name}
              style={{ background: swatch(f.id) }}
              onMouseEnter={() => setActive(f.id)}
              onFocus={() => setActive(f.id)}
              onClick={() => setActive(f.id)}
            />
          ))}
        </div>
        <h3 className="nx-card-name">
          <button type="button" onClick={onOpen}>
            {p.name}
          </button>
        </h3>
        <p className="nx-card-meta">
          {finishes[cur].name} ·{" "}
          {p.unisex ? "Unisex" : fits.length === 2 ? "Men's + Women's" : fits[0] === "W" ? "Women's" : "Men's"}
        </p>
        <p className="nx-card-price">{priceLabel(p)}</p>
      </div>
    </article>
  );
}

/* ───────────────────── product detail ───────────────────── */

function Detail({ p, startFit, base, onClose }: { p: Product; startFit: FitFilter; base: string; onClose: () => void }) {
  const fits = fitsOf(p);
  const [fit, setFit] = useState<Fit>(startFit !== "all" && fits.includes(startFit) ? startFit : fits[0]);
  const fins = p.finishes.filter((f) => finishMadeIn(f, fit));
  const [finish, setFinish] = useState<FinishId>(fins[0].id);
  const cur = fins.some((f) => f.id === finish) ? finish : fins[0].id;
  /** -1 = the finish shot; otherwise a detail index */
  const [view, setView] = useState(-1);

  const main = shotFor(p, cur, fit);
  const shown: Shot = view >= 0 ? p.details[view].shot : main.shot;
  const sizes = p.sizes?.[fit];

  const tryOn = () => {
    onClose();
    window.dispatchEvent(new CustomEvent("nertia:tap", { detail: { product: p.id, finish: cur, fit } }));
  };
  const openSheet = () => {
    onClose();
    window.dispatchEvent(new CustomEvent("nertia:sheet", { detail: p.sheet }));
  };

  return (
    <div className="nx-pdp-inner">
      <button type="button" className="nx-pdp-close" onClick={onClose} aria-label="Close">
        &#10005;
      </button>

      <div className="nx-pdp-gallery">
        <div className={`nx-pdp-main${shown.contain ? " is-contain" : ""}`}>
          <img src={`${base}${shown.src}.webp`} alt={`${p.name} in ${finishes[cur].name}`} width={shown.w} height={shown.h} />
          {view < 0 && main.shownIn ? (
            <span className="nx-pdp-note">Not photographed yet · shown in {finishes[main.shownIn].name}</span>
          ) : null}
          {view >= 0 ? <span className="nx-pdp-note">{p.details[view].label}</span> : null}
        </div>
        <div className="nx-pdp-thumbs" role="group" aria-label="Images">
          {fins
            .filter((f) => f[fit])
            .map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={view < 0 && cur === f.id}
                onClick={() => {
                  setFinish(f.id);
                  setView(-1);
                }}
                aria-label={finishes[f.id].name}
              >
                <img src={`${base}${f[fit]!.src}.webp`} alt="" loading="lazy" />
              </button>
            ))}
          {p.details.map((d, i) => (
            <button key={d.shot.src} type="button" aria-pressed={view === i} onClick={() => setView(i)} aria-label={d.label}>
              <img src={`${base}${d.shot.src}.webp`} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      </div>

      <div className="nx-pdp-info">
        <p className="micro">
          Drop 001 · Liquid Series{p.badge ? ` · ${p.badge}` : ""}
        </p>
        <h3 className="nx-pdp-name">{p.name}</h3>
        <p className="nx-pdp-price">
          {priceLabel(p)}
          {p.price !== null ? <span> USD</span> : null}
        </p>
        <p className="nx-pdp-tag">{p.tagline}</p>

        <div className="nx-pdp-opt">
          <p className="nx-pdp-label">
            Finish <b>{finishes[cur].name}</b>
            {finishes[cur].note ? <em> · {finishes[cur].note}</em> : null}
          </p>
          <div className="nx-pdp-sw" role="group" aria-label="Finish">
            {fins.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={cur === f.id}
                aria-label={finishes[f.id].name}
                title={finishes[f.id].name}
                style={{ background: swatch(f.id) }}
                onClick={() => {
                  setFinish(f.id);
                  setView(-1);
                }}
              />
            ))}
          </div>
        </div>

        {fits.length > 1 && !p.unisex ? (
          <div className="nx-pdp-opt">
            <p className="nx-pdp-label">Fit</p>
            <div className="nx-fit" role="group" aria-label="Fit">
              {fits.map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={fit === f}
                  onClick={() => {
                    setFit(f);
                    setView(-1);
                  }}
                >
                  {f === "M" ? "Men's" : "Women's"}
                </button>
              ))}
            </div>
            {p.fitNote?.[fit] ? <p className="nx-pdp-small">{p.fitNote[fit]}</p> : null}
          </div>
        ) : null}

        <div className="nx-pdp-opt">
          <p className="nx-pdp-label">{p.sizeNote && sizes ? p.sizeNote : "Sizes"}</p>
          {sizes ? (
            <ul className="nx-sizes" aria-label="Size run">
              {sizes.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : (
            <p className="nx-pdp-small">{p.sizeNote ?? "Size run confirmed at presale"}</p>
          )}
        </div>

        <div className="nx-pdp-cta">
          {p.ar ? (
            <button type="button" className="nx-btn is-primary" onClick={tryOn}>
              See it in AR <span aria-hidden="true">&#8594;</span>
            </button>
          ) : null}
          <button type="button" className="nx-btn" onClick={openSheet}>
            Product sheet
          </button>
        </div>

        <ul className="nx-feat">
          {p.features.map(([a, b]) => (
            <li key={a}>
              <b>{a}</b>
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <p className="nx-pdp-foot">
          {p.run ? `${p.run} numbered units in Drop 001. ` : ""}Every piece carries its own NFC chip and AR
          effect. Presale only · 50-wash guarantee · free repair or replace.
        </p>
      </div>
    </div>
  );
}
