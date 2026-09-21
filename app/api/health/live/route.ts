import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

/**
 * 进程存活探针。
 *
 * 这里故意不访问数据库、外部数据源或页面渲染链路。看门狗只能用它判断
 * Next 进程能否响应，不能因为上游变慢或普通页面负载高就重启健康进程。
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: Date.now(),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    },
  );
}
