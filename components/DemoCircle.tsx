"use client";
import { useRef, useEffect } from "react";

// 22 mock users for the demo
const MOCK_USERS = [
  { init: "A", color: "#1d9bf0" }, { init: "B", color: "#7b6cf6" },
  { init: "C", color: "#f59e0b" }, { init: "D", color: "#10b981" },
  { init: "E", color: "#ef4444" }, { init: "F", color: "#ec4899" },
  { init: "G", color: "#06b6d4" }, { init: "H", color: "#84cc16" },
  { init: "J", color: "#f97316" }, { init: "K", color: "#a855f7" },
  { init: "L", color: "#14b8a6" }, { init: "M", color: "#eab308" },
  { init: "N", color: "#3b82f6" }, { init: "P", color: "#d946ef" },
  { init: "R", color: "#22c55e" }, { init: "S", color: "#fb923c" },
  { init: "T", color: "#818cf8" }, { init: "V", color: "#2dd4bf" },
  { init: "W", color: "#facc15" }, { init: "Y", color: "#f87171" },
  { init: "Z", color: "#c084fc" }, { init: "X", color: "#38bdf8" },
];

const SIZE      = 460;
const ACCENT    = "#b2b2b4";
const SHOW_TEXT = 3500;
const FADE_IN   = 900;
const SHOW_AVT  = 4500;
const FADE_OUT  = 900;
const CYCLE     = SHOW_TEXT + FADE_IN + SHOW_AVT + FADE_OUT;

/** Same algorithm as CircleChart.computeRings */
function computeRings(total: number, centerOuter: number, sc: number) {
  const AVATAR_R = [42, 35, 28, 22];
  const BORDER_W = [3.5, 3.0, 2.5, 2.0];
  const RING_GAP = 3 * sc;
  const rings: { R: number; r: number; bw: number; n: number; offset: number }[] = [];
  let innerEdge = centerOuter;
  let remaining = total;
  let offset = 0;
  for (let tier = 0; tier < AVATAR_R.length && remaining > 0; tier++) {
    const r  = AVATAR_R[tier] * sc;
    const bw = BORDER_W[tier] * sc;
    const nodeR = r + bw;
    const R = innerEdge + nodeR + RING_GAP;
    const maxN = Math.max(1, Math.floor(Math.PI / Math.asin(Math.min(0.999, nodeR / R))));
    const n    = Math.min(maxN, remaining);
    rings.push({ R, r, bw, n, offset });
    innerEdge  = R + nodeR + RING_GAP;
    remaining -= n;
    offset    += n;
  }
  return rings;
}

/** Same as CircleChart.drawCircleAvatar (no-image path) */
function drawAvatar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number,
  color: string, init: string,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  g.addColorStop(0, color + "dd");
  g.addColorStop(1, color + "66");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.floor(r * 0.55)}px system-ui,sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(init, x, y);
  ctx.restore();
}

