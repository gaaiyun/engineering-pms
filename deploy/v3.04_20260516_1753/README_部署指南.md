# 🚀 v3.04 部署包 — 宝塔上传指南

**目标读者：** 你（运维 / 开发者）
**部署场景：** 阿里云 ECS + 宝塔面板，已有生产 PocketBase 运行中
**新增内容：** 5 个 PB hooks + 10 个 migrations + 新前端 dist + v3.04 APK
**预计耗时：** 15-20 分钟（不含数据备份）

---

## 📦 包内容（共 9.8 MB）

```
deploy/v3.04_20260516_1753/
├── backend/
│   ├── pb_hooks/                                # 5 个，全部覆盖现网
│   │   ├── realtime.pb.js                       # PR 2 SSE idleTimeout=30min
│   │   ├── handoffs_status_sync.pb.js           # ★ 新 Bug #1+C2+C3 兜底
│   │   ├── audit_logs_reject_sync.pb.js         # ★ 新 E-1+H-1 兜底
│   │   ├── project_progress_sync.pb.js          # ★ 新 I9 项目进度自动重算
│   │   └── llm_proxy.pb.js                      # ★ 新 C1 API key 服务端代理
│   └── pb_migrations/                           # 38 个，PB 自动判已应用跳过
│       ├── ...（旧 migrations，已应用的会自动跳过）
│       ├── 1772800000_tighten_handoffs_rules_and_audit_create.js   # ★ 新
│       ├── 1772900000_tighten_handoffs_create_audit_list.js        # ★ 新
│       └── 1773000000_create_app_settings.js                        # ★ 新
├── frontend/
│   └── dist/                                    # 前端打包产物，覆盖 wwwroot
└── EngineeringPMS_v3.04_production_ready.apk    # ★ 新 Android APK 6.94 MB
```

---

## ⚠️ 部署前必做（5 分钟）

### 1. 备份生产 PocketBase 数据库

**在宝塔终端：**
```bash
cd /www/server/pocketbase
DATE=$(date +%Y%m%d_%H%M)
mkdir -p backups
cp -r pb_data backups/pb_data_${DATE}_before_v3.04
ls -lh backups/ | tail -3
```

**重要：** 这一步**不可跳过**。万一 migration 出错可以回滚。

### 2. 备份现有 pb_hooks（如果有的话）

```bash
cd /www/server/pocketbase
if [ -d pb_hooks ]; then
  cp -r pb_hooks backups/pb_hooks_${DATE}_before_v3.04
fi
```

### 3. 记录当前 PB 版本和最后一条 migration

```bash
cd /www/server/pocketbase
./pocketbase --version
ls pb_migrations/ 2>/dev/null | sort | tail -3
```
> 期望看到 `1772700000_create_device_tokens.js` 是最新的。如果你的服务器最后一个是更早的，说明本次会一次性应用多个 migrations，**就更要先备份**。

---

## 📤 上传方式 — 宝塔 SFTP（推荐）

宝塔自带文件管理器拖拽即可，但**大量文件**用 SFTP 更稳。

### 方式 A：宝塔文件管理器（简单 / 文件少）

1. 登录宝塔 → **文件** → 进入 `/www/server/pocketbase/`
2. **上传 hooks**：进入 `pb_hooks/`（没有则新建），把本地 `deploy/v3.04_*/backend/pb_hooks/` 下 **5 个 .js 文件**全部上传（覆盖同名）
3. **上传 migrations**：进入 `pb_migrations/`，把本地 `deploy/v3.04_*/backend/pb_migrations/` 下**全部 .js 文件**上传（PB 自动判已应用的会跳过）
4. **上传前端**：进入 `/www/wwwroot/<你的站点目录>`（如 `project_v2`），上传 `deploy/v3.04_*/frontend/dist/` **目录下所有内容**（覆盖 `index.html` + `assets/` + `icons/` + `manifest.json` + `sw.js`）

### 方式 B：SCP / SFTP 命令行（推荐 / 文件多）

**本地 PowerShell 或 Git Bash：**

```bash
# 假设你的服务器 IP 是 127.0.0.1，用户 root
# 1. 上传 hooks（5 个文件覆盖）
scp deploy/v3.04_20260516_1753/backend/pb_hooks/*.js root@127.0.0.1:/www/server/pocketbase/pb_hooks/

# 2. 上传 migrations（38 个文件，PB 自动跳过已应用的）
scp deploy/v3.04_20260516_1753/backend/pb_migrations/*.js root@127.0.0.1:/www/server/pocketbase/pb_migrations/

# 3. 上传前端 dist
scp -r deploy/v3.04_20260516_1753/frontend/dist/* root@127.0.0.1:/www/wwwroot/project_v2/
```

> **如何获取服务器 root 密码：** 宝塔面板 → 面板设置 → SSH 状态（确认 SSH 开启）。或者你阿里云控制台的 ECS root 密码。

### 方式 C：rsync（最稳 / 增量同步）

