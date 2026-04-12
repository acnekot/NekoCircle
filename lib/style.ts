export type NodeScheme = "rainbow" | "accent" | "tier" | "warm" | "cool" | "mono";
export type BgGradient = "radial" | "linear-tb" | "linear-lr" | "solid";
export type FontChoice = "sans-serif" | "serif" | "monospace";
export type NodeSize = "small" | "medium" | "large";

export type StyleConfig = {
  theme: string;
  bgColor1: string;
  bgColor2: string;
  bgGradient: BgGradient;
  accentColor: string;
  nodeScheme: NodeScheme;
  nodeSize: NodeSize;
  showAvatars: boolean;
  showUsernames: boolean;
  showScores: boolean;
  showRankBadge: boolean;
  showLines: boolean;
  glowEffect: boolean;
  font: FontChoice;
  title: string;
  showTitle: boolean;
  watermark: string;
  showWatermark: boolean;
  displayCount: number;
};

export const DEFAULT_STYLE: StyleConfig = {
  theme: "dark",
  bgColor1: "#b2b2b4",
  bgColor2: "#b2b2b4",
  bgGradient: "solid",
  accentColor: "#b2b2b4",
  nodeScheme: "rainbow",
  nodeSize: "medium",
  showAvatars: true,
  showUsernames: false,
  showScores: false,
  showRankBadge: false,
  showLines: true,
  glowEffect: true,
  font: "sans-serif",
  title: "",
  showTitle: false,
  watermark: "NekoCircle",
  showWatermark: true,
  displayCount: 22,
};

export type ThemePreset = {
  name: string;
  emoji: string;
  bgColor1: string;
  bgColor2: string;
  accentColor: string;
};

export const THEME_PRESETS: Record<string, ThemePreset> = {
  "twitter":     { name: "推特圈",   emoji: "🐦", bgColor1: "#d0ddd0", bgColor2: "#d0ddd0", accentColor: "#1d9bf0" },
  "dark-blue":   { name: "深海蓝",   emoji: "🌊", bgColor1: "#1a2744", bgColor2: "#0a0f1e", accentColor: "#1d9bf0" },
  "dark-purple": { name: "星云紫",   emoji: "🌌", bgColor1: "#1e1040", bgColor2: "#080510", accentColor: "#7b6cf6" },
  "midnight":    { name: "午夜",     emoji: "🌙", bgColor1: "#1a1a2e", bgColor2: "#000000", accentColor: "#e94560" },
  "cyberpunk":   { name: "赛博朋克", emoji: "⚡", bgColor1: "#001a2c", bgColor2: "#000a14", accentColor: "#00d4ff" },
  "forest":      { name: "森林",     emoji: "🌿", bgColor1: "#0a2010", bgColor2: "#040d04", accentColor: "#10b981" },
  "rose":        { name: "玫瑰",     emoji: "🌸", bgColor1: "#2a1020", bgColor2: "#0d0408", accentColor: "#ec4899" },
  "gold":        { name: "黄金",     emoji: "✨", bgColor1: "#1a1200", bgColor2: "#080600", accentColor: "#f59e0b" },
};

export const NODE_PALETTES: Record<NodeScheme, (accent: string, idx: number, tier: number) => string> = {
  rainbow: (_a, i) => [
    "#1d9bf0","#7b6cf6","#f59e0b","#10b981",
    "#ef4444","#ec4899","#06b6d4","#84cc16",
    "#f97316","#a855f7","#14b8a6","#eab308",
  ][i % 12],
  accent:  (a)        => a,
  tier:    (a, _i, t) => (["#1d9bf0","#7b6cf6","#10b981"] as const)[t] ?? a,
  warm:    (_a, i)    => ["#ef4444","#f97316","#f59e0b","#ec4899","#e11d48","#fb923c","#fbbf24","#f43f5e"][i % 8],
  cool:    (_a, i)    => ["#1d9bf0","#06b6d4","#7b6cf6","#10b981","#0ea5e9","#14b8a6","#6366f1","#22d3ee"][i % 8],
  mono:    ()         => "#888888",
};

export function hexBrightness(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

export function loadStyleConfig(): StyleConfig {
  if (typeof window === "undefined") return DEFAULT_STYLE;
  try {
    const raw = localStorage.getItem("circle_style");
    const base = raw ? { ...DEFAULT_STYLE, ...JSON.parse(raw) } : DEFAULT_STYLE;
    // Always force these on regardless of saved config
    return { ...base, showAvatars: true, showWatermark: true, showLines: true, glowEffect: true,
             bgColor1: base.bgColor1 === "#111827" || base.bgColor1 === "#030712" ? "#b2b2b4" : base.bgColor1,
             bgColor2: base.bgColor2 === "#030712" || base.bgColor2 === "#111827" ? "#b2b2b4" : base.bgColor2,
           };
  } catch {
    return DEFAULT_STYLE;
  }
}

export function saveStyleConfig(s: StyleConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem("circle_style", JSON.stringify(s));
}


