"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AdminNav from "@/components/AdminNav";

type Overview = {
  overview: {
    path: string;
    bytes: number;
    tables: { name: string; label: string; rows: number }[];
  };
  tables: { name: string; label: string; description: string }[];
};

type TableReport = {
  table: string;
  label: string;
  received: number;
  inserted: number;
  skipped: number;
  notes: string[];
};

type ImportReport = {
  mode: "merge" | "replace";
  appliedAt: string;
  snapshotPath: string | null;
  tables: TableReport[];
  dryRun: boolean;
};

function formatBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function AdminDataPage() {
  const [meta, setMeta] = useState<Overview | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);

  // 导出
  const [picked, setPicked] = useState<string[]>([]);
  const [includeCredentials, setIncludeCredentials] = useState(false);
  const [exportNote, setExportNote] = useState("");

  // 导入
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [bundle, setBundle] = useState<Record<string, unknown> | null>(null);
  const [fileSummary, setFileSummary] = useState<{ table: string; rows: number }[]>([]);
  const [fileError, setFileError] = useState("");
  const [exportedAt, setExportedAt] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [importError, setImportError] = useState("");

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    try {
      const res = await fetch("/api/admin/data/export?overview=1", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      const data: Overview = await res.json();
      setMeta(data);
      setPicked(data.tables.map((t) => t.name));
    } catch {
      /* 概览读取失败不致命 */
    } finally {
      setLoadingMeta(false);
    }
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  /**
   * 通过浏览器原生下载导出。
   *
   * 不用 fetch + blob：整库导出接近 20MB，实测在本环境下 fetch 能拿到响应头，
   * 但读取响应体会失败（Failed to fetch），而同一个 URL 用 curl 却能完整下载。
   * 改成直接导航到该 URL（响应带 Content-Disposition: attachment），
   * 由浏览器的下载管理器处理，服务端成功返回的字节数不再受限制。
   */
  const doExport = () => {
    setExportNote("");
    const params = new URLSearchParams();
    if (picked.length) params.set("tables", picked.join(","));
    if (includeCredentials) params.set("credentials", "1");
    const a = document.createElement("a");
    a.href = `/api/admin/data/export?${params}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setExportNote("已开始下载（保存位置由浏览器决定）");
  };

  const onPickFile = async (file: File | undefined) => {
    setReport(null);
    setImportError("");
    setBundle(null);
    setFileSummary([]);
    setFileError("");
    setFileName(file ? file.name : "");
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || parsed.app !== "nekocircle") {
        setFileError("这不是 NekoCircle 的备份文件（app 字段不匹配）。");
        return;
      }
      const tables = parsed.tables || {};
      setFileSummary(
        Object.entries(tables).map(([k, v]) => ({
          table: k,
          rows: Array.isArray(v) ? v.length : 0,
        })),
      );
      setExportedAt(parsed.exportedAt || "");
      setBundle(parsed);
    } catch {
      setFileError("无法解析为 JSON。");
    }
  };

  const doImport = async (dryRun: boolean) => {
    if (!bundle) return;
    if (mode === "replace" && !confirmReplace && !dryRun) return;
    setImporting(true);
    setImportError("");
    try {
      const res = await fetch("/api/admin/data/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bundle, mode, confirm: confirmReplace, dryRun }),
      });
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "导入失败");
      setReport(data.report as ImportReport);
      if (!dryRun) await loadMeta();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "导入失败");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="gradient-bg min-h-screen py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <AdminNav />

        {/* 现状 */}
        <div className="card rounded-2xl p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">当前数据</h2>
            <button
              onClick={loadMeta}
              disabled={loadingMeta}
              className="text-[11px] text-gray-500 hover:text-white transition-colors disabled:opacity-40"
            >
              {loadingMeta ? "读取中…" : "刷新"}
            </button>
          </div>
          {meta ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {meta.overview.tables.map((t) => (
                  <div key={t.name} className="rounded-xl bg-white/5 px-3 py-2.5">
                    <div className="text-[11px] text-gray-500">{t.label}</div>
                    <div className="text-lg font-bold text-white tabular-nums">
                      {t.rows.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-gray-600">
                <span className="font-mono break-all">{meta.overview.path}</span>
                <span className="shrink-0 ml-3">{formatBytes(meta.overview.bytes)}</span>
              </div>
            </>
          ) : (
            <div className="text-gray-600 text-sm">读取中…</div>
          )}
        </div>

        {/* 导出 */}
        <div className="card rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white mb-1">导出备份</h2>
          <p className="text-[11px] text-gray-600 mb-4">
            以 JSON 下载，可直接在下方导入回本服务。
          </p>

          <div className="space-y-2 mb-4">
            {(meta?.tables ?? []).map((t) => (
              <label
                key={t.name}
                className="flex items-start gap-2.5 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={picked.includes(t.name)}
                  onChange={(e) =>
                    setPicked((prev) =>
                      e.target.checked
                        ? [...prev, t.name]
                        : prev.filter((x) => x !== t.name),
                    )
                  }
                  className="mt-0.5 accent-[#1d9bf0]"
                />
                <span>
                  <span className="text-xs text-gray-200 group-hover:text-white">
                    {t.label}
                  </span>
                  <span className="text-[11px] text-gray-600 block">{t.description}</span>
                </span>
              </label>
            ))}

            <label className="flex items-start gap-2.5 cursor-pointer group pt-1">
              <input
                type="checkbox"
                checked={includeCredentials}
                onChange={(e) => setIncludeCredentials(e.target.checked)}
                className="mt-0.5 accent-[#1d9bf0]"
              />
              <span>
                <span className="text-xs text-gray-200 group-hover:text-white">
                  包含登录凭据（密码哈希）
                </span>
                <span className="text-[11px] text-gray-600 block">
                  默认不含。勾选后备份里有管理员密码哈希，请妥善保管该文件。
                </span>
              </span>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={doExport}
              disabled={picked.length === 0}
              className="px-4 py-2 rounded-lg bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white text-sm font-medium transition-colors disabled:opacity-40"
            >
              下载备份
            </button>
            {exportNote && (
              <span className="text-xs text-gray-400">{exportNote}</span>
            )}
          </div>
        </div>

        {/* 导入 */}
        <div className="card rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white mb-1">导入备份</h2>
          <p className="text-[11px] text-gray-600 mb-2">
            先选择文件，建议先「试运行」确认影响范围。覆盖模式会在写入前自动生成数据库快照。
          </p>
          <ul className="text-[11px] text-gray-600 mb-4 space-y-1 list-disc pl-4">
            <li>
              覆盖模式<strong className="text-gray-400">不会</strong>删除备份里没带的登录凭据
              （否则后台会退化成「谁先登录谁设密码」的状态）。
            </li>
            <li>只接受本应用已知的设置项，备份里的陌生键会被忽略。</li>
            <li>单个文件上限 64MB。备份过大时，可按表分批导出。</li>
          </ul>

          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => onPickFile(e.target.files?.[0])}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full py-3 rounded-xl border border-dashed border-white/15 hover:border-[#1d9bf0]/50 text-sm text-gray-400 hover:text-white transition-colors mb-3"
          >
            {fileName ? `已选择：${fileName}` : "选择备份文件（.json）"}
          </button>

          {fileError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 text-red-400 text-xs mb-3">
              {fileError}
            </div>
          )}

          {bundle && (
            <>
              <div className="rounded-xl bg-white/5 p-3 mb-4 space-y-1.5">
                <div className="text-[11px] text-gray-500 mb-2">
                  文件内容{exportedAt ? `（导出于 ${exportedAt}）` : ""}
                </div>
                {fileSummary.map((s) => (
                  <div key={s.table} className="flex justify-between text-xs">
                    <span className="text-gray-400">{s.table}</span>
                    <span className="text-gray-300 tabular-nums">
                      {s.rows.toLocaleString()} 行
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {(["merge", "replace"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={
                      "px-3 py-1.5 rounded-lg text-xs border transition-colors " +
                      (mode === m
                        ? "border-[#1d9bf0] bg-[#1d9bf0]/10 text-white"
                        : "border-white/10 text-gray-400 hover:text-white")
                    }
                  >
                    {m === "merge" ? "合并（保留现有数据）" : "覆盖（先清空对应表）"}
                  </button>
                ))}
              </div>

              {mode === "replace" && (
                <label className="flex items-start gap-2.5 cursor-pointer mb-4">
                  <input
                    type="checkbox"
                    checked={confirmReplace}
                    onChange={(e) => setConfirmReplace(e.target.checked)}
                    className="mt-0.5 accent-red-500"
                  />
                  <span className="text-[11px] text-red-300/90">
                    我明白这会先清空所选表（含所有已生成的圈子），并已确认要这么做。
                  </span>
                </label>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => doImport(true)}
                  disabled={importing}
                  className="px-4 py-2 rounded-lg border border-white/15 hover:border-white/30 text-gray-200 text-sm transition-colors disabled:opacity-40"
                >
                  试运行
                </button>
                <button
                  onClick={() => doImport(false)}
                  disabled={
                    importing || (mode === "replace" && !confirmReplace)
                  }
                  className="px-4 py-2 rounded-lg bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white text-sm font-medium transition-colors disabled:opacity-40"
                >
                  {importing ? "处理中…" : "执行导入"}
                </button>
              </div>
            </>
          )}

          {importError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 text-red-400 text-xs mt-4">
              {importError}
            </div>
          )}

          {report && (
            <div className="mt-4 rounded-xl border border-white/10 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white">
                  {report.dryRun ? "试运行结果" : "导入完成"}
                  <span className="text-gray-600 ml-2">
                    （{report.mode === "merge" ? "合并" : "覆盖"}）
                  </span>
                </span>
                {report.snapshotPath && (
                  <span className="text-[10px] text-gray-600 font-mono truncate max-w-[45%]">
                    快照 {report.snapshotPath}
                  </span>
                )}
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-600 text-left">
                    <th className="font-normal pb-1.5">表</th>
                    <th className="font-normal pb-1.5 text-right">读取</th>
                    <th className="font-normal pb-1.5 text-right">写入</th>
                    <th className="font-normal pb-1.5 text-right">跳过</th>
                  </tr>
                </thead>
                <tbody>
                  {report.tables.map((t) => (
                    <tr key={t.table} className="border-t border-white/5">
                      <td className="py-1.5 text-gray-300">
                        {t.label}
                        {t.notes.length > 0 && (
                          <span className="text-[10px] text-amber-400/80 block">
                            {t.notes.join("、")}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-right text-gray-400 tabular-nums">
                        {t.received}
                      </td>
                      <td className="py-1.5 text-right text-emerald-400 tabular-nums">
                        {t.inserted}
                      </td>
                      <td className="py-1.5 text-right text-gray-500 tabular-nums">
                        {t.skipped}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.dryRun && (
                <p className="text-[10px] text-gray-600 mt-2">
                  试运行不会写入任何数据（整个事务已回滚）。
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}