```bash
# 仅会上传变化的文件，重复执行幂等
rsync -avz --progress \
  deploy/v3.04_20260516_1753/backend/ \
  root@127.0.0.1:/www/server/pocketbase/

rsync -avz --progress --delete \
  deploy/v3.04_20260516_1753/frontend/dist/ \
  root@127.0.0.1:/www/wwwroot/project_v2/
```

> `--delete` 会删除目标目录里**不在源里的**文件，确保前端 dist 干净。

---

## 🔄 应用 migrations + 重启 PB（核心步骤）

**在宝塔终端：**

### 1. 应用新 migrations

```bash
cd /www/server/pocketbase
./pocketbase migrate up
```

期望输出类似：
```
Applied: 1772800000_tighten_handoffs_rules_and_audit_create.js
Applied: 1772900000_tighten_handoffs_create_audit_list.js
Applied: 1773000000_create_app_settings.js
```

> 之前的 migrations 已应用，PB 自动跳过；如果你的服务器从未应用过 1772400000+，那次跑会一次性应用 11 个。

### 2. 重启 PocketBase

```bash
# 杀掉现有 PB 进程
pkill -f "pocketbase serve" || true
sleep 2

# 启动（后台）
cd /www/server/pocketbase
nohup ./pocketbase serve --http="0.0.0.0:8090" > pb.log 2>&1 &
echo "PB started, PID=$!"
sleep 3

# 验证服务起来 + hooks 加载
curl -s http://127.0.0.1:8090/api/health
echo ""
tail -20 pb.log
```

期望看到 `Server started at http://0.0.0.0:8090`。**注意检查 pb.log 是否有 `[handoffs hook]` `[audit_logs hook]` `[project_progress]` `[llm-proxy]` 加载错误**。无错即可。

### 3. 配置 LLM API Key（C1 必做）

**只有在你想用 AI 功能时才做这一步。如果不用 AI，跳过本步骤。**

PB Admin UI 方式（推荐）：
1. 浏览器访问 `http://<你的域名或IP>:8090/_/`
2. 用 **superuser 账号**登录（注：不是 admin_boss，是 PB 自己的 admin 邮箱密码）
3. 左侧 → **Collections** → 找到新创建的 `app_settings`
4. **+ New record**：
   - `key`: `siliconflow_api_key`
   - `value`: 你的真实 sk-xxxx... 密钥
   - `description`: `SiliconFlow LLM API key for /api/custom/llm-proxy`
5. Save

PB Admin API 方式（如果你有 admin token）：
```bash
# 用 admin_boss（admin role 用户）登录
TOKEN=$(curl -s -X POST http://127.0.0.1:8090/api/collections/users/auth-with-password \
  -H "Content-Type: application/json" \
  -d '{"identity":"admin_boss","password":"<你的密码>"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

curl -X POST http://127.0.0.1:8090/api/collections/app_settings/records \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key":"siliconflow_api_key","value":"sk-你的真实KEY","description":"LLM API key"}'
```

---

## 🔍 部署后验证（5 分钟）

### 1. 前端访问

浏览器打开你的站点 → 应看到登录页 + 顶部 "服务器已连接"。

### 2. 登录测试

用 `admin_boss / 12345678`（或你设置的）登录 → 应跳转 `/admin` 看到管理控制台。

### 3. PB 端验证 hooks 工作

在宝塔终端：
```bash
# 测 project_progress hook：随便建一条 task，看 project 字段是否自动更新
cd /www/server/pocketbase
tail -f pb.log
# 在另一终端或前端创建一个测试任务，回来这个终端应看到：
# [project_progress] after-create recomputed <projectId> total= X completed= Y progress= Z
# Ctrl+C 退出 tail
```

### 4. 验证 PB rules 收紧（P0-3 + P6/P8）

```bash
# 用普通员工 token 试着 PATCH handoffs.status='approved'，应该 403
EMP_TOKEN=$(curl -s -X POST http://127.0.0.1:8090/api/collections/users/auth-with-password \
  -H "Content-Type: application/json" \
  -d '{"identity":"chen_doc","password":"12345678"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# 拿任一 handoff id
H_ID=$(curl -s "http://127.0.0.1:8090/api/collections/handoffs/records?perPage=1" \
  -H "Authorization: $EMP_TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['items'][0]['id'])")

curl -X PATCH "http://127.0.0.1:8090/api/collections/handoffs/records/$H_ID" \
  -H "Authorization: $EMP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"approved"}' -w "\nHTTP: %{http_code}\n"
```
**期望 HTTP 403 / 401**（员工无权限）— 如果是 200 说明 P0-3 migration 没应用，回去 step 1。

### 5. 验证 LLM proxy（如果配置了 API key）

```bash
USER_TOKEN=$(curl -s -X POST http://127.0.0.1:8090/api/collections/users/auth-with-password \
  -H "Content-Type: application/json" \
  -d '{"identity":"admin_boss","password":"<密码>"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

curl -X POST http://127.0.0.1:8090/api/custom/llm-proxy \
  -H "Authorization: $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-ai/DeepSeek-V3","messages":[{"role":"user","content":"hi"}],"max_tokens":20}'
```
**期望** 200 + LLM 返回内容；403/503 → API key 未配置或权限错。

