"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import {
  DIAGNOSIS_DEFS,
  generateDiagnosisPrompt,
  type DiagnosisType,
} from "@/lib/ai-prompts";
import type { CircleUser, SelfProfile } from "@/types/circle";

type Props = { self: SelfProfile; users: CircleUser[] };

const AI_APPS = [
  ["ChatGPT", "https://chatgpt.com/"],
  ["Claude", "https://claude.ai/"],
  ["Gemini", "https://gemini.google.com/"],
  ["DeepSeek", "https://chat.deepseek.com/"],
  ["Grok", "https://x.com/i/grok"],
] as const;

export default function AIDiagnosisPanel({ self, users }: Props) {
  const { locale, t } = useTranslation();
  const [selected, setSelected] = useState<DiagnosisType | null>(null);
  const [partner, setPartner] = useState("");
  const [copied, setCopied] = useState(false);
  const definition = DIAGNOSIS_DEFS.find((item) => item.id === selected);
  const prompt = useMemo(
    () =>
      selected
        ? generateDiagnosisPrompt(
            selected,
            locale,
            self.screenName,
            users,
            definition?.needsPartner ? partner || undefined : undefined,
          )
        : "",
    [definition?.needsPartner, locale, partner, selected, self.screenName, users],
  );

  const copyPrompt = async () => {
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="card rounded-2xl p-5 space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">{t("extras.ai.title")}</h2>
        <p className="text-sm text-gray-500 mt-1">{t("extras.ai.desc")}</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        {DIAGNOSIS_DEFS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSelected(selected === item.id ? null : item.id)}
            className={`rounded-xl border p-3 text-left transition-colors ${
              selected === item.id
                ? "border-[#bec2ff]/45 bg-[#3c4278]/55"
                : "border-white/10 bg-white/5 hover:bg-white/10"
            }`}
          >
            <span className="block text-sm font-semibold text-white">
              {item.title[locale]}
            </span>
            <span className="block text-xs text-gray-500 mt-1 leading-relaxed">
              {item.description[locale]}
            </span>
          </button>
        ))}
      </div>
      {definition?.needsPartner && (
        <label className="block text-sm text-gray-400">
          {t("extras.ai.partner")}
          <input
            value={partner}
            onChange={(event) => setPartner(event.target.value.replace(/^@+/, ""))}
            placeholder="username"
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none focus:border-[#bec2ff]/60"
          />
        </label>
      )}
      {prompt && (
        <div className="space-y-3">
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-black/25 border border-white/10 p-4 text-xs leading-relaxed text-gray-300">
            {prompt}
          </pre>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyPrompt}
              className="btn-primary rounded-lg px-4 py-2 text-sm font-medium text-white"
            >
              {copied ? t("common.copied") : t("extras.ai.copy")}
            </button>
            {AI_APPS.map(([name, url]) => (
              <a
                key={name}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300 hover:bg-white/10"
              >
                {name}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
