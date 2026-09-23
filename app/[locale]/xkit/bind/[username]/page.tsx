"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import Md3Icon from "@/components/Md3Icon";
import { useTranslation } from "@/components/LocaleProvider";

type BindState = "checking" | "ready" | "unavailable" | "bound" | "binding" | "success" | "auth_failed" | "account_mismatch" | "request_failed" | "invalid_input";

export default function XKitBindPage() {
  const params = useParams();
  const router = useRouter();
  const { locale, t } = useTranslation();
  const username = ((params?.username as string) ?? "").replace(/^@+/, "");
  const [authToken, setAuthToken] = useState("");
  const [ct0, setCt0] = useState("");
  const [state, setState] = useState<BindState>("checking");
  const [boundAccount, setBoundAccount] = useState("");
  const [expiresAt, setExpiresAt] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/xkit/bind", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { available?: boolean; bound?: boolean; accountName?: string; expiresAt?: number }) => {
        if (!active) return;
        if (!data.available) setState("unavailable");
        else if (data.bound) {
          setBoundAccount(data.accountName ?? "");
          setExpiresAt(data.expiresAt ?? null);
          setState("bound");
        } else setState("ready");
      })
      .catch(() => { if (active) setState("unavailable"); });
    return () => { active = false; };
  }, []);

  async function bindAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authToken.trim() || !ct0.trim()) {
      setState("invalid_input");
      return;
    }
    setState("binding");
    try {
      const response = await fetch("/api/xkit/bind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ screenName: username, authToken: authToken.trim(), ct0: ct0.trim() }),
      });
      const data = await response.json() as { error?: string; bound?: boolean; accountName?: string; expiresAt?: number };
      setAuthToken("");
      setCt0("");
      if (!response.ok || data.error) {
        const nextState: BindState = data.error === "xkit_account_mismatch"
          ? "account_mismatch"
          : data.error === "xkit_auth_failed"
            ? "auth_failed"
            : data.error === "xkit_invalid_input"
              ? "invalid_input"
              : "request_failed";
        setState(nextState);
        return;
      }
      setBoundAccount(data.accountName ?? username);
      setExpiresAt(data.expiresAt ?? null);
      setState("success");
      window.setTimeout(() => router.replace(`/${locale}/yahoo/${encodeURIComponent(username)}`), 700);
    } catch {
      setAuthToken("");
      setCt0("");
      setState("request_failed");
    }
  }

  async function unbindAccount() {
    try {
      await fetch("/api/xkit/bind", { method: "DELETE", cache: "no-store" });
    } finally {
      setBoundAccount("");
      setExpiresAt(null);
      setState("ready");
    }
  }

  const stateText: Record<BindState, string> = {
    checking: t("xkitBind.checking"),
    ready: t("xkitBind.ready"),
    unavailable: t("xkitBind.unavailable"),
    bound: t("xkitBind.bound", { account: boundAccount }),
    binding: t("xkitBind.binding"),
    success: t("xkitBind.success"),
    auth_failed: t("xkitBind.authFailed"),
    account_mismatch: t("xkitBind.accountMismatch", { account: username }),
    request_failed: t("xkitBind.requestFailed"),
    invalid_input: t("xkitBind.invalidInput"),
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-6 text-slate-100 sm:px-6 sm:py-10">
      <header className="flex items-center justify-between">
        <Link href={`/${locale}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-200 hover:text-white">
          <Md3Icon name="pet" className="h-7 w-7 text-[#bec2ff]" /> NekoCircle
        </Link>
        <LanguageSwitcher />
      </header>

      <section className="card mx-auto mt-10 max-w-xl rounded-3xl p-5 sm:mt-16 sm:p-8">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#bec2ff]/20 bg-[#3c4278]/30 text-[#bec2ff]">
          <Md3Icon name="key" className="h-6 w-6" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#bec2ff]">xKit · Beta</p>
        <h1 className="mt-2 text-2xl font-bold text-white">{t("xkitBind.title")}</h1>
        <p className="mt-2 text-sm text-slate-400">{t("xkitBind.target", { account: username })}</p>

        <div className={`mt-5 rounded-xl border px-3 py-3 text-sm ${state === "auth_failed" || state === "account_mismatch" || state === "request_failed" || state === "invalid_input" || state === "unavailable" ? "border-amber-300/20 bg-amber-300/5 text-amber-100" : "border-white/10 bg-white/[0.035] text-slate-300"}`} role="status" aria-live="polite">
          {stateText[state]}
          {state === "bound" && expiresAt && <span className="mt-1 block text-xs text-slate-500">{t("xkitBind.expires", { time: new Date(expiresAt).toLocaleTimeString() })}</span>}
        </div>

        {(state === "checking" || state === "binding" || state === "ready" || state === "auth_failed" || state === "account_mismatch" || state === "request_failed" || state === "invalid_input") && (
          <form onSubmit={bindAccount} autoComplete="off" className="mt-5 space-y-4">
            <label className="block text-sm text-slate-300">
              <span className="mb-1.5 block">auth_token</span>
              <input type="password" autoComplete="new-password" spellCheck={false} value={authToken} onChange={(event) => setAuthToken(event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 font-mono text-sm text-white outline-none focus:border-[#bec2ff]/50" placeholder={t("xkitBind.cookiePlaceholder")} />
            </label>
            <label className="block text-sm text-slate-300">
              <span className="mb-1.5 block">ct0</span>
              <input type="password" autoComplete="new-password" spellCheck={false} value={ct0} onChange={(event) => setCt0(event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 font-mono text-sm text-white outline-none focus:border-[#bec2ff]/50" placeholder={t("xkitBind.cookiePlaceholder")} />
            </label>
            <button type="submit" disabled={state === "binding" || state === "checking"} className="btn-primary inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-60">
              <Md3Icon name={state === "binding" ? "restart" : "check"} className={`h-4 w-4 ${state === "binding" ? "animate-spin" : ""}`} />
              {state === "binding" ? t("xkitBind.bindingButton") : t("xkitBind.submit")}
            </button>
          </form>
        )}

        {state === "bound" && (
          <button type="button" onClick={() => { void unbindAccount(); }} className="result-action mt-5 w-full bg-white/[0.055] text-slate-200 hover:bg-white/10">
            <Md3Icon name="close" className="h-4 w-4" /> {t("xkitBind.unbind")}
          </button>
        )}

        <div className="mt-6 space-y-2 border-t border-white/10 pt-4 text-xs leading-relaxed text-slate-500">
          <p>{t("xkitBind.privacy")}</p>
          <p>{t("xkitBind.cookieHelp")}</p>
        </div>
        <Link href={`/${locale}/yahoo/${encodeURIComponent(username)}`} className="mt-5 inline-flex items-center gap-2 text-sm text-[#bec2ff] hover:text-white">
          <Md3Icon name="south" className="h-4 w-4 rotate-90" /> {t("xkitBind.back")}
        </Link>
      </section>
    </main>
  );
}
