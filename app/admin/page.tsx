"use client";
import { useState, useEffect, useCallback } from "react";

type Settings = {
  api_key_set: boolean;
  top_count: string;
  tweet_limit: string;
  affinity_weight_reply_by_me: string;
  affinity_weight_replied_by_him: string;
  affinity_weight_quote_by_me: string;
  affinity_weight_quoted_by_him: string;
  affinity_weight_rt_by_me: string;
  affinity_weight_rted_by_him: string;
  affinity_weight_mention_by_me: string;
  affinity_weight_mentioned_by_him: string;
  affinity_decay_lambda: string;
  mock_mode: string;
  cache_ttl_tweets: string;
  cache_ttl_interactions: string;
  cache_ttl_mentions: string;
  analysis_cache_ttl: string;
  manual_slow_mode: string;
  manual_rate_ms: string;
};

type HistoryItem = {
  id: string;
  username: string;
  display_name: string | null;
  status: string;
  tweet_count: number;
  top_count: number;
  created_at: number;
};

type CacheStats = {
  cachedTweetSets: number;
  cachedInteractionSets: number;
  cachedMentionSets: number;
  totalInteractionUsers: number;
  oldestFetch: number | null;
  newestFetch: number | null;
};

type UserItem = {
  id: number;
  username: string;
  email: string;
  role: string;
  subscription: number;
  created_at: number;
};

