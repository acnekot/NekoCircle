"use client";
import { useRef, useState, useCallback, useEffect } from "react";
import type { AnalysisResult } from "@/lib/analyze";
import { DEFAULT_STYLE, NODE_PALETTES, hexBrightness, sanitizeHex, type StyleConfig } from "@/lib/style";

type Props = { result: AnalysisResult; style?: StyleConfig; onAccentColor?: (hex: string) => void };

/** 通用绘制函数，可传入任意 canvas、sc、W，供预览和高清导出复用 */
export function renderToCanvas(
  canvas: HTMLCanvasElement,
  result: AnalysisResult,
  s: StyleConfig,
  imageCache: Map<string, HTMLImageElement>,
  options: { exportScale?: number } = {},
) {
  const mul       = SIZE_MUL[s.nodeSize];
  const displayN  = s.displayCount ?? 30;
  const scAdapt   = computeScaleForCount(Math.min(displayN, result.topUsers.length), mul);
  const exportScale = options.exportScale ?? 1;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = exportScale;
  const W   = 700;
  canvas.width        = W * dpr;
  canvas.height       = W * dpr;
  canvas.style.width  = `${W}px`;
  canvas.style.height = `${W}px`;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  const cx = W / 2;
  const cy = W / 2;
  const sc = scAdapt;
  const isLight = hexBrightness(s.bgColor1) > 128;
  const font    = s.font;

  // Background
  {
    const bg1 = sanitizeHex(s.bgColor1, "#b2b2b4");
    const bg2 = sanitizeHex(s.bgColor2, "#b2b2b4");
    let fill: CanvasGradient | string = bg1;
    if (s.bgGradient !== "solid") {
      let g: CanvasGradient;
      if (s.bgGradient === "radial")         g = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.65);
      else if (s.bgGradient === "linear-tb") g = ctx.createLinearGradient(0, 0, 0, W);
      else                                   g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, bg1); g.addColorStop(1, bg2);
      fill = g;
    }
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, W, W);
  }

  // Title
  const accent = sanitizeHex(s.accentColor, "#1d9bf0");
  if (s.showTitle && s.title) {
    ctx.fillStyle    = accent;
    ctx.font         = `bold ${Math.round(18 * sc)}px ${font}`;
    ctx.textAlign    = "center";
    ctx.textBaseline = "top";
    ctx.fillText(s.title, cx, 12 * sc);
  }

  // Center avatar
  const centerR     = Math.round(60 * sc * mul);
  const centerBW    = 4 * sc;
  const centerOuter = centerR + centerBW;

  if (s.glowEffect && !isLight) { ctx.shadowColor = accent; ctx.shadowBlur = 22 * sc; }
  ctx.beginPath(); ctx.arc(cx, cy, centerOuter + 5 * sc, 0, Math.PI * 2);
  ctx.strokeStyle = accent + "44"; ctx.lineWidth = 2 * sc; ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.arc(cx, cy, centerOuter, 0, Math.PI * 2);
  ctx.fillStyle = isLight ? "#ffffff" : "rgba(255,255,255,0.18)"; ctx.fill();
  drawCircleAvatar(ctx, imageCache, result.targetUser.profilePicture, cx, cy, centerR, accent, s.showAvatars, font, result.targetUser.userName);
  ctx.beginPath(); ctx.arc(cx, cy, centerOuter, 0, Math.PI * 2);
  ctx.strokeStyle = accent; ctx.lineWidth = 2 * sc; ctx.stroke();

  // Ring nodes
  const users = result.topUsers.slice(0, displayN);
  const rings = computeRings(users.length, centerOuter, sc, mul);
  const nodeData: { x: number; y: number; r: number; idx: number }[] = [];
  const ANGLE_OFFSETS = [
    -Math.PI / 2, -Math.PI / 2 + Math.PI / 14, -Math.PI / 2 - Math.PI / 18,
    -Math.PI / 2 + Math.PI / 22, -Math.PI / 2 - Math.PI / 26, -Math.PI / 2 + Math.PI / 30,
    -Math.PI / 2 - Math.PI / 34, -Math.PI / 2 + Math.PI / 38,
  ];
  rings.forEach(({ R, r, bw, n, offset }, tier) => {
    const nodeR = r + bw;
    const angleOffset = ANGLE_OFFSETS[tier % ANGLE_OFFSETS.length] ?? -Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const idx  = offset + i;
      const item = users[idx];
      if (!item) break;
      const angle = angleOffset + (i / n) * Math.PI * 2;
      const x = cx + Math.cos(angle) * R;
      const y = cy + Math.sin(angle) * R;
      nodeData.push({ x, y, r: nodeR, idx });
      const color = sanitizeHex(NODE_PALETTES[s.nodeScheme](accent, idx, tier));
      if (s.glowEffect && !isLight) { ctx.shadowColor = color; ctx.shadowBlur = 8 * sc; }
      ctx.beginPath(); ctx.arc(x, y, nodeR, 0, Math.PI * 2);
      ctx.fillStyle = isLight ? "#ffffff" : "rgba(255,255,255,0.15)"; ctx.fill();
      ctx.shadowBlur = 0;
      drawCircleAvatar(ctx, imageCache, item.user.profilePicture, x, y, r, color, s.showAvatars, font, item.user.userName);
      if (s.showRankBadge) {
        const bx = x + nodeR * 0.68, by = y - nodeR * 0.68, br = 8 * sc;
        ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(bx, by, br + 1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#333"; ctx.font = `bold ${Math.round(8.5 * sc)}px ${font}`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(idx + 1), bx, by);
      }
      if (s.showUsernames) {
        const lx = cx + Math.cos(angle) * (R + nodeR + 5 * sc);
        const ly = cy + Math.sin(angle) * (R + nodeR + 5 * sc);
        ctx.fillStyle    = isLight ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.75)";
        ctx.font         = `bold ${Math.round((9 - tier * 0.5) * sc)}px ${font}`;
        ctx.textAlign    = "center";
        ctx.textBaseline = Math.sin(angle) < -0.2 ? "bottom" : Math.sin(angle) > 0.2 ? "top" : "middle";
        ctx.fillText("@" + item.user.userName.slice(0, 12) + (item.user.userName.length > 12 ? "…" : ""), lx, ly);
      }
      if (s.showScores) {
        const baseOff = (s.showUsernames ? 18 : 5) * sc;
        const lx = cx + Math.cos(angle) * (R + nodeR + baseOff);
        const ly = cy + Math.sin(angle) * (R + nodeR + baseOff);
        ctx.fillStyle    = isLight ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.55)";
        ctx.font         = `${Math.round(8 * sc)}px ${font}`;
        ctx.textAlign    = "center"; ctx.textBaseline = "middle";
        ctx.fillText(String(item.score), lx, ly);
      }
    }
  });

  // Watermark
  if (s.showWatermark) {
    const wm1 = "NekoCircle";
    const wm2 = "circle.catsuki.cc";
    const fs = Math.round(13 * sc);
    const fs2 = Math.round(10 * sc);
    ctx.font = `bold ${fs}px ${font}`;
    const tw1 = ctx.measureText(wm1).width;
    ctx.font = `${fs2}px ${font}`;
    const tw2 = ctx.measureText(wm2).width;
    const tw = Math.max(tw1, tw2);
    const padX = 10 * sc, padY = 5 * sc;
    const lineGap = 3 * sc;
    const rh = fs + lineGap + fs2 + padY * 2;
    const rx = 14 * sc, ry = W - 14 * sc - rh;
    const rw = tw + padX * 2;
    ctx.fillStyle = isLight ? "rgba(0,0,0,0.72)" : "rgba(255,255,255,0.82)";
    pill(ctx, rx, ry, rw, rh, 4 * sc); ctx.fill();
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillStyle = isLight ? "#fff" : "#111";
    ctx.font = `bold ${fs}px ${font}`;
    ctx.fillText(wm1, rx + padX, ry + padY);
    ctx.font = `${fs2}px ${font}`;
    ctx.globalAlpha = 0.7;
    ctx.fillText(wm2, rx + padX, ry + padY + fs + lineGap);
    ctx.globalAlpha = 1.0;
  }

  (canvas as HTMLCanvasElement & { _nodes?: typeof nodeData })._nodes = nodeData;
}

