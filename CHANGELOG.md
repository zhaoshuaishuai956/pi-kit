# Changelog

## 0.1.0 — 2026-10-04

首次发布：可移植的 Pi 界面 / 主题方案。

- 主题 `pi-coder-ayu`、状态栏、工具输出折叠、diff 渲染（来自 npm 包 `@bachi/pi-coder`）
- Working HUD / 工具槽 / 编辑器样式（来自 npm 包 `pi-cyber-ui`）
- 中文斜杠命令菜单（`extensions/command-menu-zh.ts`）
- 状态栏套餐用量段：commandcode / opencode / deepseek（`extensions/provider-usage.ts`）
- 议会顾问 agents：务实派 / 反方 / Codex 外部顾问（配合 `pi-subagents`）
- `extensions/kit-autosync.ts`：每次会话启动 `git pull --ff-only`，只读同步、本地有改动时跳过
- 安装提示词（`docs/INSTALL_PROMPT.md`）与 bash / PowerShell 安装脚本
