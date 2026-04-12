import { NextResponse } from "next/server";
import { initDb, getSetting, createAnalysis, updateAnalysis, getAnalysis, findRecentAnalysis } from "@/lib/db";
import { getUserInfo, setMockMode, setApiKeys, setManualSlowMode } from "@/lib/twitter";
import { analyzeUser, type ProgressInfo, type LogEntry } from "@/lib/analyze";
import { verifyToken, USER_COOKIE_NAME } from "@/lib/auth";
import { randomUUID } from "crypto";
import { getAnalysisRuntimeConfig } from "@/lib/analysis-config";

export async function POST(req: Request) {
  try {
    initDb();
    const { username, topCount = 30 } = await req.json();
    if (!username) return NextResponse.json({ error: "用户名不能为空" }, { status: 400 });

    // Require login to generate
    const cookieHeader = (req as Request & { headers: Headers }).headers.get("cookie") ?? "";
    const userTokenMatch = cookieHeader.match(/(?:^|;\s*)neko_user=([^;]+)/);
    const userToken = userTokenMatch ? userTokenMatch[1] : null;
    let userId: number | null = null;
    if (userToken) {
      const payload = await verifyToken(userToken);
      if (payload?.sub) userId = parseInt(payload.sub as string);
    }
    if (!userId) {
      return NextResponse.json({ error: "请先登录后再生成互动圈", requireLogin: true }, { status: 401 });
    }

    const config = getAnalysisRuntimeConfig();
    const allKeys = config.apiKeys;
    const useMock = config.useMock;

    if (!useMock && allKeys.length === 0)
      return NextResponse.json({ error: "请先在管理后台配置 API Key" }, { status: 400 });

    const tweetLimit = config.tweetLimit;
    const weights = config.weights;

    // 缓存命中检查：2小时内同用户名的完成结果直接复用
    if (!useMock) {
      const cacheTtlMin = parseInt(getSetting("analysis_cache_ttl") || "120", 10);
      if (cacheTtlMin > 0) {
        const cached = findRecentAnalysis(username, cacheTtlMin * 60 * 1000);
        if (cached) {
          return NextResponse.json({ id: cached.id, cached: true });
        }
      }
    }

    const id = randomUUID();
    createAnalysis(id, username, topCount);
    if (userId) updateAnalysis(id, { user_id: userId } as Parameters<typeof updateAnalysis>[1]);

    (async () => {
      try {
        setMockMode(useMock);
        setApiKeys(useMock ? ["mock"] : allKeys);
        // Manual slow mode (user-configured throttle, independent of 429 auto-slow)
        const manualOn = getSetting("manual_slow_mode") === "1";
        const manualMs = parseInt(getSetting("manual_rate_ms") || "1000");
        setManualSlowMode(!useMock && manualOn, manualMs);

        updateAnalysis(id, { status: "running", progress: 0, progress_msg: "启动中...", logs: "[]", should_stop: 0 });
        const targetUser = await getUserInfo(username, allKeys[0] || "mock");
        updateAnalysis(id, { display_name: targetUser.name, avatar: targetUser.profilePicture });

        const MAX_LOGS = 500;

        const onProgress = (info: ProgressInfo) => {
          const row = getAnalysis(id);
          const logs: LogEntry[] = JSON.parse(row?.logs || "[]");
          logs.push(info.entry);
          if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
          updateAnalysis(id, {
            progress: info.pct,
            progress_msg: info.msg,
            eta_sec: info.etaSec,
            slow_mode: info.slowMode ? 1 : 0,
            logs: JSON.stringify(logs),
            req_count: info.reqCount,
            spent_credits: info.spentCredits,
            saved_credits: info.savedCredits,
          });
        };

        // Stop check: reads DB flag
        const checkStop = () => (getAnalysis(id)?.should_stop ?? 0) === 1;

        const { result, rawData } = await analyzeUser(
          targetUser, allKeys[0] || "mock", tweetLimit, topCount, weights,
          onProgress, allKeys.slice(1), useMock, checkStop,
        );

        updateAnalysis(id, {
          status: "done",
          progress: 100,
          tweet_count: result.tweetCount,
          result: JSON.stringify(result),
          raw_data: JSON.stringify(rawData),
        });
      } catch (err: unknown) {
        updateAnalysis(id, {
          status: "error",
          result: JSON.stringify({ error: err instanceof Error ? err.message : "分析失败" }),
        });
      }
    })();

    return NextResponse.json({ id });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "服务器错误" }, { status: 500 });
  }
}
