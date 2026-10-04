/**
 * command-menu-zh — 给斜杠命令菜单（输入 / 弹出的补全列表）加中文说明。
 *
 * 实现：包装 autocomplete provider，命中映射表的命令把描述正文替换成中文；
 * 扩展命令的来源前缀（[u:npm:…]）保留，未收录的命令原样显示。
 * 范围：pi 内置命令 + 本机已安装扩展的命令 + 提示模板命令。
 * 技能（skill:…）不动——描述来自技能自身；以后新装的扩展命令也不在表内。
 *
 * 局限：只能改命令补全菜单。/settings、/hotkeys 等其它界面没有扩展点。
 */
import type {
  AutocompleteProviderFactory,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

/** 命令名（不含斜杠） → 中文描述；扩展命令的来源前缀由代码保留 */
const ZH: Record<string, string> = {
  // ---- pi 内置 ----
  settings: "打开设置菜单",
  model: "<provider/model> — 选择模型（打开选择器）",
  tree: "浏览会话树（切换分支）",
  thinking: "<level> — 设置思考级别",
  "scoped-models": "启用/禁用 Ctrl+P 循环切换的模型",
  export: "导出会话（默认 HTML，可指定 .html/.jsonl 路径）",
  import: "从 JSONL 文件导入并继续某个会话",
  share: "把会话分享为私密 GitHub gist",
  bug: "<description> — 向 Pi 开发者报告问题",
  copy: "复制最后一条 agent 消息到剪贴板",
  name: "设置会话显示名称",
  session: "显示当前会话信息与统计",
  changelog: "查看更新日志",
  hotkeys: "查看全部键盘快捷键",
  fork: "从之前的某条用户消息创建新分支会话",
  clone: "在当前节点复制当前会话",
  trust: "保存项目信任决定（供后续会话使用）",
  login: "<provider> — 配置供应商登录",
  logout: "移除供应商登录",
  new: "开始新会话",
  compact: "手动压缩当前上下文",
  resume: "切换/继续另一个已保存会话",
  reload: "重新加载键位、扩展、技能、提示模板、主题与上下文文件",
  quit: "退出 Pi",

  // ---- pi-commandcode-provider ----
  "commandcode-quota": "查看 Command Code 账户用量与配额",
  "commandcode-refresh": "刷新 Command Code 模型目录",
  "commandcode-status": "查看 Command Code 供应商诊断（已脱敏）",

  // ---- pi-mcp-adapter ----
  "mcp-adapter": "查看 MCP 服务器状态",
  "mcp-auth": "与 MCP 服务器进行 OAuth 认证",

  // ---- @bachi/pi-coder ----
  ask: "预览 ask_user_question 问卷对话框（演示用）",
  clear: "开始新会话（/new 别名）",
  exit: "干净退出 pi（/quit 别名）",
  memory: "自动记忆：状态、打开目录、显示索引、开关",
  rewind: "把代码和/或对话回退到之前的某条提示（Claude Code 风格）",
  tasks: "查看或管理任务列表 —— /tasks [status|clear|on|off]",
  theme: "切换 pi 主题（浏览时实时预览）",

  // ---- pi-web-access ----
  websearch: "打开网页搜索策展器",
  curator: "切换或配置搜索策展工作流",
  "google-account": "显示 Gemini Web 当前使用的 Google 账户",
  search: "浏览已保存的网页搜索结果",

  // ---- pi-subagents ----
  "subagents-watchdog": "查看/切换默认关闭的 subagent 看门狗",
  subagents: "管理 subagents：查看元数据、更新模型/思考级别/提示",
  run: "通过 workflowScript 运行一个 subagent：/run agent[output=file] [task] [--bg] [--fork]",
  "subagent-cost": "查看本会话父子 agent 的用量成本",
  "subagents-doctor": "查看 subagent 诊断信息",
  "subagents-inspect-rpc": "宿主集成桥：响应异步子进程检查请求（不触发模型轮次）",
  "subagents-guide": "查看内置 subagents 指南",
  "subagents-refine": "为一个 subagent 生成项目级细化覆盖层",
  "subagents-fleet": "打开实时 subagent 集群检查器",
  "subagents-detach": "把前台单 subagent 运行转入后台（不终止）",
  "subagents-stop": "停止本会话的异步 subagent 运行；可加 <run-id> <child-id> 停某个子任务",
  "subagents-steer": "向运行中的异步 subagent 发送引导消息；--child <child-id> 指定子任务",
  "prompt-workflow": "通过原生 pi-subagents 运行提示模板：/prompt-workflow <name> [args]",
  "subagents-models": "查看已发现 subagents 的模型映射",
  "subagents-profiles": "列出已保存的 subagent 配置档",
  "subagents-load-profile": "把 subagent 配置档载入 ~/.pi/agent/settings.json",
  "subagents-refresh-provider-models": "刷新某个供应商的模型目录缓存",
  "subagents-generate-profiles": "生成 <provider>.quota 与 <provider>.quality 配置档",
  "subagents-check-profile": "检查已保存的配置档是否仍指向可用模型",

  // ---- 其它内置/模板 ----
  llama: "管理 llama.cpp 路由器的模型",
  council: "召开顾问委员会并输出决策备忘",
  "gather-context-and-clarify": "先用 subagents 收集上下文，再提出澄清问题",
  "parallel-cleanup": "并行清理审查",
  "parallel-research": "并行 subagents 调研",
  "parallel-review": "并行 subagents 审查",
  "review-loop": "审查/修复循环，直到无问题",
};

const PROVIDER_MARKER = "__commandMenuZh";

/** 只替换描述正文，保留扩展命令的来源前缀（[u:npm:…] ） */
function translate(name: string, description: string | undefined): string | undefined {
  const zh = ZH[name];
  if (!zh) return description;
  const prefix = description?.match(/^(\[[^\]]+\]\s*)/)?.[1] ?? "";
  return prefix + zh;
}

