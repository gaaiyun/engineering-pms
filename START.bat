@echo off
chcp 65001 > nul
echo ═══════════════════════════════════════════════════
echo     工程项目管理系统 - 快速启动
echo ═══════════════════════════════════════════════════
echo.

echo [1/3] 检查 Node.js...
node -v
if %errorlevel% neq 0 (
    echo 错误: 未安装 Node.js
    pause
    exit /b 1
)

echo [2/3] 启动前端开发服务器...
cd /d "%~dp0frontend"
start cmd /k "npm run dev"

echo [3/3] 等待服务器启动...
timeout /t 5 /nobreak > nul

echo.
echo ═══════════════════════════════════════════════════
echo   ✅ 启动完成！
echo ═══════════════════════════════════════════════════
echo.
echo 🌐 访问地址: http://localhost:5173 或 http://localhost:5174
echo.
echo 📱 测试账号:
echo    经理: zhang_manager / 12345678
echo    员工: chen_doc / 12345678
echo.
echo 🔑 配置 AI Key: 在浏览器控制台执行:
echo    localStorage.setItem('sf_api_key', 'sk-YOUR_SILICONFLOW_API_KEY')
echo.
echo ═══════════════════════════════════════════════════

start http://localhost:5173

pause
