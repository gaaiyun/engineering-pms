r"""
v3.0 UI 桌面验证脚本 — 用 Playwright 模拟 desktop/tablet/mobile 三档断点，
访问 PR 1/3/4/5 改造的关键页面，截图存档，检查 JS 错误。

依赖：python -m pip install playwright && playwright install chromium

运行方式（通过 with_server.py 自动起 dev server + 后端 PB）：
  cd G:/项目管理软件_v2
  python C:/Users/gaaiy/.claude/skills/webapp-testing/scripts/with_server.py \
    --server "cd backend && pocketbase.exe serve --http=127.0.0.1:8090" --port 8090 \
    --server "cd frontend && npm run dev -- --host 127.0.0.1" --port 5173 \
    -- python scripts/verify_v3_ui.py
"""
import json
import os
import sys
from pathlib import Path
import urllib.request
import urllib.error

from playwright.sync_api import sync_playwright, Page, BrowserContext

OUT_DIR = Path(r"G:\项目管理软件_v2\docs\superpowers\qa-screenshots")
OUT_DIR.mkdir(parents=True, exist_ok=True)
RESULTS: list[dict] = []

# 注意：frontend/src/lib/pocketbase.ts 在 hostname=localhost 时会强制走
# PRODUCTION_PB_URL（由 VITE_PB_URL 决定）。所以我们必须用同一个 PB 拿 token，
# 否则 token 校验时 frontend 拿 token 去线上 PB 验证会失败。
PB_URL_PROD = os.environ.get("PB_URL_PROD", "http://127.0.0.1:8090")
PB_URL_LOCAL = "http://127.0.0.1:8090"
APP_URL = "http://localhost:5173"
MANAGER = {"identity": "zhang_manager", "password": "12345678"}

BREAKPOINTS = [
    {"name": "desktop", "width": 1440, "height": 900},
    {"name": "tablet", "width": 900, "height": 700},
    {"name": "mobile", "width": 390, "height": 800},
]


def pb_login_at(base: str) -> dict | None:
    """通过指定 PB API 拿 token。返回 { token, record }；失败返回 None"""
    try:
        req = urllib.request.Request(
            f"{base}/api/collections/users/auth-with-password",
            method="POST",
            data=json.dumps(MANAGER).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            return json.loads(resp.read().decode())
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
        print(f"!! PB login at {base} failed: {e}")
        return None


def pb_login() -> tuple[dict | None, str]:
    """优先尝试 prod（因为 frontend 在 localhost 模式下会强制连 prod），
    失败再 fallback 到本地。返回 (auth, base_url_used)。"""
    auth = pb_login_at(PB_URL_PROD)
    if auth is not None:
        return auth, PB_URL_PROD
    auth = pb_login_at(PB_URL_LOCAL)
    if auth is not None:
        return auth, PB_URL_LOCAL
    return None, ""


def inject_pb_url_only(context: BrowserContext, pb_base: str):
    """只强制 pb_url 指向本地 PB（auth 之后通过 UI 表单登录）"""
    context.add_init_script(
        f"window.localStorage.setItem('pb_url', {json.dumps(pb_base)});"
    )


def login_via_form(page: Page) -> bool:
    """在 /login 页面通过表单登录 zhang_manager"""
    try:
        page.goto(APP_URL + "/login", wait_until="networkidle", timeout=15000)
        page.wait_for_timeout(500)
        # antd-mobile Input 用 input[placeholder*=...]
        page.locator("input").nth(0).fill(MANAGER["identity"])
        page.locator("input").nth(1).fill(MANAGER["password"])
        # 登录按钮
        page.locator("text=登 录").first.click()
        # 等导航完成
        page.wait_for_url(lambda url: "/login" not in url, timeout=15000)
        return True
    except Exception as e:
        print(f"!! form login failed: {e}")
        return False


def take_shot(page: Page, name: str, bp: str, extra: dict | None = None):
    file = OUT_DIR / f"{bp}_{name}.png"
    try:
        page.screenshot(path=str(file), full_page=False)
        ok = True
    except Exception as e:  # noqa: BLE001
        ok = False
        print(f"  ! screenshot fail: {e}")
    rec = {"bp": bp, "page": name, "screenshot": file.name, "ok": ok}
    if extra:
        rec.update(extra)
    RESULTS.append(rec)


def check_console(page: Page) -> list[str]:
    """安装控制台监听，返回引用列表（调用方可以 read）"""
    logs: list[str] = []
    page.on("console", lambda msg: logs.append(f"[{msg.type}] {msg.text}") if msg.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))
    return logs


