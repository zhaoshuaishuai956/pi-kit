/**
 * kit-autosync — pi-kit 配置目录的启动自动同步。
 *
 * 每次会话启动时，若本目录是 pi-kit 克隆（存在 .pi-kit.json）：
 *   1. 工作区有受跟踪改动 → 跳过，状态行提示（避免覆盖本机改动、产生冲突）；
 *   2. 否则执行 `git pull --ff-only`（公开仓，匿名 HTTPS 即可；离线/失败静默跳过）；
 *   3. HEAD 前进 → 状态行提示「已更新，重启后生效」。
 *
 * 原则：只读同步。不自动合并、不 force、不改工作区；任何失败都不影响会话。
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "pi-kit";

interface RunResult {
	code: number;
	out: string;
}

function run(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<RunResult> {
	return new Promise((resolve) => {
		let settled = false;
		let out = "";
		const done = (code: number) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({ code, out });
		};
		const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "ignore"] });
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			done(-1);
		}, timeoutMs);
		child.stdout?.on("data", (chunk: Buffer) => {
			out += chunk.toString();
		});
		child.on("error", () => done(-1));
		child.on("exit", (code) => done(code ?? -1));
	});
}

function setStatus(ctx: ExtensionContext, text: string | undefined): void {
	if (!ctx.hasUI) return;
	try {
		ctx.ui.setStatus(STATUS_KEY, text);
	} catch {
		/* stale ctx：留给下一次启动 */
	}
}

async function sync(root: string, ctx: ExtensionContext): Promise<void> {
	const dirty = await run("git", ["status", "--porcelain", "--untracked-files=no"], root, 5_000);
	if (dirty.code !== 0) return;
	if (dirty.out.trim().length > 0) {
		setStatus(ctx, "pi-kit: 本地有改动，跳过自动同步");
		return;
	}

	const before = await run("git", ["rev-parse", "--short", "HEAD"], root, 5_000);
	const pull = await run("git", ["pull", "--ff-only", "--quiet"], root, 25_000);
	if (pull.code !== 0) return; // 离线或不可快进：静默，不打扰

	const after = await run("git", ["rev-parse", "--short", "HEAD"], root, 5_000);
	const from = before.out.trim();
	const to = after.out.trim();
	if (before.code === 0 && after.code === 0 && from && to && from !== to) {
		setStatus(ctx, `pi-kit 已更新 ${from} → ${to}，重启后生效`);
	}
}

export default function (pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		const root = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
		if (!existsSync(join(root, ".pi-kit.json"))) return;
		// 后台执行，不阻塞启动
		void sync(root, ctx).catch(() => {});
	});
}
