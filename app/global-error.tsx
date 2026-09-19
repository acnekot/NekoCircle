"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="zh">
      <body style={{ margin: 0, background: "#0a0f1e", color: "white", fontFamily: "sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <div style={{ textAlign: "center" }}>
            <h1>应用加载失败</h1>
            <button
              onClick={reset}
              style={{ border: 0, borderRadius: 12, padding: "10px 20px", color: "white", background: "#1d9bf0", cursor: "pointer" }}
            >
              重新加载
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
