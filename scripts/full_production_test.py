r"""
全功能生产场景实测 + 截图。模拟真实用户操作链路。

测试覆盖：
A. 管理员 admin_boss：登录 → AdminDashboard → 项目管理 → AI Console（验证 C1 LLM proxy 链路）
B. 经理 zhang_manager：登录 → ReviewCenter 审核 → 创建任务 → 桌面表格 + 批量
C. 员工 chen_doc：登录 → MyTasks → 接收任务 → 标记卡点 → 解除卡点
D. 响应式：3 个 viewport（mobile 390 / mobile_max 768 / desktop 1440）登录后首页
E. C2 HybridAuthStore：rememberMe=true vs false 的 storage 验证

输出：docs/superpowers/qa-screenshots/full_production_test/ 下若干 .png + summary.md
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright, Page, BrowserContext

OUT = Path(r"G:\项目管理软件_v2\docs\superpowers\qa-screenshots\full_production_test")
OUT.mkdir(parents=True, exist_ok=True)

PB = "http://127.0.0.1:8090"
APP = "http://localhost:5173"

USERS = {
    "admin": {"id": "admin_boss", "pwd": "12345678", "name": "赵总"},
    "manager": {"id": "zhang_manager", "pwd": "12345678", "name": "张经理"},
    "employee": {"id": "chen_doc", "pwd": "12345678", "name": "陈资料"},
}

RESULTS: list[dict] = []


def shot(page: Page, name: str, note: str = ""):
    p = OUT / f"{name}.png"
    page.screenshot(path=str(p), full_page=False)
    RESULTS.append({"name": name, "note": note, "url": page.url, "file": p.name})
    print(f"  📸 {name}: {page.url}")


def setup_ctx(browser, viewport=(1440, 900)) -> BrowserContext:
    ctx = browser.new_context(viewport={"width": viewport[0], "height": viewport[1]})
    ctx.add_init_script(f"window.localStorage.setItem('pb_url', {json.dumps(PB)});")
    return ctx


def login(page: Page, user_id: str, password: str, remember: bool = True) -> bool:
    page.goto(f"{APP}/login", wait_until="domcontentloaded", timeout=15000)
    page.wait_for_timeout(1000)
    try:
        page.locator("input").nth(0).fill(user_id)
        page.locator("input").nth(1).fill(password)
        if remember:
            try:
                # antd-mobile checkbox is non-standard; check current state via label click
                cb = page.locator("text=记住登录状态").first
                if cb.is_visible(timeout=500):
                    cb.click()
            except Exception:
                pass
        page.locator("text=登 录").first.click()
        page.wait_for_url(lambda u: "/login" not in u, timeout=15000)
        return True
    except Exception as e:
        print(f"  ⚠️ login failed: {e}")
        return False


def section_a_admin(browser):
    print("\n=== A. 管理员 admin_boss 全流程 ===")
    ctx = setup_ctx(browser)
    page = ctx.new_page()
    if not login(page, USERS["admin"]["id"], USERS["admin"]["pwd"]):
        ctx.close()
        return
    shot(page, "A01_admin_dashboard", "admin 登录后默认到 /admin")

    # 概览 tab（默认）
    page.wait_for_timeout(800)

    # 时间轴 tab
    try:
        page.locator("text=时间轴").first.click(timeout=3000)
        page.wait_for_timeout(2000)
        shot(page, "A02_admin_timeline")
    except Exception as e:
        print(f"  timeline tab: {e}")

    # 项目 tab
    try:
        page.locator("text=项目").first.click(timeout=3000)
        page.wait_for_timeout(2000)
        shot(page, "A03_admin_projects")
    except Exception as e:
        print(f"  projects tab: {e}")

    # AI tab — 验证 C1 LLM proxy UI 路径
    try:
        page.locator("text=AI").first.click(timeout=3000)
        page.wait_for_timeout(2500)
        shot(page, "A04_admin_ai_console", "C1 验证：AI Console 入口")
    except Exception as e:
        print(f"  AI tab: {e}")

    # 我的 tab
    try:
        page.locator("text=我的").first.click(timeout=3000)
        page.wait_for_timeout(1500)
        shot(page, "A05_admin_profile")
    except Exception as e:
        print(f"  profile tab: {e}")

    # 审核中心
    page.goto(f"{APP}/review-center?tab=handoff", wait_until="domcontentloaded", timeout=10000)
    page.wait_for_timeout(1500)
    shot(page, "A06_review_center_handoff_tab", "PR 3 修复：直接 ?tab=handoff 深链")

    # 通知中心
    page.goto(f"{APP}/notifications", wait_until="domcontentloaded", timeout=10000)
    page.wait_for_timeout(1500)
    shot(page, "A07_notifications")

    # 设置
    page.goto(f"{APP}/settings", wait_until="domcontentloaded", timeout=10000)
    page.wait_for_timeout(1500)
    shot(page, "A08_settings")

    ctx.close()


def section_b_manager(browser):
    print("\n=== B. 经理 zhang_manager 全流程 ===")
    ctx = setup_ctx(browser)
    page = ctx.new_page()
    if not login(page, USERS["manager"]["id"], USERS["manager"]["pwd"]):
        ctx.close()
        return
    shot(page, "B01_manager_dashboard", "manager 登录默认 /admin")

    # PR 4 桌面表格视图
    page.goto(f"{APP}/my-tasks", wait_until="domcontentloaded", timeout=10000)
    page.wait_for_timeout(2000)
    shot(page, "B02_my_tasks_desktop_table", "PR 4 桌面 TanStack Table")

    # 试着勾选 checkbox（触发 BulkBar）
    try:
        checkboxes = page.locator("input[type='checkbox']").all()
        if len(checkboxes) >= 2:
            checkboxes[1].click()
            page.wait_for_timeout(800)
            shot(page, "B03_my_tasks_bulkbar_active", "PR 4 BulkBar 多选触发")
    except Exception as e:
        print(f"  bulkbar: {e}")

    # 我的项目
    page.goto(f"{APP}/my-projects", wait_until="domcontentloaded", timeout=10000)
    page.wait_for_timeout(2000)
    shot(page, "B04_my_projects")

    # 切到一个项目的看板
    try:
        first_project = page.locator(".project-card, [class*='project']").first
        if first_project.is_visible(timeout=2000):
            first_project.click()
            page.wait_for_timeout(2500)
            shot(page, "B05_project_timeline_or_kanban")
    except Exception as e:
        print(f"  project nav: {e}")

    # 直接访问看板路径（zhang_manager 应该有 manager 权限拖拽）
    try:
        # 拿第一个项目 id
        req = urllib.request.Request(f"{PB}/api/collections/users/auth-with-password",
            data=json.dumps({"identity": USERS["manager"]["id"], "password": USERS["manager"]["pwd"]}).encode(),
            headers={"Content-Type": "application/json"}, method="POST")
        auth = json.loads(urllib.request.urlopen(req).read())
        req = urllib.request.Request(f"{PB}/api/collections/projects/records?perPage=1&fields=id",
            headers={"Authorization": auth["token"]})
        pid = json.loads(urllib.request.urlopen(req).read())["items"][0]["id"]
        page.goto(f"{APP}/project/{pid}/kanban", wait_until="domcontentloaded", timeout=15000)
        page.wait_for_timeout(3000)
        shot(page, "B06_kanban_board", f"J-3 验证：kanban 实际能加载（pid={pid}）")
    except Exception as e:
        print(f"  kanban: {e}")

    # 时间轴页面
    try:
        page.goto(f"{APP}/project/{pid}/timeline", wait_until="domcontentloaded", timeout=15000)
        page.wait_for_timeout(3000)
        shot(page, "B07_project_timeline_page")
    except Exception as e:
        print(f"  timeline: {e}")

    ctx.close()


def section_c_employee(browser):
    print("\n=== C. 员工 chen_doc 全流程 ===")
    ctx = setup_ctx(browser)
    page = ctx.new_page()
    if not login(page, USERS["employee"]["id"], USERS["employee"]["pwd"]):
        ctx.close()
        return
    shot(page, "C01_employee_home", "employee 默认 /app 含底部 Tab")

    # 切到任务 tab
    try:
        page.locator("text=/^任务/").first.click(timeout=3000)
        page.wait_for_timeout(1500)
        shot(page, "C02_employee_tasks_tab")
    except Exception:
        pass

    # 我的任务（员工视角）
    page.goto(f"{APP}/my-tasks", wait_until="domcontentloaded", timeout=10000)
    page.wait_for_timeout(2000)
    shot(page, "C03_employee_my_tasks", "桌面员工 my-tasks（桌面 viewport 1440）")

    # 通知中心
    page.goto(f"{APP}/notifications", wait_until="domcontentloaded", timeout=10000)
    page.wait_for_timeout(1500)
    shot(page, "C04_employee_notifications")

    # 设置（验证 J-1 桌面端无 mobile header）
    page.goto(f"{APP}/settings", wait_until="domcontentloaded", timeout=10000)
    page.wait_for_timeout(1500)
    shot(page, "C05_employee_settings_desktop", "J-1 修复：桌面端无 mobile page header")

    ctx.close()


def section_d_responsive(browser):
    print("\n=== D. 响应式 3 个 viewport ===")
    for vp_name, w, h in [("390_mobile", 390, 844), ("768_mobile_max", 768, 1024), ("1440_desktop", 1440, 900)]:
        try:
            ctx = setup_ctx(browser, viewport=(w, h))
            page = ctx.new_page()
            if not login(page, USERS["manager"]["id"], USERS["manager"]["pwd"]):
                ctx.close()
                continue
            # 首页
            try:
                page.goto(f"{APP}/admin", wait_until="domcontentloaded", timeout=20000)
                page.wait_for_timeout(2500)
                shot(page, f"D_{vp_name}_admin_home")
            except Exception as e:
                print(f"  {vp_name} admin: {e}")
            # 设置（J-2 重点：768 应铺满，不留两侧空白）
            try:
                page.goto(f"{APP}/settings", wait_until="domcontentloaded", timeout=20000)
                page.wait_for_timeout(2000)
                shot(page, f"D_{vp_name}_settings", "J-2 验证点（768 应铺满）")
            except Exception as e:
                print(f"  {vp_name} settings: {e}")
            # 我的任务（测 PR 4 表格 vs 卡片切换）
            try:
                page.goto(f"{APP}/my-tasks", wait_until="domcontentloaded", timeout=20000)
                page.wait_for_timeout(2500)
                shot(page, f"D_{vp_name}_my_tasks", "桌面=表格 移动=卡片")
            except Exception as e:
                print(f"  {vp_name} my-tasks: {e}")
            ctx.close()
        except Exception as e:
            print(f"  {vp_name} fatal: {e}")


def section_e_remember_login(browser):
    print("\n=== E. C2 HybridAuthStore: rememberMe storage 验证 ===")
    # E.1: rememberMe=true → localStorage 应有 pocketbase_auth
    ctx = setup_ctx(browser)
    page = ctx.new_page()
    if login(page, USERS["manager"]["id"], USERS["manager"]["pwd"], remember=True):
        page.wait_for_timeout(1500)
        storage = page.evaluate("""() => ({
            local: localStorage.getItem('pocketbase_auth')?.length || 0,
            session: sessionStorage.getItem('pocketbase_auth')?.length || 0,
            rememberMe: localStorage.getItem('rememberMe'),
        })""")
        shot(page, "E01_remember_true", f"C2: rememberMe=1 → local={storage['local']} session={storage['session']}")
        print(f"  E1 remember=true: localStorage token len={storage['local']}, sessionStorage={storage['session']}, rememberMe={storage['rememberMe']}")
        RESULTS.append({"name": "E01_storage_check", "note": f"C2 rememberMe=true → local={storage['local']} session={storage['session']}", "url": page.url, "file": "(no file)"})
    ctx.close()

    # E.2: rememberMe=false → sessionStorage 应有，localStorage 应为空
    ctx = setup_ctx(browser)
    page = ctx.new_page()
    if login(page, USERS["manager"]["id"], USERS["manager"]["pwd"], remember=False):
        page.wait_for_timeout(1500)
        storage = page.evaluate("""() => ({
            local: localStorage.getItem('pocketbase_auth')?.length || 0,
            session: sessionStorage.getItem('pocketbase_auth')?.length || 0,
            rememberMe: localStorage.getItem('rememberMe'),
        })""")
        shot(page, "E02_remember_false", f"C2: rememberMe=null → local={storage['local']} session={storage['session']}")
        print(f"  E2 remember=false: localStorage={storage['local']}, sessionStorage={storage['session']}, rememberMe={storage['rememberMe']}")
        RESULTS.append({"name": "E02_storage_check", "note": f"C2 rememberMe=false → local={storage['local']} session={storage['session']}", "url": page.url, "file": "(no file)"})
    ctx.close()


def main() -> int:
    print(f"Output: {OUT}")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            section_a_admin(browser)
            section_b_manager(browser)
            section_c_employee(browser)
            section_d_responsive(browser)
            section_e_remember_login(browser)
        finally:
            browser.close()

    # Write summary
    summary_path = OUT / "_summary.md"
    with open(summary_path, "w", encoding="utf-8") as f:
        f.write("# 全功能生产场景实测 — 截图汇总\n\n")
        f.write(f"共 {len(RESULTS)} 个 entry\n\n")
        f.write("| name | url | note |\n|---|---|---|\n")
        for r in RESULTS:
            note = r.get("note", "").replace("|", "\\|")
            f.write(f"| {r['name']} | `{r['url']}` | {note} |\n")
    print(f"\n=== Done. {len(RESULTS)} entries, summary: {summary_path} ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
