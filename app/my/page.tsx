"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type UserInfo = {
  ok: boolean;
  username: string;
  subscribed: boolean;
  role: string;
};

type HistoryItem = {
  id: string;
  username: string;
  display_name: string | null;
  avatar: string | null;
  status: string;
  tweet_count: number;
  top_count: number;
  created_at: number;
  logs: string;
  result: string | null;
};

export default function MyPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyError, setHistoryError] = useState<{ error: string; subscribed: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const meRes = await fetch("/api/user/me");
      const me = await meRes.json();
      if (!me.ok) {
        router.push("/login");
        return;
      }
      setUser(me);

      const hRes = await fetch("/api/user/history");
      if (hRes.status === 403) {
        const data = await hRes.json();
        setHistoryError(data);
      } else if (hRes.ok) {
        setHistory(await hRes.json());
      }
      setLoading(false);
    })();
  }, [router]);

  const logout = async () => {
    await fetch("/api/user/logout", { method: "POST" });
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="gradient-bg min-h-screen flex items-center justify-center">
        <div className="text-gray-400 text-sm">加载中...</div>
      </div>
    );
  }

  return (
    <div className="gradient-bg min-h-screen py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">我的主页</h1>
            <p className="text-gray-400 text-sm mt-0.5">
              👤 {user?.username}
              {user?.subscribed && (
                <span className="ml-2 text-xs bg-[#1d9bf0]/20 text-[#1d9bf0] px-2 py-0.5 rounded-full">
                  ✨ 订阅用户
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a href="/" className="text-gray-500 hover:text-white text-sm transition-colors">← 首页</a>
            <button
              onClick={logout}
              className="text-xs text-gray-600 hover:text-red-400 transition-colors border border-white/10 rounded-lg px-3 py-1.5"
            >
              退出登录
            </button>
          </div>
        </div>

        {/* History section */}
        <div className="card rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4">📊 我的分析历史</h2>

          {historyError ? (
            <div className="text-center py-10 space-y-4">
              <div className="text-4xl">🔒</div>
              <h3 className="text-lg font-semibold">需要订阅才能查看历史记录</h3>
              <p className="text-gray-500 text-sm max-w-xs mx-auto">
                升级订阅后即可访问：
              </p>
              <ul className="text-sm text-gray-400 space-y-1">
                <li>📂 保存所有分析历史</li>
                <li>🔁 随时回顾过往结果</li>
                <li>📈 追踪圈子变化趋势</li>
              </ul>
              <div className="pt-2">
                <a
                  href="/"
                  className="inline-block btn-primary px-6 py-2 rounded-xl text-sm font-semibold"
                >
                  升级订阅 ✨
                </a>
              </div>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-10 text-gray-600 text-sm">
              <p>暂无分析记录</p>
              <a href="/" className="text-[#1d9bf0] hover:underline mt-2 inline-block text-xs">
                去分析你的第一个圈子 →
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 bg-white/3 hover:bg-white/6 rounded-xl px-4 py-3 transition-colors"
                >
                  <a href={`/result/${item.id}`} className="contents group">
                    {item.avatar ? (
                      <img
                        src={item.avatar}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 text-lg">
                        🐱
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        @{item.username}
                        {item.display_name && (
                          <span className="text-gray-500 ml-1.5">{item.display_name}</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        {new Date(item.created_at).toLocaleString("zh-CN")}
                      </div>
                    </div>
                  </a>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      item.status === "done"
                        ? "bg-green-500/20 text-green-400"
                        : item.status === "error"
                        ? "bg-red-500/20 text-red-400"
                        : "bg-yellow-500/20 text-yellow-400"
                    }`}>
                      {item.status === "done" ? "✅ 完成" : item.status === "error" ? "❌ 失败" : "⏳ 进行中"}
                    </span>
                    <div className="flex items-center gap-2">
                      {item.status === "done" && (
                        <a
                          href={`/api/results/${item.id}/export`}
                          className="text-xs text-gray-400 hover:text-white transition-colors"
                        >
                          导出数据
                        </a>
                      )}
                      <a href={`/result/${item.id}`} className="text-xs text-[#1d9bf0] hover:underline">查看 →</a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
