"use client";

import { useState } from "react";
import type { InteractionUser } from "@/lib/circle-convert";

type Props = {
  topUsers: InteractionUser[];
};

export default function FindYourself({ topUsers }: Props) {
  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState<{
    found: boolean;
    rank?: number;
    user?: InteractionUser;
  } | null>(null);

  const handleSearch = () => {
    const q = query.trim().replace(/^@+/, "").toLowerCase();
    if (!q) return;
    const idx = topUsers.findIndex(
      (u) => u.user.userName.toLowerCase() === q
    );
    if (idx >= 0) {
      setSearchResult({ found: true, rank: idx + 1, user: topUsers[idx] });
    } else {
      setSearchResult({ found: false });
    }
  };

  return (
    <div className="card rounded-2xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
        <span>🔍</span> 查找自我
      </h3>
      <p className="text-xs text-gray-500 leading-relaxed">
        输入你的 X/Twitter 用户名，查看你是否在这个圈子中
      </p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">@</span>
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSearchResult(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            placeholder="用户名"
            className="w-full pl-7 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-600 outline-none focus:border-white/30 transition-colors"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={!query.trim()}
          className="px-3 py-2 rounded-xl text-sm font-medium bg-[#1d9bf0]/20 text-[#1d9bf0] hover:bg-[#1d9bf0]/30 border border-[#1d9bf0]/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          搜索
        </button>
      </div>

      {/* Result */}
      {searchResult && (
        <div className={`rounded-xl p-3 text-sm ${
          searchResult.found
            ? "bg-green-500/10 border border-green-500/20"
            : "bg-white/5 border border-white/10"
        }`}>
          {searchResult.found && searchResult.user ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-green-400 font-bold text-lg">🎉</span>
                <span className="text-green-400 font-medium">
                  你在第 {searchResult.rank} 位！
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-700 overflow-hidden shrink-0">
                  {searchResult.user.user.profilePicture ? (
                    <img
                      src={searchResult.user.user.profilePicture}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm font-bold text-gray-400">
                      {searchResult.user.user.userName[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white text-sm truncate">
                    {searchResult.user.user.name}
                  </div>
                  <div className="text-gray-500 text-xs">
                    @{searchResult.user.user.userName}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-yellow-400 font-bold font-mono text-sm">
                    {searchResult.user.score.toFixed(1)}
                  </div>
                  <div className="text-gray-600 text-xs">分数</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-gray-400">
              <span>😿</span>
              <span>未在此圈子中找到 @{query.trim().replace(/^@+/, "")}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
