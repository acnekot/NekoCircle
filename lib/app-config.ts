/**
 * 后台可运行时修改的参数设置。
 *
 * 存储：SQLite 的 `settings` 表（key/value 均为 TEXT）。
 * 优先级：DB 中的行 > 环境变量 > 代码默认值。
 * 「恢复默认」= 删除该行，于是重新回落到环境变量/默认值。
 *
 * 读取带 3 秒内存缓存：抓取热路径（如 Yahoo 分页）每个请求会多次读取配置，
 * 而 lib/db.ts 的 getSetting 每次都会开关一次 SQLite 连接，直接调用开销明显。
 */
import { deleteSetting, getAllSettings, setSetting } from "./db";

export type SettingType = "text" | "number" | "boolean";

export type SettingDef = {
  key: string;
  label: string;
  description: string;
  type: SettingType;
  /** 保存值（均为字符串）。未设置时的最后兜底。 */
  defaultValue: string;
  /** 环境变量回落（按顺序取第一个非空值） */
  env?: string[];
  min?: number;
  max?: number;
  unit?: string;
  group: string;
  placeholder?: string;
  /** 布尔值的补充说明（开/关各代表什么） */
  onLabel?: string;
  offLabel?: string;
};

/**
 * 设置定义。只有这里列出的 key 才会被保存和公开（allowlist）。
 * description 必须写清「改了会发生什么」——放一堆不生效的开关没有意义，
 * 因此这里的每一项都能在 lib/ 或 app/api/ 里找到实际引用点。
 */
export const SETTING_DEFS: SettingDef[] = [
  {
    key: "global_proxy",
    label: "数据源出口代理",
    description:
      "让 Yahoo 与 Bing 的抓取走代理。http:// 为 HTTP 代理，socks5:// 为 SOCKS5。留空则直连。不适用于头像图片的抓取。",
    type: "text",
    defaultValue: "",
    env: ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"],
    group: "代理",
    placeholder: "socks5://127.0.0.1:1080",
  },
  {
    key: "yahoo_proxy",
    label: "Yahoo 专用代理",
    description:
      "只想让 Yahoo 走另一条线路时填写。http:// 为 HTTP 代理，https:// 为中继模式（能访问 /pagination 的网关）。优先级高于上面的「出口代理」。",
    type: "text",
    defaultValue: "",
    env: ["YAHOO_PROXY"],
    group: "代理",
    placeholder: "https://your-relay.example.com",
  },
  {
    key: "yahoo_max_pages",
    label: "Yahoo 每方向最大页数",
    description:
      "每页 40 条，去程与回程各最多翻这么多页。调大可减少漏抓，但更容易触发 Yahoo 的 IP 限流。",
    type: "number",
    defaultValue: "20",
    env: ["YAHOO_MAX_PAGES"],
    min: 1,
    max: 100,
    unit: "页",
    group: "抓取",
  },
  {
    key: "yahoo_parallel_pages",
    label: "Yahoo 并发页数",
    description:
      "同时发出的分页请求数。调大更快，但瞬时请求数上升，更容易被限流。走 SOCKS5 时建议调低。",
    type: "number",
    defaultValue: "8",
    min: 1,
    max: 32,
    unit: "条",
    group: "抓取",
  },
  {
    key: "bing_max_pages",
    label: "Bing 补充最大页数",
    description:
      "作为 Yahoo 补充的 Bing 搜索页数。设为 0 则完全关闭 Bing 补充（仅用 Yahoo 组成）。",
    type: "number",
    defaultValue: "5",
    min: 0,
    max: 20,
    unit: "页",
    group: "抓取",
  },
  {
    key: "payload_cache_ttl_sec",
    label: "抓取结果缓存秒数",
    description:
      "Next 数据缓存（unstable_cache）对同一用户的抓取结果保留多久。修改从下次生成缓存时开始生效。",
    type: "number",
    defaultValue: "300",
    min: 0,
    max: 3600,
    unit: "秒",
    group: "缓存与频率",
  },
  {
    key: "circle_reuse_ttl_min",
    label: "已生成圈子的复用窗口",
    description:
      "同一用户再次生成时，若在这个时间内则直接返回 DB 中的已有圈子，不再请求数据源。设为 0 表示每次都重新抓取。",
    type: "number",
    defaultValue: "120",
    min: 0,
    max: 1440,
    unit: "分",
    group: "缓存与频率",
  },
  {
    key: "force_refresh_min_interval_sec",
    label: "强制刷新最小间隔",
    description:
      "避免「立即更新」被连点打垮数据源的下限。在此间隔内的重复请求会返回 DB 中的最近结果（带 throttled 标记）。",
    type: "number",
    defaultValue: "15",
    min: 0,
    max: 600,
    unit: "秒",
    group: "缓存与频率",
  },
  {
    key: "generation_enabled",
    label: "允许生成新圈子",
    description:
      "关闭后生成请求一律返回 503，前台显示维护提示。数据源被限流期间可用它临时止血。",
    type: "boolean",
    defaultValue: "true",
    group: "运维",
    onLabel: "接受生成请求",
    offLabel: "维护中（503）",
  },
  {
    key: "maintenance_message",
    label: "停止期间的提示文案",
    description:
      "关闭生成时返回给用户的消息。留空则使用默认文案。",
    type: "text",
    defaultValue: "",
    group: "运维",
    placeholder: "暂时停止生成新的互动圈，请稍后再试。",
  },
];

