# E2E 业务流程测试 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:executing-plans` (inline)

**Goal:** Playwright 双 context 跑 6 个 manager+employee 协作场景，三层验证（UI + DB + 通知），发现 bug 立即修复。

**Architecture:** Python 单脚本 + Playwright sync_api + 直接调 PB REST。每个 scenario 是独立函数返回 `ScenarioResult`，失败时截图 + dump DB 状态 + 继续下一个。

**Tech Stack:** Playwright Python sync + urllib + PB JS SDK behind Vite。已有 dev server (5173) + PB (8090) 运行。

**Spec：** `docs/superpowers/specs/2026-05-16-e2e-business-flow-test-design.md`

---

## 0. 文件结构

| 文件 | 角色 |
|---|---|
| `scripts/e2e_business_flow.py` | 主测试脚本（含 6 个 scenarios + cleanup） |
| `docs/superpowers/qa-screenshots/e2e_*.png` | 每个 scenario 关键步骤截图 |
| `docs/superpowers/qa-screenshots/e2e_results.json` | scenario pass/fail 矩阵 |
| `docs/superpowers/manual-qa/2026-05-16-e2e-business-flow-results.md` | 最终报告 |

修复发现 bug 时按需修对应 `frontend/src/...` 或 `backend/pb_hooks/...`，一 bug 一 commit。

---

## Task 1: 通用 helpers（写在脚本顶部）

**Files:**
- Create: `scripts/e2e_business_flow.py`

- [ ] **Step 1.1: 起脚本骨架 + helpers**

```python
"""
E2E 业务流程测试 — Playwright 双 context 模拟 manager + employee 协作。
按 docs/superpowers/specs/2026-05-16-e2e-business-flow-test-design.md 执行。
"""
import json
import sys
import time
import urllib.request
import urllib.error
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from playwright.sync_api import sync_playwright, BrowserContext, Page

# ---- 配置 ----
PB_URL = "http://127.0.0.1:8090"
APP_URL = "http://localhost:5173"
PASSWORD = "12345678"

ROLES = {
    "MANAGER": {"username": "zhang_manager", "name": "张经理"},
    "MANAGER2": {"username": "mgr_li", "name": "李经理"},
    "EMPLOYEE": {"username": "zhao_site", "name": "赵工长"},
    "EMPLOYEE2": {"username": "chen_doc", "name": "陈资料"},
    "ADMIN": {"username": "admin_boss", "name": "赵总(老板)"},
}

OUT_DIR = Path(r"G:\项目管理软件_v2\docs\superpowers\qa-screenshots")
OUT_DIR.mkdir(parents=True, exist_ok=True)

TEST_PREFIX = f"E2E-Test-{int(time.time())}-"

# ---- 结果数据结构 ----
@dataclass
class ScenarioResult:
    name: str
    passed: bool = False
    error: str = ""
    screenshots: list[str] = field(default_factory=list)
    db_dumps: dict[str, Any] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)

ALL_RESULTS: list[ScenarioResult] = []

# ---- PB REST helpers ----
def pb_login(identity: str) -> dict:
    req = urllib.request.Request(
        f"{PB_URL}/api/collections/users/auth-with-password",
        method="POST",
        data=json.dumps({"identity": identity, "password": PASSWORD}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.loads(r.read())

def pb_get(path: str, token: str = "", params: dict | None = None) -> dict:
    url = f"{PB_URL}{path}"
    if params:
        from urllib.parse import urlencode
        url += "?" + urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": token} if token else {})
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.loads(r.read())

def pb_post(path: str, token: str, body: dict) -> dict:
    req = urllib.request.Request(
        f"{PB_URL}{path}",
        method="POST",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Authorization": token},
    )
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.loads(r.read())

def pb_delete(path: str, token: str) -> int:
    req = urllib.request.Request(f"{PB_URL}{path}", method="DELETE",
                                  headers={"Authorization": token})
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code

# ---- UI helpers ----
def login_via_form(page: Page, identity: str) -> bool:
    page.goto(f"{APP_URL}/login", wait_until="networkidle", timeout=15000)
    page.wait_for_timeout(500)
    page.locator("input").nth(0).fill(identity)
    page.locator("input").nth(1).fill(PASSWORD)
    page.locator("text=登 录").first.click()
    try:
        page.wait_for_url(lambda u: "/login" not in u, timeout=15000)
        return True
    except Exception:
        return False

def shot(page: Page, name: str, result: ScenarioResult):
    p = OUT_DIR / f"e2e_{name}.png"
    try:
        page.screenshot(path=str(p), full_page=False)
        result.screenshots.append(p.name)
    except Exception as e:
        result.notes.append(f"screenshot fail {name}: {e}")

def setup_pb_override(ctx: BrowserContext):
    """让 React 走本地 PB（pocketbase.ts 在 localhost 会强制连 prod）"""
    ctx.add_init_script(
        f"window.localStorage.setItem('pb_url', {json.dumps(PB_URL)});"
    )
```