def assert_visible(page: Page, selector: str) -> bool:
    try:
        return page.locator(selector).first.is_visible(timeout=3000)
    except Exception:
        return False


def visit_routes(context: BrowserContext, bp: dict, auth_ok: bool):
    page = context.new_page()
    page.set_viewport_size({"width": bp["width"], "height": bp["height"]})
    console_logs = check_console(page)

    print(f"\n=== Breakpoint: {bp['name']} ({bp['width']}x{bp['height']}) ===")

    # 1. 登录页（取 root redirect 截图）
    page.goto(APP_URL + "/")
    page.wait_for_load_state("networkidle", timeout=15000)
    page.wait_for_timeout(500)
    take_shot(page, "01_root_redirect", bp["name"], {
        "url_after_root": page.url,
        "h_login_visible": assert_visible(page, "text=工程结算管理"),
    })

    if not auth_ok:
        print("  (auth not available — skipping protected pages)")
        page.close()
        return

    # 2. 通过表单实际登录
    login_ok = login_via_form(page)
    if not login_ok:
        print("  (form login failed — protected page screenshots will all be /login)")
        page.close()
        return
    print(f"  form login OK, post-login url: {page.url}")
    take_shot(page, "02a_post_login", bp["name"], {"url": page.url})

    # 2. 跳转到 /app（普通用户首页）— 经理实际默认应该是 /admin
    for path, name in [
        ("/app", "02_home_app"),
        ("/my-tasks", "03_my_tasks_table"),
        ("/notifications", "04_notifications"),
        ("/settings", "05_settings"),
        ("/admin", "06_admin_dashboard"),
        ("/review-center", "07_review_center"),
        ("/my-projects", "08_my_projects"),
    ]:
        try:
            page.goto(APP_URL + path)
            page.wait_for_load_state("networkidle", timeout=15000)
            page.wait_for_timeout(800)
        except Exception as e:
            print(f"  ! goto {path} failed: {e}")
            continue

        # 桌面端检查 Sidebar 是否渲染（aria-label=主导航）
        sidebar_visible = False
        if bp["name"] != "mobile":
            sidebar_visible = assert_visible(page, "[aria-label='主导航']")

        # 移动端检查 Sidebar 不渲染
        sidebar_absent_mobile = False
        if bp["name"] == "mobile":
            sidebar_absent_mobile = page.locator("[aria-label='主导航']").count() == 0

        take_shot(page, name, bp["name"], {
            "url": page.url,
            "sidebar_visible_desktop": sidebar_visible if bp["name"] != "mobile" else None,
            "sidebar_absent_mobile": sidebar_absent_mobile if bp["name"] == "mobile" else None,
        })

    # 3. 错误日志摘要
    if console_logs:
        sample = "\n    ".join(console_logs[:5])
        RESULTS.append({"bp": bp["name"], "page": "_console_errors_warnings", "count": len(console_logs), "sample": sample})
        print(f"  [warn] {len(console_logs)} console errors/warnings; first 5:\n    {sample}")

    page.close()


def main() -> int:
    print(f"Output dir: {OUT_DIR}")

    auth, pb_base = pb_login()
    auth_ok = auth is not None
    if auth_ok and auth is not None:
        print(f"PB login: OK ({auth['record'].get('username', '?')}) via {pb_base}")
    else:
        print("PB login: FAILED — will skip protected pages")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        for bp in BREAKPOINTS:
            context = browser.new_context(viewport={"width": bp["width"], "height": bp["height"]})
            if auth_ok and pb_base:
                inject_pb_url_only(context, pb_base)
            try:
                visit_routes(context, bp, auth_ok)
            finally:
                context.close()

        browser.close()

    # 写入结果 JSON
    report = OUT_DIR / "results.json"
    report.write_text(json.dumps(RESULTS, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n=== Report written to {report} ===")
    print(f"Total entries: {len(RESULTS)}")
    print(f"Screenshots: {len(list(OUT_DIR.glob('*.png')))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
