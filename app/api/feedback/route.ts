import { NextRequest, NextResponse } from "next/server";
import { createFeedback, initDb } from "@/lib/db";

const recentSubmissions = new Map<string, number>();
const MIN_INTERVAL_MS = 30_000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      content?: unknown;
      contact?: unknown;
      locale?: unknown;
      website?: unknown;
    };

    // Hidden honeypot field: bots commonly fill it, people never see it.
    if (typeof body.website === "string" && body.website.trim()) {
      return NextResponse.json({ ok: true });
    }

    const content = typeof body.content === "string" ? body.content.trim() : "";
    const contact = typeof body.contact === "string" ? body.contact.trim() : "";
    const locale = ["zh", "en", "ja"].includes(String(body.locale)) ? String(body.locale) : "zh";
    if (content.length < 5) {
      return NextResponse.json({ error: "feedback_too_short" }, { status: 400 });
    }
    if (content.length > 1000 || contact.length > 160) {
      return NextResponse.json({ error: "feedback_too_long" }, { status: 400 });
    }

    const clientKey = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const lastAt = recentSubmissions.get(clientKey) ?? 0;
    if (Date.now() - lastAt < MIN_INTERVAL_MS) {
      return NextResponse.json({ error: "feedback_rate_limited" }, { status: 429 });
    }

    initDb();
    const id = createFeedback(content, contact, locale);
    recentSubmissions.set(clientKey, Date.now());
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "feedback_failed" }, { status: 500 });
  }
}
