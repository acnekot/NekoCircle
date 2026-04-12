"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const endpoint = tab === "login" ? "/api/user/login" : "/api/user/register";
      const body: Record<string, string> = { username, password };
      if (tab === "register" && email) body.email = email;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "操作失败");
        return;
      }
      router.push("/my");
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gradient-bg min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-1">🐱 NekoCircle</h1>
          <p className="text-gray-500 text-sm">你的 Twitter 互动圈分析工具</p>
        </div>

        <div className="card rounded-2xl p-6">
          {/* Tabs */}
          <div className="flex rounded-xl bg-white/5 p-1 mb-6">
            {(["login", "register"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(""); }}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                  tab === t ? "bg-[#1d9bf0] text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                {t === "login" ? "登录" : "注册"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">用户名</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                placeholder="输入用户名"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#1d9bf0] transition-colors text-sm"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={tab === "login" ? "current-password" : "new-password"}
                placeholder={tab === "register" ? "至少 6 位" : "输入密码"}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#1d9bf0] transition-colors text-sm"
              />
            </div>

            {tab === "register" && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">邮箱（可选）</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="your@email.com"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#1d9bf0] transition-colors text-sm"
                />
              </div>
            )}

            {error && (
              <p className="text-red-400 text-xs text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-3 rounded-xl font-semibold text-sm disabled:opacity-50"
            >
              {loading ? "处理中..." : tab === "login" ? "登录" : "注册"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-600 mt-4">
          <a href="/" className="hover:text-gray-400 transition-colors">← 返回首页</a>
        </p>
      </div>
    </div>
  );
}
