# pi-kit（消费端说明）

这个目录是公开仓库 [pi-kit](https://github.com/zhaoshuaishuai956/pi-kit) 的克隆，被用作
`PI_CODING_AGENT_DIR`。它是一个**共享的界面层**，不是私人配置目录。

## 给在这台机器上运行的 pi / agent

- 不要在这里写入私人内容：密钥、设备名、内网地址、个人记忆、会话导出。
  需要私人记忆 / 技能时，另建自己的配置目录，或在项目里用 `AGENTS.md`。
- 机器本地文件已被 `.gitignore`（`auth.json*`、`models*.json`、`trust.json`、`sessions/`、`npm/`、
  `bin/`、`git/`、`extensions-disabled/` 等），不要 `git add -f`。
- `extensions/kit-autosync.ts` 会在每次会话启动时 `git pull --ff-only`：
  - 若受跟踪文件在本机被改过，自动同步会跳过（防止覆盖 / 冲突）；
  - 要长期本地覆盖某个文件：`git update-index --skip-worktree <file>`。
- 不要在仓库里提交密钥；密钥只走环境变量或 `pi login`。
- 在这个目录做实验性改动前先建分支或复制文件；改完要么导出到上游（提 PR），要么还原。
  不要把半成品留在工作区，否则自动同步会一直被跳过。

## 上游

主题与大部分 UI 行为来自 npm 包（见 `README.md` 的「上游与致谢」），由 pi 的包管理器安装与更新。
