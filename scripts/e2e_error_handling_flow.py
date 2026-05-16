r"""
E2E 错误处理/离线场景测试 — Round 4 (Agent L)

测试网络/PB 异常时前端的容错性：
  E1 — PB 服务器中断（不存在端口）→ 是否白屏 vs 错误 UI
  E2 — Token 过期/失效（删 localStorage）→ 是否跳 /login
  E3 — 任务 mutate 失败（route 拦截 500）→ 是否 toast 错误
  E4 — 并发请求（快速点击 5 次）→ debounce/disable 是否有效
  E5 — 大量数据渲染（100 任务）→ 渲染时间、滚动、内存
  E6 — Capacitor 原生事件错误模拟（不易跑，跳过）

前置：pocketbase :8090 + Vite :5173 已启动。
"""
from __future__ import annotations
import asyncio
import io
import json
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", line_buffering=True)
except Exception:
    pass

from playwright.async_api import async_playwright, Page, BrowserContext, Route  # type: ignore

# ========== 配置 ==========
BASE_URL = "http://127.0.0.1:5173"
PB_URL = "http://127.0.0.1:8090"
PB_BAD_URL = "http://127.0.0.1:8091"  # 不存在的端口

ROLES = {
    "MANAGER": {"username": "zhang_manager", "name": "张经理"},
    "EMPLOYEE": {"username": "zhao_site", "name": "赵工长"},
    "ADMIN": {"username": "admin_boss", "name": "赵总(老板)"},
}
PASSWORD = "12345678"

ROOT = Path(r"G:\项目管理软件_v2")
SCREEN_DIR = ROOT / "docs" / "superpowers" / "qa-screenshots" / "error_handling"
LOG_PATH = ROOT / "docs" / "superpowers" / "overnight-log" / "agent_L_error_handling.md"
SCREEN_DIR.mkdir(parents=True, exist_ok=True)
LOG_PATH.parent.mkdir(parents=True, exist_ok=True)

TEST_PREFIX = f"E2E-Err-{int(time.time())}-"


@dataclass
class ScenarioResult:
    name: str
    status: str = "PENDING"  # PASS|FAIL|INCONCLUSIVE
    error: str = ""
    notes: list[str] = field(default_factory=list)
    observations: dict[str, Any] = field(default_factory=dict)
    screenshots: list[str] = field(default_factory=list)
    recommendations: list[str] = field(default_factory=list)


ALL_RESULTS: list[ScenarioResult] = []
CLEANUP_TASKS: list[str] = []


