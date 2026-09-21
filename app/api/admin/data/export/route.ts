import { NextRequest, NextResponse } from "next/server";
import { gzipSync } from "node:zlib";
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

    // ?gzip=1 返回压缩包（.json.gz）。实测整库导出可压到约 1/3（18.9MB ← 65MB，
    // 里面大量 ID 类字符串不好压），后台默认走这条路：
    // 既绕开各层体积上限，也让浏览器下载更快。
    //
    // 注意用的是 content-type: application/gzip 而不是 content-encoding: gzip
    // ——后者会让 Cloudflare 之类的中间层参与解压/再压缩（正是下面 no-transform
    // 注释里那个坑），而且浏览器会就地解压，拿不到 .gz 文件本身。
    const asGzip = sp.get("gzip") === "1" || sp.get("gzip") === "true";
    if (asGzip) {
      const json = JSON.stringify(bundle, null, 2);
      const gz = gzipSync(Buffer.from(json, "utf8"), { level: 6 });
      return new NextResponse(new Uint8Array(gz), {
        status: 200,
        headers: {
          "content-type": "application/gzip",
          "content-disposition": `attachment; filename="${filename}.gz"`,
          "cache-control": "no-store, no-transform",
          // 便于对照压缩比，排查「文件为什么这么小」之类的问题
          "x-uncompressed-bytes": String(Buffer.byteLength(json, "utf8")),
        },
      });
    }

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