/**
 * Atmospheric backdrop. Pure SVG — no image request, no 3D, no
 * WebGL context. Renders as a server component with zero JS cost.
 *
 * This is a stand-in. When /images/hero/hero-sculpture.webp exists,
 * set --hero-image in globals.css and the .hero-art layer paints
 * over this.
 */
export default function HeroVeil() {
  return (
    <div className="veil" aria-hidden="true">
      <svg preserveAspectRatio="xMidYMid slice" viewBox="0 0 1200 800">
        <defs>
          <filter id="smoke" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.0016 0.004"
              numOctaves="5"
              seed="8"
              result="n"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="n"
              scale="190"
              xChannelSelector="R"
              yChannelSelector="G"
            />
            <feGaussianBlur stdDeviation="9" />
          </filter>

          <filter id="vein" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.004 0.012"
              numOctaves="4"
              seed="21"
              result="n"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="n"
              scale="120"
              xChannelSelector="R"
              yChannelSelector="B"
            />
            <feGaussianBlur stdDeviation="2.2" />
          </filter>

          <radialGradient id="plume" cx="50%" cy="50%">
            <stop offset="0%" stopColor="#cfc7bb" stopOpacity="0.72" />
            <stop offset="45%" stopColor="#5d564d" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#0a0908" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#E2B268" />
            <stop offset="55%" stopColor="#B6873F" />
            <stop offset="100%" stopColor="#5C4119" />
          </linearGradient>
        </defs>

        <rect width="1200" height="800" fill="#070605" />

        <g filter="url(#smoke)">
          <ellipse cx="760" cy="330" rx="330" ry="270" fill="url(#plume)" />
          <ellipse cx="560" cy="180" rx="240" ry="150" fill="url(#plume)" opacity="0.55" />
          <ellipse cx="900" cy="600" rx="300" ry="200" fill="url(#plume)" opacity="0.45" />
        </g>

        <g filter="url(#vein)" opacity="0.62" fill="none" stroke="url(#gold)">
          <path d="M430 300 C 600 150, 820 260, 980 140" strokeWidth="2.4" />
          <path d="M470 430 C 660 380, 840 470, 1040 400" strokeWidth="1.6" />
          <path d="M520 560 C 700 520, 880 640, 1080 570" strokeWidth="2" />
          <path d="M600 690 C 760 640, 900 730, 1120 660" strokeWidth="1.2" />
        </g>

        <g filter="url(#smoke)" opacity="0.5">
          <ellipse cx="680" cy="470" rx="260" ry="230" fill="url(#plume)" />
        </g>
      </svg>

      <div className="hero-art" />
    </div>
  );
}
