import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import {
  getAppConfig,
  getSettingValue,
  isOverridden,
  resetSettingValue,
  saveSettingValue,
  SETTING_DEFS,
} from "@/lib/app-config";

export const dynamic = "force-dynamic";

type ItemDTO = {
  key: string;
  label: string;
  description: string;
  type: string;
  group: string;
  unit?: string;
  min?: number;
  max?: number;
  placeholder?: string;
  onLabel?: string;
  offLabel?: string;
  env?: string[];
  value: string;
  /** 当前值来自哪里 */
  source: "db" | "env" | "default";
  override: boolean;
  defaultValue: string;
};

function sourceOf(key: string): "db" | "env" | "default" {
  if (isOverridden(key)) return "db";
  const def = SETTING_DEFS.find((d) => d.key === key)!;
  const fromEnv = (def.env ?? []).some((n) => {
    const v = process.env[n];
    return v !== undefined && v.trim() !== "";
  });
  return fromEnv ? "env" : "default";
}

export async function GET() {
  try {
    initDb();
    const items: ItemDTO[] = SETTING_DEFS.map((d) => {
      const value = getSettingValue(d.key);
      const source = sourceOf(d.key);
      return {
        key: d.key,
        label: d.label,
        description: d.description,
        type: d.type,
        group: d.group,
        unit: d.unit,
        min: d.min,
        max: d.max,
        placeholder: d.placeholder,
        onLabel: d.onLabel,
        offLabel: d.offLabel,
        env: d.env,
        // 代理 URL 里可能嵌着凭据，没必要显示在界面上，
        // 因此文本值原样返回，但把密码部分遮蔽掉
        value: value.replace(/(\/\/[^/@\s]*):[^/@\s]*@/, "$1:***@"),
        source,
        override: source === "db",
        defaultValue: d.defaultValue,
      };
    });

    return NextResponse.json(
      {
        groups: Array.from(new Set(SETTING_DEFS.map((d) => d.group))),
        items,
        runtime: getAppConfig(),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  let body: { updates?: Record<string, unknown>; resets?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "无法读取请求内容。" }, { status: 400 });
  }

  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "格式不正确。" }, { status: 400 });

  const updates = body.updates && typeof body.updates === "object" ? body.updates : {};
  const resets = Array.isArray(body.resets) ? body.resets : [];

  const saved: string[] = [];
  const reset: string[] = [];
  const errors: Record<string, string> = {};

  try {
    initDb();

    for (const [key, value] of Object.entries(updates)) {
      try {
        saveSettingValue(key, value);
        saved.push(key);
      } catch (err) {
        errors[key] = err instanceof Error ? err.message : "保存失败。";
      }
    }

    for (const key of resets) {
      try {
        resetSettingValue(String(key));
        reset.push(String(key));
      } catch (err) {
        errors[String(key)] = err instanceof Error ? err.message : "重置失败。";
      }
    }

    return NextResponse.json(
      { ok: Object.keys(errors).length === 0, saved, reset, errors, runtime: getAppConfig() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}