"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <div style={{ padding: "2rem", fontFamily: "sans-serif", maxWidth: "600px" }}>
          <h1>页面出错</h1>
          <pre style={{ overflow: "auto", background: "#f5f5f5", padding: "1rem", fontSize: "12px" }}>
            {error.message}
          </pre>
          {error.digest && <p style={{ color: "#666" }}>digest: {error.digest}</p>}
          <button
            type="button"
            onClick={() => reset()}
            style={{ marginTop: "1rem", padding: "0.5rem 1rem", cursor: "pointer" }}
          >
            重试
          </button>
        </div>
      </body>
    </html>
  );
}
