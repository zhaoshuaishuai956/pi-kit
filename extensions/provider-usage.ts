/**
 * provider-usage — 状态行里的用量段（并入 pi-coder statusline 第二行，不再占独立行），跟随当前模型的供应商自动切换数据源。
 *
 * 数据源（按 provider id 分派）：
 *   commandcode        https://api.commandcode.ai/alpha/*（5 小时 / 每周窗口 + 剩余额度）
 *   opencode           https://opencode.ai/zen/go/v1/usage（5 小时 / 本周 / 本月窗口）
 *   opencode-go        同上
 *   deepseek           https://api.deepseek.com/user/balance（账户余额）
 *   其他供应商没有公开用量接口 → 用量行自动隐藏。
 *
 * Key 来源：环境变量 → <agent-dir>/auth.json 对应条目（agent-dir 即 PI_CODING_AGENT_DIR）。
 * 刷新时机：session_start / 切换模型（model_select）/ 每 60 秒；/usage 可手动刷新并看详情。
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const REFRESH_MS = 60_000;
const TIMEOUT_MS = 15_000;
const STATUS_KEY = "usage";

type FgColor = "accent" | "dim" | "success" | "warning" | "error" | "info" | "muted" | "text";

/** 用量栏中的一段，例如「5h 12%」或「余额 ¥50.61」。 */
interface Segment {
  /** 前缀标签（可选），如「5h」「余额」 */
  label?: string;
  /** 值文本，如「12%」「$29.99」 */
  text: string;
  /** 已用百分比：给定时按阈值上色（≥60 黄、≥85 红） */
  percent?: number;
  /** 无 percent 时的固定颜色 */
  tone?: FgColor;
}

interface Snapshot {
  /** provider id，同时也是栏内显示的标签 */
  provider: string;
  segments: Segment[];
  /** /usage 详情的正文行 */
  detail: string[];
  error?: string;
  updatedAt: number;
}

interface UsageData {
  segments: Segment[];
  detail: string[];
}

interface ProviderSource {
  /** 环境变量候选（按序） */
  env: string[];
  /** auth.json 条目候选（按序） */
  auth: string[];
  load(key: string): Promise<UsageData>;
}

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------

let currentProvider: string | undefined;
const cache = new Map<string, Snapshot>();
const inflight = new Set<string>();
let latestCtx: ExtensionContext | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function agentDir(): string {
  return process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function pctText(p?: number): string {
  return p === undefined || !Number.isFinite(p) ? "—" : `${Math.round(p)}%`;
}

function clockText(ts: number): string {
  return new Date(ts).toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" });
}

/** 把秒 / 毫秒 / ISO 时间统一成毫秒时间戳；无法解析返回 null */
function resetTimeMs(value: unknown): number | null {
  let parsed: number | undefined;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) parsed = value;
  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();
    parsed = /^\d+$/.test(trimmed) ? Number(trimmed) : Date.parse(trimmed);
  }
  if (parsed === undefined || !Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed >= 1e12 ? Math.round(parsed) : Math.round(parsed * 1000);
}

