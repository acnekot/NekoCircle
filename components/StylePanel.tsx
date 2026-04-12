"use client";
import {
  DEFAULT_STYLE,
  type StyleConfig, type BgGradient, type NodeSize,
} from "@/lib/style";

type Props = {
  value: StyleConfig;
  onChange: (s: StyleConfig) => void;
  maxUsers?: number;
  /** 是否显示「全部」选项 */
  showAllOption?: boolean;
};

function Toggle({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${checked ? "bg-[#1d9bf0]" : "bg-white/10"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`}
      />
    </button>
  );
}

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-400">{label}</label>
      <div className="flex items-center gap-2">
        <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-white/20 flex-shrink-0">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 w-12 h-12 -m-1 cursor-pointer opacity-0"
          />
          <div className="w-full h-full rounded-lg" style={{ background: value }} />
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && onChange(e.target.value)}
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs font-mono outline-none focus:border-[#1d9bf0] w-20"
          maxLength={7}
        />
      </div>
    </div>
  );
}

const BG_GRADIENTS: { key: BgGradient; label: string }[] = [
  { key: "radial",    label: "🔆 径向" },
  { key: "linear-tb", label: "⬇ 竖向" },
  { key: "linear-lr", label: "➡ 横向" },
  { key: "solid",     label: "■ 纯色" },
];

const NODE_SIZES: { key: NodeSize; label: string }[] = [
  { key: "small",  label: "小" },
  { key: "medium", label: "中" },
  { key: "large",  label: "大" },
];

export default function StylePanel({ value: s, onChange, maxUsers = 50, showAllOption = false }: Props) {
  const set = <K extends keyof StyleConfig>(k: K, v: StyleConfig[K]) => onChange({ ...s, [k]: v });

  return (
    <div className="card rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2 font-semibold text-sm">
        🎨 <span>自定义样式</span>
      </div>

      <div className="px-5 pb-5 space-y-6 pt-4">

          {/* ── Background ───────────────────────── */}
          <section>
            <h3 className="text-xs text-gray-400 font-medium mb-3">🌅 背景</h3>
            <div className="grid grid-cols-2 gap-4 mb-3">
              <ColorPicker label="内层颜色" value={s.bgColor1} onChange={(v) => set("bgColor1", v)} />
              <ColorPicker label="外层颜色" value={s.bgColor2} onChange={(v) => set("bgColor2", v)} />
            </div>
            <div className="flex gap-2 flex-wrap">
              {BG_GRADIENTS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => set("bgGradient", key)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${s.bgGradient === key ? "bg-[#1d9bf0] text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          {/* ── Node size ─────────────────────────── */}
          <section>
            <h3 className="text-xs text-gray-400 font-medium mb-3">⭕ 节点大小</h3>
            <div className="flex gap-2">
              {NODE_SIZES.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => set("nodeSize", key)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${s.nodeSize === key ? "border-[#1d9bf0] bg-[#1d9bf0]/10 text-white" : "border-white/10 bg-white/3 text-gray-400 hover:border-white/25"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          {/* ── Display toggles ───────────────────── */}
          <section>
            <h3 className="text-xs text-gray-400 font-medium mb-3">👁 显示选项</h3>
            <div className="space-y-2.5">
              {/* Display count presets */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm">👥 显示人数</div>
                  <div className="text-gray-500 text-xs">当前显示 {Math.min(s.displayCount ?? 22, maxUsers)} 人</div>
                </div>
              </div>
              <div className="flex gap-2">
                {[7, 22, 50].map(n => {
                  const actual = Math.min(n, maxUsers);
                  const active = (s.displayCount ?? 22) === n;
                  return (
                    <button key={n} type="button"
                      onClick={() => set("displayCount", n)}
                      disabled={maxUsers < n && maxUsers < (n === 7 ? 1 : n === 22 ? 8 : 23)}
                      className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                        active
                          ? "bg-[#1d9bf0] text-white"
                          : "bg-white/8 text-gray-300 hover:bg-white/15"
                      } disabled:opacity-30 disabled:cursor-not-allowed`}
                    >
                      {actual}
                    </button>
                  );
                })}
                {showAllOption && (
                  <button
                    type="button"
                    onClick={() => set("displayCount", maxUsers)}
                    className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                      (s.displayCount ?? 22) >= maxUsers
                        ? "bg-[#1d9bf0] text-white"
                        : "bg-white/8 text-gray-300 hover:bg-white/15"
                    }`}
                  >
                    全部
                  </button>
                )}
              </div>

              {[
                { key: "showUsernames" as const, label: "🏷 用户名",      desc: "节点外侧显示 @用户名" },
                { key: "showScores"    as const, label: "⭐ 互动分数",    desc: "显示权重分" },
                { key: "showRankBadge" as const, label: "🔢 排名徽章",    desc: "节点右上角编号" },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">{label}</div>
                    <div className="text-gray-500 text-xs">{desc}</div>
                  </div>
                  <Toggle checked={s[key] as boolean} onToggle={() => set(key, !s[key] as StyleConfig[typeof key])} />
                </div>
              ))}
            </div>
          </section>

          {/* ── Reset ────────────────────────────── */}
          <div className="pt-1 border-t border-white/5">
            <button
              type="button"
              onClick={() => onChange(DEFAULT_STYLE)}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              ↺ 恢复默认样式
            </button>
          </div>
        </div>
    </div>
  );
}