const commandMenuProviderFactory: AutocompleteProviderFactory = (current) => {
  // 幂等：已经包装过就直接透传（避免 /reload 后重复包装）
  if ((current as unknown as Record<string, unknown>)[PROVIDER_MARKER] === true) return current;

  const wrapped = {
    triggerCharacters: current.triggerCharacters,
    async getSuggestions(lines, cursorLine, cursorCol, options) {
      const result = await current.getSuggestions(lines, cursorLine, cursorCol, options);
      // 只处理命令补全本身（以 / 开头、还没进入参数），参数补全与文件补全不碰
      if (!result || !result.prefix.startsWith("/") || result.prefix.includes(" ")) return result;
      return {
        ...result,
        items: result.items.map((item) => {
          const zh = translate(item.value, item.description);
          return zh === item.description ? item : { ...item, description: zh };
        }),
      };
    },
    applyCompletion: (lines: string[], cursorLine: number, cursorCol: number, item: { value: string; label: string; description?: string }, prefix: string) =>
      current.applyCompletion(lines, cursorLine, cursorCol, item, prefix),
    shouldTriggerFileCompletion: current.shouldTriggerFileCompletion
      ? (lines: string[], cursorLine: number, cursorCol: number) =>
          current.shouldTriggerFileCompletion!(lines, cursorLine, cursorCol)
      : undefined,
  } as typeof current & Record<string, unknown>;

  wrapped[PROVIDER_MARKER] = true;
  return wrapped;
};

let installed = false;

function install(ctx: ExtensionContext): void {
  if (!ctx.hasUI || installed) return;
  installed = true;
  ctx.ui.addAutocompleteProvider(commandMenuProviderFactory);
}

export default function commandMenuZhExtension(pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    install(ctx);
  });

  // /reload 或会话切换后兜底：确保包装还在
  pi.on("before_agent_start", (_event, ctx) => {
    install(ctx);
  });
}
