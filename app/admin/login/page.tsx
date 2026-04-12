"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [mode, setMode]       = useState<"login" | "setup" | "loading">("loading");
  const [password, setPassword] = useState("");
  const [error, setError]     = useState("");
  const [busy, setBusy]       = useState(false);

  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((d) => setMode(d.hasAdmin ? "login" : "setup"))
      .catch(() => setMode("login"));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res  = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "操作失败"); return; }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("网络错误");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "loading") {
    return (
      <div className="gradient-bg min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="gradient-bg min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <svg className="w-7 h-7 text-[#1d9bf0]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            <span className="text-xl font-bold text-white">NekoCircle</span>
          </div>
          <p className="text-gray-500 text-sm">
            {mode === "setup" ? "首次使用，设置管理员密码" : "管理后台"}
          </p>
        </div>

        <div className="card rounded-2xl p-6">
          <h2 className="text-base font-semibold text-white mb-5">
            {mode === "setup" ? "🔑 初始化设置" : "🔐 管理员登录"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">
                {mode === "setup" ? "设置管理员密码" : "管理员密码"}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "setup" ? "至少 6 位" : "••••••••"}
                autoComplete={mode === "setup" ? "new-password" : "current-password"}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-[#1d9bf0] transition-colors"
                disabled={busy}
                required
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !password}
              className="btn-primary w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {busy ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  处理中...
                </span>
              ) : mode === "setup" ? "设置密码并进入" : "登录"}
            </button>
          </form>

          {mode === "login" && (
            <p className="text-xs text-gray-700 text-center mt-4">
              管理后台使用独立密码，与用户账号无关
            </p>
          )}
        </div>

        <div className="mt-4 text-center">
          <a href="/" className="text-gray-600 hover:text-gray-400 text-xs transition-colors">← 返回首页</a>
        </div>
      </div>
    </div>
  );
}
