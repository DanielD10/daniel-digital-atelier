"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Catches render errors in any route below the root layout. The
 * layout itself still renders, so the masthead and fonts survive.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Vercel captures this in the function logs. The digest is what
    // ties a visitor's report to a specific log line.
    console.error("[route error]", error.digest, error.message);
  }, [error]);

  return (
    <div className="msg-screen">
      <h1>Something broke on this page</h1>
      <p>
        Not your fault. Try again — if it keeps happening, the home page is
        still fine.
      </p>
      <div className="msg-actions">
        <button className="cta" type="button" onClick={reset}>
          Try again
        </button>
        <Link className="cta" href="/">
          Go home
        </Link>
      </div>
      {error.digest ? (
        <p className="micro" style={{ marginTop: "28px" }}>
          Reference {error.digest}
        </p>
      ) : null}
    </div>
  );
}
