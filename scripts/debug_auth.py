"""快速 debug：注入 auth 后看 localStorage / pb 实例 / 路径状态"""
import json
import urllib.request
from playwright.sync_api import sync_playwright

PB_LOCAL = "http://127.0.0.1:8090"
APP = "http://localhost:5173"

# Login at local PB
req = urllib.request.Request(
    f"{PB_LOCAL}/api/collections/users/auth-with-password",
    method="POST",
    data=json.dumps({"identity": "zhang_manager", "password": "12345678"}).encode(),
    headers={"Content-Type": "application/json"},
)
resp = urllib.request.urlopen(req, timeout=8).read().decode()
auth = json.loads(resp)
print(f"Got token (len={len(auth['token'])}, user={auth['record']['username']})")

payload = json.dumps({"token": auth["token"], "record": auth["record"]})

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    ctx.add_init_script(
        f"window.localStorage.setItem('pb_url', {json.dumps(PB_LOCAL)});"
        f"window.localStorage.setItem('pocketbase_auth', {json.dumps(payload)});"
    )
    page = ctx.new_page()

    logs = []
    page.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"))
    page.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))

    page.goto(APP + "/app")
    page.wait_for_load_state("networkidle", timeout=15000)
    page.wait_for_timeout(1500)

    info = page.evaluate("""
        () => ({
            url: location.href,
            ls_pb_url: localStorage.getItem('pb_url'),
            ls_auth_present: !!localStorage.getItem('pocketbase_auth'),
            ls_auth_len: (localStorage.getItem('pocketbase_auth') || '').length,
            ls_keys: Object.keys(localStorage),
        })
    """)
    print(json.dumps(info, indent=2, ensure_ascii=False))

    print("\nConsole/pageerror entries:")
    for l in logs[:20]:
        print("  ", l)

    page.screenshot(path="G:/项目管理软件_v2/docs/superpowers/qa-screenshots/_debug_auth_after_goto_app.png")
    print(f"\nScreenshot saved")

    browser.close()