function resetText(value: unknown): string {
  const ms = resetTimeMs(value);
  if (ms === null) return "—";
  return new Date(ms).toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new Error(`API key 被拒绝（HTTP ${res.status}）`);
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as unknown;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("请求超时");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/** 读取某个数据源的 API key：环境变量优先，其次 agent 目录的 auth.json（不回显） */
async function readKey(source: ProviderSource): Promise<string | undefined> {
  for (const name of source.env) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  try {
    const raw = await readFile(join(agentDir(), "auth.json"), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const name of source.auth) {
      const entry = parsed[name];
      if (typeof entry === "string" && entry) return entry;
      if (isRecord(entry)) {
        for (const field of ["key", "access", "apiKey"]) {
          const value = entry[field];
          if (typeof value === "string" && value) return value;
        }
      }
    }
  } catch {
    /* 没有配置就当作未登录 */
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// 数据源：opencode（opencode / opencode-go）
// ---------------------------------------------------------------------------

interface OpenCodeWindow {
  status?: string;
  percent?: number;
  resetsAt?: string;
}
interface OpenCodeUsage {
  rolling?: OpenCodeWindow;
  weekly?: OpenCodeWindow;
  monthly?: OpenCodeWindow;
}

async function loadOpenCode(key: string): Promise<UsageData> {
  const body = (await fetchJson("https://opencode.ai/zen/go/v1/usage", {
    Authorization: `Bearer ${key}`,
  })) as { usage?: OpenCodeUsage };
  const usage = body?.usage ?? {};
  const seg = (label: string, w?: OpenCodeWindow): Segment => ({
    label,
    text: pctText(w?.percent),
    percent: w?.percent,
  });
  const line = (name: string, w?: OpenCodeWindow): string => {
    const at = w?.resetsAt ? new Date(w.resetsAt).toLocaleString("zh-CN", { hour12: false }) : "—";
    return `${name}：${pctText(w?.percent)}   重置于 ${at}`;
  };
  return {
    segments: [seg("5h", usage.rolling), seg("本周", usage.weekly), seg("本月", usage.monthly)],
    detail: [
      line("5 小时窗口", usage.rolling),
      line("本周窗口", usage.weekly),
      line("本月窗口", usage.monthly),
    ],
  };
}

// ---------------------------------------------------------------------------
// 数据源：commandcode
// ---------------------------------------------------------------------------

const COMMAND_CODE_BASE = "https://api.commandcode.ai";

interface CommandCodeWindow {
  used?: number;
  cap?: number;
  exceeded?: boolean;
  resetAt?: unknown;
}

function commandCodeWindow(
  window: CommandCodeWindow | undefined,
  label: string,
  name: string,
): { segment: Segment; detail: string } | null {
  const used = num(window?.used);
  const cap = num(window?.cap);
  if (used === undefined || cap === undefined || cap <= 0) return null;
  const percent = (used / cap) * 100;
  const exceeded = window?.exceeded === true;
  return {
    segment: {
      label,
      text: pctText(percent) + (exceeded ? " !" : ""),
      percent,
    },
    detail: `${name}：${used.toFixed(2)} / ${cap.toFixed(2)} credits（${pctText(percent)}${exceeded ? "，已超限" : ""}）   重置于 ${resetText(window?.resetAt)}`,
  };
}

async function loadCommandCode(key: string): Promise<UsageData> {
  const headers = { accept: "application/json", Authorization: `Bearer ${key}` };
  const who = (await fetchJson(`${COMMAND_CODE_BASE}/alpha/whoami`, headers)) as Record<string, unknown>;
  const org = isRecord(who.org) ? who.org : undefined;
  const orgId = org && typeof org.id === "string" ? org.id : undefined;
  const q = orgId ? `?orgId=${encodeURIComponent(orgId)}` : "";

  const creditsRaw = (await fetchJson(`${COMMAND_CODE_BASE}/alpha/billing/credits${q}`, headers)) as Record<string, unknown>;
  const subscriptionRaw = await fetchJson(`${COMMAND_CODE_BASE}/alpha/billing/subscriptions${q}`, headers).catch(() => null);

  const credits = isRecord(creditsRaw.credits) ? creditsRaw.credits : {};
  const monthly = num(credits.monthlyCredits) ?? 0;
  const purchased = num(credits.purchasedCredits) ?? 0;
  const free = num(credits.freeCredits) ?? 0;
  const remaining = monthly + purchased + free;

  const limits = isRecord(creditsRaw.windowLimits) ? creditsRaw.windowLimits : {};
  const fiveHour = commandCodeWindow(isRecord(limits.fiveHour) ? limits.fiveHour : undefined, "5h", "5 小时窗口");
  const weekly = commandCodeWindow(isRecord(limits.weekly) ? limits.weekly : undefined, "周", "本周窗口");

  const segments: Segment[] = [];
  const detail: string[] = [];
  if (fiveHour) {
    segments.push(fiveHour.segment);
    detail.push(fiveHour.detail);
  }
  if (weekly) {
    segments.push(weekly.segment);
    detail.push(weekly.detail);
  }
  segments.push({ label: "余额", text: `$${remaining.toFixed(2)}`, tone: "text" });
  detail.push(
    `剩余额度：$${remaining.toFixed(2)}（月度 $${monthly.toFixed(2)} / 已购 $${purchased.toFixed(2)} / 赠送 $${free.toFixed(2)}）`,
  );

  const sub = isRecord(subscriptionRaw) && isRecord(subscriptionRaw.data) ? subscriptionRaw.data : undefined;
  if (sub) {
    const plan = typeof sub.planId === "string" ? sub.planId.replace(/[_-]+/g, " ").trim() : "未知";
    const status = typeof sub.status === "string" ? sub.status : undefined;
    const endMs = resetTimeMs(sub.currentPeriodEnd);
    const renew = endMs
      ? `续期 ${new Date(endMs).toLocaleDateString("zh-CN")}（${Math.max(0, Math.ceil((endMs - Date.now()) / 86_400_000))} 天）`
      : "";
    detail.push(`订阅：${plan}${status ? `（${status}）` : ""}${renew ? `   ${renew}` : ""}`);
  }

  const user = isRecord(who.user) ? who.user : undefined;
  const account =
    user && typeof user.userName === "string"
      ? user.userName
      : user && typeof user.name === "string"
        ? user.name
        : undefined;
  if (account) detail.push(`账户：${account}`);

  return { segments, detail };
}

// ---------------------------------------------------------------------------
// 数据源：deepseek
// ---------------------------------------------------------------------------

async function loadDeepSeek(key: string): Promise<UsageData> {
  const raw = (await fetchJson("https://api.deepseek.com/user/balance", {
    Authorization: `Bearer ${key}`,
    accept: "application/json",
  })) as Record<string, unknown>;
  const infos = Array.isArray(raw.balance_infos) ? raw.balance_infos.filter(isRecord) : [];
  const info = infos[0];
  const available = raw.is_available !== false;
  const symbol = info?.currency === "USD" ? "$" : "¥";
  const total = typeof info?.total_balance === "string" ? info.total_balance : "—";
  const detail = [
    `可用性：${available ? "正常" : "不可用"}`,
    `余额：${symbol}${total}`,
  ];
  if (info) {
    detail.push(`  充值余额：${symbol}${String(info.topped_up_balance ?? "—")}`);
    detail.push(`  赠送余额：${symbol}${String(info.granted_balance ?? "—")}`);
  }
  return {
    segments: [{ label: "余额", text: `${symbol}${total}`, tone: available ? "text" : "error" }],
    detail,
  };
}

// ---------------------------------------------------------------------------
// 数据源注册表
// ---------------------------------------------------------------------------

const openCodeSource: ProviderSource = {
  env: ["OPENCODE_API_KEY"],
  auth: ["opencode-go", "opencode"],
  load: loadOpenCode,
};

const SOURCES: Record<string, ProviderSource> = {
  commandcode: {
    env: ["COMMAND_CODE_API_KEY", "COMMANDCODE_API_KEY"],
    auth: ["commandcode"],
    load: loadCommandCode,
  },
  opencode: openCodeSource,
  "opencode-go": openCodeSource,
  deepseek: {
    env: ["DEEPSEEK_API_KEY"],
    auth: ["deepseek"],
    load: loadDeepSeek,
  },
};

// ---------------------------------------------------------------------------
// 刷新 / 渲染
// ---------------------------------------------------------------------------

function syncProvider(ctx: ExtensionContext): void {
  currentProvider = ctx.model?.provider ?? process.env.PI_PROVIDER ?? undefined;
}

async function refresh(providerId?: string): Promise<void> {
  const pid = providerId ?? currentProvider;
  if (!pid) {
    publish();
    return;
  }
  const source = SOURCES[pid];
  if (!source) {
    publish();
    return;
  }
  if (inflight.has(pid)) return;
  inflight.add(pid);
  try {
    const key = await readKey(source);
    if (!key) {
      throw new Error(
        `未找到 API key（环境变量 ${source.env.join(" / ")} 或 auth.json 里的 ${source.auth.join(" / ")}）`,
      );
    }
    const data = await source.load(key);
    cache.set(pid, { provider: pid, segments: data.segments, detail: data.detail, updatedAt: Date.now() });
  } catch (e) {
    cache.set(pid, {
      provider: pid,
      segments: [],
      detail: [],
      error: e instanceof Error ? e.message : String(e),
      updatedAt: Date.now(),
    });
  } finally {
    inflight.delete(pid);
    publish();
  }
}

/** 状态行文本（纯文本，交给 statusline 统一着色与截断）。 */
function statusText(): string | undefined {
  const pid = currentProvider;
  if (!pid || !SOURCES[pid]) return undefined;
  const snap = cache.get(pid);
  if (!snap) return `${pid} 用量读取中…`;
  if (snap.error) return `⚠ ${pid} 用量不可用`;
  const body = snap.segments
    .map((seg) => (seg.label ? `${seg.label} ${seg.text}` : seg.text))
    .join(" · ");
  return `${pid} ${body}`;
}

/** 写入扩展状态行（pi-coder statusline 第二行）；无数据源时清掉旧值。 */
function publish(ctx?: ExtensionContext | null): void {
  const c = ctx ?? latestCtx;
  if (!c || !c.hasUI) return;
  try {
    c.ui.setStatus(STATUS_KEY, statusText());
  } catch {
    /* stale ctx：留给下一次事件刷新 */
  }
}

async function showUsage(ctx: ExtensionContext): Promise<void> {
  syncProvider(ctx);
  const pid = currentProvider;
  if (!pid || !SOURCES[pid]) {
    ctx.ui.notify(
      `当前供应商「${pid ?? "未知"}」没有可查询的用量数据源。\n支持：${Object.keys(SOURCES).join(" / ")}`,
      "warning",
    );
    return;
  }
  await refresh(pid);
  const snap = cache.get(pid);
  if (!snap) {
    ctx.ui.notify("用量读取中，请稍后再试（也可看状态行里的用量段）", "info");
    return;
  }
  if (snap.error) {
    ctx.ui.notify(`${pid} 用量获取失败：${snap.error}`, "error");
    return;
  }
  const modelId = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "未知";
  const lines = [
    `用量来源：${pid}（当前模型 ${modelId}）`,
    ...snap.detail,
    `更新于 ${clockText(snap.updatedAt)}`,
  ];
  ctx.ui.notify(lines.join("\n"), "info");
}

export default function providerUsageExtension(pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    latestCtx = ctx;
    syncProvider(ctx);
    publish(ctx);
    await refresh();
    if (timer) clearInterval(timer);
    timer = setInterval(() => void refresh(), REFRESH_MS);
    (timer as { unref?: () => void }).unref?.();
  });

  // 切换模型（供应商可能变化）→ 立即刷新对应数据源
  pi.on("model_select", async (_event, ctx) => {
    latestCtx = ctx;
    syncProvider(ctx);
    publish(ctx);
    void refresh();
  });

  // /reload 后兜底：回合开始时确保这一行还在、供应商已同步
  pi.on("before_agent_start", async (_event, ctx) => {
    latestCtx = ctx;
    syncProvider(ctx);
    publish(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    try {
      ctx.ui.setStatus(STATUS_KEY, undefined);
    } catch {
      /* ignore */
    }
    latestCtx = null;
  });

  pi.registerCommand("usage", {
    description: "刷新并查看当前模型供应商的套餐用量（commandcode / opencode / deepseek）",
    handler: async (_args, ctx) => {
      await showUsage(ctx);
    },
  });

  pi.registerCommand("opencode-usage", {
    description: "（别名）查看当前模型供应商的套餐用量",
    handler: async (_args, ctx) => {
      await showUsage(ctx);
    },
  });
}
