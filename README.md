# pi-kit

一套可移植的 [Pi](https://pi.dev) 编码代理**界面 / 主题方案**：clone 下来直接当 `PI_CODING_AGENT_DIR` 用，
每次启动自动从本仓库同步最新设置。

> 只含界面层：主题、状态栏、中文命令菜单、用量栏、议会顾问、少量界面设置。
> 不含任何私人数据 —— 没有设备名、内网地址、账号、密钥、记忆或会话历史；机器本地文件全部被 `.gitignore`。

## 这套方案包含什么

| 组成 | 来自 | 说明 |
|---|---|---|
| 主题 `pi-coder-ayu` | `@bachi/pi-coder` | 深色 Ayu 配色，覆盖整个 TUI |
| 状态栏 · 工具输出折叠 · diff 渲染 | `@bachi/pi-coder` | 一行式 statusline、折叠的 bash/read/write 展示 |
| Working HUD · 工具槽 · 编辑器 | `pi-cyber-ui` | 运行指示、Tokyo Night 风格面板 |
| 中文斜杠命令菜单 | 本仓库 `extensions/command-menu-zh.ts` | `/model`、`/resume` 等命令描述中文化 |
| 套餐用量段 | 本仓库 `extensions/provider-usage.ts` | 状态栏显示 commandcode / opencode / deepseek 的余量 |
| 议会顾问 | 本仓库 `agents/council-*.md` + `pi-subagents` | 务实派 / 反方 / Codex 外部顾问 |
| 启动自动同步 | 本仓库 `extensions/kit-autosync.ts` | 每次启动 `git pull --ff-only` |

## 快速开始

### 方式一：让新终端里的 pi 自己装（推荐）

把 [`docs/INSTALL_PROMPT.md`](docs/INSTALL_PROMPT.md) 整段内容贴进新终端的 pi 会话，agent 会完成
克隆 → 设置环境变量 → 首次启动 → 验证 → 汇报。

### 方式二：手动

```bash
git clone https://github.com/zhaoshuaishuai956/pi-kit.git ~/pi-kit
bash ~/pi-kit/scripts/install.sh --write-rc   # 可选：把 PI_CODING_AGENT_DIR 写进 shell 配置
pi --version                                  # 首次启动会装 packages，可能较慢
```

Windows PowerShell：

```powershell
git clone https://github.com/zhaoshuaishuai956/pi-kit.git "$env:USERPROFILE\pi-kit"
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\pi-kit\scripts\install.ps1" -WriteUserEnv
pi --version
```

首次启动时 pi 会按 `settings.json` 的 `packages` 自动安装 npm 包（`@bachi/pi-coder`、`pi-cyber-ui`、
`pi-mcp-adapter`、`pi-web-access`、`pi-subagents`），视网络可能几分钟；**第二次启动就恢复正常速度**。

本仓库**不含** `auth.json`：用 `pi login <provider>` 或 provider 环境变量登录。想保留旧配置，
把旧目录（如 `~/.pi/agent`）里的 `auth.json` / `models*.json` / `trust.json` / `sessions/` / `npm/`
**拷贝**（不是移动）进来即可。

## 启动自动同步

`extensions/kit-autosync.ts` 在每次 pi 会话启动时：

- 工作区干净 → `git pull --ff-only`；HEAD 前进 → 状态栏提示「已更新，重启后生效」；
- 本地改过受跟踪文件 / 离线 / 冲突 → 跳过并提示，**绝不自动合并**。

想在本机长期覆盖某个文件（例如换主题、改键位），用：

```bash
git update-index --skip-worktree settings.json   # 恢复跟踪：--no-skip-worktree
```

## 仓库结构

```
pi-kit/
├── .pi-kit.json            # 标记文件（自同步扩展据此确认“这是 kit 配置目录”）
├── settings.json           # 界面设置与 packages（无个人 provider 默认值）
├── keybindings.json        # 键位
├── web-search.json         # pi-web-access 工具名映射
├── agents/                 # 议会顾问（模型继承本机默认，不锁个人 provider）
├── extensions/
│   ├── command-menu-zh.ts  # 中文命令菜单
│   ├── provider-usage.ts   # 状态栏用量段
│   └── kit-autosync.ts     # 启动自动同步
├── docs/INSTALL_PROMPT.md  # 贴给新终端 agent 的安装提示词
├── scripts/install.sh      # Linux / macOS / Termux
├── scripts/install.ps1     # Windows
└── themes/                 # 预留；当前主题由 npm 包提供
```

## 安全须知

- `extensions/*.ts` 会以你的**完整权限**运行；这是 pi 扩展的机制，安装前建议先翻一眼源码与 `git log`。
- 本仓库不含密钥；`auth.json`、`models*.json`、`trust.json`、`sessions/`、`npm/` 等机器本地文件已
  `.gitignore`，**不要 `git add -f`**。密钥只走环境变量。
- 第三方包在首次启动时从 npm 安装，各自遵循其许可证（见下）。

## 上游与致谢

| 包 | 作用 | 许可证 |
|---|---|---|
| [`@bachi/pi-coder`](https://github.com/jayli/pi-coder) | 30 个 TUI 扩展、3 个主题、状态栏 | MIT |
| [`pi-cyber-ui`](https://github.com/22GNUs/pi-cyber-ui) | Tokyo Night 风格 UI / working HUD | MIT |
| [`pi-web-access`](https://github.com/nicobailon/pi-web-access) | 联网搜索与抓取工具 | MIT |
| [`pi-subagents`](https://github.com/nicobailon/pi-subagents) | 子代理 / 议会工作流 | MIT |
| [`pi-mcp-adapter`](https://github.com/nicobailon/pi-mcp-adapter) | MCP 适配器 | MIT |

## 版本固定（可选）

`packages` 默认跟随上游最新版；想固定就写版本号，例如：

```json
"packages": ["npm:@bachi/pi-coder@2.3.0"]
```

## 维护方式

本仓库由作者机上的脚本从本机 pi 配置**白名单导出 + 脱敏扫描**后推送；每次导出只包含上面列出的
界面层文件，私人内容不会进入本仓库。

## License

本仓库自有内容为 [MIT](LICENSE)；上游 npm 包遵循各自的许可证。
