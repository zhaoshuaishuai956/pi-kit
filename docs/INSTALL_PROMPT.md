<!--
用途：把本文件整段粘贴给一台新终端上的 pi，agent 会完成 pi-kit 的接入与验证。
本文件是自包含的：在克隆仓库之前也能读。
-->

# 任务：把本终端接入 pi-kit 并验证

你是这台终端上新启动的 pi。请把本机接入公开仓库 **pi-kit**（Pi 的界面 / 主题方案），
并**证明**配置确实生效。逐步执行、每步验证；遇到改动用户现有配置或不可逆操作时先停下来问用户，
不要猜、不要绕。

## 0. 背景与红线

- 仓库：`https://github.com/zhaoshuaishuai956/pi-kit.git`（**公开**，匿名 HTTPS 即可克隆）。
  clone 后把它作为 pi 的配置目录（`PI_CODING_AGENT_DIR`）。
- 它只含界面层（主题 / 状态栏 / 中文命令菜单 / 用量栏 / 议会顾问 / 界面设置），
  **不含密钥、记忆、设备信息**。`auth.json` / `models*.json` / `trust.json` / `sessions/` / `npm/`
  等是机器本地文件（已 `.gitignore`），**不要提交、不要 `git add -f`**。
- 不要修改或删除用户已有的配置目录（如 `~/.pi/agent`），它是冷备份；需要旧密钥 / 历史时
  **拷贝**而不是移动。
- 不执行 `git push --force`，不自动解决 merge / rebase 冲突。

## 1. 环境检查

记录 `git --version`、`node -v`、`pi --version`、OS 与默认 shell（bash / zsh / PowerShell）。
缺 git 或 node 先报告再继续。检查 `echo "$PI_CODING_AGENT_DIR"`（Windows：`$env:PI_CODING_AGENT_DIR`）；
若已指向别的目录，先报告，不要直接覆盖。

## 2. 克隆

```bash
git clone https://github.com/zhaoshuaishuai956/pi-kit.git ~/pi-kit
```

- 已存在且是同一仓库 → `git -C ~/pi-kit pull --ff-only`，本提示词可安全重跑。
- 克隆后先读 `README.md` 与 `AGENTS.md`；后续以仓库文档为准。

## 3. 从旧配置迁移机器本地文件（可选，有旧目录才做）

旧目录通常是 `~/.pi/agent`。只**拷贝**以下内容（存在才拷，不要覆盖仓库文件）：
`auth.json`、`models.json`、`models-store.json`、`trust.json`、`sessions/`、`npm/`。
没有旧目录就跳过；provider 登录用 `pi login <provider>` 或环境变量。

## 4. 指向 pi-kit（持久化）

Linux / macOS / Termux（写进 `~/.bashrc` 或 `~/.zshrc`）：

```bash
export PI_CODING_AGENT_DIR="$HOME/pi-kit"
```

Windows（用户级持久化，一次即可）：

```powershell
[Environment]::SetEnvironmentVariable('PI_CODING_AGENT_DIR', "$env:USERPROFILE\pi-kit", 'User')
```

当前 shell 不会立刻生效；后续验证命令请显式带变量（如 `PI_CODING_AGENT_DIR=... pi --version`）。

## 5. 首次启动（装包，可能慢）

```bash
PI_CODING_AGENT_DIR="$HOME/pi-kit" pi --version
```

首次启动会按 `settings.json` 的 `packages` 自动安装 npm 包（`@bachi/pi-coder`、`pi-cyber-ui`、
`pi-mcp-adapter`、`pi-web-access`、`pi-subagents`）；视网络可能几分钟，**不要当卡死**。
第二次启动恢复正常速度。

## 6. 验证

1. `PI_CODING_AGENT_DIR="$HOME/pi-kit" pi list` → 应列出 5 个包。
2. 启动输出里没有 `Failed to load extension` 之类的扩展加载错误。
3. 冒烟：`PI_CODING_AGENT_DIR="$HOME/pi-kit" pi --no-session -p "Reply with exactly: OK"` → 返回 `OK`
   （需要已配置 provider；没有 key 就跳过这一步并说明原因）。
4. 自动同步：`git -C ~/pi-kit log --oneline -1`；再次启动 pi 后 HEAD 不应无故变化（已是最新）；
   若上游确有新提交，启动后 HEAD 应前进，状态栏提示「重启后生效」。
5. 交互式启动 `pi`：确认主题为 `pi-coder-ayu`、底部状态栏存在、`/model` 菜单描述为中文。

## 7. 汇报

用一张表汇报，失败项附原始错误（不要贴 token）与下一步建议：

| 检查项 | 结果 |
|---|---|
| 克隆路径 / 分支 / HEAD | |
| `PI_CODING_AGENT_DIR` 是否持久化 | |
| 旧配置迁移（auth / models / trust / sessions / npm） | |
| `pi list` 包数 | |
| 冒烟（`OK` / 跳过原因） | |
| 启动有无扩展错误 | |
| 自动同步行为 | |

## 长期规则

- 本目录是共享只读层：不写入私人内容；每台机器的密钥与历史留在本机（已 gitignore）。
- 每次 pi 启动会自动 `git pull --ff-only`；本地改过受跟踪文件时同步会跳过 ——
  要长期覆盖某文件用 `git update-index --skip-worktree <file>`。
- 想贡献改动：fork 后在分支上提交、开 PR；不要把密钥或个人数据带进提交。
