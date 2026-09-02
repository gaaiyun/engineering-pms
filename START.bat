@echo off
setlocal
chcp 65001 > nul

where node > nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Node.js，请先安装 Node.js 18 或更高版本。
  pause
  exit /b 1
)

if not defined VITE_PB_URL set "VITE_PB_URL=http://127.0.0.1:8090"

echo 工程结算管理系统 - 本地前端开发
echo PocketBase: %VITE_PB_URL%
echo 提示: 本脚本不会启动或重建 PocketBase，也不会写入账号和密钥。
echo.

cd /d "%~dp0frontend"
if not exist node_modules (
  echo [1/2] 安装前端依赖...
  call npm install
  if errorlevel 1 exit /b 1
)

echo [2/2] 启动 Vite 开发服务器...
call npm run dev

endlocal
