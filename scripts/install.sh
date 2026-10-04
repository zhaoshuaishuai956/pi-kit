#!/usr/bin/env bash
# pi-kit 安装助手（在克隆后的仓库内运行，Linux / macOS / Termux）。
# 用法: bash scripts/install.sh [--write-rc]
#   --write-rc  把 PI_CODING_AGENT_DIR 追加到当前登录 shell 的配置文件（.zshrc / .bashrc）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WRITE_RC=0

for arg in "$@"; do
	case "$arg" in
		--write-rc) WRITE_RC=1 ;;
		-h | --help)
			echo "用法：bash scripts/install.sh [--write-rc]"
			exit 0
			;;
		*)
			echo "未知参数：$arg（支持 --write-rc）" >&2
			exit 2
			;;
	esac
done

command -v git >/dev/null 2>&1 || {
	echo "✗ 缺少 git，请先安装" >&2
	exit 1
}

git -C "$ROOT" pull --ff-only

if [ "$WRITE_RC" = "1" ]; then
	case "$(basename "${SHELL:-bash}")" in
		zsh) RC="$HOME/.zshrc" ;;
		*) RC="$HOME/.bashrc" ;;
	esac
	LINE="export PI_CODING_AGENT_DIR=\"$ROOT\""
	if grep -qsF "$LINE" "$RC" 2>/dev/null; then
		echo "✓ $RC 已包含该行"
	else
		printf '\n# pi-kit\n%s\n' "$LINE" >>"$RC"
		echo "✓ 已写入 $RC（新开 shell 生效）"
	fi
fi

echo
echo "pi-kit 就绪：$ROOT"
echo "  1) export PI_CODING_AGENT_DIR=\"$ROOT\"   # 或用 --write-rc 持久化"
echo "  2) pi --version                          # 首次启动自动安装 packages，可能较慢"
echo "  3) pi                                    # 交互式启动，确认主题与状态栏"
