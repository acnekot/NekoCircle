"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CircleChart from "@/components/CircleChart";
import { yahooToAnalysisResult } from "@/lib/circle-convert";
import { DEFAULT_STYLE, type StyleConfig } from "@/lib/style";
import type { CircleUser, SelfProfile } from "@/types/circle";
import styles from "./md3-demo.module.css";

const REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000;

type Payload = {
  screenName: string;
  counts: { mentionsToYou: number; mentionsFromYou: number };
  circleUsers?: CircleUser[];
  selfAvatarUrl?: string;
  selfAvatarUrlPreview?: string;
  error?: string;
};

const LIVE_STYLE: StyleConfig = {
  ...DEFAULT_STYLE,
  bgColor1: "#121318",
  bgColor2: "#121318",
  bgGradient: "solid",
  accentColor: "#bec2ff",
  nodeScheme: "rainbow",
  nodeSize: "medium",
  showAvatars: true,
  showWatermark: false,
  showLines: false,
  glowEffect: false,
  displayCount: 22,
};

export default function LiveGeneratedCircle({ screenName }: { screenName: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const query = new URLSearchParams({ screenName, buildCircle: "1" });
      const response = await fetch(`/api/yahoo-mentions?${query}`, {
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as Payload;
      if (data.error || !data.circleUsers?.length) throw new Error(data.error || "empty circle");
      setPayload(data);
      setFailed(false);
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") setFailed(true);
    }
  }, [screenName]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const interval = window.setInterval(() => { void load(); }, REFRESH_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [load]);

  const result = useMemo(() => {
    if (!payload?.circleUsers) return null;
    const self: SelfProfile = {
      screenName: payload.screenName,
      displayName: payload.screenName,
      avatarUrl: payload.selfAvatarUrl,
      avatarUrlPreview: payload.selfAvatarUrlPreview,
    };
    const anonymizedUsers = payload.circleUsers.map((user, index) => ({
      ...user,
      avatarUrl: `/assets/anime-avatar-grid.png#cell=${index % 25}`,
      avatarUrlPreview: undefined,
    }));
    return yahooToAnalysisResult(self, anonymizedUsers, {
      toYou: payload.counts.mentionsToYou,
      fromYou: payload.counts.mentionsFromYou,
    });
  }, [payload]);

  if (result) {
    return (
      <CircleChart
        result={result}
        style={LIVE_STYLE}
        presentation="flat-transparent"
        interactive={false}
        centerAvatarCycle
      />
    );
  }

  return (
    <div className={styles.liveCircleState} role="status">
      <span className={failed ? styles.liveCircleError : styles.liveCircleLoader} />
      <small>{failed ? "PREVIEW UNAVAILABLE" : "BUILDING LIVE CIRCLE"}</small>
    </div>
  );
}