/** Extract a representative vibrant color (median of top candidates) from an image */
function extractVibrantColor(img: HTMLImageElement): string {
  try {
    const size = 40;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    type Candidate = { r: number; g: number; b: number; score: number };
    const candidates: Candidate[] = [];
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 200) continue;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const l = (max + min) / 510;
      if (l < 0.15 || l > 0.88) continue;
      const s = max === min ? 0 : (max - min) / (255 * (1 - Math.abs(2 * l - 1)));
      const score = s * (1 - Math.abs(l - 0.5) * 1.2);
      if (score > 0.1) candidates.push({ r, g, b, score });
    }
    if (!candidates.length) return "";
    // Sort by score, take middle 50% to get a representative median color
    candidates.sort((a, b) => a.score - b.score);
    const lo = Math.floor(candidates.length * 0.25);
    const hi = Math.floor(candidates.length * 0.75);
    const slice = candidates.slice(lo, hi + 1);
    const avg = slice.reduce((acc, c) => ({ r: acc.r + c.r, g: acc.g + c.g, b: acc.b + c.b }), { r: 0, g: 0, b: 0 });
    const n = slice.length;
    const [r, g, b] = [Math.round(avg.r / n), Math.round(avg.g / n), Math.round(avg.b / n)];
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  } catch { return ""; }
}
const SIZE_MUL = { small: 0.80, medium: 1.0, large: 1.22 };

