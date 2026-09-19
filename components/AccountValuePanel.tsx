"use client";

import { useMemo } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { estimateAccountValue } from "@/lib/account-value";
import type { CircleUser, SelfProfile } from "@/types/circle";

type Props = { self: SelfProfile; users: CircleUser[] };

function formatYen(value: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function AccountValuePanel({ self, users }: Props) {
  const { t } = useTranslation();
  const result = useMemo(() => estimateAccountValue(users, self), [self, users]);
  const metrics = [
    [t("extras.value.followers"), result.metrics.followers.toLocaleString()],
    [t("extras.value.tweets"), result.metrics.tweets.toLocaleString()],
    [t("extras.value.age"), result.metrics.accountAgeDays.toLocaleString()],
    [t("extras.value.users"), result.metrics.uniqueUsers.toLocaleString()],
    [t("extras.value.mentions"), result.metrics.totalMentions.toLocaleString()],
    [t("extras.value.score"), result.metrics.averageScore.toLocaleString()],
  ];

  return (
    <div className="card rounded-2xl p-6 text-center overflow-hidden relative">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-[#1d9bf0]/10 pointer-events-none" />
      <div className="relative">
        <p className="text-sm text-gray-500">@{self.screenName}</p>
        <h2 className="text-xl font-bold text-white mt-1">{t("extras.value.title")}</h2>
        <div className="text-4xl sm:text-5xl font-black text-emerald-400 mt-5 tracking-tight">
          {formatYen(result.estimatedPriceYen)}
        </div>
        <div className="inline-flex mt-3 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1 text-emerald-300 font-bold">
          {result.grade} {t("extras.value.grade")}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-6 text-left">
          {metrics.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-white/10 bg-black/15 p-3">
              <div className="text-xs text-gray-500">{label}</div>
              <div className="text-base font-semibold text-gray-200 mt-1">{value}</div>
            </div>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-gray-600 mt-5">{t("extras.value.disclaimer")}</p>
      </div>
    </div>
  );
}
