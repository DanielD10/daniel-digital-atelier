"use client";

import { useEffect } from "react";

/**
 * Last line of defence. Fires when the root layout itself throws,
 * which means fonts and globals.css may not have loaded — so this
 * file ships its own <html>, <body> and inline styles. It must not
 * depend on anything else in the app.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error]", error.digest, error.message);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeContent: "center",
          textAlign: "center",
          gap: "20px",
          padding: "24px",
          background: "#070605",
          color: "#efeae1",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
          fontWeight: 300,
        }}
      >
        <h1 style={{ fontSize: "28px", fontWeight: 400, margin: 0 }}>
          The site failed to load
        </h1>
        <p style={{ color: "#a39b8e", margin: 0, fontSize: "15px" }}>
          Something went wrong at the root. Reloading usually fixes it.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            justifySelf: "center",
            marginTop: "12px",
            padding: "14px 30px",
            borderRadius: "999px",
            border: "1px solid #6b655d",
            background: "none",
            color: "#e7e2d9",
            fontSize: "11px",
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
