/**
 * The hero backdrop, built as vector so it is resolution-independent —
 * razor sharp on a 5K display and on a phone, with no image request
 * and no second asset to ship.
 *
 * Three stacked passes make it read as material rather than as a
 * gradient:
 *
 *   1. MARBLE   — low-frequency fractal noise lit from upper right,
 *                 so the mass has form instead of being flat fog.
 *   2. SMOKE    — high-octave turbulence displacing soft plumes.
 *                 Octaves are what separate "cloud" from "mush".
 *   3. VEINS    — thin gold paths displaced by their own noise and
 *                 bloomed, so they sit *in* the stone, not on it.
 *
 * Filters render at device resolution, so this costs nothing in
 * sharpness. It is still a stand-in: set --hero-image in globals.css
 * when the real render exists and .hero-art paints over the top.
 */

function Defs() {
  return (
    <defs>
      {/* ── Marble body. Noise through a lighting filter gives the
             mass a lit surface with highlight and shadow. ───────── */}
      <filter id="marble" x="-25%" y="-25%" width="150%" height="150%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.0022 0.0055"
          numOctaves="7"
          seed="14"
          result="noise"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="noise"
          scale="220"
          xChannelSelector="R"
          yChannelSelector="G"
          result="mass"
        />
        <feGaussianBlur in="mass" stdDeviation="7" result="soft" />
        {/* Specular pass: the difference between "grey cloud" and
            "polished stone" is a highlight with a direction. */}
        <feSpecularLighting
          in="soft"
          surfaceScale="3.4"
          specularConstant="0.62"
          specularExponent="22"
          lightingColor="#fffaf0"
          result="spec"
        >
          <feDistantLight azimuth="235" elevation="58" />
        </feSpecularLighting>
        <feComposite in="spec" in2="soft" operator="in" result="specClipped" />
        <feComposite in="soft" in2="specClipped" operator="arithmetic" k1="0" k2="1" k3="0.85" k4="0" />
      </filter>

      {/* ── Smoke. Finer, faster noise and a longer displacement. ── */}
      <filter id="smoke" x="-30%" y="-30%" width="160%" height="160%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.0014 0.0042"
          numOctaves="6"
          seed="8"
          result="n"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="n"
          scale="240"
          xChannelSelector="R"
          yChannelSelector="G"
        />
        <feGaussianBlur stdDeviation="10" />
      </filter>

      {/* ── Wisps. Tighter noise for the fine tendrils that read as
             detail when you lean in. ──────────────────────────── */}
      <filter id="wisp" x="-30%" y="-30%" width="160%" height="160%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.006 0.014"
          numOctaves="5"
          seed="31"
          result="n"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="n"
          scale="90"
          xChannelSelector="R"
          yChannelSelector="B"
        />
        <feGaussianBlur stdDeviation="2.4" />
      </filter>

      {/* ── Gold veining, with bloom so the metal catches light. ─── */}
      <filter id="vein" x="-30%" y="-30%" width="160%" height="160%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.0035 0.011"
          numOctaves="6"
          seed="21"
          result="n"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="n"
          scale="150"
          xChannelSelector="R"
          yChannelSelector="B"
          result="warped"
        />
        <feGaussianBlur in="warped" stdDeviation="7" result="bloom" />
        <feMerge>
          <feMergeNode in="bloom" />
          <feMergeNode in="warped" />
        </feMerge>
      </filter>

      <radialGradient id="plume" cx="50%" cy="46%">
        <stop offset="0%" stopColor="#e6ded2" stopOpacity="0.82" />
        <stop offset="28%" stopColor="#b3aa9d" stopOpacity="0.52" />
        <stop offset="62%" stopColor="#4f4840" stopOpacity="0.26" />
        <stop offset="100%" stopColor="#0a0908" stopOpacity="0" />
      </radialGradient>

      <radialGradient id="stone" cx="62%" cy="36%">
        <stop offset="0%" stopColor="#f2ece1" stopOpacity="0.9" />
        <stop offset="34%" stopColor="#9c948a" stopOpacity="0.6" />
        <stop offset="70%" stopColor="#3a352f" stopOpacity="0.3" />
        <stop offset="100%" stopColor="#090807" stopOpacity="0" />
      </radialGradient>

      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#F2CE8E" />
        <stop offset="40%" stopColor="#C7963F" />
        <stop offset="100%" stopColor="#5C4119" />
      </linearGradient>
    </defs>
  );
}

