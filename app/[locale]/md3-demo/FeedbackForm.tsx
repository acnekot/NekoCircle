"use client";

import { useState } from "react";
import Md3Icon from "@/components/Md3Icon";
import { useTranslation } from "@/components/LocaleProvider";
import styles from "./md3-demo.module.css";

export default function FeedbackForm() {
  const { locale, t } = useTranslation();
  const [content, setContent] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (content.trim().length < 5 || status === "sending") return;
    setStatus("sending");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, contact, locale, website: "" }),
      });
      if (!response.ok) throw new Error("feedback_failed");
      setContent("");
      setContact("");
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className={styles.feedbackSection} aria-labelledby="feedback-title">
      <div className={styles.feedbackCopy}>
        <span className={styles.feedbackIcon}><Md3Icon name="feedback" /></span>
        <small>FEEDBACK</small>
        <h2 id="feedback-title">{t("feedback.title")}</h2>
        <p>{t("feedback.description")}</p>
      </div>

      <form className={styles.feedbackForm} onSubmit={submit}>
        <label htmlFor="feedback-content">{t("feedback.messageLabel")}</label>
        <textarea
          id="feedback-content"
          value={content}
          onChange={(event) => { setContent(event.target.value); if (status !== "idle") setStatus("idle"); }}
          placeholder={t("feedback.messagePlaceholder")}
          minLength={5}
          maxLength={1000}
          rows={5}
          required
        />
        <div className={styles.feedbackMeta}>
          <div>
            <label htmlFor="feedback-contact">{t("feedback.contactLabel")}</label>
            <input
              id="feedback-contact"
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              placeholder={t("feedback.contactPlaceholder")}
              maxLength={160}
            />
          </div>
          <button type="submit" disabled={content.trim().length < 5 || status === "sending"}>
            <span>{status === "sending" ? t("feedback.sending") : t("feedback.submit")}</span>
            <Md3Icon name="send" />
          </button>
        </div>
        <p className={`${styles.feedbackStatus} ${status === "error" ? styles.feedbackStatusError : ""}`} role="status">
          {status === "sent" ? t("feedback.success") : status === "error" ? t("feedback.error") : t("feedback.privacy")}
        </p>
      </form>
    </section>
  );
}
