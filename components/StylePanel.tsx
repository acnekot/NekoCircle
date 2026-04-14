"use client";
import {
  DEFAULT_STYLE, DEFAULT_USERNAME, USERNAME_PRESETS,
  type StyleConfig, type BgGradient, type NodeSize, type UsernameConfig,
  type NameplateStyle, type NameplatePosition, type NameplateTextStyle, type NameplateArrange,
} from "@/lib/style";
import { useTranslation } from "@/components/LocaleProvider";

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

/** Button group helper */
function BtnGroup<T extends string>({ options, value, onChange }: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 flex-wrap">
      {options.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
            value === key ? "bg-[#1d9bf0] text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const BG_GRADIENT_KEYS: { key: BgGradient; tKey: string }[] = [
  { key: "radial",    tKey: "style.gradient.radial" },
  { key: "linear-tb", tKey: "style.gradient.linearTb" },
  { key: "linear-lr", tKey: "style.gradient.linearLr" },
  { key: "solid",     tKey: "style.gradient.solid" },
];

const NODE_SIZE_KEYS: { key: NodeSize; tKey: string }[] = [
  { key: "small",  tKey: "style.nodeSize.small" },
  { key: "medium", tKey: "style.nodeSize.medium" },
  { key: "large",  tKey: "style.nodeSize.large" },
];

export default function StylePanel({ value: s, onChange, maxUsers = 50, showAllOption = false }: Props) {
  const { t } = useTranslation();
  const set = <K extends keyof StyleConfig>(k: K, v: StyleConfig[K]) => onChange({ ...s, [k]: v });
  const uc = s.usernameConfig;
  const setUname = <K extends keyof UsernameConfig>(k: K, v: UsernameConfig[K]) =>
    onChange({ ...s, usernameConfig: { ...uc, [k]: v } });

  return (
    <div className="card rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2 font-semibold text-sm">
        🎨 <span>{t("style.title")}</span>
      </div>

      <div className="px-5 pb-5 space-y-6 pt-4">

          {/* ── Background ───────────────────────── */}
          <section>
            <h3 className="text-xs text-gray-400 font-medium mb-3">{t("style.bg")}</h3>
            <div className="grid grid-cols-2 gap-4 mb-3">
              <ColorPicker label={t("style.bgInner")} value={s.bgColor1} onChange={(v) => set("bgColor1", v)} />
              <ColorPicker label={t("style.bgOuter")} value={s.bgColor2} onChange={(v) => set("bgColor2", v)} />
            </div>
            <div className="flex gap-2 flex-wrap">
              {BG_GRADIENT_KEYS.map(({ key, tKey }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => set("bgGradient", key)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${s.bgGradient === key ? "bg-[#1d9bf0] text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"}`}
                >
                  {t(tKey)}
                </button>
              ))}
            </div>
          </section>

          {/* ── Node size ─────────────────────────── */}
          <section>
            <h3 className="text-xs text-gray-400 font-medium mb-3">{t("style.nodeSize")}</h3>
            <div className="flex gap-2">
              {NODE_SIZE_KEYS.map(({ key, tKey }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => set("nodeSize", key)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${s.nodeSize === key ? "border-[#1d9bf0] bg-[#1d9bf0]/10 text-white" : "border-white/10 bg-white/3 text-gray-400 hover:border-white/25"}`}
                >
                  {t(tKey)}
                </button>
              ))}
            </div>
          </section>

          {/* ── Display toggles ───────────────────── */}
          <section>
            <h3 className="text-xs text-gray-400 font-medium mb-3">{t("style.display")}</h3>
            <div className="space-y-2.5">
              {/* Display count presets */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm">{t("style.displayCount")}</div>
                  <div className="text-gray-500 text-xs">{t("style.displayCountCurrent", { n: Math.min(s.displayCount ?? 22, maxUsers) })}</div>
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
                    {t("style.displayAll")}
                  </button>
                )}
              </div>

              {/* ── Username config (expandable) ──── */}
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">{t("style.showUsernames")}</div>
                    <div className="text-gray-500 text-xs">{t("style.showUsernamesDesc")}</div>
                  </div>
                  <Toggle checked={uc.enabled} onToggle={() => setUname("enabled", !uc.enabled)} />
                </div>

                {/* Expandable sub-panel */}
                <div
                  className="overflow-hidden transition-all duration-300 ease-in-out"
                  style={{ maxHeight: uc.enabled ? "600px" : "0px", opacity: uc.enabled ? 1 : 0 }}
                >
                  <div className="mt-3 space-y-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">

                    {/* Presets */}
                    <div>
                      <div className="text-xs text-gray-500 mb-1.5">{t("style.uname.presets")}</div>
                      <div className="flex gap-1.5 flex-wrap">
                        {USERNAME_PRESETS.map(({ key, config }) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => onChange({ ...s, usernameConfig: { ...uc, ...config } })}
                            className="px-2.5 py-1 rounded-lg text-xs bg-white/5 text-gray-400 hover:bg-white/10 transition-colors border border-white/8"
                          >
                            {t(key)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Nameplate style */}
                    <div>
                      <div className="text-xs text-gray-500 mb-1.5">{t("style.uname.style")}</div>
                      <BtnGroup<NameplateStyle>
                        options={[
                          { key: "pill", label: t("style.uname.stylePill") },
                          { key: "rect", label: t("style.uname.styleRect") },
                          { key: "bare", label: t("style.uname.styleBare") },
                        ]}
                        value={uc.style}
                        onChange={(v) => setUname("style", v)}
                      />
                    </div>

                    {/* Position */}
                    <div>
                      <div className="text-xs text-gray-500 mb-1.5">{t("style.uname.position")}</div>
                      <BtnGroup<NameplatePosition>
                        options={[
                          { key: "below", label: t("style.uname.posBelow") },
                          { key: "above", label: t("style.uname.posAbove") },
                        ]}
                        value={uc.position}
                        onChange={(v) => setUname("position", v)}
                      />
                    </div>

                    {/* Arrange */}
                    <div>
                      <div className="text-xs text-gray-500 mb-1.5">{t("style.uname.arrange")}</div>
                      <BtnGroup<NameplateArrange>
                        options={[
                          { key: "horizontal", label: t("style.uname.arrHorizontal") },
                          { key: "radial", label: t("style.uname.arrRadial") },
                        ]}
                        value={uc.arrange}
                        onChange={(v) => setUname("arrange", v)}
                      />
                    </div>

                    {/* Text style */}
                    <div>
                      <div className="text-xs text-gray-500 mb-1.5">{t("style.uname.textStyle")}</div>
                      <BtnGroup<NameplateTextStyle>
                        options={[
                          { key: "bold", label: t("style.uname.tsBold") },
                          { key: "normal", label: t("style.uname.tsNormal") },
                          { key: "italic", label: t("style.uname.tsItalic") },
                        ]}
                        value={uc.textStyle}
                        onChange={(v) => setUname("textStyle", v)}
                      />
                    </div>

                    {/* Font size */}
                    <div>
                      <div className="text-xs text-gray-500 mb-1.5">{t("style.uname.size")}</div>
                      <BtnGroup<"small" | "medium" | "large">
                        options={[
                          { key: "small", label: t("style.uname.sizeSmall") },
                          { key: "medium", label: t("style.uname.sizeMedium") },
                          { key: "large", label: t("style.uname.sizeLarge") },
                        ]}
                        value={uc.fontSize}
                        onChange={(v) => setUname("fontSize", v)}
                      />
                    </div>

                    {/* Z-index / layer */}
                    <div>
                      <div className="text-xs text-gray-500 mb-1.5">{t("style.uname.zIndex")}</div>
                      <BtnGroup<"above" | "below">
                        options={[
                          { key: "above", label: t("style.uname.zAbove") },
                          { key: "below", label: t("style.uname.zBelow") },
                        ]}
                        value={uc.zIndex}
                        onChange={(v) => setUname("zIndex", v)}
                      />
                    </div>

                    {/* Max length slider */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-gray-500">{t("style.uname.maxLength")}</span>
                        <span className="text-xs text-gray-300 tabular-nums">{uc.maxLength}</span>
                      </div>
                      <input
                        type="range" min={3} max={20} step={1}
                        value={uc.maxLength}
                        onChange={(e) => setUname("maxLength", Number(e.target.value))}
                        className="w-full h-1.5 rounded-full appearance-none bg-white/10 accent-[#1d9bf0]"
                      />
                    </div>

                    {/* Colors */}
                    <div className="grid grid-cols-2 gap-3">
                      <ColorPicker label={t("style.uname.bgColor")} value={uc.bgColor} onChange={(v) => setUname("bgColor", v)} />
                      <ColorPicker label={t("style.uname.textColor")} value={uc.textColor} onChange={(v) => setUname("textColor", v)} />
                    </div>

                    {/* Opacity slider */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-gray-500">{t("style.uname.opacity")}</span>
                        <span className="text-xs text-gray-300 tabular-nums">{Math.round(uc.opacity * 100)}%</span>
                      </div>
                      <input
                        type="range" min={0} max={100} step={5}
                        value={Math.round(uc.opacity * 100)}
                        onChange={(e) => setUname("opacity", Number(e.target.value) / 100)}
                        className="w-full h-1.5 rounded-full appearance-none bg-white/10 accent-[#1d9bf0]"
                      />
                    </div>

                  </div>
                </div>
              </div>

              {/* Scores + Rank badge toggles */}
              {[
                { key: "showScores"    as const, label: t("style.showScores"),     desc: t("style.showScoresDesc") },
                { key: "showRankBadge" as const, label: t("style.showRankBadge"),  desc: t("style.showRankBadgeDesc") },
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
              {t("style.reset")}
            </button>
          </div>
        </div>
    </div>
  );
}