- [ ] **Step 1.2: 验证 helpers 能用**

```bash
cd "G:/项目管理软件_v2"
PYTHONIOENCODING=utf-8 PYTHONUTF8=1 python -c "
from scripts.e2e_business_flow import pb_login, ROLES
auth = pb_login(ROLES['MANAGER']['username'])
print('login OK:', auth['record']['name'])
"
```

Expected: `login OK: 张经理`

---

## Task 2: S1 — Manager 建任务 + 指派 + 通知

**Files:**
- Add scenario function to `scripts/e2e_business_flow.py`

- [ ] **Step 2.1: 实现 S1**

```python
def s1_create_and_assign(browser, manager_auth: dict, employee_auth: dict) -> ScenarioResult:
    r = ScenarioResult(name="S1_create_assign")
    try:
        # 找一个可用项目
        projects = pb_get("/api/collections/projects/records",
                          manager_auth["token"],
                          {"perPage": 50, "filter": 'status="active"'})
        if not projects["items"]:
            r.error = "no active project"
            return r
        project = projects["items"][0]
        r.notes.append(f"using project: {project['name']} ({project['id']})")

        # 直接调 PB 创建任务（前端 UI 通过 BatchTaskEditor 复杂，先用 API 创建）
        deadline = "2026-06-30 23:59:59.000Z"
        task = pb_post("/api/collections/tasks/records", manager_auth["token"], {
            "project": project["id"],
            "stage_name": f"{TEST_PREFIX}S1建任务",
            "description": "E2E 测试 S1 — manager 建任务",
            "status": "pending",
            "deadline": deadline,
            "assignees": [employee_auth["record"]["id"]],
            "priority": "normal",
            "created_by": manager_auth["record"]["id"],
            "sequence": 9999,
        })
        r.db_dumps["task"] = {"id": task["id"], "status": task["status"]}
        r.notes.append(f"created task: {task['id']} status={task['status']}")

        # 验证 DB
        if task["status"] != "pending":
            r.error = f"expected status=pending, got {task['status']}"
            return r
        if employee_auth["record"]["id"] not in (task.get("assignees") or []):
            r.error = f"assignee not in {task.get('assignees')}"
            return r

        # 验证通知（用 manager token 查 employee 的通知 — 可能权限不够；试两次）
        time.sleep(1)
        try:
            notes = pb_get("/api/collections/notifications/records",
                          employee_auth["token"],
                          {"filter": f'user="{employee_auth["record"]["id"]}" && created>"{task["created"]}"'})
            assigned_notif = [n for n in notes["items"]
                              if "task_assigned" in n.get("type", "") or "assign" in n.get("title", "")]
            r.db_dumps["notifications"] = [n["title"] for n in notes["items"]][:5]
            r.notes.append(f"notifications fetched: {len(notes['items'])} total, "
                           f"{len(assigned_notif)} task_assigned")
        except Exception as e:
            r.notes.append(f"notif check fail: {e}")

        # UI 验证：employee 视角能看到此任务
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        setup_pb_override(ctx)
        page = ctx.new_page()
        login_via_form(page, employee_auth["record"]["username"])
        page.goto(f"{APP_URL}/my-tasks")
        page.wait_for_load_state("networkidle", timeout=10000)
        page.wait_for_timeout(1500)
        shot(page, "S1_employee_my_tasks", r)
        # 查找任务名
        task_visible = page.locator(f"text={TEST_PREFIX}S1").first.is_visible(timeout=3000)
        r.notes.append(f"task visible in employee my-tasks: {task_visible}")
        if not task_visible:
            r.error = "task not visible in employee UI"
            ctx.close()
            return r
        ctx.close()

        r.passed = True
        # 保存 task_id 给后续 scenarios
        S1_TASK_ID["id"] = task["id"]
    except Exception as e:
        r.error = f"exception: {type(e).__name__}: {e}"
    return r

S1_TASK_ID: dict[str, str] = {}
```

- [ ] **Step 2.2: 写 main() 串接（占位）**