export default function AdminPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState({
    api_key: "",
    admin_password: "",
    top_count: "30",
    tweet_limit: "20",
    affinity_weight_reply_by_me: "100",
    affinity_weight_replied_by_him: "40",
    affinity_weight_quote_by_me: "25",
    affinity_weight_quoted_by_him: "18",
    affinity_weight_rt_by_me: "15",
    affinity_weight_rted_by_him: "10",
    affinity_weight_mention_by_me: "8",
    affinity_weight_mentioned_by_him: "5",
    affinity_decay_lambda: "0.05",
    subscription_required: "1",
    subscription_name: "NekoCircle Pro",
    subscription_desc: "生成并保存互动圈，查看历史记录",
    mock_mode: "0",
    cache_ttl_tweets: "60",
    cache_ttl_interactions: "360",
    cache_ttl_mentions: "120",
    analysis_cache_ttl: "120",
    manual_slow_mode: "0",
    manual_rate_ms: "1000",
  });
  const [saveMsg, setSaveMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [cacheMsg, setCacheMsg] = useState("");
  const [users, setUsers] = useState<UserItem[]>([]);

  const loadCacheStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/cache");
      setCacheStats(await res.json());
    } catch { /* ignore */ }
  }, []);

  const loadSettings = async () => {
    const res = await fetch("/api/admin/settings");
    const data = await res.json();
    setSettings(data);
    setForm((prev) => ({
      ...prev,
      top_count: data.top_count ?? "30",
      tweet_limit: data.tweet_limit ?? "20",
      affinity_weight_reply_by_me: data.affinity_weight_reply_by_me ?? "100",
      affinity_weight_replied_by_him: data.affinity_weight_replied_by_him ?? "40",
      affinity_weight_quote_by_me: data.affinity_weight_quote_by_me ?? "25",
      affinity_weight_quoted_by_him: data.affinity_weight_quoted_by_him ?? "18",
      affinity_weight_rt_by_me: data.affinity_weight_rt_by_me ?? "15",
      affinity_weight_rted_by_him: data.affinity_weight_rted_by_him ?? "10",
      affinity_weight_mention_by_me: data.affinity_weight_mention_by_me ?? "8",
      affinity_weight_mentioned_by_him: data.affinity_weight_mentioned_by_him ?? "5",
      affinity_decay_lambda: data.affinity_decay_lambda ?? "0.05",
      subscription_required: data.subscription_required ?? "1",
      subscription_name: data.subscription_name ?? "NekoCircle Pro",
      subscription_desc: data.subscription_desc ?? "生成并保存互动圈，查看历史记录",
      mock_mode: data.mock_mode ?? "0",
      cache_ttl_tweets: data.cache_ttl_tweets ?? "60",
      cache_ttl_interactions: data.cache_ttl_interactions ?? "360",
      cache_ttl_mentions: data.cache_ttl_mentions ?? "120",
      analysis_cache_ttl: data.analysis_cache_ttl ?? "120",
      manual_slow_mode: data.manual_slow_mode ?? "0",
      manual_rate_ms: data.manual_rate_ms ?? "1000",
    }));
  };

  const loadHistory = async () => {
    const res = await fetch("/api/admin/history");
    const data = await res.json();
    setHistory(data);
  };

  const loadUsers = async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) setUsers(await res.json());
  };

  const toggleSubscription = async (user: UserItem) => {
    await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscribed: user.subscription !== 1 }),
    });
    loadUsers();
  };

  const clearCache = async () => {
    setCacheMsg("清空中...");
    await fetch("/api/admin/cache", { method: "DELETE" });
    await loadCacheStats();
    setCacheMsg("✅ 缓存已清空");
    setTimeout(() => setCacheMsg(""), 3000);
  };

  const evictCache = async () => {
    setCacheMsg("清理过期数据...");
    const res = await fetch("/api/admin/cache?evict=1&days=7", { method: "DELETE" });
    const data = await res.json();
    await loadCacheStats();
    setCacheMsg(`✅ 清理了 ${data.removed} 条过期记录`);
    setTimeout(() => setCacheMsg(""), 3000);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg("");
    const payload: Record<string, string> = {};
    Object.entries(form).forEach(([k, v]) => { if (v) payload[k] = v; });
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    if (data.ok) {
      setSaveMsg("✅ 保存成功");
      loadSettings();
      setTimeout(() => setSaveMsg(""), 3000);
    } else {
      setSaveMsg("❌ " + (data.error ?? "保存失败"));
    }
  };

  const deleteItem = async (id: string) => {
    if (!confirm("确认删除？")) return;
    await fetch("/api/admin/history", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadHistory();
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  };

  useEffect(() => {
    loadSettings();
    loadHistory();
    loadCacheStats();
    loadUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="gradient-bg min-h-screen py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">⚙️ 管理后台</h1>
          <div className="flex items-center gap-3">
            <a href="/api-test" className="text-gray-500 hover:text-white text-sm transition-colors">🧪 API 测试</a>
            <a href="/stats" className="text-gray-500 hover:text-white text-sm transition-colors">📊 统计</a>
            <a href="/" className="text-gray-500 hover:text-white text-sm transition-colors">← 首页</a>
            <button onClick={logout} className="text-xs text-gray-600 hover:text-red-400 transition-colors border border-white/10 rounded-lg px-3 py-1.5">
              退出登录
            </button>
          </div>
        </div>

        {/* Settings Form */}
        <div className="card rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-6">基本配置</h2>
          <form onSubmit={save} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className="block text-sm text-gray-400 mb-1">
                  API Key (twitterapi.io)
                  {settings?.api_key_set && <span className="ml-2 text-green-400 text-xs">✅ 已配置</span>}
                </label>
                <input
                  type="password"
                  value={form.api_key}
                  onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                  placeholder="输入新 API Key（留空则不修改）"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#1d9bf0] transition-colors text-sm"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">推文抓取数量</label>
                <input
                  type="number"
                  min={20}
                  max={200}
                  value={form.tweet_limit}
                  onChange={(e) => setForm({ ...form, tweet_limit: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#1d9bf0] transition-colors text-sm"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">默认 Top 展示人数</label>
                <input
                  type="number"
                  min={10}
                  max={50}
                  value={form.top_count}
                  onChange={(e) => setForm({ ...form, top_count: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#1d9bf0] transition-colors text-sm"
                />
              </div>

            </div>

            <div className="space-y-3">
              <div>
                <h3 className="text-sm text-gray-400 mb-3">亲密度算法配置</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { key: "affinity_weight_reply_by_me" as const, label: "我回复他", color: "text-blue-400" },
                    { key: "affinity_weight_replied_by_him" as const, label: "他回复我", color: "text-blue-300" },
                    { key: "affinity_weight_quote_by_me" as const, label: "我引用他", color: "text-purple-400" },
                    { key: "affinity_weight_quoted_by_him" as const, label: "他引用我", color: "text-purple-300" },
                    { key: "affinity_weight_rt_by_me" as const, label: "我转他", color: "text-green-400" },
                    { key: "affinity_weight_rted_by_him" as const, label: "他转我", color: "text-green-300" },
                    { key: "affinity_weight_mention_by_me" as const, label: "我提及他", color: "text-pink-400" },
                    { key: "affinity_weight_mentioned_by_him" as const, label: "他提及我", color: "text-pink-300" },
                  ].map(({ key, label, color }) => (
                    <div key={key}>
                      <label className={`block text-xs ${color} mb-1`}>{label} 权重</label>
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={form[key]}
                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-[#1d9bf0] transition-colors text-sm text-center"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">时间衰减 λ</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={form.affinity_decay_lambda}
                    onChange={(e) => setForm({ ...form, affinity_decay_lambda: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-[#1d9bf0] transition-colors text-sm text-center"
                  />
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-gray-500 leading-relaxed">
                算法按互动方向独立计权：主动互动权重更高，被动次之，叠加时间衰减后直接求和。
                <span className="text-gray-400"> 点赞</span> 因平台隐私策略已不稳定开放，不作为算分项。
              </div>
            </div>

            {/* Mock Mode Toggle */}
            <div className="flex items-center justify-between p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
              <div>
                <div className="text-sm font-medium text-yellow-400">🧪 测试模式 (Mock)</div>
                <div className="text-xs text-gray-500 mt-0.5">启用后使用假数据，无需消耗 API 额度，用于调试流程</div>
              </div>
              <button
                type="button"
                onClick={() => setForm({ ...form, mock_mode: form.mock_mode === "1" ? "0" : "1" })}
                className={`relative w-12 h-6 rounded-full transition-colors ${form.mock_mode === "1" ? "bg-yellow-500" : "bg-white/10"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.mock_mode === "1" ? "translate-x-6" : ""}`} />
              </button>
            </div>

            {/* Manual Rate Limit */}
            <div className="p-4 bg-orange-500/5 border border-orange-500/20 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-orange-400">🐢 主动限速</div>
                  <div className="text-xs text-gray-500 mt-0.5">无需等 429，强制每次 API 调用间隔固定时间，防止积分跑太快</div>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, manual_slow_mode: form.manual_slow_mode === "1" ? "0" : "1" })}
                  className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${form.manual_slow_mode === "1" ? "bg-orange-500" : "bg-white/10"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.manual_slow_mode === "1" ? "translate-x-6" : ""}`} />
                </button>
              </div>
              {form.manual_slow_mode === "1" && (
                <div className="flex items-center gap-3">
                  <label className="text-xs text-gray-400 whitespace-nowrap">每次调用间隔（ms）</label>
                  <input
                    type="number" min="200" max="10000" step="100"
                    value={form.manual_rate_ms}
                    onChange={e => setForm({ ...form, manual_rate_ms: e.target.value })}
                    className="w-28 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-orange-400/50"
                  />
                  <span className="text-xs text-gray-600">
                    ≈ {form.manual_rate_ms ? Math.round(60000 / parseInt(form.manual_rate_ms)) : 0} 次/分钟
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-4">
              <button
                type="submit"
                disabled={saving}
                className="btn-primary px-8 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50"
              >
                {saving ? "保存中..." : "保存设置"}
              </button>
              {saveMsg && <span className="text-sm">{saveMsg}</span>}
            </div>
          </form>
        </div>

        {/* Cache Management */}
        <div className="card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">💾 本地缓存</h2>
            <button onClick={loadCacheStats} className="text-gray-500 hover:text-white text-sm transition-colors">🔄 刷新</button>
          </div>

          {/* Stats grid */}
          {cacheStats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              {[
                { label: "缓存用户推文", val: cacheStats.cachedTweetSets, color: "text-cyan-400" },
                { label: "互动集合", val: cacheStats.cachedInteractionSets, color: "text-green-400" },
                { label: "互动用户记录", val: cacheStats.totalInteractionUsers, color: "text-purple-400" },
                { label: "Mention集合", val: cacheStats.cachedMentionSets, color: "text-pink-400" },
              ].map(s => (
                <div key={s.label} className="bg-white/5 rounded-xl p-3 text-center">
                  <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          )}
          {cacheStats?.newestFetch && (
            <p className="text-xs text-gray-600 mb-4">
              最新缓存：{new Date(cacheStats.newestFetch).toLocaleString("zh-CN")}
              {cacheStats.oldestFetch && ` · 最早：${new Date(cacheStats.oldestFetch).toLocaleString("zh-CN")}`}
            </p>
          )}

          {/* TTL settings */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {[
              { key: "analysis_cache_ttl" as const, label: "✨ 分析结果缓存（分钟）" },
              { key: "cache_ttl_tweets" as const, label: "推文列表 TTL（分钟）" },
              { key: "cache_ttl_interactions" as const, label: "互动数据 TTL（分钟）" },
              { key: "cache_ttl_mentions" as const, label: "Mention TTL（分钟）" },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                <input
                  type="number" min="5" value={form[key]}
                  onChange={e => setForm({ ...form, [key]: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <button onClick={evictCache}
              className="px-4 py-2 rounded-xl text-sm bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10 transition-all">
              🧹 清理 7 天前旧数据
            </button>
            <button onClick={clearCache}
              className="px-4 py-2 rounded-xl text-sm bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-all">
              🗑 清空全部缓存
            </button>
            {cacheMsg && <span className="text-sm text-gray-400">{cacheMsg}</span>}
          </div>
        </div>

        {/* Subscription Config */}
        <div className="card rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-5">💎 订阅配置</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
              <div>
                <div className="text-sm font-medium text-blue-300">需要订阅才能生成</div>
                <div className="text-xs text-gray-500 mt-0.5">关闭后所有登录用户均可生成</div>
              </div>
              <button
                type="button"
                onClick={() => setForm({ ...form, subscription_required: form.subscription_required === "1" ? "0" : "1" })}
                className={`relative w-12 h-6 rounded-full transition-colors ${form.subscription_required === "1" ? "bg-blue-500" : "bg-white/10"}`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${form.subscription_required === "1" ? "left-7" : "left-1"}`} />
              </button>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">订阅方案名称</label>
              <input
                type="text"
                value={form.subscription_name}
                onChange={(e) => setForm({ ...form, subscription_name: e.target.value })}
                placeholder="NekoCircle Pro"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#1d9bf0] transition-colors text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">订阅说明文案</label>
              <input
                type="text"
                value={form.subscription_desc}
                onChange={(e) => setForm({ ...form, subscription_desc: e.target.value })}
                placeholder="生成并保存互动圈，查看历史记录"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#1d9bf0] transition-colors text-sm"
              />
            </div>
            <button
              type="button"
              onClick={async () => {
                setSaving(true);
                const res = await fetch("/api/admin/settings", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    subscription_required: form.subscription_required,
                    subscription_name: form.subscription_name,
                    subscription_desc: form.subscription_desc,
                  }),
                });
                const data = await res.json();
                setSaving(false);
                setSaveMsg(data.ok ? "✅ 订阅配置已保存" : "❌ " + (data.error ?? "保存失败"));
                setTimeout(() => setSaveMsg(""), 3000);
              }}
              disabled={saving}
              className="px-5 py-2 rounded-xl text-sm bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 transition-all"
            >
              保存订阅配置
            </button>
            {saveMsg && <span className="text-sm text-gray-400 ml-3">{saveMsg}</span>}
          </div>
        </div>

        {/* History */}
        <div className="card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">分析历史</h2>
            <button onClick={loadHistory} className="text-gray-500 hover:text-white text-sm transition-colors">
              🔄 刷新
            </button>
          </div>
          {history.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-6">暂无历史记录</p>
          ) : (
            <div className="space-y-2">
              {history.map((item) => (
                <div key={item.id} className="flex items-center gap-3 bg-white/3 rounded-xl px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">
                      @{item.username}
                      {item.display_name && <span className="text-gray-500 ml-2">{item.display_name}</span>}
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5">
                      {new Date(item.created_at).toLocaleString("zh-CN")} ·{" "}
                      {item.tweet_count > 0 ? `${item.tweet_count}条推文` : ""}
                      {" "}·{" "}
                      <span className={
                        item.status === "done" ? "text-green-400" :
                        item.status === "error" ? "text-red-400" :
                        "text-yellow-400"
                      }>
                        {item.status === "done" ? "✅ 完成" : item.status === "error" ? "❌ 失败" : "⏳ 进行中"}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {item.status === "done" && (
                      <>
                        <a
                          href={`/api/results/${item.id}/export`}
                          className="text-xs text-gray-400 hover:text-white"
                        >
                          导出
                        </a>
                        <a
                          href={`/result/${item.id}`}
                          className="text-xs text-[#1d9bf0] hover:underline"
                        >
                          查看
                        </a>
                      </>
                    )}
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="text-xs text-red-500 hover:text-red-400"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* User Management */}
        <div className="card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">👥 用户管理</h2>
            <button onClick={loadUsers} className="text-gray-500 hover:text-white text-sm transition-colors">🔄 刷新</button>
          </div>
          {users.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-6">暂无注册用户</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-white/10">
                    <th className="pb-2 pr-4">用户名</th>
                    <th className="pb-2 pr-4">邮箱</th>
                    <th className="pb-2 pr-4">角色</th>
                    <th className="pb-2 pr-4">订阅状态</th>
                    <th className="pb-2 pr-4">注册时间</th>
                    <th className="pb-2">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-white/3 transition-colors">
                      <td className="py-2.5 pr-4 font-medium">{u.username}</td>
                      <td className="py-2.5 pr-4 text-gray-500 text-xs">{u.email || "—"}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          u.role === "admin" ? "bg-purple-500/20 text-purple-400" : "bg-white/10 text-gray-400"
                        }`}>
                          {u.role === "admin" ? "管理员" : "用户"}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          u.subscription === 1 ? "bg-[#1d9bf0]/20 text-[#1d9bf0]" : "bg-white/5 text-gray-600"
                        }`}>
                          {u.subscription === 1 ? "✨ 已订阅" : "免费"}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-gray-600">
                        {new Date(u.created_at).toLocaleString("zh-CN")}
                      </td>
                      <td className="py-2.5">
                        <button
                          onClick={() => toggleSubscription(u)}
                          className={`text-xs px-3 py-1 rounded-lg border transition-all ${
                            u.subscription === 1
                              ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
                              : "border-[#1d9bf0]/30 text-[#1d9bf0] hover:bg-[#1d9bf0]/10"
                          }`}
                        >
                          {u.subscription === 1 ? "取消订阅" : "开启订阅"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
