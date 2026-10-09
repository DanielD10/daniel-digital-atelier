import Link from "next/link";

/**
 * Fixed across the whole homepage. The dot is driven by GSAP in
 * SiteMotion rather than a scroll listener in React — no state
 * updates, no re-renders, runs on the compositor.
 */
export default function BottomRail() {
  return (
    <div className="rail">
      <svg className="star" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 1 L13.6 10.4 L23 12 L13.6 13.6 L12 23 L10.4 13.6 L1 12 L10.4 10.4 Z" />
      </svg>

      <span className="micro">A decade in the making.</span>

      <span className="rail-track" aria-hidden="true">
        <i className="rail-dot" />
      </span>

      <span className="micro rail-say">
        Let&rsquo;s build something unforgettable.
      </span>

      <Link className="cta" href="/contact">
        Start a project <span aria-hidden="true">&#8594;</span>
      </Link>
    </div>
  );
}