---

## 📱 APK 安装（独立步骤）

**文件位置**：`deploy/v3.04_20260516_1753/EngineeringPMS_v3.04_production_ready.apk`（6.94 MB）

### 1. 传 APK 到手机
- **方式 A**：把 APK 文件直接发到你的微信文件传输助手，手机点开下载安装。
- **方式 B**：把 APK 放 `frontend/dist/` 同级，加个 Nginx location 让 `http://你的域名/EngineeringPMS_v3.04.apk` 可下载，发链接给员工。

### 2. 手机首次安装
- 设置 → 应用 → 允许此来源安装（"未知来源"）
- 打开 APK 安装
- 启动 app → 默认会用 `frontend/src/lib/pocketbase.ts` 里硬编码的 `http://127.0.0.1:8090`（**如果你的 IP 不是这个，必须先改源码再重打 APK**）

### 3. 后台推送验证（PR 2 关键功能）
- 装好后登录，**通知栏会出现常驻"消息接收中"持久通知**（小图标 + "工程结算管理"）
- 按 home 键回桌面 → 等 5 分钟
- 让另一台手机/电脑给该账号发任务 → **30 秒内** 应在通知栏看到推送
- 如果**收不到**：
  - 小米/华为/OPPO/vivo 必须加电池白名单 + 自启动权限（详见 `docs/android-background-keepalive.md`）
  - 检查 PB 端 `pb_hooks/realtime.pb.js` 是否加载（pb.log 应见 `idleTimeout`）

---

## 🚨 回滚方案（如果新版出大问题）

**1 分钟内回滚：**
```bash
cd /www/server/pocketbase

# 停 PB
pkill -f "pocketbase serve"

# 还原数据库
cp -r backups/pb_data_<日期>_before_v3.04/* pb_data/

# 删新加的 hooks（保留 realtime.pb.js）
rm pb_hooks/handoffs_status_sync.pb.js
rm pb_hooks/audit_logs_reject_sync.pb.js
rm pb_hooks/project_progress_sync.pb.js
rm pb_hooks/llm_proxy.pb.js

# 删新加的 migrations（注：PB 会把已应用的 migrations 记录在 _migrations 表中，
# 但我们已经还原了 pb_data，所以这些表记录也被还原了，没问题）
rm pb_migrations/1772800000_*.js
rm pb_migrations/1772900000_*.js
rm pb_migrations/1773000000_*.js

# 前端也回滚（如果你之前备份了 dist）
# cp -r /backup/wwwroot/project_v2_before_v3.04/* /www/wwwroot/project_v2/

# 重启 PB
nohup ./pocketbase serve --http="0.0.0.0:8090" > pb.log 2>&1 &
```

---

## ❓ 常见问题

### Q1: `./pocketbase migrate up` 报错 "no migration files"
A: 文件没传到 `pb_migrations/` 目录或权限不对。`ls /www/server/pocketbase/pb_migrations/` 看看。

### Q2: PB 重启后 pb.log 显示 hook 报错
A: 看具体哪个 hook 错。我们在所有 hook 外层都加了 try/catch，**不应该阻塞主流程**。如果阻塞了，立刻删该 hook 文件 + 重启 PB。

### Q3: 浏览器进站点后白屏
A:
1. F12 看 console 错误
2. 检查 `/www/wwwroot/project_v2/index.html` 存在
3. 检查 Nginx 配置含 `try_files $uri $uri/ /index.html;`（SPA 必需）

### Q4: 手机 APK 装上后访问 PB 失败
A: APK 内硬编码 PB 地址 `http://127.0.0.1:8090`。如果你的服务器 IP 不同，改 `frontend/src/lib/pocketbase.ts` 第 4 行 `PRODUCTION_PB_URL` 后重新打 APK。

### Q5: AI 功能不工作
A: 没配 `app_settings` 表里的 `siliconflow_api_key`。回到部署步骤 3。

---

## ✅ 完整流程速查（终端命令一条龙）

**假设：** 你已经把部署包传到了服务器 `/tmp/v3.04/`

```bash
# 1. 备份
cd /www/server/pocketbase
DATE=$(date +%Y%m%d_%H%M)
cp -r pb_data backups/pb_data_${DATE}_before_v3.04

# 2. 部署后端文件
cp /tmp/v3.04/backend/pb_hooks/*.js pb_hooks/
cp /tmp/v3.04/backend/pb_migrations/*.js pb_migrations/

# 3. 部署前端
cp -r /tmp/v3.04/frontend/dist/* /www/wwwroot/project_v2/

# 4. 应用 migrations
./pocketbase migrate up

# 5. 重启 PB
pkill -f "pocketbase serve"; sleep 2
nohup ./pocketbase serve --http="0.0.0.0:8090" > pb.log 2>&1 &

# 6. 验证
sleep 3 && curl -s http://127.0.0.1:8090/api/health && tail -10 pb.log
```

完成。

---

**有问题随时找我**（开发者会 commit hash `19c32fa` 之后的版本看到本文档）。