export default function HeroVeil() {
  return (
    <>
      <div className="veil" aria-hidden="true">
        <svg preserveAspectRatio="xMidYMid slice" viewBox="0 0 1600 1000">
          <Defs />

          <rect width="1600" height="1000" fill="#070605" />

          {/* 1 — marble mass */}
          <g filter="url(#marble)" opacity="0.92">
            <ellipse cx="1000" cy="420" rx="420" ry="360" fill="url(#stone)" />
            <ellipse cx="860" cy="250" rx="280" ry="200" fill="url(#stone)" opacity="0.6" />
          </g>

          {/* 2 — smoke */}
          <g filter="url(#smoke)">
            <ellipse cx="1010" cy="400" rx="400" ry="330" fill="url(#plume)" />
            <ellipse cx="760" cy="215" rx="300" ry="185" fill="url(#plume)" opacity="0.55" />
            <ellipse cx="1180" cy="760" rx="360" ry="250" fill="url(#plume)" opacity="0.45" />
            <ellipse cx="900" cy="590" rx="320" ry="290" fill="url(#plume)" opacity="0.5" />
          </g>

          {/* 3 — gold veining */}
          <g filter="url(#vein)" opacity="0.72" fill="none" stroke="url(#gold)">
            <path d="M560 360 C 760 180, 1050 310, 1270 165" strokeWidth="2.6" />
            <path d="M600 530 C 840 460, 1090 575, 1350 490" strokeWidth="1.7" />
            <path d="M660 690 C 890 630, 1120 780, 1400 700" strokeWidth="2.2" />
            <path d="M760 850 C 950 780, 1160 890, 1420 810" strokeWidth="1.3" />
            <path d="M700 270 C 880 320, 980 430, 1150 380" strokeWidth="1" />
          </g>

          {/* 4 — fine wisps, the detail that rewards leaning in */}
          <g filter="url(#wisp)" opacity="0.34">
            <ellipse cx="1050" cy="330" rx="200" ry="150" fill="url(#plume)" />
            <ellipse cx="880" cy="640" rx="170" ry="140" fill="url(#plume)" />
          </g>
        </svg>

        <div className="hero-art" />
      </div>

      {/*
        Foreground tendrils. Same material, pushed in front of the
        wordmark in 3D space so smoke crosses the letterforms. This is
        the bit a template cannot produce, because it needs the art
        and the type to know about each other.
      */}
      <div className="veil-fore" aria-hidden="true">
        <svg preserveAspectRatio="xMidYMid slice" viewBox="0 0 1600 1000">
          <defs>
            <filter id="foreSmoke" x="-30%" y="-30%" width="160%" height="160%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.0019 0.005"
                numOctaves="6"
                seed="47"
                result="n"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="n"
                scale="260"
                xChannelSelector="R"
                yChannelSelector="G"
              />
              <feGaussianBlur stdDeviation="12" />
            </filter>

            <radialGradient id="forePlume" cx="50%" cy="50%">
              <stop offset="0%" stopColor="#ddd5c9" stopOpacity="0.55" />
              <stop offset="55%" stopColor="#6d665c" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#0a0908" stopOpacity="0" />
            </radialGradient>

            {/* Fades the layer out toward the left so it never sits on
                top of the smaller label type, only the display size. */}
            <linearGradient id="foreMaskGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#000" />
              <stop offset="34%" stopColor="#000" />
              <stop offset="62%" stopColor="#fff" />
              <stop offset="100%" stopColor="#fff" />
            </linearGradient>
            <mask id="foreMask">
              <rect width="1600" height="1000" fill="url(#foreMaskGrad)" />
            </mask>
          </defs>

          <g mask="url(#foreMask)" filter="url(#foreSmoke)">
            <ellipse cx="880" cy="430" rx="340" ry="230" fill="url(#forePlume)" />
            <ellipse cx="1120" cy="620" rx="300" ry="200" fill="url(#forePlume)" opacity="0.7" />
          </g>
        </svg>
      </div>
    </>
  );
}
