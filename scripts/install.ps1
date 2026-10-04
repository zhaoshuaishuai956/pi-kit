# pi-kit 安装助手（在克隆后的仓库内运行，Windows PowerShell）。
# 用法: powershell -ExecutionPolicy Bypass -File scripts\install.ps1 [-WriteUserEnv]
#   -WriteUserEnv  把 PI_CODING_AGENT_DIR 写入用户级环境变量（持久化）
param([switch]$WriteUserEnv)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error '缺少 git，请先安装'
    exit 1
}

git -C $Root pull --ff-only

if ($WriteUserEnv) {
    [Environment]::SetEnvironmentVariable('PI_CODING_AGENT_DIR', $Root, 'User')
    Write-Host "✓ 已写入用户环境变量：PI_CODING_AGENT_DIR=$Root"
}

Write-Host ""
Write-Host "pi-kit 就绪：$Root"
Write-Host "  1) `$env:PI_CODING_AGENT_DIR = '$Root'   # 当前会话；-WriteUserEnv 会做持久化"
Write-Host "  2) pi --version                          # 首次启动自动安装 packages，可能较慢"
Write-Host "  3) pi                                    # 交互式启动，确认主题与状态栏"
