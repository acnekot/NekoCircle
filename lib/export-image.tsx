import type { AnalysisResult } from "@/lib/circle-convert";
import { DEFAULT_STYLE, type StyleConfig } from "@/lib/style";

type PartialStyle = Partial<StyleConfig> | null | undefined;

const SIZE_MUL = { small: 0.8, medium: 1, large: 1.22 } as const;
const IMAGE_SIZE = 1200;
const DISPLAY_COUNT_PRESETS = [7, 22, 50] as const;

type RingInfo = { R: number; r: number; bw: number; n: number; offset: number };

function hexBrightness(hex: string): number {
  const value = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#000000";
  const r = Number.parseInt(value.slice(1, 3), 16);
  const g = Number.parseInt(value.slice(3, 5), 16);
  const b = Number.parseInt(value.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function toBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return fallback;
}

function toNumber(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function sanitizeColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function sanitizeEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function sanitizeText(value: unknown, fallback: string, maxLen = 80) {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, maxLen);
}

function normalizeDisplayCount(value: unknown) {
  const parsed = toNumber(value, DEFAULT_STYLE.displayCount);
  if (DISPLAY_COUNT_PRESETS.includes(parsed as typeof DISPLAY_COUNT_PRESETS[number])) return parsed;
  if (parsed <= 7) return 7;
  if (parsed <= 22) return 22;
  return 50;
}

export function mergeExportStyle(partial?: PartialStyle): StyleConfig {
  const style = partial ?? {};
  const merged: StyleConfig = {
    ...DEFAULT_STYLE,
    bgColor1: sanitizeColor(style.bgColor1, DEFAULT_STYLE.bgColor1),
    bgColor2: sanitizeColor(style.bgColor2, DEFAULT_STYLE.bgColor2),
    bgGradient: sanitizeEnum(style.bgGradient, ["radial", "linear-tb", "linear-lr", "solid"], DEFAULT_STYLE.bgGradient),
    accentColor: sanitizeColor(style.accentColor, DEFAULT_STYLE.accentColor),
    nodeScheme: sanitizeEnum(style.nodeScheme, ["rainbow", "accent", "tier", "warm", "cool", "mono"], DEFAULT_STYLE.nodeScheme),
    nodeSize: sanitizeEnum(style.nodeSize, ["small", "medium", "large"], DEFAULT_STYLE.nodeSize),
    showAvatars: toBoolean(style.showAvatars, true),
    showUsernames: toBoolean(style.showUsernames, DEFAULT_STYLE.showUsernames),
    showScores: toBoolean(style.showScores, DEFAULT_STYLE.showScores),
    showRankBadge: toBoolean(style.showRankBadge, DEFAULT_STYLE.showRankBadge),
    showLines: true,
    glowEffect: toBoolean(style.glowEffect, true),
    font: sanitizeEnum(style.font, ["sans-serif", "serif", "monospace"], DEFAULT_STYLE.font),
    title: sanitizeText(style.title, DEFAULT_STYLE.title),
    showTitle: toBoolean(style.showTitle, DEFAULT_STYLE.showTitle),
    watermark: "NekoCircle",
    showWatermark: toBoolean(style.showWatermark, true),
    displayCount: normalizeDisplayCount(style.displayCount),
    theme: sanitizeText(style.theme, DEFAULT_STYLE.theme, 24),
  };

  return merged;
}

function computeRings(total: number, centerOuter: number, scale: number, mul: number): RingInfo[] {
  const AVATAR_R = [42, 35, 28, 22];
  const BORDER_W = [3.5, 3.0, 2.5, 2.0];
  const RING_GAP = 3 * scale;

  const rings: RingInfo[] = [];
  let innerEdge = centerOuter;
  let remaining = total;
  let offset = 0;

  for (let tier = 0; tier < AVATAR_R.length && remaining > 0; tier++) {
    const r = AVATAR_R[tier] * scale * mul;
    const bw = BORDER_W[tier] * scale;
    const nodeR = r + bw;
    const R = innerEdge + nodeR + RING_GAP;
    const maxN = Math.max(1, Math.floor(Math.PI / Math.asin(Math.min(0.999, nodeR / R))));
    const n = Math.min(maxN, remaining);
    rings.push({ R, r, bw, n, offset });
    innerEdge = R + nodeR + RING_GAP;
    remaining -= n;
    offset += n;
  }

  return rings;
}

function backgroundFor(style: StyleConfig) {
  if (style.bgGradient === "radial") {
    return `radial-gradient(circle at center, ${style.bgColor1} 0%, ${style.bgColor2} 100%)`;
  }
  if (style.bgGradient === "linear-tb") {
    return `linear-gradient(to bottom, ${style.bgColor1} 0%, ${style.bgColor2} 100%)`;
  }
  if (style.bgGradient === "linear-lr") {
    return `linear-gradient(to right, ${style.bgColor1} 0%, ${style.bgColor2} 100%)`;
  }
  return style.bgColor1;
}

function filenameFor(label: string) {
  return label.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "circle";
}

function avatarUrl(origin: string, url: string) {
  return `${origin}/api/avatar?url=${encodeURIComponent(url)}`;
}

function initials(name: string) {
  return (name[0] ?? "?").toUpperCase();
}

function nodeColor(accent: string, idx: number, tier: number, scheme: StyleConfig["nodeScheme"]) {
  const palettes = {
    rainbow: [
      "#1d9bf0", "#7b6cf6", "#f59e0b", "#10b981",
      "#ef4444", "#ec4899", "#06b6d4", "#84cc16",
      "#f97316", "#a855f7", "#14b8a6", "#eab308",
    ],
    warm: ["#ef4444", "#f97316", "#f59e0b", "#ec4899", "#e11d48", "#fb923c", "#fbbf24", "#f43f5e"],
    cool: ["#1d9bf0", "#06b6d4", "#7b6cf6", "#10b981", "#0ea5e9", "#14b8a6", "#6366f1", "#22d3ee"],
    mono: ["#888888"],
  } as const;

  if (scheme === "accent") return accent;
  if (scheme === "tier") return (["#1d9bf0", "#7b6cf6", "#10b981"] as const)[tier] ?? accent;
  if (scheme === "warm") return palettes.warm[idx % palettes.warm.length];
  if (scheme === "cool") return palettes.cool[idx % palettes.cool.length];
  if (scheme === "mono") return palettes.mono[0];
  return palettes.rainbow[idx % palettes.rainbow.length];
}

export function getExportFilename(username: string) {
  return `${filenameFor(username)}-circle.png`;
}

export function CircleExportImage({
  result,
  style,
  origin,
}: {
  result: AnalysisResult;
  style: StyleConfig;
  origin: string;
}) {
  const size = IMAGE_SIZE;
  const center = size / 2;
  const scale = size / 700;
  const mul = SIZE_MUL[style.nodeSize];
  const isLight = hexBrightness(style.bgColor1) > 128;
  const centerR = Math.round(60 * scale * mul);
  const centerBW = 4 * scale;
  const centerOuter = centerR + centerBW;
  const users = result.topUsers.slice(0, style.displayCount);
  const rings = computeRings(users.length, centerOuter, scale, mul);
  const fontFamily = style.font;

  return (
    <div
      style={{
        width: size,
        height: size,
        position: "relative",
        display: "flex",
        background: backgroundFor(style),
        color: isLight ? "#111111" : "#ffffff",
        overflow: "hidden",
        fontFamily,
      }}
    >
      {style.showTitle && style.title ? (
        <div
          style={{
            position: "absolute",
            top: 24,
            left: 0,
            right: 0,
            textAlign: "center",
            fontSize: 34,
            fontWeight: 700,
            color: style.accentColor,
          }}
        >
          {style.title}
        </div>
      ) : null}

      <div
        style={{
          position: "absolute",
          left: center - centerOuter - 10,
          top: center - centerOuter - 10,
          width: (centerOuter + 10) * 2,
          height: (centerOuter + 10) * 2,
          borderRadius: "9999px",
          border: `4px solid ${style.accentColor}44`,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: center - centerOuter,
          top: center - centerOuter,
          width: centerOuter * 2,
          height: centerOuter * 2,
          borderRadius: "9999px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isLight ? "#ffffff" : "rgba(255,255,255,0.18)",
          border: `4px solid ${style.accentColor}`,
          overflow: "hidden",
        }}
      >
        {style.showAvatars && result.targetUser.profilePicture ? (
          <img
            alt={result.targetUser.userName}
            src={avatarUrl(origin, result.targetUser.profilePicture)}
            width={centerR * 2}
            height={centerR * 2}
            style={{ width: centerR * 2, height: centerR * 2, borderRadius: "9999px", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: centerR * 2,
              height: centerR * 2,
              borderRadius: "9999px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontSize: centerR * 0.9,
              fontWeight: 700,
              background: `linear-gradient(135deg, ${style.accentColor}, ${style.accentColor}88)`,
            }}
          >
            {initials(result.targetUser.userName)}
          </div>
        )}
      </div>

      {rings.flatMap(({ R, r, bw, n, offset }, tier) =>
        Array.from({ length: n }, (_, index) => {
          const idx = offset + index;
          const item = users[idx];
          if (!item) return null;

          const angleOffset = [
            -Math.PI / 2,
            -Math.PI / 2 + Math.PI / 14,
            -Math.PI / 2 - Math.PI / 18,
            -Math.PI / 2 + Math.PI / 22,
          ][tier] ?? -Math.PI / 2;
          const angle = angleOffset + (index / n) * Math.PI * 2;
          const nodeR = r + bw;
          const x = center + Math.cos(angle) * R;
          const y = center + Math.sin(angle) * R;
          const color = nodeColor(style.accentColor, idx, tier, style.nodeScheme);
          const labelX = center + Math.cos(angle) * (R + nodeR + 22 * scale);
          const labelY = center + Math.sin(angle) * (R + nodeR + 22 * scale);
          const scoreY = labelY + (style.showUsernames ? 22 : 0);

          return (
            <div
              key={`${item.user.id}-${idx}`}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: size,
                height: size,
                display: "flex",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: x - nodeR,
                  top: y - nodeR,
                  width: nodeR * 2,
                  height: nodeR * 2,
                  borderRadius: "9999px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: isLight ? "#ffffff" : "rgba(255,255,255,0.15)",
                  boxShadow: style.glowEffect && !isLight ? `0 0 30px ${color}` : "none",
                }}
              >
                {style.showAvatars && item.user.profilePicture ? (
                  <img
                    alt={item.user.userName}
                    src={avatarUrl(origin, item.user.profilePicture)}
                    width={r * 2}
                    height={r * 2}
                    style={{ width: r * 2, height: r * 2, borderRadius: "9999px", objectFit: "cover" }}
                  />
                ) : (
                  <div
                    style={{
                      width: r * 2,
                      height: r * 2,
                      borderRadius: "9999px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#ffffff",
                      fontSize: r * 0.75,
                      fontWeight: 700,
                      background: `linear-gradient(135deg, ${color}, ${color}88)`,
                    }}
                  >
                    {initials(item.user.userName)}
                  </div>
                )}
              </div>

              {style.showRankBadge ? (
                <div
                  style={{
                    position: "absolute",
                    left: x + nodeR * 0.45,
                    top: y - nodeR * 0.9,
                    width: 28 * scale,
                    height: 28 * scale,
                    borderRadius: "9999px",
                    background: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#222222",
                    fontSize: 14 * scale,
                    fontWeight: 700,
                    border: "2px solid #222222",
                  }}
                >
                  {idx + 1}
                </div>
              ) : null}

              {style.showUsernames ? (
                <div
                  style={{
                    position: "absolute",
                    left: labelX - 90 * scale,
                    top: labelY - 10 * scale,
                    width: 180 * scale,
                    textAlign: "center",
                    fontSize: (17 - tier) * scale,
                    fontWeight: 700,
                    color: isLight ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.8)",
                  }}
                >
                  {`@${item.user.userName.slice(0, 12)}`}
                </div>
              ) : null}

              {style.showScores ? (
                <div
                  style={{
                    position: "absolute",
                    left: labelX - 50 * scale,
                    top: scoreY + 6 * scale,
                    width: 100 * scale,
                    textAlign: "center",
                    fontSize: 14 * scale,
                    color: isLight ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.6)",
                  }}
                >
                  {item.score}
                </div>
              ) : null}
            </div>
          );
        }),
      )}

      {style.showWatermark ? (
        <div
          style={{
            position: "absolute",
            left: 24,
            bottom: 24,
            padding: "10px 18px",
            borderRadius: 16,
            background: isLight ? "rgba(0,0,0,0.72)" : "rgba(255,255,255,0.82)",
            color: isLight ? "#ffffff" : "#111111",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span style={{ fontSize: 24, fontWeight: 700 }}>NekoCircle</span>
          <span style={{ fontSize: 18, opacity: 0.7, marginTop: 2 }}>circle.catsuki.cc</span>
        </div>
      ) : null}
    </div>
  );
}
