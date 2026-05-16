"""快速 debug my-tasks 页面，看 employee 登录后能否看到任务"""
import json
from playwright.sync_api import sync_playwright

PB = "http://127.0.0.1:8090"
APP = "http://localhost:5173"

# zhaogong (赵工长 employee) 登录
import urllib.request
auth_data = json.dumps({"identity": "zhao_site", "password": "12345678"}).encode()
req = urllib.request.Request(
    f"{PB}/api/collections/users/auth-with-password",
    data=auth_data,
    headers={"Content-Type": "application/json"},
    method="POST",
)
resp = json.loads(urllib.request.urlopen(req).read())
print(f"Logged in: {resp['record']['username']} role={resp['record']['role']}")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    ctx.add_init_script(
        f"window.localStorage.setItem('pb_url', {json.dumps(PB)});"
    )
    page = ctx.new_page()

    errors = []
    page.on("console", lambda m: errors.append(f"[{m.type}] {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))

    # Login via form
    page.goto(f"{APP}/login", wait_until="domcontentloaded", timeout=15000)
    page.wait_for_timeout(1000)
    page.locator("input").nth(0).fill("zhao_site")
    page.locator("input").nth(1).fill("12345678")
    page.locator("text=登 录").first.click()
    page.wait_for_url(lambda u: "/login" not in u, timeout=10000)
    print(f"After login URL: {page.url}")

    page.goto(f"{APP}/my-tasks", wait_until="domcontentloaded", timeout=15000)
    page.wait_for_timeout(3000)
    print(f"My-tasks URL: {page.url}")

    # Check what's in the DOM
    body_text = page.locator("body").text_content() or ""
    print(f"---page body text (first 500 chars)---")
    print(body_text[:500])
    print("---")

    # Count specific elements
    tab_count = page.locator("text=/进行中|待办|逾期|已完成/").count()
    print(f"Tab text count: {tab_count}")

    # E2E test prefix tasks
    if "E2E-Test-" in body_text:
        print("E2E-Test- prefix found in body!")
    else:
        print("NO E2E-Test- prefix in body")

    page.screenshot(path="G:/项目管理软件_v2/docs/superpowers/qa-screenshots/_debug_my_tasks.png")
    print(f"Screenshot saved")

    if errors:
        print("---console errors/warnings---")
        for e in errors[:10]:
            print(f"  {e}")
    else:
        print("(no console errors)")

    browser.close()
