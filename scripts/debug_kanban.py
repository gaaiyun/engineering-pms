"""Debug J-3: ProjectKanban page shows '看板加载失败'"""
import json, urllib.request
from playwright.sync_api import sync_playwright

PB = "http://127.0.0.1:8090"
APP = "http://localhost:5173"

req = urllib.request.Request(f"{PB}/api/collections/users/auth-with-password",
    data=json.dumps({"identity":"zhang_manager","password":"12345678"}).encode(),
    headers={"Content-Type":"application/json"}, method="POST")
auth = json.loads(urllib.request.urlopen(req).read())

req = urllib.request.Request(f"{PB}/api/collections/projects/records?perPage=1",
    headers={"Authorization": auth["token"]})
pid = json.loads(urllib.request.urlopen(req).read())["items"][0]["id"]
print(f"Project: {pid}")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    ctx.add_init_script(f"window.localStorage.setItem('pb_url', {json.dumps(PB)});")
    page = ctx.new_page()

    errors = []
    page.on("console", lambda m: errors.append(f"[{m.type}] {m.text}") if m.type in ("error","warning") else None)
    page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))
    page.on("requestfailed", lambda r: errors.append(f"[reqfail] {r.url} - {r.failure}"))

    # Login
    page.goto(f"{APP}/login", wait_until="domcontentloaded")
    page.wait_for_timeout(1000)
    page.locator("input").nth(0).fill("zhang_manager")
    page.locator("input").nth(1).fill("12345678")
    page.locator("text=登 录").first.click()
    page.wait_for_url(lambda u: "/login" not in u, timeout=10000)
    print(f"Logged in, at: {page.url}")

    # Go to kanban
    page.goto(f"{APP}/project/{pid}/kanban", wait_until="networkidle", timeout=15000)
    page.wait_for_timeout(3000)
    print(f"Kanban URL: {page.url}")
    body = page.locator("body").text_content() or ""
    print("body has '看板加载失败':", "看板加载失败" in body)
    print("body has project name:", "智慧产业园" in body)
    print(f"body[:200]: {body[:200]}")

    print("\n--- console errors/warnings ---")
    for e in errors[:20]:
        print(f"  {e}")

    page.screenshot(path="G:/项目管理软件_v2/docs/superpowers/qa-screenshots/_debug_kanban.png")
    browser.close()