const DEF_BY_KEY = new Map(SETTING_DEFS.map((d) => [d.key, d]));

export function getSettingDef(key: string): SettingDef | undefined {
  return DEF_BY_KEY.get(key);
}

/** 敏感 key（导出时默认排除） */
export const CREDENTIAL_KEY_RE = /^admin_password/i;

/* ------------------------------------------------------------------ */
/* 读取                                                               */
/* ------------------------------------------------------------------ */

type CacheEntry = { at: number; values: Record<string, string> };
let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 3_000;

export function invalidateAppConfig(): void {
  cache = null;
}

function readAllSettings(): Record<string, string> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.values;
  let values: Record<string, string> = {};
  try {
    values = getAllSettings();
  } catch {
    // DB 尚不存在 / 暂时读不到时不要缓存，直接用默认值继续跑
    return values;
  }
  cache = { at: now, values };
  return values;
}

function envValue(def: SettingDef): string | undefined {
  for (const name of def.env ?? []) {
    const v = process.env[name];
    if (v !== undefined && v.trim() !== "") return v;
  }
  return undefined;
}

/**
 * 设置的原始值（字符串）。
 * DB 中有该行则用它，否则用环境变量，最后用默认值。
 */
export function getSettingValue(key: string): string {
  const def = DEF_BY_KEY.get(key);
  if (!def) return "";
  const stored = readAllSettings()[key];
  if (stored !== undefined) return stored;
  return envValue(def) ?? def.defaultValue;
}

/** 该值是否已保存在 DB（即已覆盖默认值） */
export function isOverridden(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(readAllSettings(), key);
}

/** 校验后保存。返回规范化后的字符串。 */
export function saveSettingValue(key: string, raw: unknown): string {
  const def = DEF_BY_KEY.get(key);
  if (!def) throw new Error(`unknown setting: ${key}`);

  let value: string;
  if (def.type === "boolean") {
    value = raw === true || raw === "true" || raw === "1" || raw === 1 ? "true" : "false";
  } else if (def.type === "number") {
    const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
    if (!Number.isFinite(n)) throw new Error(`${def.label}：请填写数字。`);
    if (def.min !== undefined && n < def.min)
      throw new Error(`${def.label}：请填写不小于 ${def.min} 的值。`);
    if (def.max !== undefined && n > def.max)
      throw new Error(`${def.label}：请填写不大于 ${def.max} 的值。`);
    value = String(Math.floor(n));
  } else {
    value = String(raw ?? "").trim();
    if (value.length > 500) throw new Error(`${def.label}：内容过长。`);
    if (key.endsWith("_proxy") && value && !/^(https?|socks[45]?):\/\//i.test(value))
      throw new Error(`${def.label}：请以 http://、https:// 或 socks5:// 开头。`);
  }
  setSetting(key, value);
  invalidateAppConfig();
  return value;
}

/** 恢复默认（删除 DB 中的行，回落至环境变量/默认值） */
export function resetSettingValue(key: string): void {
  if (!DEF_BY_KEY.has(key)) throw new Error(`unknown setting: ${key}`);
  deleteSetting(key);
  invalidateAppConfig();
}

/* ------------------------------------------------------------------ */
/* 带类型的访问器（抓取侧代码用这些）                                  */
/* ------------------------------------------------------------------ */

function num(key: string): number {
  const def = DEF_BY_KEY.get(key)!;
  const raw = getSettingValue(key);
  const n = Number(raw);
  let v = Number.isFinite(n) ? n : Number(def.defaultValue);
  if (!Number.isFinite(v)) v = 0;
  if (def.min !== undefined) v = Math.max(def.min, v);
  if (def.max !== undefined) v = Math.min(def.max, v);
  return Math.floor(v);
}

function bool(key: string): boolean {
  return getSettingValue(key) === "true";
}

export type AppConfig = {
  globalProxy: string;
  yahooProxy: string;
  yahooMaxPages: number;
  yahooParallelPages: number;
  bingMaxPages: number;
  payloadCacheTtlSec: number;
  circleReuseTtlMs: number;
  forceRefreshMinIntervalMs: number;
  generationEnabled: boolean;
};

export function getAppConfig(): AppConfig {
  return {
    globalProxy: getSettingValue("global_proxy").trim(),
    yahooProxy: getSettingValue("yahoo_proxy").trim().replace(/\/$/, ""),
    yahooMaxPages: num("yahoo_max_pages"),
    yahooParallelPages: num("yahoo_parallel_pages"),
    bingMaxPages: num("bing_max_pages"),
    payloadCacheTtlSec: num("payload_cache_ttl_sec"),
    circleReuseTtlMs: num("circle_reuse_ttl_min") * 60 * 1000,
    forceRefreshMinIntervalMs: num("force_refresh_min_interval_sec") * 1000,
    generationEnabled: bool("generation_enabled"),
  };
}

/**
 * 解析数据源抓取用的代理。
 * 顺序：Yahoo 专用设置 → 出口代理 → 无。
 */
export function resolveFetchProxy(): string | undefined {
  const c = getAppConfig();
  return c.yahooProxy || c.globalProxy || undefined;
}