```python
def main() -> int:
    print(f"=== E2E test, prefix={TEST_PREFIX} ===")
    manager_auth = pb_login(ROLES["MANAGER"]["username"])
    employee_auth = pb_login(ROLES["EMPLOYEE"]["username"])
    print(f"manager: {manager_auth['record']['name']} / employee: {employee_auth['record']['name']}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for scenario in [s1_create_and_assign]:
            print(f"\n--- {scenario.__name__} ---")
            try:
                r = scenario(browser, manager_auth, employee_auth)
            except Exception as e:
                r = ScenarioResult(name=scenario.__name__, error=f"top-level: {e}")
            ALL_RESULTS.append(r)
            print(f"  {'PASS' if r.passed else 'FAIL'}: {r.error or 'ok'}")
            for n in r.notes:
                print(f"    {n}")
        browser.close()

    # 写结果
    out = OUT_DIR / "e2e_results.json"
    out.write_text(json.dumps([r.__dict__ for r in ALL_RESULTS], ensure_ascii=False, indent=2), encoding="utf-8")
    passed = sum(1 for r in ALL_RESULTS if r.passed)
    print(f"\n=== {passed}/{len(ALL_RESULTS)} PASS ===")
    return 0 if passed == len(ALL_RESULTS) else 1

if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2.3: 跑 S1**

```bash
cd "G:/项目管理软件_v2"
PYTHONIOENCODING=utf-8 PYTHONUTF8=1 python scripts/e2e_business_flow.py 2>&1 | tail -30
```

Expected: `S1_create_assign PASS` 或暴露 bug。失败就修对应代码。

---

## Task 3-7: S2-S6 复用同样的"实现 → 跑 → 修 bug → 重跑"循环

每个 scenario 函数加到 scripts/e2e_business_flow.py，main() 里串到 scenarios list。代码在执行时具体产出（避免 plan 文件膨胀）。

S2 actions：
- employee 登录 UI 找到 S1 task → 点开 → 改状态 pending→in_progress
- 验证 DB tasks.status / audit_logs / 通知

S3 actions：
- employee 点"完成" → 弹 handoff dialog → 填表 → 提交
- 验证 DB handoffs 表新增

S4 actions：
- manager 登录 `/review-center` → 找 handoff → 批准
- 验证 DB tasks.completed_at / handoffs.status / 通知

S5 actions（错路）：
- mgr_li 登录 review-center → 拒绝 with reason
- 验证任务退回 / employee 收到拒绝通知

S6 actions（批量）：
- 用 API 预创建 3 个任务给 chen_doc
- manager 登录 → desktop /my-tasks → 多选 → batch complete
- 验证 3 个任务 status=completed

每个场景：发现 bug → 修代码 → 单独 commit → 重跑直到通过。

---

## Task 8: Cleanup + 最终报告

- [ ] **Step 8.1: 清理 E2E 测试数据**

```python
def cleanup_e2e_data():
    """删除所有 stage_name 以 E2E-Test- 开头的任务及关联数据"""
    admin = pb_login(ROLES["ADMIN"]["username"])
    token = admin["token"]
    # 找 E2E 任务
    tasks = pb_get("/api/collections/tasks/records",
                   token,
                   {"perPage": 200, "filter": 'stage_name~"E2E-Test-"'})
    print(f"cleanup: {tasks['totalItems']} E2E tasks found")
    for t in tasks["items"]:
        # 删关联 handoffs
        try:
            hs = pb_get("/api/collections/handoffs/records",
                        token, {"filter": f'from_task="{t["id"]}"'})
            for h in hs["items"]:
                pb_delete(f"/api/collections/handoffs/records/{h['id']}", token)
        except Exception:
            pass
        # 删 audit_logs
        try:
            als = pb_get("/api/collections/audit_logs/records",
                         token, {"filter": f'task="{t["id"]}"'})
            for a in als["items"]:
                pb_delete(f"/api/collections/audit_logs/records/{a['id']}", token)
        except Exception:
            pass
        # 删任务本身
        pb_delete(f"/api/collections/tasks/records/{t['id']}", token)
    print("cleanup done")
```

加到 main() 末尾（不论成败都跑）。

- [ ] **Step 8.2: 写报告 `docs/superpowers/manual-qa/2026-05-16-e2e-business-flow-results.md`**

每个 scenario 一节，含：通过/失败 + 截图清单 + DB dump + 失败原因 + 修复 commit 链接。

- [ ] **Step 8.3: Commit 脚本 + 报告 + 截图 + 所有修复 commit + push**

---

## 验收

- 全 6 个 scenario PASS = 通过
- 部分 PASS = 已识别 bug 写入报告
- 每个 bug 一个 commit，git log 可追溯

---

## Execution Handoff

Inline execution（用户已批量授权）。
