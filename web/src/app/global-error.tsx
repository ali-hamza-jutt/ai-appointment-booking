"use client";

export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          alignItems: "center",
          background: "var(--bw-canvas, Canvas)",
          color: "var(--bw-ink, CanvasText)",
          display: "flex",
          fontFamily: "var(--font-inter, system-ui, sans-serif)",
          justifyContent: "center",
          margin: 0,
          minHeight: "100vh",
          padding: "24px",
        }}
      >
        <title>Something went wrong | BookWise AI</title>
        <main style={{ maxWidth: "420px", textAlign: "center" }}>
          <p
            style={{
              color: "var(--bw-brand, LinkText)",
              fontSize: "14px",
              fontWeight: 700,
              margin: "0 0 12px",
            }}
          >
            BookWise AI
          </p>
          <h1 style={{ fontSize: "24px", margin: "0 0 10px" }}>
            Something went wrong
          </h1>
          <p
            style={{
              color: "var(--bw-muted, GrayText)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            The application could not be loaded. Please try again.
          </p>
          <button
            onClick={retry}
            style={{
              background: "var(--bw-brand, LinkText)",
              border: 0,
              borderRadius: "10px",
              color: "var(--bw-surface, Canvas)",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 700,
              marginTop: "20px",
              minHeight: "42px",
              padding: "10px 18px",
            }}
            type="button"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
