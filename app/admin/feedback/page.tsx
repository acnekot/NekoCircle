"use client";

import { useCallback, useEffect, useState } from "react";
import AdminNav from "@/components/AdminNav";
import Md3Icon from "@/components/Md3Icon";

type Feedback = {
  id: number;
  content: string;
  contact: string;
  locale: string;
  status: "new" | "reviewed";
  created_at: number;
};

export default function AdminFeedbackPage() {
  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/feedback", { cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "读取失败");
      setItems(Array.isArray(data) ? data : []);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function setReviewed(item: Feedback) {
    const status = item.status === "new" ? "reviewed" : "new";
    const response = await fetch(`/api/admin/feedback/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (response.ok) void load();
  }

  async function remove(item: Feedback) {
    if (!window.confirm("确定删除这条反馈？")) return;
    const response = await fetch(`/api/admin/feedback/${item.id}`, { method: "DELETE" });
    if (response.ok) void load();
  }

  const newCount = items.filter((item) => item.status === "new").length;

  return (
    <div className="gradient-bg min-h-screen px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <AdminNav />

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-white"><Md3Icon name="feedback" className="h-6 w-6 text-[#bec2ff]" />用户反馈</h1>
            <p className="mt-1 text-sm text-gray-500">共 {items.length} 条，{newCount} 条待处理</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="md3-tonal-button inline-flex items-center gap-2 disabled:opacity-50">
            <Md3Icon name="restart" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />刷新
          </button>
        </div>

        {error && <div className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
        {loading && items.length === 0 && <div className="card rounded-2xl p-10 text-center text-sm text-gray-500">正在读取反馈…</div>}
        {!loading && items.length === 0 && (
          <div className="card rounded-2xl p-10 text-center">
            <Md3Icon name="inbox" className="mx-auto h-10 w-10 text-gray-600" />
            <p className="mt-3 text-sm text-gray-500">暂时没有反馈</p>
          </div>
        )}

        <div className="space-y-3">
          {items.map((item) => (
            <article key={item.id} className={`card rounded-2xl border p-5 ${item.status === "new" ? "border-[#bec2ff]/25" : "border-white/5 opacity-75"}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className={`rounded-full px-2 py-1 ${item.status === "new" ? "bg-[#3c4278] text-[#dfe0ff]" : "bg-white/5 text-gray-500"}`}>{item.status === "new" ? "待处理" : "已处理"}</span>
                  <span>{item.locale.toUpperCase()}</span>
                  <span>{new Date(item.created_at).toLocaleString("zh-CN")}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => void setReviewed(item)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-gray-400 hover:bg-white/5 hover:text-white">
                    <Md3Icon name={item.status === "new" ? "check" : "restart"} className="h-3.5 w-3.5" />{item.status === "new" ? "标为已处理" : "重新打开"}
                  </button>
                  <button type="button" onClick={() => void remove(item)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-red-400/70 hover:bg-red-500/10 hover:text-red-300">
                    <Md3Icon name="delete" className="h-3.5 w-3.5" />删除
                  </button>
                </div>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-gray-200">{item.content}</p>
              {item.contact && (
                <p className="mt-3 flex items-center gap-2 border-t border-white/5 pt-3 text-xs text-gray-500">
                  <Md3Icon name="person" className="h-4 w-4" />联系方式：<span className="text-gray-300">{item.contact}</span>
                </p>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
