"use client";

/**
 * Root-level error boundary that catches errors thrown above the regular
 * <ErrorPage> in app/error.tsx (e.g. errors inside the root layout itself).
 * Renders its own <html>/<body> because the regular layout isn't available
 * here. Keep it lean — this is the absolute last line of UI defence.
 */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("ECCG global error:", error);
  }, [error]);
  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          padding: "4rem 1rem",
          maxWidth: 640,
          margin: "0 auto",
          textAlign: "center",
          background: "#fff",
          color: "#111",
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>
          The site is currently unreachable.
        </h1>
        <p style={{ marginTop: 12, fontSize: 14, color: "#666" }}>
          A core service failed before the page could render. Please retry —
          most often this is a transient deploy issue.
        </p>
        {error.digest && (
          <p style={{ marginTop: 12, fontSize: 12, color: "#888" }}>
            Reference id: <code>{error.digest}</code>
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: 24,
            padding: "8px 16px",
            borderRadius: 6,
            background: "#6366f1",
            color: "#fff",
            border: 0,
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          Retry
        </button>
      </body>
    </html>
  );
}
