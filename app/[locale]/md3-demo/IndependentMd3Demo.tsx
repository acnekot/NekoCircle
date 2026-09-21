"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/components/LocaleProvider";
import LiveGeneratedCircle from "./LiveGeneratedCircle";
import styles from "./md3-demo.module.css";

type HomeStats = {
  yahooCircleCount: number;
  totalGenerations: number;
  todayCount: number;
};

function Arrow() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13m-5-5 5 5-5 5" /></svg>;
}

export default function IndependentMd3Demo() {
  const router = useRouter();
  const { locale, t } = useTranslation();
  const [username, setUsername] = useState("acnekot");
  const [circleId, setCircleId] = useState("");
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
    if (name) router.push(`/${locale}/yahoo/${encodeURIComponent(name)}`);
  }

  function openCircle() {
    const id = circleId.trim();
    if (id) router.push(`/${locale}/circle/${encodeURIComponent(id)}`);
  }

  const languageNames: Record<string, string> = { zh: "中", en: "EN", ja: "日" };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href={`/${locale}/md3-demo`} aria-label="NekoCircle">
          <span className={styles.brandMark} aria-hidden="true"><i /><i /><i /></span>
          <span><b>NekoCircle</b><small>social orbit</small></span>
        </a>

        <nav className={styles.nav} aria-label="Demo navigation">
          <a href={`/${locale}/stats`}>{t("nav.stats")}</a>
          <div className={styles.languages}>
            {["zh", "en", "ja"].map((code) => (
              <a key={code} href={`/${code}/md3-demo`} aria-current={locale === code ? "page" : undefined}>
                {languageNames[code]}
              </a>
            ))}
          </div>
        </nav>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <div className={styles.kicker}><i /> PUBLIC SOCIAL SIGNALS</div>
            <h1>{t("home.hero.title1")}<em>{t("home.hero.title2")}</em></h1>
            <p className={styles.lede}>{t("home.hero.desc")}</p>

            <form className={styles.searchPanel} onSubmit={generate}>
              <label htmlFor="md3-username">X USERNAME</label>
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
              <div className={styles.supporting}>
                <span>{t("home.badge.noLogin")} · No API key</span>
                <span>FxTwitter / Yahoo / Bing</span>
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

        <section className={styles.utility}>
          <div>
            <small>SAVED RESULT</small>
            <h2>{t("home.lookup.title")}</h2>
            <p>{t("home.lookup.desc")}</p>
          </div>
          <div className={styles.lookup}>
            <input
              value={circleId}
              onChange={(event) => setCircleId(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") openCircle(); }}
              placeholder={t("home.lookup.placeholder")}
              aria-label={t("home.lookup.placeholder")}
            />
            <button onClick={openCircle} disabled={!circleId.trim()} type="button"><Arrow /></button>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>© NekoCircle</span>
        <a href="https://github.com/acnekot/NekoCircle" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
      </footer>
    </div>
  );
}
