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

type CleanupState = {
  retentionHours: number;
  autoCleanup: boolean;
  cutoff: number;
  all: { count: number; bytes: number; oldestCreatedAt: number | null };
  expired: { count: number; bytes: number; oldestCreatedAt: number | null };
};

function formatBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** gzip 魔数（1f 8b）——按内容判定，不看扩展名。 */
function isGzipBytes(bytes: Uint8Array): boolean {
  return bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/**
 * 浏览器侧解压，仅用于在界面上显示「文件里有哪些表、各多少行」。
 * 发给服务端的是**原始压缩字节**，不重新压缩——避免无谓的 CPU 与内存开销。
 */
async function gunzipToText(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).text();
}

export default function AdminDataPage() {
  const [meta, setMeta] = useState<Overview | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [cleanupState, setCleanupState] = useState<CleanupState | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState("");

  // 导出
  const [picked, setPicked] = useState<string[]>([]);
  const [includeCredentials, setIncludeCredentials] = useState(false);
  const [gzipExport, setGzipExport] = useState(true);
  const [exportNote, setExportNote] = useState("");

  // 导入
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [bundle, setBundle] = useState<Record<string, unknown> | null>(null);
  /** 压缩备份的原始字节：直接原样上传，不再序列化成 JSON 信封。 */
  const [gzBytes, setGzBytes] = useState<Uint8Array | null>(null);
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

  const loadCleanup = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/data/cleanup", { cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      const data = await response.json();
      if (response.ok) setCleanupState(data);
    } catch {
      setCleanupMessage("无法读取临时数据状态");
    }
  }, []);

  useEffect(() => {
    loadMeta();
    loadCleanup();
  }, [loadMeta, loadCleanup]);

  const cleanupTemporary = async (scope: "expired" | "all") => {
    const count = scope === "expired"
      ? cleanupState?.expired.count ?? 0
      : cleanupState?.all.count ?? 0;
    if (!count) return;
    const wording = scope === "expired" ? "过期临时圈子" : "全部临时圈子";
    if (!window.confirm(`确定删除 ${count} 个${wording}？已授权长期保存的圈子不会受影响。`)) return;
    setCleaning(true);
    setCleanupMessage("");
    try {
      const response = await fetch("/api/admin/data/cleanup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope,
          confirm: scope === "all" ? "DELETE_TEMPORARY" : "",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "清理失败");
      setCleanupMessage(`已清理 ${data.deleted.count} 个临时圈子，释放约 ${formatBytes(data.deleted.bytes)} 数据内容`);
      setCleanupState(data.state);
      await loadMeta();
    } catch (error) {
      setCleanupMessage(error instanceof Error ? error.message : "清理失败");
    } finally {
      setCleaning(false);
    }
  };

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
    if (gzipExport) params.set("gzip", "1");
    const a = document.createElement("a");
    a.href = `/api/admin/data/export?${params}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setExportNote(
      gzipExport
        ? "已开始下载压缩备份（.json.gz，整库体积约可压到 1/3）"
        : "已开始下载（保存位置由浏览器决定）",
    );
  };

  const onPickFile = async (file: File | undefined) => {
    setReport(null);
    setImportError("");
    setBundle(null);
    setGzBytes(null);
    setFileSummary([]);
    setFileError("");
    setFileName(file ? file.name : "");
    if (!file) return;
    try {
      // 读成字节而不是 file.text()：要按魔数识别 .gz，
      // 而 text() 对压缩文件只会吐出乱码。
      const bytes = new Uint8Array(await file.arrayBuffer());
      const gz = isGzipBytes(bytes);
      let text: string;
      if (gz) {
        if (typeof DecompressionStream === "undefined") {
          setFileError(
            "这个浏览器不支持解压 .gz 备份，请改用未压缩的 .json 备份。",
          );
          return;
        }
        text = await gunzipToText(bytes);
      } else {
        text = new TextDecoder().decode(bytes);
      }

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
      // 压缩备份：只留原始字节，不再把整个备份包塞进 state
      // （整库解压后接近 70MB，占着没意义）。
      if (gz) setGzBytes(bytes);
      else setBundle(parsed);
    } catch {
      setFileError("无法解析为 JSON（若是压缩备份，请确认文件完整）。");
    }
  };

  const doImport = async (dryRun: boolean) => {
    if (!bundle && !gzBytes) return;
    if (mode === "replace" && !confirmReplace && !dryRun) return;
    setImporting(true);
    setImportError("");
    try {
      // 压缩备份：原样上传字节，参数走 query（解压后不是信封结构）。
      // 未压缩：沿用 JSON 信封，bundle 作为对象嵌入。
      const init: RequestInit = gzBytes
        ? {
            method: "POST",
            headers: { "content-type": "application/gzip" },
            body: gzBytes as unknown as BodyInit,
          }
        : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              bundle,
              mode,
              confirm: confirmReplace,
              dryRun,
            }),
          };
      const params = new URLSearchParams();
      if (gzBytes) {
        params.set("mode", mode);
        if (confirmReplace) params.set("confirm", "1");
        if (dryRun) params.set("dryRun", "1");
      }
      const query = params.toString();
      const res = await fetch(
        `/api/admin/data/import${query ? `?${query}` : ""}`,
        init,
      );
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

        <div className="card rounded-2xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">临时数据清理</h2>
              <p className="mt-1 text-[11px] leading-relaxed text-gray-600">
                仅清理未授权长期保存的圈子正文；已授权圈子和匿名生成统计不会被删除。
              </p>
            </div>
            <a href="/admin/settings" className="text-[11px] text-[#bec2ff] hover:underline">
              调整保留策略
            </a>
          </div>

          {cleanupState ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-white/5 px-3 py-3">
                  <div className="text-[10px] text-gray-600">全部临时圈子</div>
                  <div className="mt-1 text-xl font-bold tabular-nums text-white">{cleanupState.all.count}</div>
                </div>
                <div className="rounded-xl bg-white/5 px-3 py-3">
                  <div className="text-[10px] text-gray-600">已过期</div>
                  <div className="mt-1 text-xl font-bold tabular-nums text-amber-300">{cleanupState.expired.count}</div>
                </div>
                <div className="rounded-xl bg-white/5 px-3 py-3">
                  <div className="text-[10px] text-gray-600">临时数据体积</div>
                  <div className="mt-1 text-xl font-bold tabular-nums text-white">{formatBytes(cleanupState.all.bytes)}</div>
                </div>
                <div className="rounded-xl bg-white/5 px-3 py-3">
                  <div className="text-[10px] text-gray-600">当前策略</div>
                  <div className="mt-1 text-sm font-semibold text-white">{cleanupState.retentionHours} 小时</div>
                  <div className="mt-1 text-[10px] text-gray-600">{cleanupState.autoCleanup ? "自动清理开启" : "仅手动清理"}</div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => cleanupTemporary("expired")}
                  disabled={cleaning || cleanupState.expired.count === 0}
                  className="rounded-lg bg-amber-400/15 px-4 py-2 text-xs font-medium text-amber-200 transition hover:bg-amber-400/25 disabled:opacity-35"
                >
                  {cleaning ? "清理中…" : `清理过期数据（${cleanupState.expired.count}）`}
                </button>
                <button
                  onClick={() => cleanupTemporary("all")}
                  disabled={cleaning || cleanupState.all.count === 0}
                  className="rounded-lg border border-red-400/20 px-4 py-2 text-xs text-red-300 transition hover:bg-red-400/10 disabled:opacity-35"
                >
                  清理全部临时数据
                </button>
                {cleanupMessage && <span className="text-xs text-gray-400">{cleanupMessage}</span>}
              </div>
            </>
          ) : (
            <div className="mt-4 text-xs text-gray-600">正在读取临时数据状态…</div>
          )}
        </div>

        {/* 导出 */}
        <div className="card rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white mb-1">导出备份</h2>
          <p className="text-[11px] text-gray-600 mb-4">
            以 JSON 或压缩备份（.json.gz）下载，两者都能在下方导入回本服务。
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
                checked={gzipExport}
                onChange={(e) => setGzipExport(e.target.checked)}
                className="mt-0.5 accent-[#1d9bf0]"
              />
              <span>
                <span className="text-xs text-gray-200 group-hover:text-white">
                  压缩下载（.json.gz，推荐）
                </span>
                <span className="text-[11px] text-gray-600 block">
                  实测整库可压到约 1/3（取决于数据内容），也更容易再导入回来。
                </span>
              </span>
            </label>

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
            <li>
              支持 <code>.json</code> 与压缩备份 <code>.json.gz</code>（按文件内容识别，
              不看扩展名）。压缩包不必手动解压。
            </li>
          </ul>

          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json,application/gzip,.gz,.json.gz"
            className="hidden"
            onChange={(e) => onPickFile(e.target.files?.[0])}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full py-3 rounded-xl border border-dashed border-white/15 hover:border-[#1d9bf0]/50 text-sm text-gray-400 hover:text-white transition-colors mb-3"
          >
            {fileName ? `已选择：${fileName}` : "选择备份文件（.json / .json.gz）"}
          </button>

          {fileError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 text-red-400 text-xs mb-3">
              {fileError}
            </div>
          )}

          {(bundle || gzBytes) && (
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