export default function DemoCircle() {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const avatarRef     = useRef<HTMLImageElement | null>(null);
  const rafRef        = useRef<number>(0);
  const startRef      = useRef<number>(0);
  const showingAvatar = useRef(false);

  useEffect(() => {
    // Load real avatar via Twitter API proxy
    fetch("/api/demo-avatar")
      .then(r => r.json())
      .then(({ url }) => {
        if (!url) return;
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = `/api/avatar?url=${encodeURIComponent(url)}`;
        img.onload = () => { avatarRef.current = img; };
      })
      .catch(() => {});

    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = SIZE * dpr;
    canvas.height = SIZE * dpr;
    canvas.style.width  = `${SIZE}px`;
    canvas.style.height = `${SIZE}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const cx = SIZE / 2, cy = SIZE / 2;
    const sc = SIZE / 700;

    const centerR  = 60 * sc;
    const centerBW = 4 * sc;
    const centerOuter = centerR + centerBW;
    const rings = computeRings(MOCK_USERS.length, centerOuter, sc);

    // ── Offscreen: static bg + orbit lines + nodes ──────────────────────────
    const bg = document.createElement("canvas");
    bg.width = SIZE * dpr; bg.height = SIZE * dpr;
    const bx = bg.getContext("2d")!;
    bx.scale(dpr, dpr);

    // Background — transparent (no fill)

    // Orbit lines — hidden per user preference
    // for (const { R } of rings) { ... }

    // Nodes — same rendering as CircleChart ring nodes
    const ANGLE_OFFSETS = [
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI / 14,
      -Math.PI / 2 - Math.PI / 18,
      -Math.PI / 2 + Math.PI / 22,
    ];
    rings.forEach(({ R, r, bw, n, offset }, tier) => {
      const nodeR = r + bw;
      const angleOff = ANGLE_OFFSETS[tier] ?? -Math.PI / 2;
      for (let i = 0; i < n; i++) {
        const angle = angleOff + (i / n) * Math.PI * 2;
        const nx = cx + Math.cos(angle) * R;
        const ny = cy + Math.sin(angle) * R;
        const m  = MOCK_USERS[offset + i];

        // White border disc
        bx.beginPath();
        bx.arc(nx, ny, nodeR, 0, Math.PI * 2);
        bx.fillStyle = "rgba(255,255,255,0.15)";
        bx.fill();

        // Avatar fill
        drawAvatar(bx, nx, ny, r, m.color, m.init);

        // Color border
        bx.beginPath();
        bx.arc(nx, ny, nodeR, 0, Math.PI * 2);
        bx.strokeStyle = m.color;
        bx.lineWidth = bw * 0.6;
        bx.stroke();
      }
    });

    startRef.current = performance.now();

    function draw(now: number) {
      const elapsed = (now - startRef.current) % CYCLE;
      let avatarAlpha = 0;
      if (elapsed < SHOW_TEXT) {
        avatarAlpha = 0;
      } else if (elapsed < SHOW_TEXT + FADE_IN) {
        avatarAlpha = (elapsed - SHOW_TEXT) / FADE_IN;
      } else if (elapsed < SHOW_TEXT + FADE_IN + SHOW_AVT) {
        avatarAlpha = 1;
      } else {
        avatarAlpha = 1 - (elapsed - SHOW_TEXT - FADE_IN - SHOW_AVT) / FADE_OUT;
      }
      showingAvatar.current = avatarAlpha > 0.5;

      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.drawImage(bg, 0, 0, SIZE * dpr, SIZE * dpr, 0, 0, SIZE, SIZE);

      // Center halo
      ctx.beginPath();
      ctx.arc(cx, cy, centerOuter + 5 * sc, 0, Math.PI * 2);
      ctx.strokeStyle = ACCENT + "44";
      ctx.lineWidth = 2 * sc;
      ctx.stroke();

      // White border disc
      ctx.beginPath();
      ctx.arc(cx, cy, centerOuter, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fill();

      // Center clip
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, centerR, 0, Math.PI * 2);
      ctx.clip();

      // Gradient base
      const base = ctx.createRadialGradient(cx - centerR * 0.3, cy - centerR * 0.3, 0, cx, cy, centerR);
      base.addColorStop(0, "#1e3a5fcc");
      base.addColorStop(1, "#0f172acc");
      ctx.fillStyle = base;
      ctx.fill();

      // YOU (fades out)
      if (avatarAlpha < 0.99) {
        ctx.globalAlpha = 1 - avatarAlpha;
        ctx.fillStyle = "#e2e8f0";
        ctx.font = `bold ${Math.floor(centerR * 0.38)}px system-ui,sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("YOU", cx, cy);
      }
      // Avatar (fades in)
      if (avatarRef.current && avatarAlpha > 0.01) {
        ctx.globalAlpha = avatarAlpha;
        ctx.drawImage(avatarRef.current, cx - centerR, cy - centerR, centerR * 2, centerR * 2);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // Accent border on center
      ctx.beginPath();
      ctx.arc(cx, cy, centerOuter, 0, Math.PI * 2);
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 2 * sc;
      ctx.stroke();

      if (canvas) canvas.style.cursor = showingAvatar.current ? "pointer" : "default";
      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      onClick={() => { if (showingAvatar.current) window.open("https://x.com/acnekot", "_blank", "noopener"); }}
      style={{ filter: "drop-shadow(0 0 40px rgba(29,155,240,0.15))" }}
      title="@acnekot"
    />
  );
}
