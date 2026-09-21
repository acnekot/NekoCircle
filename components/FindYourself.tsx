"use client";

import { useState } from "react";
import AvatarImage from "@/components/AvatarImage";
import Md3Icon from "@/components/Md3Icon";
import type { InteractionUser } from "@/lib/circle-convert";
import { useTranslation } from "@/components/LocaleProvider";

type Props = {
  topUsers: InteractionUser[];
  ownerUsername?: string;
  onHighlight?: (username: string | null) => void;
};

export default function FindYourself({ topUsers, ownerUsername, onHighlight }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState<{
    found: boolean;
    rank?: number;
    user?: InteractionUser;
    isSelf?: boolean;
  } | null>(null);

  const handleSearch = () => {
    const q = query.trim().replace(/^@+/, "").toLowerCase();
    if (!q) {
      onHighlight?.(null);
      return;
    }
    // 检测是否搜索的是圈主自己
    if (ownerUsername && q === ownerUsername.replace(/^@+/, "").toLowerCase()) {
      setSearchResult({ found: false, isSelf: true });
      onHighlight?.(ownerUsername);
      return;
    }
    const idx = topUsers.findIndex(
      (u) => u.user.userName.toLowerCase() === q
    );
    if (idx >= 0) {
      setSearchResult({ found: true, rank: idx + 1, user: topUsers[idx] });
      onHighlight?.(topUsers[idx].user.userName);
    } else {
      setSearchResult({ found: false });
      onHighlight?.(null);
    }
  };

  return (
    <div className="card rounded-2xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
        <Md3Icon name="search" className="h-4 w-4 text-[#bec2ff]" /> {t("find.title")}
      </h3>
      <p className="text-xs text-gray-500 leading-relaxed">
        {t("find.desc")}
      </p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">@</span>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchResult(null);
              onHighlight?.(null);
            }}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            placeholder={t("find.placeholder")}
            className="w-full pl-7 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-600 outline-none focus:border-white/30 transition-colors"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={!query.trim()}
          className="px-4 py-2 rounded-full text-sm font-medium bg-[#3c4278] text-[#dfe0ff] hover:bg-[#4b528c] border border-[#bec2ff]/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          {t("find.search")}
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
                <Md3Icon name="check" className="h-5 w-5 text-green-400" />
                <span className="text-green-400 font-medium">
                  {t("find.rankResult", { rank: searchResult.rank ?? 0 })}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-700 overflow-hidden shrink-0">
                  <AvatarImage
                    hdUrl={searchResult.user.user.profilePicture}
                    name={searchResult.user.user.userName}
                    imgClassName="w-full h-full object-cover"
                    fallbackClassName="w-full h-full flex items-center justify-center text-sm font-bold text-gray-400"
                  />
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
                  <div className="text-gray-600 text-xs">{t("find.score")}</div>
                </div>
              </div>
            </div>
          ) : searchResult.isSelf ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-gray-400">
                <Md3Icon name="sad" className="h-4 w-4" />
                <span>{t("find.selfJoke1")}</span>
              </div>
              <div className="flex items-center gap-2 text-amber-400">
                <Md3Icon name="sparkle" className="h-4 w-4" />
                <span>{t("find.selfJoke2")}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-gray-400">
              <Md3Icon name="sad" className="h-4 w-4" />
              <span>{t("find.notFound", { name: query.trim().replace(/^@+/, "") })}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
