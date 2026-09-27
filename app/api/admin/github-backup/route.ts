import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import {
  getGitHubBackupStatus,
  syncLongTermCirclesToGitHub,
} from "@/lib/github-backup";

export const dynamic = "force-dynamic";

export async function GET() {
  initDb();
  return NextResponse.json(getGitHubBackupStatus(), {
    headers: { "cache-control": "no-store" },
  });
}

export async function POST() {
  try {
    initDb();
    const result = await syncLongTermCirclesToGitHub();
    return NextResponse.json({ result, status: getGitHubBackupStatus() }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "GitHub 备份失败。",
        status: getGitHubBackupStatus(),
      },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}
