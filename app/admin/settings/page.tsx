"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminNav from "@/components/AdminNav";

type Item = {
  key: string;
  label: string;
  description: string;
  type: "text" | "number" | "boolean";
  group: string;
  unit?: string;
  min?: number;
  max?: number;
  placeholder?: string;
  onLabel?: string;
  offLabel?: string;
  env?: string[];
  value: string;
  source: "db" | "env" | "default";
  override: boolean;
  defaultValue: string;
};

type Runtime = Record<string, string | number | boolean>;

const SOURCE_BADGE: Record<Item["source"], { text: string; cls: string }> = {
  db: { text: "已自定义", cls: "bg-[#1d9bf0]/15 text-[#1d9bf0] border-[#1d9bf0]/30" },
  env: { text: "来自环境变量", cls: "bg-amber-400/10 text-amber-300 border-amber-400/30" },
  default: { text: "默认值", cls: "bg-white/5 text-gray-500 border-white/10" },
};

export default function AdminSettingsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/settings", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      const data = await res.json();
      setItems(data.items || []);
      setGroups(data.groups || []);
      setRuntime(data.runtime || null);
      setDraft(
        Object.fromEntries((data.items || []).map((i: Item) => [i.key, i.value])),
      );
      setErrors({});
    } catch {
      setFlash("读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(
    () => items.filter((i) => draft[i.key] !== i.value).map((i) => i.key),
    [items, draft],
  );

  const save = async () => {
    if (!dirty.length) return;
    setSaving(true);
    setFlash("");
    setErrors({});
    try {
      const updates: Record<string, unknown> = {};
      for (const key of dirty) {
        const item = items.find((i) => i.key === key)!;
        updates[key] = item.type === "boolean" ? draft[key] === "true" : draft[key];
      }
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      const data = await res.json();
      if (data.errors && Object.keys(data.errors).length) {
        setErrors(data.errors);
        setFlash("部分设置未能保存");
      } else {
        setFlash(`已保存 ${data.saved?.length ?? 0} 项`);
      }
      if (data.runtime) setRuntime(data.runtime);
      await load();
    } catch {
      setFlash("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const resetOne = async (key: string) => {
    setSaving(true);
    setFlash("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resets: [key] }),
      });
      const data = await res.json();
      if (data.runtime) setRuntime(data.runtime);
      setFlash("已恢复默认");
      await load();
    } catch {
      setFlash("重置失败");
    } finally {
      setSaving(false);
    }
  };

  const set = (key: string, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="gradient-bg min-h-screen py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <AdminNav />

        <div className="card rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white mb-1">参数设置</h2>
          <p className="text-[11px] text-gray-600">
            修改后立即生效（正在进行的抓取不受影响）。取值优先级：此处设置 → 环境变量 → 默认值。
          </p>
        </div>

        {loading && items.length === 0 && (
          <div className="card rounded-2xl p-10 text-center text-gray-500 text-sm">
            读取中…
          </div>
        )}

        {groups.map((group) => {
          const groupItems = items.filter((i) => i.group === group);
          if (!groupItems.length) return null;
          return (
            <div key={group} className="card rounded-2xl p-5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
                {group}
              </h3>
              <div className="space-y-5">
                {groupItems.map((item) => {
                  const badge = SOURCE_BADGE[item.source];
                  const masked = item.value.includes("***@");
                  const isDirty = draft[item.key] !== item.value;
                  return (
                    <div key={item.key}>
                      <div className="flex items-center gap-2 mb-1">
                        <label className="text-xs text-gray-200">{item.label}</label>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded border ${badge.cls}`}
                        >
                          {badge.text}
                        </span>
                        {isDirty && (
                          <span className="text-[10px] text-amber-300">未保存</span>
                        )}
                        {item.override && (
                          <button
                            onClick={() => resetOne(item.key)}
                            disabled={saving}
                            className="ml-auto text-[10px] text-gray-600 hover:text-white transition-colors disabled:opacity-40"
                          >
                            恢复默认
                          </button>
                        )}
                      </div>

                      {item.type === "boolean" ? (
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() =>
                              set(item.key, draft[item.key] === "true" ? "false" : "true")
                            }
                            className={
                              "relative w-11 h-6 rounded-full transition-colors " +
                              (draft[item.key] === "true" ? "bg-[#1d9bf0]" : "bg-white/15")
                            }
                          >
                            <span
                              className={
                                "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all " +
                                (draft[item.key] === "true" ? "left-[22px]" : "left-0.5")
                              }
                            />
                          </button>
                          <span className="text-xs text-gray-400">
                            {draft[item.key] === "true" ? item.onLabel : item.offLabel}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            type={item.type === "number" ? "number" : "text"}
                            value={draft[item.key] ?? ""}
                            min={item.min}
                            max={item.max}
                            placeholder={item.placeholder}
                            onChange={(e) => set(item.key, e.target.value)}
                            className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-white/10 focus:border-[#1d9bf0]/60 outline-none text-sm text-white placeholder:text-gray-700 font-mono"
                          />
                          {item.unit && (
                            <span className="text-xs text-gray-600 shrink-0">
                              {item.unit}
                            </span>
                          )}
                        </div>
                      )}

                      <p className="text-[11px] text-gray-600 mt-1.5 leading-relaxed">
                        {item.description}
                      </p>
                      <div className="flex flex-wrap gap-x-3 text-[10px] text-gray-700 mt-1">
                        {item.type !== "boolean" && (
                          <span>
                            默认 {item.defaultValue === "" ? "（空）" : item.defaultValue}
                          </span>
                        )}
                        {item.type === "number" && item.min !== undefined && (
                          <span>
                            范围 {item.min} – {item.max}
                          </span>
                        )}
                        {item.env?.length && <span>环境变量 {item.env.join(" / ")}</span>}
                      </div>
                      {masked && (
                        <p className="text-[10px] text-amber-400/80 mt-1">
                          当前值中的凭据已隐藏。若要保持原样请勿修改此字段；修改后将按新值覆盖。
                        </p>
                      )}
                      {errors[item.key] && (
                        <p className="text-[11px] text-red-400 mt-1">{errors[item.key]}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {runtime && (
          <div className="card rounded-2xl p-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              当前生效值
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
              {Object.entries(runtime).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2 text-[11px]">
                  <span className="text-gray-600 font-mono truncate">{k}</span>
                  <span className="text-gray-300 font-mono truncate">
                    {typeof v === "boolean" ? (v ? "true" : "false") : String(v) || "（空）"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 保存栏 */}
        <div className="sticky bottom-4">
          <div className="card rounded-2xl px-5 py-3 flex items-center gap-3 backdrop-blur">
            <span className="text-xs text-gray-500 flex-1">
              {dirty.length ? `${dirty.length} 项待保存` : "没有未保存的修改"}
              {flash && <span className="text-gray-300 ml-2">· {flash}</span>}
            </span>
            <button
              onClick={save}
              disabled={saving || dirty.length === 0}
              className="px-4 py-2 rounded-lg bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white text-sm font-medium transition-colors disabled:opacity-40"
            >
              {saving ? "保存中…" : "保存修改"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}