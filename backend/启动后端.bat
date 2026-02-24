@echo off
cd /d "%~dp0"

echo ============================================
echo   启动 PocketBase 本地开发后端
echo ============================================
echo.

if not exist pocketbase.exe (
    echo [错误] 找不到 pocketbase.exe，请先运行 download_pocketbase.ps1 下载
    pause
    exit /b
)

echo [启动] PocketBase 正在启动...
echo.
pocketbase.exe serve




