/* ─── Dynamic ring layout ────────────────────────────────────────────────────
 * Works outward from the center.
 * For each ring:
 *   1. Ring radius R = prev_outer_edge + nodeRadius + gap
 *   2. Max nodes that fit without overlapping = floor(π / arcsin(nodeR / R))
 *   3. Use that many nodes (tight packing, nearly touching)
 */
type RingInfo = { R: number; r: number; bw: number; n: number; offset: number };

function computeRings(total: number, centerOuter: number, scale: number, mul: number): RingInfo[] {
  // 基础 4 个 tier 的头像半径，之后的 tier 按比例缩小（最小 12px）
  const BASE_AVATAR_R = [42, 35, 28, 22];
  const BASE_BORDER_W = [3.5, 3.0, 2.5, 2.0];
  const RING_GAP = 3 * scale;

  // 动态生成足够多的 tier，直到容纳 total 个节点
  const getAvatarR = (tier: number) => {
    if (tier < BASE_AVATAR_R.length) return BASE_AVATAR_R[tier];
    // 从第5个 tier 开始递减，最小 12
    return Math.max(12, BASE_AVATAR_R[BASE_AVATAR_R.length - 1] - (tier - BASE_AVATAR_R.length + 1) * 3);
  };
  const getBorderW = (tier: number) => {
    if (tier < BASE_BORDER_W.length) return BASE_BORDER_W[tier];
    return Math.max(1.0, BASE_BORDER_W[BASE_BORDER_W.length - 1] - (tier - BASE_BORDER_W.length + 1) * 0.3);
  };

  const rings: RingInfo[] = [];
  let innerEdge = centerOuter;
  let remaining = total;
  let offset = 0;
  let tier = 0;

  while (remaining > 0 && tier < 20) {
    const r     = getAvatarR(tier) * scale * mul;
    const bw    = getBorderW(tier) * scale;
    const nodeR = r + bw;

    const R    = innerEdge + nodeR + RING_GAP;
    const maxN = Math.max(1, Math.floor(Math.PI / Math.asin(Math.min(0.999, nodeR / R))));
    const n    = Math.min(maxN, remaining);

    rings.push({ R, r, bw, n, offset });

    innerEdge  = R + nodeR + RING_GAP;
    remaining -= n;
    offset    += n;
    tier++;
  }
  return rings;
}

/** 给定 total 个节点，计算使内容刚好放入 700px 画布所需的 sc 缩放比例（<=1）。
 *  若 total 很少，sc 保持 1.0（即和原来700px效果一样）。 */
