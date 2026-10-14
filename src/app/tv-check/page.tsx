import type { Metadata } from "next";

/**
 * A bench, not a feature.
 *
 * The film plays embedded on a desktop and fails on a phone the
 * instant you press play, and every fix so far has been a guess
 * shipped blind because this end cannot reach YouTube to test
 * anything. So instead of guessing again: six players, the same
 * video, one variable changed at a time. Open it on the phone
 * that fails, press play on each, and whichever ones work say
 * exactly which parameter is responsible.
 *
 * Delete the route once the answer is known.
 */

const ID = "iOQisO0KAzM";

export const metadata: Metadata = {
  title: "TV check",
  robots: { index: false, follow: false },
};

type Variant = { n: number; label: string; note: string; src: string };

const VARIANTS: Variant[] = [
  {
    n: 1,
    label: "Plain youtube.com",
    note: "Nothing but the id. If this one fails, nothing we pass is the cause.",
    src: `https://www.youtube.com/embed/${ID}`,
  },
  {
    n: 2,
    label: "Plain nocookie",
    note: "Same, on the privacy domain. This is what the desktop uses.",
    src: `https://www.youtube-nocookie.com/embed/${ID}`,
  },
  {
    n: 3,
    label: "youtube.com + playsinline",
    note: "Keeps the video in the page instead of going fullscreen.",
    src: `https://www.youtube.com/embed/${ID}?playsinline=1`,
  },
  {
    n: 4,
    label: "youtube.com + jsapi",
    note: "Adds enablejsapi, which is what drives the room's transport buttons.",
    src: `https://www.youtube.com/embed/${ID}?playsinline=1&enablejsapi=1`,
  },
  {
    n: 5,
    label: "youtube.com + jsapi + origin",
    note: "Exactly what the room sends a phone right now.",
    src: `https://www.youtube.com/embed/${ID}?playsinline=1&enablejsapi=1&rel=0&modestbranding=1`,
  },
  {
    n: 6,
    label: "Small player (200px)",
    note: "Same as 3, laid out tiny — rules the size theory in or out.",
    src: `https://www.youtube.com/embed/${ID}?playsinline=1`,
  },
];

export default function TvCheck() {
  return (
    <main style={{ padding: "20px 14px 60px", maxWidth: 560, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, margin: "0 0 6px" }}>TV check</h1>
      <p style={{ fontSize: 14, lineHeight: 1.5, opacity: 0.8, margin: "0 0 4px" }}>
        Press play on each. Note which ones actually play and which show the
        error. Variant 5 is what the room sends your phone today.
      </p>
      <p style={{ fontSize: 14, lineHeight: 1.5, opacity: 0.8, margin: "0 0 22px" }}>
        Then run the whole page once more on wi-fi instead of cellular. If
        everything passes on wi-fi and fails on 5G, it is the carrier network
        and not the code.
      </p>

      {VARIANTS.map((v) => (
        <section key={v.n} style={{ margin: "0 0 26px" }}>
          <h2 style={{ fontSize: 15, margin: "0 0 2px" }}>
            {v.n}. {v.label}
          </h2>
          <p style={{ fontSize: 13, lineHeight: 1.45, opacity: 0.65, margin: "0 0 8px" }}>
            {v.note}
          </p>
          <iframe
            src={v.src}
            title={v.label}
            width={v.n === 6 ? 200 : undefined}
            height={v.n === 6 ? 113 : undefined}
            style={
              v.n === 6
                ? { width: 200, height: 113, border: 0, display: "block", background: "#000" }
                : { width: "100%", aspectRatio: "16 / 9", border: 0, display: "block", background: "#000" }
            }
            allow="encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </section>
      ))}

      <section style={{ margin: "0 0 26px" }}>
        <h2 style={{ fontSize: 15, margin: "0 0 8px" }}>7. Straight to YouTube</h2>
        <p style={{ fontSize: 13, lineHeight: 1.45, opacity: 0.65, margin: "0 0 8px" }}>
          Not embedded at all. If this one also fails on the same connection,
          the problem is the network or the video, not the embed.
        </p>
        <a
          href={`https://www.youtube.com/watch?v=${ID}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 15 }}
        >
          Open the film on YouTube
        </a>
      </section>
    </main>
  );
}
