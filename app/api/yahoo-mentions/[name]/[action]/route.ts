import { NextRequest, NextResponse } from "next/server";
import { GET as yahooMentionsGET } from "../../route";

/**
 * 強制再取得のショートカット URL。
 *
 *   GET /api/yahoo-mentions/<screenName>/ref
 *   GET /api/yahoo-mentions/<screenName>/refresh
 *
 * は `?screenName=<screenName>&refresh=1` と同じ意味になる。
 * 実装は本体の GET に委譲しているので、キャッシュ迂回のロジックは 1 か所だけ。
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string; action: string }> },
) {
  const { name, action } = await params;
  if (action !== "ref" && action !== "refresh") {
    return NextResponse.json(
      { error: "未知的操作。请使用 /ref。" },
      { status: 404 },
    );
  }

  const url = new URL(req.url);
  url.searchParams.set("screenName", decodeURIComponent(name));
  url.searchParams.set("refresh", "1");

  return yahooMentionsGET(
    new NextRequest(url, { method: "GET", headers: req.headers }),
  );
}
