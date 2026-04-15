"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Announcement = {
  id: number;
  title: string;
  content: string;
  type: string;
  active: number;
  pinned: number;
  locale: string;
  created_at: number;
  updated_at: number;
};

type EditingAnnouncement = {
  title: string;
  content: string;
  type: string;
  locale: string;
};

export default function AdminPage() {
  const router = useRouter();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // New announcement form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EditingAnnouncement>({ title: "", content: "", type: "info", locale: "all" });
  const [submitting, setSubmitting] = useState(false);

  // Editing
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditingAnnouncement>({ title: "", content: "", type: "info", locale: "all" });

  // Password change
  const [showPwForm, setShowPwForm] = useState(false);
  const [pwOld, setPwOld] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [pwSubmitting, setPwSubmitting] = useState(false);

  const fetchAnnouncements = () => {
    setLoading(true);
    fetch("/api/admin/announcements")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setAnnouncements(data);
        setLoading(false);
      })
      .catch(() => { setError("加载失败"); setLoading(false); });
  };

  useEffect(() => { fetchAnnouncements(); }, []);

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "创建失败"); return; }
      setForm({ title: "", content: "", type: "info", locale: "all" });
      setShowForm(false);
      fetchAnnouncements();
    } catch { setError("网络错误"); }
    finally { setSubmitting(false); }
  };

  const handleUpdate = async (id: number) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/announcements/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "更新失败"); return; }
      setEditingId(null);
      fetchAnnouncements();
    } catch { setError("网络错误"); }
    finally { setSubmitting(false); }
  };

  const handleToggleActive = async (a: Announcement) => {
    await fetch(`/api/admin/announcements/${a.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: a.active === 1 ? 0 : 1 }),
    });
    fetchAnnouncements();
  };

  const handleTogglePinned = async (a: Announcement) => {
    await fetch(`/api/admin/announcements/${a.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: a.pinned === 1 ? 0 : 1 }),
    });
    fetchAnnouncements();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定删除这条公告？")) return;
    await fetch(`/api/admin/announcements/${id}`, { method: "DELETE" });
    fetchAnnouncements();
  };

  const handleLogout = async () => {
    document.cookie = "neko_admin=; path=/; max-age=0";
    router.push("/admin/login");
    router.refresh();
  };

  const handleChangePassword = async () => {
    setPwMsg(""); setPwErr("");
    if (!pwOld || !pwNew || !pwConfirm) { setPwErr("请填写所有字段"); return; }
    if (pwNew.length < 6) { setPwErr("新密码至少 6 位"); return; }
    if (pwNew !== pwConfirm) { setPwErr("两次输入的新密码不一致"); return; }
    setPwSubmitting(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword: pwOld, newPassword: pwNew }),
      });
      const data = await res.json();
      if (!res.ok) { setPwErr(data.error ?? "修改失败"); return; }
      setPwMsg("密码修改成功！");
      setPwOld(""); setPwNew(""); setPwConfirm("");
      setTimeout(() => { setShowPwForm(false); setPwMsg(""); }, 1500);
    } catch { setPwErr("网络错误"); }
    finally { setPwSubmitting(false); }
  };

  const typeOptions = [
    { value: "info", label: "ℹ️ 信息", color: "text-blue-400" },
    { value: "warning", label: "⚠️ 警告", color: "text-amber-400" },
    { value: "success", label: "✅ 成功", color: "text-green-400" },
  ];

  const localeOptions = [
    { value: "all", label: "🌐 所有语言" },
    { value: "zh", label: "🇨🇳 中文" },
    { value: "en", label: "🇺🇸 English" },
    { value: "ja", label: "🇯🇵 日本語" },
  ];

  return (
    <div className="gradient-bg min-h-screen py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">📢 公告管理</h1>
            <p className="text-sm text-gray-500 mt-1">管理首页公告展示</p>
          </div>
          <div className="flex items-center gap-3">
            <a href="/" className="text-gray-500 hover:text-white text-sm transition-colors">← 首页</a>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-600 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg border border-white/10 hover:border-red-500/30"
            >
              退出登录
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError("")} className="text-red-400/50 hover:text-red-400">✕</button>
          </div>
        )}

        {/* New announcement button + form */}
        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="w-full py-3 rounded-xl text-sm font-medium bg-[#1d9bf0]/10 text-[#1d9bf0] hover:bg-[#1d9bf0]/20 border border-[#1d9bf0]/20 transition-all"
          >
            + 新建公告
          </button>
        ) : (
          <div className="card rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">新建公告</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-600 hover:text-gray-400 text-sm">取消</button>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1.5">标题 *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="公告标题"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-[#1d9bf0] transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1.5">内容（可选）</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="公告详细内容..."
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-[#1d9bf0] transition-colors resize-none"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1.5">类型</label>
              <div className="flex gap-2">
                {typeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setForm({ ...form, type: opt.value })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      form.type === opt.value
                        ? "bg-white/10 border-white/20 text-white"
                        : "bg-white/3 border-white/5 text-gray-500 hover:bg-white/5"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1.5">显示语言</label>
              <div className="flex gap-2">
                {localeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setForm({ ...form, locale: opt.value })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      form.locale === opt.value
                        ? "bg-white/10 border-white/20 text-white"
                        : "bg-white/3 border-white/5 text-gray-500 hover:bg-white/5"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleCreate}
              disabled={submitting || !form.title.trim()}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[#1d9bf0] hover:bg-[#1a8cd8] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? "创建中..." : "创建公告"}
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="card rounded-2xl p-8 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white/10 border-t-[#1d9bf0] rounded-full animate-spin" />
          </div>
        )}

        {/* List */}
        {!loading && announcements.length === 0 && (
          <div className="card rounded-2xl p-8 text-center">
            <div className="text-3xl mb-3">📭</div>
            <p className="text-gray-500 text-sm">暂无公告</p>
          </div>
        )}

        {!loading && announcements.length > 0 && (
          <div className="space-y-3">
            {announcements.map((a) => (
              <div key={a.id} className="card rounded-2xl p-4">
                {editingId === a.id ? (
                  /* ── Edit mode ── */
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-[#1d9bf0] transition-colors"
                    />
                    <textarea
                      value={editForm.content}
                      onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                      rows={2}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-[#1d9bf0] transition-colors resize-none"
                    />
                    <div className="flex gap-2">
                      {typeOptions.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setEditForm({ ...editForm, type: opt.value })}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            editForm.type === opt.value
                              ? "bg-white/10 border-white/20 text-white"
                              : "bg-white/3 border-white/5 text-gray-500 hover:bg-white/5"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      {localeOptions.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setEditForm({ ...editForm, locale: opt.value })}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            editForm.locale === opt.value
                              ? "bg-white/10 border-white/20 text-white"
                              : "bg-white/3 border-white/5 text-gray-500 hover:bg-white/5"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-300 border border-white/10 transition-all"
                      >
                        取消
                      </button>
                      <button
                        onClick={() => handleUpdate(a.id)}
                        disabled={submitting}
                        className="px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-[#1d9bf0] hover:bg-[#1a8cd8] disabled:opacity-50 transition-all"
                      >
                        {submitting ? "保存中..." : "保存"}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Display mode ── */
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-sm font-semibold text-white">{a.title}</span>
                          {a.pinned === 1 && <span className="text-xs" title="置顶">📌</span>}
                          <span className={`text-xs px-1.5 py-0.5 rounded border ${
                            a.type === "warning" ? "border-amber-500/30 text-amber-400 bg-amber-500/10"
                            : a.type === "success" ? "border-green-500/30 text-green-400 bg-green-500/10"
                            : "border-blue-500/30 text-blue-400 bg-blue-500/10"
                          }`}>
                            {a.type === "warning" ? "⚠️ 警告" : a.type === "success" ? "✅ 成功" : "ℹ️ 信息"}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded border ${
                            a.active === 1
                              ? "border-green-500/30 text-green-400 bg-green-500/10"
                              : "border-gray-500/30 text-gray-500 bg-gray-500/10"
                          }`}>
                            {a.active === 1 ? "显示中" : "已隐藏"}
                          </span>
                          <span className="text-xs px-1.5 py-0.5 rounded border border-purple-500/30 text-purple-400 bg-purple-500/10">
                            {a.locale === "zh" ? "🇨🇳 中文" : a.locale === "en" ? "🇺🇸 EN" : a.locale === "ja" ? "🇯🇵 日本語" : "🌐 全部"}
                          </span>
                        </div>
                        {a.content && (
                          <p className="text-xs text-gray-500 leading-relaxed mt-1 whitespace-pre-line">{a.content}</p>
                        )}
                        <p className="text-xs text-gray-700 mt-2">
                          创建 {new Date(a.created_at).toLocaleString("zh-CN")}
                          {a.updated_at !== a.created_at && ` · 更新 ${new Date(a.updated_at).toLocaleString("zh-CN")}`}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
                      <button
                        onClick={() => { setEditingId(a.id); setEditForm({ title: a.title, content: a.content, type: a.type, locale: a.locale || "all" }); }}
                        className="text-xs text-gray-500 hover:text-white px-2.5 py-1 rounded-lg hover:bg-white/5 transition-all"
                      >
                        ✏️ 编辑
                      </button>
                      <button
                        onClick={() => handleToggleActive(a)}
                        className="text-xs text-gray-500 hover:text-white px-2.5 py-1 rounded-lg hover:bg-white/5 transition-all"
                      >
                        {a.active === 1 ? "🔴 隐藏" : "🟢 显示"}
                      </button>
                      <button
                        onClick={() => handleTogglePinned(a)}
                        className="text-xs text-gray-500 hover:text-white px-2.5 py-1 rounded-lg hover:bg-white/5 transition-all"
                      >
                        {a.pinned === 1 ? "📌 取消置顶" : "📌 置顶"}
                      </button>
                      <div className="flex-1" />
                      <button
                        onClick={() => handleDelete(a.id)}
                        className="text-xs text-red-500/60 hover:text-red-400 px-2.5 py-1 rounded-lg hover:bg-red-500/5 transition-all"
                      >
                        🗑️ 删除
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Password change */}
        <div className="card rounded-2xl overflow-hidden">
          <button
            onClick={() => { setShowPwForm(!showPwForm); setPwErr(""); setPwMsg(""); }}
            className="w-full px-5 py-4 flex items-center justify-between text-sm font-semibold hover:bg-white/3 transition-colors"
          >
            <span>🔑 修改密码</span>
            <svg className={`w-4 h-4 text-gray-500 transition-transform ${showPwForm ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>
          {showPwForm && (
            <div className="px-5 pb-5 space-y-3 border-t border-white/5 pt-4">
              {pwMsg && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-2.5 text-green-400 text-sm">{pwMsg}</div>
              )}
              {pwErr && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5 text-red-400 text-sm">{pwErr}</div>
              )}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">旧密码</label>
                <input
                  type="password"
                  value={pwOld}
                  onChange={(e) => setPwOld(e.target.value)}
                  placeholder="请输入当前密码"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-[#1d9bf0] transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">新密码</label>
                <input
                  type="password"
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  placeholder="至少 6 位"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-[#1d9bf0] transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">确认新密码</label>
                <input
                  type="password"
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  placeholder="再次输入新密码"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-[#1d9bf0] transition-colors"
                />
              </div>
              <button
                onClick={handleChangePassword}
                disabled={pwSubmitting}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[#1d9bf0] hover:bg-[#1a8cd8] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {pwSubmitting ? "修改中..." : "确认修改"}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-700 pt-4">
          NekoCircle 管理后台 · 公告管理
        </p>
      </div>
    </div>
  );
}
