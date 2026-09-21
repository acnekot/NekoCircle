"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Aldrich } from "next/font/google";
import { useRouter } from "next/navigation";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import { useTranslation } from "@/components/LocaleProvider";
import LiveGeneratedCircle from "./LiveGeneratedCircle";
import FeedbackForm from "./FeedbackForm";
import styles from "./md3-demo.module.css";

const aldrich = Aldrich({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-aldrich",
});

type HomeStats = {
  yahooCircleCount: number;
  totalGenerations: number;
  todayCount: number;
};

function Arrow() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13m-5-5 5 5-5 5" /></svg>;
}

export default function IndependentMd3Demo({ standaloneDemo = true }: { standaloneDemo?: boolean }) {
  const router = useRouter();
  const { locale, t } = useTranslation();
  const [username, setUsername] = useState(standaloneDemo ? "acnekot" : "");
  const [circleId, setCircleId] = useState("");
  const [storageConsent, setStorageConsent] = useState(false);
  const [stats, setStats] = useState<HomeStats | null>(null);

  useEffect(() => {
    fetch("/api/home-stats")
      .then((response) => response.json())
      .then((data: HomeStats) => setStats(data))
      .catch(() => {});
  }, []);

  function generate(event: React.FormEvent) {
    event.preventDefault();
    const name = username.replace(/^@+/, "").trim();
    if (name) {
      router.push(
        `/${locale}/yahoo/${encodeURIComponent(name)}?storageConsent=${storageConsent ? "1" : "0"}`,
      );
    }
  }

  function openCircle() {
    const id = circleId.trim();
    if (id) router.push(`/${locale}/circle/${encodeURIComponent(id)}`);
  }

  const languageNames: Record<string, string> = { zh: "中", en: "EN", ja: "日" };
  const landingPath = standaloneDemo ? "/md3-demo" : "";
  const heroTitle = t("home.hero.title2");
  const heroDescription = t("home.hero.desc");

  return (
    <div className={`${styles.page} ${aldrich.variable}`}>
      <header className={styles.header}>
        <a className={styles.brand} href={`/${locale}${landingPath}`} aria-label="NekoCircle">
          <span className={styles.brandMark} aria-hidden="true">
            <Image src="/assets/neko-logo.png" alt="" width={48} height={48} priority />
          </span>
          <span><b>NekoCircle</b><small>social orbit</small></span>
        </a>

        <nav className={styles.nav} aria-label="Demo navigation">
          <a href={`/${locale}/stats`}>{t("nav.stats")}</a>
          <div className={styles.languages}>
            {["zh", "en", "ja"].map((code) => (
              <a key={code} href={`/${code}${landingPath}`} aria-current={locale === code ? "page" : undefined}>
                {languageNames[code]}
              </a>
            ))}
          </div>
        </nav>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <h1>{t("home.hero.title1")}<em>{heroTitle}</em></h1>
            <p className={styles.lede}>{heroDescription}</p>
            {!standaloneDemo && <div className={styles.announcements}><AnnouncementBanner /></div>}

            <form className={styles.searchPanel} onSubmit={generate}>
              <label htmlFor="md3-username">{t("home.form.usernameLabel")}</label>
              <div className={styles.searchRow}>
                <div className={styles.inputWrap}>
                  <span>@</span>
                  <input
                    id="md3-username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder={t("home.form.placeholder")}
                    autoComplete="off"
                  />
                </div>
                <button disabled={!username.trim()} type="submit">
                  {t("home.form.submit")}<Arrow />
                </button>
              </div>

              <label className={styles.consentOption}>
                <input
                  type="checkbox"
                  checked={storageConsent}
                  onChange={(event) => setStorageConsent(event.target.checked)}
                />
                <span className={styles.consentControl} aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>
                </span>
                <span>
                  <strong>{t("home.storageConsent.title")}</strong>
                  <small>{t("home.storageConsent.description")}</small>
                </span>
              </label>

              <div className={styles.lookupInline}>
                <div>
                  <small>SAVED RESULT</small>
                  <strong>{t("home.lookup.title")}</strong>
                </div>
                <div className={styles.lookup}>
                  <input
                    value={circleId}
                    onChange={(event) => setCircleId(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); openCircle(); } }}
                    placeholder={t("home.lookup.placeholder")}
                    aria-label={t("home.lookup.placeholder")}
                  />
                  <button onClick={openCircle} disabled={!circleId.trim()} type="button" aria-label={t("home.lookup.title")}><Arrow /></button>
                </div>
              </div>
            </form>

            <div className={styles.stats} aria-label="Service statistics">
              <div><strong>{stats?.yahooCircleCount.toLocaleString() ?? "—"}</strong><span>{t("home.stats.circles")}</span></div>
              <div><strong>{stats?.todayCount.toLocaleString() ?? "—"}</strong><span>{t("home.stats.today")}</span></div>
              <div><strong>{stats?.totalGenerations.toLocaleString() ?? "—"}</strong><span>{t("home.stats.total")}</span></div>
            </div>
          </div>

          <div className={styles.orbitColumn} aria-label="Animated interaction circle">
            <div className={styles.circleOnly}><LiveGeneratedCircle screenName="acnekot" /></div>
          </div>
        </section>

        <section className={styles.explainer}>
          <div className={styles.sectionIntro}>
            <span>01 — 04</span>
            <div><small>THE METHOD</small><h2>{t("home.howItWorks.title")}</h2></div>
          </div>
          <div className={styles.methodGrid}>
            {[
              ["01", t("home.howItWorks.step01.title"), t("home.howItWorks.step01.desc")],
              ["02", t("home.howItWorks.step02.title"), t("home.howItWorks.step02.desc")],
              ["03", t("home.howItWorks.step03.title"), t("home.howItWorks.step03.desc")],
              ["04", t("home.howItWorks.step04.title"), t("home.howItWorks.step04.desc")],
            ].map(([number, title, description]) => (
              <article key={number}>
                <span>{number}</span><h3>{title}</h3><p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <FeedbackForm />

      </main>

      <footer className={styles.footer}>
        <span>© NekoCircle</span>
        <span className={styles.footerLinks}>
          <span>{t("yahoo.inspirationFrom")} <a href="https://github.com/maebahesioru/nareaitter" target="_blank" rel="noopener noreferrer">nareaitter ↗</a></span>
          <a href="https://github.com/acnekot/NekoCircle" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
        </span>
      </footer>
    </div>
  );
}
