import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAnalysis, initDb } from "@/lib/db";
import { COOKIE_NAME, USER_COOKIE_NAME, verifyToken } from "@/lib/auth";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  initDb();
  const { id } = await params;
  const analysis = getAnalysis(id);

  if (!analysis) {
    return NextResponse.json({ error: "未找到对应历史记录" }, { status: 404 });
  }

  if (!analysis.raw_data) {
    return NextResponse.json({ error: "该记录暂无可导出的推文与互动数据" }, { status: 409 });
  }

  const cookieStore = await cookies();
  const adminToken = cookieStore.get(COOKIE_NAME)?.value;
  const userToken = cookieStore.get(USER_COOKIE_NAME)?.value;

  const adminPayload = adminToken ? await verifyToken(adminToken) : null;
  if (adminPayload?.role !== "admin") {
    const userPayload = userToken ? await verifyToken(userToken) : null;
    const userId = userPayload?.sub ? Number.parseInt(String(userPayload.sub), 10) : NaN;
    if (!Number.isFinite(userId) || analysis.user_id !== userId) {
      return NextResponse.json({ error: "无权导出该历史记录" }, { status: 403 });
    }
  }

  const rawData = JSON.parse(analysis.raw_data);
  const result = analysis.result ? JSON.parse(analysis.result) : null;
  const payload = {
    analysis: {
      id: analysis.id,
      username: analysis.username,
      display_name: analysis.display_name,
      created_at: analysis.created_at,
      tweet_count: analysis.tweet_count,
      top_count: analysis.top_count,
      status: analysis.status,
      req_count: analysis.req_count,
      spent_credits: analysis.spent_credits,
      saved_credits: analysis.saved_credits,
    },
    summary: result ? {
      analyzedAt: result.analyzedAt,
      weights: result.weights,
      topUsers: result.topUsers,
    } : null,
    rawData,
  };

  const safeName = analysis.username.replace(/[^a-zA-Z0-9_-]+/g, "-") || "history";

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}-history-${analysis.id.slice(0, 8)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
