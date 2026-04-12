"use client";

import { useEffect, useMemo, useState } from "react";

type TesterForm = {
  token: string;
  username: string;
  analysisId: string;
  title: string;
  displayCount: 7 | 22 | 50;
  showUsernames: boolean;
  showRankBadge: boolean;
  showScores: boolean;
};

const STORAGE_KEY = "api_test_form";

const DEFAULT_FORM: TesterForm = {
  token: "",
  username: "acnekot",
  analysisId: "",
  title: "acnekot Circle",
  displayCount: 22,
  showUsernames: true,
  showRankBadge: true,
  showScores: false,
};

function buildApiUrl(form: TesterForm) {
  const params = new URLSearchParams();
  if (form.analysisId.trim()) {
    params.set("analysisId", form.analysisId.trim());
  } else {
    params.set("username", form.username.trim().replace(/^@+/, ""));
  }
  if (form.title.trim()) params.set("title", form.title.trim());
  params.set("displayCount", String(form.displayCount));
  if (form.showUsernames) params.set("showUsernames", "1");
  if (form.showRankBadge) params.set("showRankBadge", "1");
  if (form.showScores) params.set("showScores", "1");
  return `/api/integrations/circle?${params.toString()}`;
}

export default function ApiTestPage() {
  const [form, setForm] = useState<TesterForm>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusText, setStatusText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<TesterForm>;
      setForm((prev) => ({ ...prev, ...parsed }));
    } catch {
      // ignore malformed local storage
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
  }, [form]);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const requestUrl = useMemo(() => buildApiUrl(form), [form]);

  const curlCommand = useMemo(() => {
    const fullUrl = `http://localhost:3000${requestUrl}`;
    return `curl -L -H 'Authorization: Bearer ${form.token || "<token>"}' '${fullUrl}' -o circle.png`;
  }, [form.token, requestUrl]);

  function update<K extends keyof TesterForm>(key: K, value: TesterForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`已复制${label}`);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      setCopied(`复制${label}失败`);
      setTimeout(() => setCopied(""), 2000);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStatusText("");
    setLoading(true);

    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
      setImageUrl("");
    }

    try {
      const res = await fetch(requestUrl, {
        headers: {
          Authorization: `Bearer ${form.token.trim()}`,
        },
      });

      setStatusText(`${res.status} ${res.statusText}`);

      if (!res.ok) {
        const contentType = res.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          const data = await res.json() as { error?: string };
          throw new Error(data.error ?? "请求失败");
        }
        throw new Error(await res.text() || "请求失败");
      }

      const blob = await res.blob();
      setImageUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : "请求失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="gradient-bg min-h-screen py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">🧪 API 测试页面</h1>
            <p className="text-sm text-gray-500 mt-1">
              用浏览器直接测试 `/api/integrations/circle`，支持预览图片和复制 curl。
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <a href="/" className="text-gray-500 hover:text-white transition-colors">← 首页</a>
            <a href="/admin" className="text-gray-500 hover:text-white transition-colors">⚙️ 后台</a>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-6">
          <div className="card rounded-2xl p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Bearer Token</label>
                <input
                  type="password"
                  value={form.token}
                  onChange={(e) => update("token", e.target.value)}
                  placeholder="catsukineko"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#1d9bf0] text-sm"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">用户名</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => update("username", e.target.value)}
                  placeholder="acnekot"
                  disabled={!!form.analysisId.trim()}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#1d9bf0] text-sm disabled:opacity-50"
                />
                <p className="text-xs text-gray-600 mt-1">填写 `analysisId` 时会优先走已有结果导出。</p>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">analysisId（可选）</label>
                <input
                  type="text"
                  value={form.analysisId}
                  onChange={(e) => update("analysisId", e.target.value)}
                  placeholder="已有分析任务 ID"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#1d9bf0] text-sm"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">图片标题</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => update("title", e.target.value)}
                  placeholder="acnekot Circle"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#1d9bf0] text-sm"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">显示人数</label>
                <div className="grid grid-cols-3 gap-3">
                  {([7, 22, 50] as const).map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => update("displayCount", count)}
                      className={`rounded-xl border px-3 py-3 text-sm font-semibold transition-colors ${form.displayCount === count ? "border-[#1d9bf0] bg-[#1d9bf0]/10 text-white" : "border-white/10 bg-white/5 text-gray-400 hover:text-white"}`}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  ["showUsernames", "显示用户名"],
                  ["showRankBadge", "显示排名"],
                  ["showScores", "显示分数"],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm">
                    <input
                      type="checkbox"
                      checked={form[key as keyof TesterForm] as boolean}
                      onChange={(e) => update(key as keyof TesterForm, e.target.checked as never)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>

              <button
                type="submit"
                disabled={loading || !form.token.trim() || (!form.analysisId.trim() && !form.username.trim())}
                className="btn-primary w-full py-3 rounded-xl font-semibold disabled:opacity-50"
              >
                {loading ? "请求中..." : "生成测试图片"}
              </button>
            </form>

            {(statusText || error) && (
              <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${error ? "bg-red-500/10 border-red-500/30 text-red-300" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"}`}>
                <div>{statusText}</div>
                {error ? <div className="mt-1 break-all">{error}</div> : null}
              </div>
            )}

            <div className="mt-5 space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm text-gray-400">请求路径</label>
                  <button onClick={() => copy(`http://localhost:3000${requestUrl}`, "请求地址")} className="text-xs text-[#1d9bf0] hover:text-white">
                    复制
                  </button>
                </div>
                <pre className="rounded-xl bg-black/40 border border-white/10 px-4 py-3 text-xs text-gray-300 whitespace-pre-wrap break-all">{`http://localhost:3000${requestUrl}`}</pre>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm text-gray-400">curl 指令</label>
                  <button onClick={() => copy(curlCommand, "curl 指令")} className="text-xs text-[#1d9bf0] hover:text-white">
                    复制
                  </button>
                </div>
                <pre className="rounded-xl bg-black/40 border border-white/10 px-4 py-3 text-xs text-gray-300 whitespace-pre-wrap break-all">{curlCommand}</pre>
              </div>

              {copied ? <p className="text-xs text-emerald-400">{copied}</p> : null}
            </div>
          </div>

          <div className="card rounded-2xl p-6 min-h-[540px]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">图片预览</h2>
              {imageUrl ? (
                <a href={imageUrl} download="circle.png" className="text-sm text-[#1d9bf0] hover:text-white transition-colors">
                  下载 PNG
                </a>
              ) : null}
            </div>

            {imageUrl ? (
              <div className="space-y-4">
                <img src={imageUrl} alt="API preview" className="w-full max-w-[720px] rounded-2xl border border-white/10 bg-black/20" />
              </div>
            ) : (
              <div className="h-[460px] rounded-2xl border border-dashed border-white/10 bg-black/20 flex items-center justify-center text-center px-6">
                <div>
                  <div className="text-4xl mb-3">🖼️</div>
                  <p className="text-gray-400">填写 token 和用户名后，点击“生成测试图片”</p>
                  <p className="text-xs text-gray-600 mt-2">这里会直接预览 `/api/integrations/circle` 返回的 PNG</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
