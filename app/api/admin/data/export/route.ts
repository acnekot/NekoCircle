import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import {
  buildExportBundle,
  databaseOverview,
  exportFilename,
  TABLE_META,
  type TableName,
} from "@/lib/admin-data";

export const dynamic = "force-dynamic";

/** 带 ?overview=1 时只返回表清单、当前行数与 DB 体积（界面初始渲染用）。 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  try {
    initDb();

    if (sp.get("overview") === "1") {
      const overview = databaseOverview();
      return NextResponse.json(
        {
          overview,
          tables: TABLE_META.map((t) => ({
            name: t.name,
            label: t.label,
            description: t.description,
          })),
        },
        { headers: { "cache-control": "no-store" } },
      );
    }

    const tablesParam = sp.get("tables");
    const requested: TableName[] | undefined = tablesParam
      ? (tablesParam
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean) as TableName[])
      : undefined;

    const bundle = buildExportBundle({
      tables: requested,
      includeCredentials: sp.get("credentials") === "1",
    });

    const filename = exportFilename();
    return new NextResponse(JSON.stringify(bundle, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        // no-transform 很重要：整库导出接近 20MB，若被 Cloudflare 之类的中间层
        // 重新压缩（实测会变成 zstd + chunked，且没有 content-length），
        // 浏览器读取响应体时会失败（Failed to fetch），而 curl 却是正常的。
        "cache-control": "no-store, no-transform",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "导出失败。" },
      { status: 500 },
    );
  }
}