# Daniel Duran — Digital Atelier

Portfolio for Daniel Duran. Next.js 16 (App Router) + TypeScript, deployed on Vercel.

**Live:** https://daniel-digital-atelier.vercel.app

---

## Running it locally

Requires Node 20.9 or later (Next.js 16 will not build on Node 18).

```bash
npm install
npm run dev          # http://localhost:3000
```

Before pushing anything significant:

```bash
npm run build        # must pass — the dev server hides prod-only failures
npm run lint         # ESLint (Next 16 flat config)
npm run typecheck    # tsc, no emit
```

## Deploying

The `main` branch is connected to Vercel. Every push builds and deploys:

```bash
git add .
git commit -m "Describe the change"
git push
```

---

## How it's put together

```
src/
├── app/
│   ├── page.tsx              Homepage — hero, manifesto, cases, decade, closer
│   ├── layout.tsx            Fonts, metadata, the no-flash inline script
│   ├── globals.css           Every design token and every rule
│   ├── error.tsx             Route-level error boundary
│   ├── global-error.tsx      Root boundary — ships its own <html>
│   ├── not-found.tsx         404
│   ├── robots.ts             Blocks crawlers on preview, allows production
│   ├── sitemap.ts            Generated from lib/projects.ts
│   ├── opengraph-image.tsx   Social share card, generated at build
│   ├── icon.tsx              Favicon, generated at build
│   ├── work/nertia/page.tsx  NERTIA case study: the AR prototype, shop and sheets
│   ├── work/[slug]/page.tsx  The other case studies
│   ├── lab/page.tsx          The studio in 3D
│   ├── api/contact/route.ts  Enquiry endpoint
│   ├── api/library/route.ts  Book search for the Lab's shelf (Gutenberg + Open Library)
│   └── api/health/route.ts   Uptime + which commit is live
├── components/
│   ├── SiteMotion.tsx        All scroll and entrance animation
│   ├── CaseTrack.tsx         The pinned horizontal case run
│   ├── EarthGlobe.tsx        The WebGL globe behind the hero
│   ├── AtelierRoom3D.tsx     The Lab: three.js room, CSS3D screens
│   ├── nertia/               NERTIA prototype
│   │   ├── NertiaAR.tsx      Stage, units, certificate, camera mode
│   │   ├── effects.ts        Every AR effect (particles + shader passes)
│   │   ├── glfield.ts        WebGL fire and fog shaders
│   │   ├── runner.ts         The procedural demo runner
│   │   ├── tracker.ts        MediaPipe pose → effect emitters
│   │   ├── NertiaShop.tsx    Storefront and product panel
│   │   └── NertiaLookbook.tsx Product sheets with hotspots
│   └── ...
├── lib/
│   ├── projects.ts           Single source of truth for the work
│   ├── nertia.ts             NERTIA finishes, units, levels, sheets
│   ├── nertia-shop.ts        NERTIA catalog (from the product sheets)
│   ├── contact-schema.ts     Validation shared by client and server
│   ├── rate-limit.ts         Fixed-window limiter
│   └── site.ts               Name, description, canonical URL resolution
└── proxy.ts                  Middleware (renamed in Next.js 16)
```

### Motion

`SiteMotion.tsx` owns everything. Two things in there are load-bearing:

**Lenis and ScrollTrigger must be wired together.** Lenis takes over scrolling
with its own RAF loop while ScrollTrigger keeps reading native scroll position.
Without the three lines that connect them, triggers fire in the wrong place and
nothing tells you why.

**Start states are set in JS, not CSS.** `globals.css` hides animated elements
under `html.js` to prevent a flash. That makes `gsap.from()` useless — it treats
the current computed style as the end state, so it animates 0 → 0. Everything
here uses `gsap.set()` then `.to()`.

An inline script in `layout.tsx` adds `html.js` before first paint and strips it
after 2.5 seconds. If GSAP fails to load, the page becomes a readable static
document instead of a blank screen.

All motion is skipped entirely under `prefers-reduced-motion`.

### Contact form

`POST /api/contact` validates, rate-limits (5/min per IP), and checks a honeypot
field. Delivery goes through Resend's REST API over plain `fetch` — no SDK.

Without `RESEND_API_KEY` it runs in log-only mode: validates, logs to the Vercel
function log, returns success. The form stays testable and a missing env var
never shows a visitor an error. `GET /api/health` reports which mode is active.

The in-memory rate limiter is per serverless instance, so the real ceiling is
higher than 5/min across cold starts. Enough for a portfolio. Move it to Upstash
Redis if it's ever abused.

## Environment variables

Copy `.env.example` to `.env.local` for local work; set the same keys in
Vercel → Settings → Environment Variables for production.

| Key | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | production | Canonical origin for metadata, sitemap, robots |
| `RESEND_API_KEY` | no | Turns on contact email delivery |
| `CONTACT_FROM_EMAIL` | with Resend | Must be on a domain verified in Resend |
| `CONTACT_TO_EMAIL` | no | Where enquiries land |

## Still to add

- `public/images/projects/*.webp` — replace the `.art-*` gradient stand-ins for LUXE, NEXUS and ALTURA
- Real case studies for LUXE, NEXUS and ALTURA on `/work/[slug]` (NERTIA's is done)