# ========== PB REST helpers ==========
def pb_login(identity: str) -> dict:
    req = urllib.request.Request(
        f"{PB_URL}/api/collections/users/auth-with-password", method="POST",
        data=json.dumps({"identity": identity, "password": PASSWORD}).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def _hdr(token: str) -> dict:
    return {"Authorization": token} if token else {}


def pb_get(path: str, token: str = "", params: dict | None = None) -> dict:
    url = f"{PB_URL}{path}" + ("?" + urlencode(params) if params else "")
    req = urllib.request.Request(url, headers=_hdr(token))
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def _send(method: str, path: str, token: str, body: dict) -> dict:
    req = urllib.request.Request(
        f"{PB_URL}{path}", method=method, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", **_hdr(token)})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {e.code}: {body_text}") from e


def pb_post(path: str, token: str, body: dict) -> dict:
    return _send("POST", path, token, body)


def pb_patch(path: str, token: str, body: dict) -> dict:
    return _send("PATCH", path, token, body)


def pb_delete(path: str, token: str) -> int:
    req = urllib.request.Request(f"{PB_URL}{path}", method="DELETE",
                                  headers=_hdr(token))
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def find_project(token: str) -> dict | None:
    try:
        ps = pb_get("/api/collections/projects/records", token,
                    {"perPage": 5, "filter": 'status="active"'})
        return ps["items"][0] if ps["items"] else None
    except Exception:
        return None


# ========== Playwright helpers ==========
async def inject_auth(page: Page, auth: dict, force_local_pb: bool = True) -> None:
    """通过 localStorage 注入登录态。

    force_local_pb: 默认覆盖 pb_url 到 127.0.0.1:8090，因为前端 pocketbase.ts
    在 localhost 模式下硬编码走线上 127.0.0.1:8090（用于 APK），但本测试
    需要前端连本地 PB（我们建的测试数据都在本地）。
    """
    payload = json.dumps({"token": auth["token"], "model": auth["record"]})
    await page.evaluate(
        """(args) => {
          localStorage.setItem('pocketbase_auth', args.p);
          localStorage.setItem('rememberMe', '1');
          if (args.pbUrl) {
            localStorage.setItem('pb_url', args.pbUrl);
          }
        }""", {"p": payload, "pbUrl": PB_URL if force_local_pb else ""},
    )


async def collect_console(page: Page, label: str) -> list[dict]:
    """开始 console 收集 — 返回引用，scenarios 自行 push。"""
    out: list[dict] = []
    page.on("console", lambda msg: out.append({
        "type": msg.type, "text": msg.text[:300],
    }))
    page.on("pageerror", lambda err: out.append({
        "type": "pageerror", "text": str(err)[:300],
    }))
    return out


async def screenshot(page: Page, name: str) -> str:
    out = SCREEN_DIR / f"{name}.png"
    try:
        await page.screenshot(path=str(out), full_page=False, timeout=8000)
        return str(out).replace("\\", "/")
    except Exception as e:
        return f"screenshot_fail:{e}"


# ============================================================
# E1 — PB 服务器中断（不存在端口）
# ============================================================
async def e1_pb_server_down(context: BrowserContext, auth_mgr: dict) -> ScenarioResult:
    r = ScenarioResult(name="E1_PB_server_down")
    page = await context.new_page()
    console_log = await collect_console(page, "E1")
    try:
        # 先访问站点（带正确 PB），注入 token + 设置 pb_url 指向不存在的端口
        await page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded", timeout=15000)
        await page.wait_for_timeout(500)
        # 不用 force_local_pb，直接覆盖到坏端口
        await inject_auth(page, auth_mgr, force_local_pb=False)
        # 把 pb_url 指向 8091 不存在端口
        await page.evaluate(
            """(badUrl) => { localStorage.setItem('pb_url', badUrl); }""", PB_BAD_URL,
        )

        # 现在跳到 /app — 前端应试图连 8091 → 失败
        nav_start = time.time()
        try:
            await page.goto(f"{BASE_URL}/app", wait_until="domcontentloaded", timeout=15000)
        except Exception as e:
            r.notes.append(f"navigation exception: {e}")

        # 等一段时间让前端尝试请求
        await page.wait_for_timeout(8000)
        nav_elapsed = int((time.time() - nav_start) * 1000)
        r.observations["navigation_elapsed_ms"] = nav_elapsed

        # 检测页面状态
        url = page.url
        r.observations["final_url"] = url
        # 截图
        r.screenshots.append(await screenshot(page, "E1_pb_down"))

        # 探测页面内容：是否白屏 / 是否有 error UI
        probe = await page.evaluate(
            """() => {
              const body = document.body;
              const text = (body.innerText || '').trim();
              const visibleEls = document.querySelectorAll('button, a, [role="alert"], [class*="error"], [class*="Error"], [class*="loading"], [class*="Loading"], [class*="skeleton"]');
              const errorEls = document.querySelectorAll('[class*="error"], [class*="Error"], [role="alert"]');
              return {
                bodyTextLen: text.length,
                bodyTextSample: text.slice(0, 300),
                visibleElCount: visibleEls.length,
                errorElCount: errorEls.length,
                hasReactRoot: !!document.querySelector('#root'),
                rootChildren: document.querySelector('#root')?.children?.length || 0,
                hasLoadingIndicator: !!document.querySelector('[class*="loading"], [class*="Loading"], [class*="skeleton"]'),
              };
            }"""
        )
        r.observations["page_probe"] = probe

        # 收 console 错误
        errors = [c for c in console_log if c["type"] in ("error", "pageerror")]
        r.observations["console_errors_count"] = len(errors)
        r.observations["console_errors_sample"] = errors[:5]

        # 判定
        is_blank = probe["bodyTextLen"] < 5 and probe["rootChildren"] == 0
        has_error_ui = probe["errorElCount"] > 0 or "失败" in probe["bodyTextSample"] or "错误" in probe["bodyTextSample"] or "Error" in probe["bodyTextSample"] or "加载" in probe["bodyTextSample"]
        has_shell = probe["rootChildren"] > 0 and probe["bodyTextLen"] > 5

        if is_blank:
            r.status = "FAIL"
            r.error = "白屏：PB 不可达时整个页面空白，没有错误 UI 也没有 Skeleton。"
            r.recommendations.append(
                "前端应包裹 react-query 调用并展示错误回退 UI（ErrorBoundary 或 Empty/Error 组件），"
                "而非完全交给 SDK fetch 失败崩溃。建议在 App.tsx 加 GlobalErrorBoundary。"
            )
        elif has_error_ui or has_shell:
            # 至少 AppShell 还能渲染（哪怕里面的数据 query 失败）
            r.status = "PASS"
            r.notes.append(
                f"AppShell 渲染正常，content textLen={probe['bodyTextLen']} "
                f"errorEl={probe['errorElCount']} loading={probe['hasLoadingIndicator']}"
            )
            # 但检查是否有明显错误提示 — 仅 console errors 不够，应该有 toast / banner
            has_user_facing_error = (
                probe["errorElCount"] > 0
                or "失败" in probe["bodyTextSample"]
                or "无法连接" in probe["bodyTextSample"]
                or "服务器" in probe["bodyTextSample"]
            )
            page_err_count = sum(1 for c in errors if c["type"] == "pageerror")
            if not has_user_facing_error:
                r.recommendations.append(
                    "PB 不可达时只有 console 错误 + Skeleton 占位符，没有 toast/banner 提示"
                    "「服务器连接失败」。用户会以为只是数据慢加载，而非网络问题。"
                    f"console 有 {len(errors)} 条错误（含 {page_err_count} 条 pageerror "
                    "如 'Something went wrong'）。建议在 react-query QueryClient 默认 "
                    "queryFn onError 或 useApiError hook 触发全局 toast：'服务器连接失败，请检查网络'。"
                )
        else:
            r.status = "INCONCLUSIVE"
            r.notes.append("页面非空但也无明显错误 UI")

        # 回滚 pb_url
        await page.evaluate("() => localStorage.removeItem('pb_url')")
    except Exception as e:
        r.status = "FAIL"
        r.error = f"exception: {type(e).__name__}: {e}"
    finally:
        await page.close()
    return r


# ============================================================
# E2 — Token 过期/失效
# ============================================================
async def e2_token_expired(context: BrowserContext, auth_mgr: dict) -> ScenarioResult:
    r = ScenarioResult(name="E2_token_expired")
    page = await context.new_page()
    console_log = await collect_console(page, "E2")
    try:
        # 先正常登录
        await page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded", timeout=15000)
        await page.wait_for_timeout(500)
        await inject_auth(page, auth_mgr)
        await page.goto(f"{BASE_URL}/app", wait_until="domcontentloaded", timeout=15000)
        await page.wait_for_timeout(2500)

        # 确认在 /app
        before_url = page.url
        r.observations["before_remove_url"] = before_url
        in_app = "/app" in before_url or "/admin" in before_url
        if not in_app:
            r.status = "INCONCLUSIVE"
            r.error = f"初始登录失败，未进入 /app: {before_url}"
            return r

        # 删 localStorage.pocketbase_auth
        await page.evaluate(
            """() => {
              localStorage.removeItem('pocketbase_auth');
              sessionStorage.removeItem('pocketbase_auth');
            }"""
        )

        # reload
        await page.reload(wait_until="domcontentloaded", timeout=15000)
        await page.wait_for_timeout(3500)
        after_url = page.url
        r.observations["after_reload_url"] = after_url

        # 截图
        r.screenshots.append(await screenshot(page, "E2_after_token_remove"))

        # 检测：是否跳 /login + 页面是否健康
        probe = await page.evaluate(
            """() => {
              const text = (document.body.innerText || '').trim();
              return {
                textLen: text.length,
                textSample: text.slice(0, 200),
                rootChildren: document.querySelector('#root')?.children?.length || 0,
                hasLoginForm: !!document.querySelector('input[type="password"]'),
              };
            }"""
        )
        r.observations["page_probe"] = probe
        errors = [c for c in console_log if c["type"] in ("error", "pageerror")]
        r.observations["console_errors_count"] = len(errors)
        r.observations["console_errors_sample"] = errors[:5]

        is_login = "/login" in after_url
        has_login_form = probe.get("hasLoginForm", False)

        if is_login and has_login_form:
            r.status = "PASS"
            r.notes.append(f"已跳 /login 且渲染了登录表单。console errors: {len(errors)}")
        elif is_login and not has_login_form:
            r.status = "FAIL"
            r.error = "URL 跳到 /login 但没渲染表单（可能崩溃）"
        elif not is_login:
            # 检查是否页面崩了
            if probe["rootChildren"] == 0:
                r.status = "FAIL"
                r.error = "Token 失效后页面白屏崩溃"
            else:
                r.status = "FAIL"
                r.error = f"Token 失效后未跳转 /login: {after_url}"
                r.recommendations.append(
                    "PrivateRoute 应监听 pb.authStore.onChange / localStorage 'storage' 事件，"
                    "或在 SDK 401 错误时调用 pb.authStore.clear() + navigate('/login')。"
                )
    except Exception as e:
        r.status = "FAIL"
        r.error = f"exception: {type(e).__name__}: {e}"
    finally:
        await page.close()
    return r


# ============================================================
# E3 — 任务 mutate 失败（拦截 DELETE 返回 500）
# ============================================================
async def e3_mutation_fail(context: BrowserContext, auth_mgr: dict,
                            project_id: str) -> ScenarioResult:
    r = ScenarioResult(name="E3_mutation_fail")
    # 先用 PB API 建一个测试任务（避免污染真实数据）
    try:
        task = pb_post("/api/collections/tasks/records", auth_mgr["token"], {
            "project": project_id,
            "stage_name": f"{TEST_PREFIX}E3-mutfail",
            "description": "E3 测试任务（用于 mutate fail 拦截）",
            "status": "pending",
            "deadline": "2026-08-30 23:59:59.000Z",
            "assignees": [auth_mgr["record"]["id"]],
            "priority": "normal",
            "created_by": auth_mgr["record"]["id"],
            "sequence": 99999,
        })
        CLEANUP_TASKS.append(task["id"])
        r.notes.append(f"created test task: {task['id']}")
    except Exception as e:
        r.status = "FAIL"
        r.error = f"setup task create fail: {e}"
        return r

    page = await context.new_page()
    console_log = await collect_console(page, "E3")

    intercepted_count = {"n": 0}

    async def block_delete(route: Route) -> None:
        req = route.request
        if req.method == "DELETE" and "/api/collections/tasks/records/" in req.url:
            intercepted_count["n"] += 1
            await route.fulfill(
                status=500, content_type="application/json",
                body=json.dumps({
                    "code": 500, "message": "Mock server error (E3 intercept)",
                    "data": {},
                }),
            )
        else:
            await route.continue_()

    await page.route("**/api/collections/tasks/records/**", block_delete)

    try:
        await page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded", timeout=15000)
        await page.wait_for_timeout(400)
        await inject_auth(page, auth_mgr)
        # 直接到任务详情页（最稳的方式：调 PB 的 delete API）
        # 这里用 page.evaluate 直接调 pb SDK delete — 模拟 useDeleteTask mutationFn
        await page.goto(f"{BASE_URL}/app", wait_until="domcontentloaded", timeout=15000)
        await page.wait_for_timeout(2500)

        # 触发 delete — 在浏览器里调 pb sdk
        delete_result = await page.evaluate(
            """async (taskId) => {
              try {
                // 取得全局 pb instance — frontend 通过 ESM 导出，但浏览器全局没暴露。
                // 直接通过 fetch 调 PB DELETE API，复用同样的 token（route 会拦截）
                const auth = JSON.parse(localStorage.getItem('pocketbase_auth') || '{}');
                const token = auth.token;
                const pbUrl = localStorage.getItem('pb_url') || 'http://127.0.0.1:8090';
                const resp = await fetch(`${pbUrl}/api/collections/tasks/records/${taskId}`, {
                  method: 'DELETE',
                  headers: { 'Authorization': token },
                });
                let body = null;
                try { body = await resp.json(); } catch (_) {}
                return { ok: resp.ok, status: resp.status, body };
              } catch (e) {
                return { ok: false, error: String(e) };
              }
            }""",
            task["id"],
        )
        r.observations["delete_result"] = delete_result
        r.observations["route_intercepted_count"] = intercepted_count["n"]

        # 等 toast / UI 渲染
        await page.wait_for_timeout(2000)
        r.screenshots.append(await screenshot(page, "E3_after_delete_fail"))

        # 检查 PB DB：task 是否还在（route 拦截了，所以应该还在）
        await asyncio.sleep(0.5)
        try:
            still_exists = pb_get(f"/api/collections/tasks/records/{task['id']}",
                                   auth_mgr["token"])
            r.observations["task_still_in_db"] = True
            r.observations["task_status"] = still_exists.get("status")
        except Exception as e:
            r.observations["task_still_in_db"] = False
            r.observations["task_query_error"] = str(e)[:200]

        # 检查 audit_logs — 拦截前应该已经 POST 了 delete_task audit
        try:
            audits = pb_get("/api/collections/audit_logs/records", auth_mgr["token"], {
                "perPage": 5,
                "filter": f'task="{task["id"]}" && action_type="delete_task"',
            })
            r.observations["delete_audit_count"] = audits.get("totalItems", 0)
            if audits.get("totalItems", 0) > 0:
                r.observations["delete_audit_ids"] = [
                    a["id"] for a in audits.get("items", [])
                ]
        except Exception as e:
            r.observations["audit_query_error"] = str(e)[:200]

        # 探测：是否有 toast/error UI
        probe = await page.evaluate(
            """() => {
              // 探测 toast / message / error 元素（antd/sonner/自定义）
              const candidates = document.querySelectorAll(
                '[class*="toast"], [class*="Toast"], [class*="message"], [class*="Message"], ' +
                '[role="alert"], [role="status"], [class*="error"], [class*="Error"], [class*="ant-message"], [class*="ant-notification"]'
              );
              const items = [];
              for (const c of candidates) {
                const r = c.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) {
                  const txt = (c.textContent || '').trim().slice(0, 100);
                  if (txt) items.push({ cls: c.className.toString().slice(0,60), text: txt });
                }
              }
              return { toastLikeCount: items.length, samples: items.slice(0, 5) };
            }"""
        )
        r.observations["toast_probe"] = probe

        errors = [c for c in console_log if c["type"] in ("error", "pageerror")]
        r.observations["console_errors_count"] = len(errors)
        r.observations["console_errors_sample"] = [
            e for e in errors[:5]
        ]

        # 判定
        intercepted_ok = intercepted_count["n"] >= 1 and not delete_result.get("ok")
        if not intercepted_ok:
            r.status = "INCONCLUSIVE"
            r.error = "route 未拦截到 DELETE 请求或仍成功"
        else:
            # 关键检查 1：task 应该还在
            if not r.observations.get("task_still_in_db"):
                r.status = "FAIL"
                r.error = "DELETE 500 但 task 已被删除，矛盾"
            # 关键检查 2：audit_log 不应"半写"成残留（即应该和 task 一致）
            elif r.observations.get("delete_audit_count", 0) > 0:
                r.status = "FAIL"
                r.error = (
                    f"AUDIT 残留：DELETE task 失败但已创建了 "
                    f"{r.observations.get('delete_audit_count')} 条 delete_task audit_log。"
                    " 复现路径：useDeleteTask mutationFn 先 await audit_logs.create()，"
                    " 再 await tasks.delete()。第二步失败时第一步已落库，"
                    " 形成「删除被拒但 audit 显示已删除」的不一致。"
                )
                r.recommendations.append(
                    "frontend/src/lib/api.ts:useDeleteTask 应改为：先 delete task 成功后"
                    " 再写 audit_log；或用 PB hook 在 onTaskDelete 写 audit（事务一致）；"
                    " 或对失败做补偿 delete audit。"
                )
            else:
                # toast 是否出现：本测试用 fetch 模拟 SDK 调用，react-query mutation 没跑，"
                # 所以 toast 可能不会触发。这是测试方法的局限，要注意标注
                r.status = "PASS"
                r.notes.append(
                    "DELETE 500 后 task 留在 DB 正确；audit_log 也未残留。"
                )
                r.notes.append(
                    "注意：本测试用 fetch 直接调 API（绕过 react-query），toast 触发依赖 mutation onError。"
                    " 真实 UI（KanbanCard 删除按钮）路径未测，建议补 KanbanPage 操作 E2E。"
                )

    except Exception as e:
        r.status = "FAIL"
        r.error = f"exception: {type(e).__name__}: {e}"
    finally:
        await page.close()
    return r


# ============================================================
# E4 — 快速 5 次点击"标记完成"
# ============================================================
async def e4_rapid_click(context: BrowserContext, auth_emp: dict,
                          auth_mgr: dict, project_id: str) -> ScenarioResult:
    r = ScenarioResult(name="E4_rapid_click_debounce")
    # 建任务：mgr 给 emp，emp 启动
    try:
        task = pb_post("/api/collections/tasks/records", auth_mgr["token"], {
            "project": project_id,
            "stage_name": f"{TEST_PREFIX}E4-rapid",
            "description": "E4 rapid click test",
            "status": "pending",
            "deadline": "2026-08-30 23:59:59.000Z",
            "assignees": [auth_emp["record"]["id"]],
            "priority": "normal",
            "created_by": auth_mgr["record"]["id"],
            "sequence": 99988,
        })
        CLEANUP_TASKS.append(task["id"])
        pb_patch(f"/api/collections/tasks/records/{task['id']}",
                  auth_emp["token"], {"status": "in_progress"})
        r.notes.append(f"created task: {task['id']}")
    except Exception as e:
        r.status = "FAIL"
        r.error = f"setup task fail: {e}"
        return r

    # 直接通过 PB API 并发 5 个 PATCH（模拟"5 次点击穿透到了网络层"）
    # 这个测的不是前端 debounce，而是 PB hook 兜底
    import threading
    from queue import Queue
    qq: Queue = Queue()

    def worker(label: str):
        t0 = time.time()
        try:
            pb_patch(f"/api/collections/tasks/records/{task['id']}",
                      auth_emp["token"], {"status": "completed"})
            pb_post("/api/collections/handoffs/records", auth_emp["token"], {
                "project": project_id, "from_task": task["id"],
                "proposed_title": f"{TEST_PREFIX}E4-{label}",
                "proposed_description": f"rapid click {label}",
                "proposed_assignees": [auth_emp["record"]["id"]],
                "proposed_due_date": "2026-09-30 23:59:59.000Z",
                "status": "pending", "submitter": auth_emp["record"]["id"],
            })
            qq.put({"label": label, "ok": True,
                    "elapsed_ms": int((time.time() - t0) * 1000)})
        except Exception as e:
            qq.put({"label": label, "ok": False,
                    "err": f"{type(e).__name__}: {str(e)[:200]}",
                    "elapsed_ms": int((time.time() - t0) * 1000)})

    threads = [threading.Thread(target=worker, args=(f"c{i+1}",)) for i in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=20)

    results = []
    while not qq.empty():
        results.append(qq.get())
    r.observations["network_layer_results"] = results
    ok_count = sum(1 for x in results if x.get("ok"))
    r.observations["network_layer_ok_count"] = ok_count
    r.notes.append(f"网络层并发 5 次，{ok_count}/5 PB 接受")

    time.sleep(1.2)
    # 查 pending handoffs 数 — PB hook C3 应该兜底
    try:
        hs = pb_get("/api/collections/handoffs/records", auth_mgr["token"], {
            "perPage": 20,
            "filter": f'from_task="{task["id"]}" && status="pending"',
        })
        pending = hs.get("totalItems", 0)
        r.observations["pending_handoff_count"] = pending
        # 全量 handoffs（含 rejected）
        all_h = pb_get("/api/collections/handoffs/records", auth_mgr["token"], {
            "perPage": 20,
            "filter": f'from_task="{task["id"]}"',
        })
        r.observations["total_handoff_count"] = all_h.get("totalItems", 0)
        for h in all_h.get("items", []):
            # cleanup 时一并清
            pass
    except Exception as e:
        r.observations["query_error"] = str(e)[:200]
        pending = -1

    # 现在测前端按钮 disable 状态
    page = await context.new_page()
    console_log = await collect_console(page, "E4")
    try:
        await page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded", timeout=15000)
        await page.wait_for_timeout(400)
        await inject_auth(page, auth_emp)
        # 找 /my-tasks 页面查看按钮状态
        await page.goto(f"{BASE_URL}/my-tasks", wait_until="domcontentloaded", timeout=15000)
        await page.wait_for_timeout(3000)
        # 截图
        r.screenshots.append(await screenshot(page, "E4_my_tasks_after_rapid"))

        # 探测 mutation pending 状态相关的按钮 disable
        probe = await page.evaluate(
            """() => {
              const btns = document.querySelectorAll('button');
              let disabled = 0; let total = 0;
              const sampleDisabled = [];
              for (const b of btns) {
                total++;
                if (b.disabled || b.hasAttribute('aria-disabled') ||
                    b.classList.toString().includes('disabled')) {
                  disabled++;
                  const t = (b.textContent || '').trim().slice(0, 30);
                  if (t && sampleDisabled.length < 8) sampleDisabled.push(t);
                }
              }
              return { totalButtons: total, disabledCount: disabled,
                       sampleDisabled };
            }"""
        )
        r.observations["ui_probe"] = probe
    except Exception as e:
        r.notes.append(f"UI probe failed: {e}")
    finally:
        await page.close()

    # 判定
    if pending == 1:
        r.status = "PASS"
        r.notes.append("PB hook C3 完美兜底：5 次并发只产生 1 个 pending handoff")
    elif pending == 0:
        r.status = "INCONCLUSIVE"
        r.notes.append("无 pending handoff（可能全 reject）")
    elif pending > 1:
        r.status = "FAIL"
        r.error = (
            f"重复 handoff：5 次并发产生 {pending} 个 pending handoff。"
            " PB hook C3（即 handoffs_status_sync 或类似）未能去重。"
        )
        r.recommendations.append(
            "在 PB hook onRecordCreate(handoffs) 加：先查 from_task 是否已有 pending handoff，"
            "如果有则 reject 这次 create。或加 unique index (from_task, status='pending')。"
        )
    else:
        r.status = "INCONCLUSIVE"
        r.error = f"无法判定 pending={pending}"

    return r


# ============================================================
# E5 — 大量数据渲染 (100 task)
# ============================================================
async def e5_large_dataset(context: BrowserContext, auth_emp: dict,
                            auth_mgr: dict, project_id: str) -> ScenarioResult:
    r = ScenarioResult(name="E5_large_dataset_100tasks")
    created_ids: list[str] = []
    try:
        # 批量建 100 个任务 — 用 PB REST，分批避免 timeout
        t_start = time.time()
        for i in range(100):
            t = pb_post("/api/collections/tasks/records", auth_mgr["token"], {
                "project": project_id,
                "stage_name": f"{TEST_PREFIX}E5-bulk-{i:03d}",
                "description": f"E5 large dataset task {i}",
                "status": "in_progress" if i % 3 == 0 else "pending",
                "deadline": "2026-12-30 23:59:59.000Z",
                "assignees": [auth_emp["record"]["id"]],
                "priority": ["low", "normal", "high"][i % 3],
                "created_by": auth_mgr["record"]["id"],
                "sequence": 90000 + i,
            })
            created_ids.append(t["id"])
            CLEANUP_TASKS.append(t["id"])
        bulk_elapsed = int((time.time() - t_start) * 1000)
        r.observations["bulk_create_elapsed_ms"] = bulk_elapsed
        r.observations["created_count"] = len(created_ids)
        r.notes.append(f"created {len(created_ids)} tasks in {bulk_elapsed}ms")
    except Exception as e:
        r.status = "FAIL"
        r.error = f"bulk create fail at i={len(created_ids)}: {e}"
        return r

    page = await context.new_page()
    console_log = await collect_console(page, "E5")
    try:
        await page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded", timeout=15000)
        await page.wait_for_timeout(400)
        await inject_auth(page, auth_emp)

        # 测渲染时间：导航到 /my-tasks 后等渲染
        t0 = time.time()
        await page.goto(f"{BASE_URL}/my-tasks", wait_until="domcontentloaded", timeout=20000)
        nav_elapsed = int((time.time() - t0) * 1000)
        r.observations["my_tasks_nav_elapsed_ms"] = nav_elapsed

        # 等 networkidle（数据加载完）
        t_load = time.time()
        try:
            await page.wait_for_load_state("networkidle", timeout=20000)
        except Exception:
            r.notes.append("networkidle timeout (20s)")
        load_elapsed = int((time.time() - t_load) * 1000)
        r.observations["network_idle_elapsed_ms"] = load_elapsed

        # 主动等待表格数据填充（最多 15s 等任务列表渲染）
        t_data = time.time()
        data_rendered = False
        for _ in range(30):  # 30 * 500ms = 15s
            await page.wait_for_timeout(500)
            row_count = await page.evaluate(
                """() => {
                  // 检查多种可能的任务表格/列表行
                  const tableRows = document.querySelectorAll('table tbody tr');
                  const liItems = document.querySelectorAll('li[class*="task"], li[data-task-id]');
                  const cards = document.querySelectorAll('[class*="elevated-card"], [class*="task-card"], [data-task-id]');
                  return Math.max(tableRows.length, liItems.length, cards.length);
                }"""
            )
            if row_count >= 30:  # >=30 表示已渲染相当数量任务
                data_rendered = True
                break
        data_wait_elapsed = int((time.time() - t_data) * 1000)
        r.observations["data_wait_elapsed_ms"] = data_wait_elapsed
        r.observations["data_rendered"] = data_rendered

        # 渲染探测
        probe = await page.evaluate(
            """() => {
              // 任务卡片/列表项数量 - 多种 selector 兼容
              const tableRows = document.querySelectorAll('table tbody tr');
              const cards = document.querySelectorAll(
                '[class*="elevated-card"], [class*="task-card"], [data-task-id]'
              );
              const taskCount = Math.max(tableRows.length, cards.length);
              // DOM 节点总数（粗略复杂度指标）
              const allEls = document.getElementsByTagName('*').length;
              // 试图找 main 容器
              const main = document.querySelector('main') || document.body;
              // 当前可见 tab 的文字（包含数字如"进行中(34)"）
              const tabs = document.querySelectorAll('[role="tab"], [class*="tab"]');
              const tabTexts = [];
              for (const t of tabs) {
                const txt = (t.textContent || '').trim();
                if (txt && txt.length < 30) tabTexts.push(txt);
              }
              return {
                taskRowCount: taskCount,
                tableRowCount: tableRows.length,
                cardCount: cards.length,
                totalDomEls: allEls,
                mainScrollH: main.scrollHeight,
                mainClientH: main.clientHeight,
                viewportH: window.innerHeight,
                tabTexts: tabTexts.slice(0, 8),
                hasVirtualScroll: !!document.querySelector(
                  '[class*="virtual"], [class*="Virtual"], [data-virtualized]'
                ),
              };
            }"""
        )
        r.observations["render_probe"] = probe

        # 滚动流畅度：模拟滚动到底部测时间
        t_scroll = time.time()
        await page.evaluate("() => window.scrollTo(0, document.body.scrollHeight)")
        await page.wait_for_timeout(500)
        await page.evaluate("() => window.scrollTo(0, 0)")
        await page.wait_for_timeout(300)
        scroll_elapsed = int((time.time() - t_scroll) * 1000)
        r.observations["scroll_test_elapsed_ms"] = scroll_elapsed

        # 内存（CDP - 通过 page.evaluate 拿 performance.memory，仅 chromium）
        try:
            mem = await page.evaluate(
                """() => {
                  if (performance && performance.memory) {
                    return {
                      usedJSHeapSize: performance.memory.usedJSHeapSize,
                      totalJSHeapSize: performance.memory.totalJSHeapSize,
                      jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
                    };
                  }
                  return null;
                }"""
            )
            r.observations["memory_metrics"] = mem
        except Exception as e:
            r.notes.append(f"memory metrics fail: {e}")

        r.screenshots.append(await screenshot(page, "E5_my_tasks_100"))

        # 判定 — 用 data_wait_elapsed 作为「真实数据可见时间」
        # 之前 nav_elapsed+load_elapsed 只测页面骨架时间，不能反映 100 task 渲染负担
        total_render = nav_elapsed + load_elapsed + data_wait_elapsed
        r.observations["total_render_ms"] = total_render

        rendered_task_count = probe.get("taskRowCount", 0)
        # 用户能看到的实际数据量
        r.observations["actually_rendered_tasks"] = rendered_task_count

        if not data_rendered:
            r.status = "FAIL"
            r.error = (
                f"等待 {data_wait_elapsed}ms 后仍未渲染足够任务行 "
                f"(only {rendered_task_count})。tab 文字: {probe.get('tabTexts')}。"
                " 可能数据加载失败或被某条件过滤掉。"
            )
            r.recommendations.append(
                "检查 useMyTasks 查询路径与 MyTasksPage 渲染分组逻辑，"
                "确保任务真的被分到 4 个 tab 之一。"
            )
        elif total_render > 10000:
            r.status = "FAIL"
            r.error = f"渲染 100 任务总用时 {total_render}ms > 10s 阈值"
            r.recommendations.append(
                "添加虚拟滚动（react-window 或 @tanstack/react-virtual）"
                " 到 MyTasksPage / TaskList 组件。当 task 数 > 50 时启用。"
            )
        elif total_render > 5000:
            r.status = "PASS"
            r.notes.append(f"WARN: 渲染 {total_render}ms 偏慢，建议虚拟滚动")
            r.recommendations.append(
                "建议在 MyTasksPage 大量数据时使用虚拟滚动 — 当前 100 条已 5s+"
            )
        else:
            r.status = "PASS"
            r.notes.append(
                f"渲染 100 任务用时 {total_render}ms 可接受"
                f"（实际渲染 {rendered_task_count} 行）"
            )

        if probe.get("totalDomEls", 0) > 5000:
            r.notes.append(f"WARN: DOM 节点 {probe['totalDomEls']} 较多")
        if not probe.get("hasVirtualScroll") and rendered_task_count >= 50:
            r.recommendations.append(
                f"建议虚拟滚动：当前 {rendered_task_count} 行 task 全部渲染到 DOM，"
                "在 200+ 条时性能会显著下降。"
            )
            r.notes.append(f"无虚拟滚动，当前 {rendered_task_count} 行全 DOM 化")
    except Exception as e:
        r.status = "FAIL"
        r.error = f"exception: {type(e).__name__}: {e}"
    finally:
        await page.close()

    return r


# ============================================================
# Cleanup
# ============================================================
def cleanup(admin_token: str) -> dict:
    stats = {"tasks": 0, "handoffs": 0, "audit_logs": 0, "errors": []}
    for tid in set(CLEANUP_TASKS):
        # 先清关联 handoffs
        try:
            hs = pb_get("/api/collections/handoffs/records", admin_token, {
                "perPage": 50, "filter": f'from_task="{tid}"',
            })
            for h in hs.get("items", []):
                code = pb_delete(
                    f"/api/collections/handoffs/records/{h['id']}", admin_token)
                if code in (204, 404):
                    stats["handoffs"] += 1
        except Exception:
            pass
        # 清 audit_logs
        try:
            audits = pb_get("/api/collections/audit_logs/records", admin_token, {
                "perPage": 50, "filter": f'task="{tid}"',
            })
            for a in audits.get("items", []):
                code = pb_delete(
                    f"/api/collections/audit_logs/records/{a['id']}", admin_token)
                if code in (204, 404):
                    stats["audit_logs"] += 1
        except Exception:
            pass
        # 删 task
        code = pb_delete(f"/api/collections/tasks/records/{tid}", admin_token)
        if code in (204, 404):
            stats["tasks"] += 1
        else:
            stats["errors"].append(f"task {tid}: HTTP {code}")
    return stats


# ============================================================
# Report
# ============================================================
def write_report(results: list[ScenarioResult]) -> None:
    lines: list[str] = []
    lines.append("# Agent L — E2E 错误处理 / 离线场景测试（Round 4）")
    lines.append("")
    lines.append(f"- 运行时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"- 测试前缀: `{TEST_PREFIX}`")
    lines.append(f"- 截图目录: `{SCREEN_DIR}`")
    lines.append("")
    # 汇总
    pass_n = sum(1 for r in results if r.status == "PASS")
    fail_n = sum(1 for r in results if r.status == "FAIL")
    inc_n = sum(1 for r in results if r.status == "INCONCLUSIVE")
    skip_n = sum(1 for r in results if r.status == "SKIP")
    lines.append(f"## 汇总: {pass_n} PASS / {fail_n} FAIL / {inc_n} INCONCLUSIVE / {skip_n} SKIP")
    lines.append("")
    lines.append("| Scenario | Status | 摘要 |")
    lines.append("|---|---|---|")
    for r in results:
        summary = (r.error or (r.notes[0] if r.notes else "")).replace("\n", " ")[:80]
        lines.append(f"| {r.name} | **{r.status}** | {summary} |")
    lines.append("")

    for r in results:
        lines.append(f"## {r.name}")
        lines.append(f"**状态**: {r.status}")
        if r.error:
            lines.append("")
            lines.append(f"**错误/原因**: {r.error}")
        if r.notes:
            lines.append("")
            lines.append("### 实际观察")
            for n in r.notes:
                lines.append(f"- {n}")
        if r.observations:
            lines.append("")
            lines.append("### 关键数据")
            lines.append("```json")
            try:
                lines.append(json.dumps(r.observations, ensure_ascii=False, indent=2))
            except Exception:
                lines.append(str(r.observations))
            lines.append("```")
        if r.screenshots:
            lines.append("")
            lines.append("### 截图")
            for s in r.screenshots:
                lines.append(f"- `{s}`")
        if r.recommendations:
            lines.append("")
            lines.append("### 修复建议")
            for rec in r.recommendations:
                lines.append(f"- {rec}")
        lines.append("")
        lines.append("---")
        lines.append("")

    # E6 单独记录
    lines.append("## E6_Capacitor_native_event (SKIP)")
    lines.append("**状态**: SKIPPED")
    lines.append("")
    lines.append("**原因**: 需要在 Android 设备/模拟器上运行 native context，Playwright Chromium 不能模拟 Capacitor APIs (`@capacitor/network`, `@capacitor/app` 等)。")
    lines.append("")
    lines.append("### 推荐验证方案")
    lines.append("1. **Capacitor Network 监听**: 在 `frontend/src/lib/networkStatus.ts`（如有）订阅 `Network.addListener('networkStatusChange')`。模拟器中切飞行模式，观察 React Query `onlineManager.setOnline()` 是否被调用、UI 是否显示离线 banner。")
    lines.append("2. **App resume/pause**: `CapacitorApp.addListener('appStateChange', ...)` — 切后台 30s 后回前台，观察 `pb.authStore.isValid` + SSE 重连情况。")
    lines.append("3. **Push notification onError**: 在 `pushNotifications.ts` 模拟 FCM token 注册失败（断网注册），看是否有 fallback。")
    lines.append("4. **建议手动 QA 脚本**: 准备 `docs/qa/capacitor_offline_manual.md` 列出 10 项 native-only 检查。")
    lines.append("")

    LOG_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"\n报告写入: {LOG_PATH}")


# ============================================================
# main
# ============================================================
async def main_async() -> int:
    print(f"=== E2E Error handling test starting, prefix={TEST_PREFIX} ===\n")
    try:
        auth_mgr = pb_login(ROLES["MANAGER"]["username"])
        auth_emp = pb_login(ROLES["EMPLOYEE"]["username"])
        auth_admin = pb_login(ROLES["ADMIN"]["username"])
    except Exception as e:
        print(f"FATAL: cannot login: {e}")
        return 1

    project = find_project(auth_mgr["token"])
    if not project:
        print("FATAL: no active project")
        return 1
    print(f"using project: {project.get('name')} ({project['id']})\n")
    project_id = project["id"]

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            ignore_https_errors=True,
        )
        # 设置默认超时
        context.set_default_timeout(20000)

        scenarios = [
            ("E1", lambda: e1_pb_server_down(context, auth_mgr)),
            ("E2", lambda: e2_token_expired(context, auth_mgr)),
            ("E3", lambda: e3_mutation_fail(context, auth_mgr, project_id)),
            ("E4", lambda: e4_rapid_click(context, auth_emp, auth_mgr, project_id)),
            ("E5", lambda: e5_large_dataset(context, auth_emp, auth_mgr, project_id)),
        ]

        for label, fn in scenarios:
            print(f"--- {label} ---")
            t0 = time.time()
            try:
                res = await fn()
            except Exception as e:
                res = ScenarioResult(name=f"{label}_outer_fail",
                                      status="FAIL",
                                      error=f"outer exception: {type(e).__name__}: {e}")
            elapsed = int((time.time() - t0) * 1000)
            res.notes.append(f"elapsed_ms: {elapsed}")
            ALL_RESULTS.append(res)
            print(f"  {res.status}: {res.error or 'ok'}  ({elapsed}ms)")
            for n in res.notes:
                print(f"    · {n}")
            print()

        await context.close()
        await browser.close()

    # cleanup
    print("--- cleanup ---")
    cs = cleanup(auth_admin["token"])
    print(f"  deleted: tasks={cs['tasks']} handoffs={cs['handoffs']} "
          f"audit_logs={cs['audit_logs']}")
    if cs["errors"]:
        print(f"  cleanup errors (first 3): {cs['errors'][:3]}")

    # 写报告
    write_report(ALL_RESULTS)

    # 汇总
    passed = sum(1 for r in ALL_RESULTS if r.status == "PASS")
    failed = sum(1 for r in ALL_RESULTS if r.status == "FAIL")
    inc = sum(1 for r in ALL_RESULTS if r.status == "INCONCLUSIVE")
    print(f"\n=== Summary: {passed} PASS / {failed} FAIL / {inc} INCONCLUSIVE "
          f"/ {len(ALL_RESULTS)} total ===")
    return 0 if failed == 0 else 1


def main() -> int:
    return asyncio.run(main_async())


if __name__ == "__main__":
    sys.exit(main())