function computeScaleForCount(total: number, mul: number): number {
  if (total <= 0) return 1;
  // 二分搜索：找最大的 sc 使得 outerEdge <= 350（700px 画布半径）
  const target = 350 - 20; // 留20px边距
  let lo = 0.3, hi = 1.0;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const sc = mid;
    const centerOuter = Math.round(60 * sc * mul) + 4 * sc;
    const rings = computeRings(total, centerOuter, sc, mul);
    if (rings.length === 0) { hi = mid; continue; }
    const last = rings[rings.length - 1]!;
    const outerEdge = last.R + last.r + last.bw;
    if (outerEdge <= target) lo = mid;
    else hi = mid;
  }
  return Math.min(1.0, lo);
}

export default function CircleChart({ result, style: styleProp, onAccentColor }: Props) {
  const s           = styleProp ?? DEFAULT_STYLE;
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const wrapRef     = useRef<HTMLDivElement>(null);
  const imageCache  = useRef<Map<string, HTMLImageElement>>(new Map());
  const [tooltip,    setTooltip]   = useState<{ x: number; y: number; user: (typeof result.topUsers)[0] } | null>(null);

  // 根据人数动态计算 sc（缩放比例），人多时整体缩小以放入固定 700px 画布
  const mul         = SIZE_MUL[s.nodeSize];
  const displayN    = s.displayCount ?? 30;
  const scAdapt     = computeScaleForCount(Math.min(displayN, result.topUsers.length), mul);
  const canvasSize  = 700;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    renderToCanvas(canvas, result, s, imageCache.current, { exportScale: dpr });
    // 把图片缓存挂到 canvas 上，供外部下载时复用
    (canvas as HTMLCanvasElement & { _imgCache?: Map<string, HTMLImageElement> })._imgCache = imageCache.current;
  }, [result, s, mul, displayN, scAdapt]);

  /* ── Clear cache when result or avatar toggle changes ── */
  useEffect(() => {
    imageCache.current.clear();
  }, [result, s.showAvatars]);

  /* ── Load images and draw ── */
  const colorExtracted = useRef(false);
  useEffect(() => { colorExtracted.current = false; }, [result]);

  useEffect(() => {
    if (!s.showAvatars) { draw(); return; }
    // yimg.jp 走 /api/image-proxy（支持 yimg + 正确 Referer），其余走 /api/avatar
    const proxy = (u: string) => {
      try {
        const host = new URL(u).hostname;
        if (host.endsWith(".yimg.jp") || host.endsWith(".yimg.com")) {
          return `/api/image-proxy?url=${encodeURIComponent(u)}`;
        }
      } catch { /* ignore */ }
      return `/api/avatar?url=${encodeURIComponent(u)}`;
    };
    const centerUrl = result.targetUser.profilePicture;
    const urls = [
      centerUrl,
      ...result.topUsers.slice(0, displayN).map(u => u.user.profilePicture),
    ].filter(Boolean);

    let cancelled = false;
    // 先用缓存已有的图片立即画一次
    draw();

    // 并发限制：最多 12 张同时加载，避免浏览器连接数耗尽
    const CONCURRENCY = 12;
    let active = 0;
    let idx = 0;

    const loadNext = () => {
      while (active < CONCURRENCY && idx < urls.length) {
        const url = urls[idx++];
        if (imageCache.current.has(url)) { loadNext(); continue; }
        active++;
        const img = new Image();
        img.crossOrigin = "anonymous";
        const done = () => {
          if (cancelled) return;
          active--;
          loadNext();
          // 每张加载完立即重绘，渐进显示
          draw();
        };
        img.onload = () => {
          if (cancelled) return;
          imageCache.current.set(url, img);
          if (url === centerUrl && !colorExtracted.current && onAccentColor) {
            const color = extractVibrantColor(img);
            if (color) { colorExtracted.current = true; onAccentColor(color); }
          }
          done();
        };
        img.onerror = done;
        img.src = proxy(url);
      }
    };

    loadNext();
    return () => { cancelled = true; };
  }, [result, s.showAvatars, displayN, draw, onAccentColor]);

  useEffect(() => { draw(); }, [draw]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current as HTMLCanvasElement & {
      _nodes?: { x: number; y: number; r: number; idx: number }[];
    };
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;
    let found  = null;
    for (const n of (canvas._nodes ?? [])) {
      if (Math.hypot(mx - n.x, my - n.y) <= n.r + 4) {
        // Store position relative to canvas container for absolute positioning
        found = { x: mx, y: my, user: result.topUsers[n.idx] };
        break;
      }
    }
    setTooltip(found);
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current as HTMLCanvasElement & {
      _nodes?: { x: number; y: number; r: number; idx: number }[];
    };
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;
    // Check center node first (target user)
    const cx = canvasSize / 2, cy = canvasSize / 2;
    if (Math.hypot(mx - cx, my - cy) <= 48) {
      window.open(`https://x.com/${result.targetUser.userName}`, "_blank", "noopener");
      return;
    }
    for (const n of (canvas._nodes ?? [])) {
      if (Math.hypot(mx - n.x, my - n.y) <= n.r + 4) {
        window.open(`https://x.com/${result.topUsers[n.idx].user.userName}`, "_blank", "noopener");
        return;
      }
    }
  };

  return (
    <div ref={wrapRef} className="relative inline-block w-full max-w-[700px]">
      <canvas ref={canvasRef} className="rounded-2xl cursor-pointer w-full"
        data-circle="true"
        onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(null)}
        onClick={handleClick} />
      {tooltip && (() => {
        // Smart positioning: flip left if too close to right edge
        const flipX = tooltip.x + 200 > canvasSize;
        const tipX  = flipX ? tooltip.x - 200 : tooltip.x + 14;
        const tipY  = Math.max(4, tooltip.y - 20);
        return (
          <div
            className="absolute z-50 bg-gray-900/95 border border-white/20 rounded-xl px-4 py-3 shadow-2xl pointer-events-none text-sm min-w-[180px]"
            style={{ left: tipX, top: tipY }}
          >
          <div className="font-bold text-white">@{tooltip.user.user.userName}</div>
          <div className="text-gray-400 text-xs mb-2">{tooltip.user.user.name}</div>
          <div className="space-y-1 text-xs">
            {[
              { label: "💬 Reply", val: tooltip.user.replies, cls: "text-blue-400" },
              { label: "🔁 Quote", val: tooltip.user.quotes, cls: "text-purple-400" },
              { label: "📣 Mention", val: tooltip.user.mentions, cls: "text-pink-400" },
              { label: "🔄 Retweet", val: tooltip.user.retweets, cls: "text-green-400" },
              { label: "⬆️ 主动分", val: tooltip.user.outboundScore.toFixed(1), cls: "text-cyan-400" },
              { label: "⬇️ 被动分", val: tooltip.user.inboundScore.toFixed(1), cls: "text-orange-400" },
            ].map(({ label, val, cls }) => (
              <div key={label} className="flex justify-between gap-4">
                <span className={cls}>{label}</span>
                <span className="text-white font-medium">{val}</span>
              </div>
            ))}
            <div className="border-t border-white/10 pt-1 flex justify-between gap-4">
              <span className="text-yellow-400">⭐ Score</span>
              <span className="text-yellow-400 font-bold">{tooltip.user.score}</span>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

/* ── Canvas helpers ────────────────────────────────────────────────────── */
function drawCircleAvatar(
  ctx: CanvasRenderingContext2D,
  cache: Map<string, HTMLImageElement>,
  url: string, x: number, y: number, r: number,
  color: string, showAvatars: boolean, font: string, userName: string,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  const img = showAvatars ? cache.get(url) : undefined;
  if (img) {
    ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
  } else {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    const safeColor = sanitizeHex(color);
    g.addColorStop(0, safeColor + "dd"); g.addColorStop(1, safeColor + "66");
    ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle    = "#fff";
    ctx.font         = `bold ${Math.floor(r * 0.55)}px ${font}`;
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(userName[0]?.toUpperCase() ?? "?", x, y);
  }
  ctx.restore();
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
