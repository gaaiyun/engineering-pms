#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
跨断点 UI 截图回归 — Agent J

5 viewport × 7 page = 35 截图，验证 AppShell 响应式（PR 3）：
  - desktop ≥ 1024  → Sidebar + TopBar
  - tablet 769-1023 → Sidebar (collapsed=64px)
  - mobile < 769    → 透传无 Sidebar

输出：
  G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/<vp>_<page>.png
  G:/项目管理软件_v2/docs/superpowers/overnight-log/agent_J_responsive_diff.md
"""
from __future__ import annotations
import asyncio
import io
import json
import os
import sys
import time
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", line_buffering=True)
except Exception:
    pass

from playwright.async_api import async_playwright, Page  # type: ignore

# ========== 配置 ==========
BASE_URL = os.environ.get("FRONTEND_URL", "http://127.0.0.1:5173")
PB_URL = os.environ.get("PB_URL", "http://127.0.0.1:8090")
USERNAME = "zhang_manager"
PASSWORD = "12345678"

ROOT = Path(__file__).resolve().parent.parent
SCREEN_DIR = ROOT / "docs" / "superpowers" / "qa-screenshots" / "responsive"
LOG_PATH = ROOT / "docs" / "superpowers" / "overnight-log" / "agent_J_responsive_diff.md"
SCREEN_DIR.mkdir(parents=True, exist_ok=True)
LOG_PATH.parent.mkdir(parents=True, exist_ok=True)

# 5 viewports: (name, width, height, expected_shell)
VIEWPORTS: list[tuple[str, int, int, str]] = [
    ("1440x900_desktop", 1440, 900, "desktop"),
    ("1024x768_desktop_min", 1024, 768, "desktop"),   # 临界点
    ("900x700_tablet", 900, 700, "tablet"),
    ("768x1024_mobile_max", 768, 1024, "mobile"),     # 临界点 - 应是 mobile（<769 严格）
    ("390x844_mobile", 390, 844, "mobile"),
]

# 核心页面：(route, name, wait_selector_or_none, extra_wait_ms)
# 注意 /project/:id/kanban 用 first_project_id 动态填充
PAGES: list[tuple[str, str, str | None, int]] = [
    ("/app", "01_home", None, 1500),
    ("/my-tasks", "02_my_tasks", None, 1800),
    ("/admin", "03_admin", None, 2200),
    ("/review-center?tab=handoff", "04_review_handoff", None, 2000),
    ("/notifications", "05_notifications", None, 1500),
    ("/settings", "06_settings", None, 1200),
    # kanban 在 main 中追加
]


# ========== PB helpers ==========
def _pb_login() -> dict:
    body = json.dumps({"identity": USERNAME, "password": PASSWORD}).encode()
    req = urllib.request.Request(
        f"{PB_URL}/api/collections/users/auth-with-password",
        method="POST", data=body,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.loads(r.read())


def _pb_get_first_project_id(token: str) -> str:
    req = urllib.request.Request(
        f"{PB_URL}/api/collections/projects/records"
        f"?perPage=5&filter=" + urllib.request.quote('status="active"'),
        headers={"Authorization": token},
    )
    with urllib.request.urlopen(req, timeout=8) as r:
        data = json.loads(r.read())
    return data["items"][0]["id"]


# ========== finding helpers ==========
@dataclass
class ShotResult:
    viewport: str
    page: str
    route: str
    path: str
    shell: str = ""        # desktop|mobile|''  (data-shell 直接值)
    shell_mode: str = ""   # mobile|tablet|desktop (含 sidebar 宽度判定)
    expected_shell: str = ""
    sidebar_visible: bool | None = None
    sidebar_width: int = 0
    scroll_w: int = 0
    client_w: int = 0
    has_h_overflow: bool = False
    visible_texts: list[str] = field(default_factory=list)
    error: str = ""
    notes: list[str] = field(default_factory=list)


async def login(page: Page, base: str, username: str, password: str) -> bool:
    await page.goto(f"{base}/login")
    await page.wait_for_load_state("networkidle")
    await page.wait_for_timeout(800)
    try:
        # 用 JS 注入 localStorage 直接登录（避免移动端表单交互复杂度）
        auth = _pb_login()
        token = auth["token"]
        model = auth["record"]
        # PocketBase JS SDK 的 authStore localStorage key 通常为 'pocketbase_auth'
        auth_payload = json.dumps({"token": token, "model": model})
        await page.evaluate(
            """(payload) => {
              localStorage.setItem('pocketbase_auth', payload);
              localStorage.setItem('rememberMe', '1');
              sessionStorage.setItem('pocketbase_auth', payload);
            }""",
            auth_payload,
        )
        # 跳到根触发 DefaultRedirect 或直接 /app
        await page.goto(f"{base}/app")
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(1000)
        if "/login" in page.url:
            # 备用：直接表单提交
            await page.goto(f"{base}/login")
            await page.wait_for_load_state("networkidle")
            await page.wait_for_timeout(500)
            await page.evaluate(
                """(args) => {
                  const inputs = document.querySelectorAll('input');
                  if (inputs.length >= 2) {
                    inputs[0].value = args.u;
                    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
                    inputs[1].value = args.p;
                    inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
                  }
                }""",
                {"u": username, "p": password},
            )
            await page.wait_for_timeout(400)
            try:
                await page.locator('button[type="submit"]').click()
            except Exception:
                pass
            await page.wait_for_timeout(2500)
        return "/login" not in page.url
    except Exception as e:
        print(f"  login error: {e}")
        return False


async def probe_layout(page: Page) -> dict[str, Any]:
    """探测当前页面布局：是否 desktop shell / sidebar / horizontal overflow / 可见文字。"""
    return await page.evaluate(
        """() => {
          const shellEl = document.querySelector('[data-shell="desktop"]');
          const shell = shellEl ? 'desktop' : 'mobile';
          // sidebar：data-shell 内部第一个 grid cell（或显式 aside / role=navigation）
          let sidebarVisible = false;
          let sidebarWidth = 0;
          let shellMode = shell; // 'mobile' | 'tablet' | 'desktop'
          if (shellEl) {
            const sidebar = shellEl.querySelector('nav, aside, [class*="idebar"], [class*="ide-bar"]') ||
              shellEl.firstElementChild;
            if (sidebar) {
              const rect = sidebar.getBoundingClientRect();
              sidebarVisible = rect.width > 0 && rect.height > 0;
              sidebarWidth = Math.round(rect.width);
              // 通过 sidebar 宽度区分 tablet(64px) vs desktop(240px)
              if (sidebarVisible) {
                shellMode = sidebarWidth < 120 ? 'tablet' : 'desktop';
              }
            }
          }
          const html = document.documentElement;
          const body = document.body;
          const scrollW = Math.max(html.scrollWidth, body ? body.scrollWidth : 0);
          const clientW = html.clientWidth;
          const innerW = window.innerWidth;
          // 抓 main 区域可见的前几段非空文字（用于"关键文字可见"检查）
          const root = document.querySelector('main') || body;
          const texts = [];
          if (root) {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
            let n;
            while ((n = walker.nextNode()) && texts.length < 25) {
              const t = (n.textContent || '').trim();
              if (t.length >= 2 && t.length < 80) {
                // 检查可见性
                const p = n.parentElement;
                if (!p) continue;
                const r = p.getBoundingClientRect();
                if (r.width > 0 && r.height > 0 && r.top < innerW * 2) {
                  texts.push(t);
                }
              }
            }
          }
          // 检查页面是否有看起来像"移动 header 漏到桌面"的元素（左侧返回箭头 + 居中标题）
          // 简单启发式：在 main 顶部 80px 范围内查找 svg/icon 形状的小按钮
          const mobileHeaderLeak = (() => {
            if (shell !== 'desktop') return false;
            const mainEl = document.querySelector('main');
            if (!mainEl) return false;
            const mainRect = mainEl.getBoundingClientRect();
            const candidates = mainEl.querySelectorAll('button, svg, [class*="back"], [class*="Back"]');
            for (const c of candidates) {
              const r = c.getBoundingClientRect();
              if (r.top - mainRect.top < 80 && r.left - mainRect.left < 80 &&
                  r.width > 6 && r.width < 48 && r.height > 6 && r.height < 48) {
                const txt = (c.textContent || '').trim();
                if (!txt || /[<←‹]/.test(txt)) return true;
              }
            }
            return false;
          })();
          // 检查 truncate/ellipsis 元素是否真有内容溢出
          const truncated = [];
          const candidates = document.querySelectorAll('[class*="truncate"], [class*="ellipsis"]');
          for (let i = 0; i < Math.min(candidates.length, 30); i++) {
            const el = candidates[i];
            if (el.scrollWidth > el.clientWidth + 2) {
              truncated.push({
                text: (el.textContent || '').trim().slice(0, 40),
                scroll: el.scrollWidth, client: el.clientWidth,
              });
            }
          }
          return {
            shell, shellMode, sidebarVisible, sidebarWidth,
            scrollW, clientW, innerW,
            visibleTexts: texts.slice(0, 12),
            truncated: truncated.slice(0, 6),
            mobileHeaderLeak,
          };
        }"""
    )


async def capture_one(
    page: Page, vp_name: str, vp_expected: str, route: str, page_name: str,
    wait_ms: int,
) -> ShotResult:
    out_path = SCREEN_DIR / f"{vp_name}_{page_name}.png"
    res = ShotResult(
        viewport=vp_name, page=page_name, route=route,
        path=str(out_path).replace("\\", "/"),
        expected_shell=vp_expected,
    )
    try:
        nav_err: Exception | None = None
        for attempt in range(2):
            try:
                await page.goto(f"{BASE_URL}{route}", wait_until="domcontentloaded", timeout=15000)
                nav_err = None
                break
            except Exception as e:
                nav_err = e
                await page.wait_for_timeout(800)
        if nav_err:
            raise nav_err
        try:
            await page.wait_for_load_state("networkidle", timeout=12000)
        except Exception:
            res.notes.append("networkidle timeout (12s)")
        await page.wait_for_timeout(wait_ms)
        # 关闭"重要通知"等首次弹窗（如果有）
        try:
            close_btns = page.locator(
                'button:has-text("知道了"), button:has-text("关闭"), '
                'button:has-text("确定"), [aria-label="Close"]'
            )
            if await close_btns.count() > 0:
                await close_btns.first.click(timeout=500)
                await page.wait_for_timeout(200)
        except Exception:
            pass
        await page.screenshot(path=str(out_path), full_page=True)

        info = await probe_layout(page)
        res.shell = info["shell"]
        res.shell_mode = info["shellMode"]
        res.sidebar_visible = info["sidebarVisible"]
        res.sidebar_width = info.get("sidebarWidth", 0)
        res.scroll_w = info["scrollW"]
        res.client_w = info["clientW"]
        res.has_h_overflow = info["scrollW"] > info["clientW"] + 4
        res.visible_texts = info["visibleTexts"]
        if info.get("truncated"):
            res.notes.append(
                "truncated: " + json.dumps(info["truncated"], ensure_ascii=False)[:200]
            )
        # 一致性校验
        if vp_expected == "mobile" and info["shell"] != "mobile":
            res.notes.append(f"[BUG] expected mobile shell, got {info['shell']}")
        if vp_expected != "mobile" and info["shell"] != "desktop":
            res.notes.append(f"[BUG] expected desktop shell, got {info['shell']}")
        if vp_expected != "mobile" and not info["sidebarVisible"]:
            res.notes.append("[BUG] desktop shell but sidebar not visible")
        if vp_expected == "mobile" and info["sidebarVisible"]:
            res.notes.append("[BUG] mobile shell unexpectedly shows sidebar")
        # tablet 折叠校验：sidebar 应 <120px
        if vp_expected == "tablet" and info["shellMode"] != "tablet":
            res.notes.append(
                f"[BUG] expected tablet (sidebar≈64px), got {info['shellMode']} "
                f"(sidebar={info.get('sidebarWidth')}px)"
            )
        if vp_expected == "desktop" and info["shellMode"] == "tablet":
            res.notes.append(
                f"[BUG] desktop viewport showing collapsed sidebar "
                f"({info.get('sidebarWidth')}px)"
            )
        if res.has_h_overflow:
            res.notes.append(
                f"[BUG] horizontal overflow: scrollW={info['scrollW']} > clientW={info['clientW']}"
            )
        if info.get("mobileHeaderLeak"):
            res.notes.append(
                "mobile-header-leak: 桌面端 main 顶部出现小按钮（可能是移动 header 漏出来）"
            )
    except Exception as e:
        res.error = f"{type(e).__name__}: {e}"
    return res


async def run_for_viewport(
    browser, vp_name: str, w: int, h: int, expected: str, project_id: str
) -> list[ShotResult]:
    is_mobile = expected == "mobile"
    context = await browser.new_context(
        viewport={"width": w, "height": h},
        device_scale_factor=1,
        is_mobile=is_mobile,
        has_touch=is_mobile,
    )
    # 修 J-3 false-positive：frontend/src/lib/pocketbase.ts 在 localhost 时
    # 强制走生产 PB（127.0.0.1:8090），导致 first_project_id（来自本地 PB）
    # 在生产 PB 不存在 → 'kanban 加载失败'。注入 pb_url 让浏览器与脚本共用
    # 本地 PB 数据源。
    import json as _json
    await context.add_init_script(
        f"window.localStorage.setItem('pb_url', {_json.dumps(PB_URL)});"
    )
    page = await context.new_page()
    results: list[ShotResult] = []
    try:
        if not await login(page, BASE_URL, USERNAME, PASSWORD):
            results.append(ShotResult(
                viewport=vp_name, page="LOGIN", route="/login",
                path="", expected_shell=expected,
                error=f"login failed at {vp_name}",
            ))
            return results
        # 等 Home 渲染稳定
        await page.wait_for_timeout(600)

        # 组装本 viewport 的页面列表（kanban 用动态 project_id）
        pages_full = list(PAGES) + [
            (f"/project/{project_id}/kanban", "07_project_kanban", None, 2500),
        ]
        for route, name, _sel, wait_ms in pages_full:
            print(f"  [{vp_name}] -> {route}")
            r = await capture_one(page, vp_name, expected, route, name, wait_ms)
            results.append(r)
            tag = "OK" if not r.error and not any("[BUG]" in n for n in r.notes) else "WARN"
            print(f"    {tag} shell={r.shell} sb={r.sidebar_visible} "
                  f"hov={r.has_h_overflow} {('err=' + r.error) if r.error else ''}")
    finally:
        await context.close()
    return results


def to_markdown(all_results: list[ShotResult], total_seconds: float) -> str:
    lines: list[str] = []
    lines.append("# Agent J — 跨断点 UI 截图回归")
    lines.append("")
    lines.append(
        f"- 生成时间: {time.strftime('%Y-%m-%d %H:%M:%S')}  "
        f"耗时 {total_seconds:.1f}s"
    )
    lines.append(f"- BASE_URL: `{BASE_URL}` | PB_URL: `{PB_URL}`")
    lines.append(f"- 账号: `{USERNAME}` (manager)")
    lines.append(
        f"- 截图目录: `docs/superpowers/qa-screenshots/responsive/`  "
        f"({len([r for r in all_results if r.path and not r.error])} 张)"
    )
    lines.append("")

    # 汇总：viewport × page 矩阵
    lines.append("## 1. 截图矩阵概览")
    lines.append("")
    lines.append(
        "| viewport | 期望 | 页面 | 实际 mode | sidebar (w) | h-overflow | error |"
    )
    lines.append("|---|---|---|---|---|---|---|")
    for r in all_results:
        if not r.path and r.error:
            lines.append(
                f"| {r.viewport} | {r.expected_shell} | {r.page} | - | - | - | "
                f"{r.error[:80]} |"
            )
            continue
        bug_mark = ""
        if any("[BUG]" in n for n in r.notes):
            bug_mark = " WARN"
        sb_str = f"{r.sidebar_visible} ({r.sidebar_width}px)"
        lines.append(
            f"| {r.viewport} | {r.expected_shell} | {r.page} | "
            f"{r.shell_mode or r.shell}{bug_mark} | {sb_str} | "
            f"{r.has_h_overflow} ({r.scroll_w}/{r.client_w}) | {r.error[:60] or '-'} |"
        )
    lines.append("")

    # BUG 列表
    bugs: list[tuple[str, str, str]] = []
    for r in all_results:
        for n in r.notes:
            if n.startswith("[BUG]"):
                bugs.append((r.viewport, r.page, n.replace("[BUG]", "").strip()))
    lines.append(f"## 2. 发现的 UI bug ({len(bugs)})")
    lines.append("")
    if not bugs:
        lines.append("无 [BUG] 级问题。")
    else:
        lines.append("| viewport | page | issue |")
        lines.append("|---|---|---|")
        for vp, pg, msg in bugs:
            lines.append(f"| {vp} | {pg} | {msg} |")
    lines.append("")

    # truncate / 其他 notes
    notes_only: list[tuple[str, str, str]] = []
    for r in all_results:
        for n in r.notes:
            if not n.startswith("[BUG]"):
                notes_only.append((r.viewport, r.page, n))
    lines.append(f"## 3. 其他视觉/截断注记 ({len(notes_only)})")
    lines.append("")
    if not notes_only:
        lines.append("无。")
    else:
        for vp, pg, msg in notes_only:
            lines.append(f"- **{vp} / {pg}** — {msg[:280]}")
    lines.append("")

    # 截图清单
    lines.append("## 4. 截图清单（绝对路径）")
    lines.append("")
    by_vp: dict[str, list[ShotResult]] = {}
    for r in all_results:
        by_vp.setdefault(r.viewport, []).append(r)
    for vp, rs in by_vp.items():
        lines.append(f"### {vp}")
        lines.append("")
        for r in rs:
            if r.path:
                vt = ", ".join((r.visible_texts or [])[:5])
                lines.append(
                    f"- `{r.path}` — route=`{r.route}` shell={r.shell} "
                    f"sb={r.sidebar_visible} hov={r.has_h_overflow}"
                )
                if vt:
                    lines.append(f"  - 可见文字片段: {vt[:240]}")
            else:
                lines.append(f"- (no screenshot) {r.route} — {r.error}")
        lines.append("")

    # 视觉一致性观察
    lines.append("## 5. 视觉一致性观察")
    lines.append("")
    # 比较同一 page 在不同 viewport 的关键文字是否都包含
    pages_set = sorted({r.page for r in all_results if r.path})
    inconsistencies: list[str] = []
    for pg in pages_set:
        rows = [r for r in all_results if r.page == pg and r.path]
        if len(rows) < 2:
            continue
        # 取每个 viewport 前 3 个可见文字，看是否有完全空的
        empty_vps = [r.viewport for r in rows if not r.visible_texts]
        if empty_vps:
            inconsistencies.append(
                f"- **{pg}** 在 {', '.join(empty_vps)} viewport 抓不到可见文字（可能空白页/加载失败）"
            )
        # 是否 desktop shell viewport 都有 sidebar
        desk = [r for r in rows if r.expected_shell != "mobile"]
        if desk and not all(r.sidebar_visible for r in desk):
            missing = [r.viewport for r in desk if not r.sidebar_visible]
            inconsistencies.append(
                f"- **{pg}** 在 {', '.join(missing)} viewport sidebar 缺失"
            )
        # 是否 mobile viewport 都没有 sidebar
        mob = [r for r in rows if r.expected_shell == "mobile"]
        if mob and any(r.sidebar_visible for r in mob):
            leaked = [r.viewport for r in mob if r.sidebar_visible]
            inconsistencies.append(
                f"- **{pg}** 在 {', '.join(leaked)} viewport mobile 不应有 sidebar"
            )
    if not inconsistencies:
        lines.append("跨 viewport sidebar/shell 行为一致，未发现明显不一致。")
    else:
        lines.extend(inconsistencies)
    lines.append("")

    # 结论
    pass_n = sum(
        1 for r in all_results if r.path and not r.error
        and not any("[BUG]" in n for n in r.notes)
    )
    lines.append("## 6. 结论")
    lines.append("")
    lines.append(
        f"- 总截图: {len([r for r in all_results if r.path])} / {len(all_results)}"
    )
    lines.append(f"- 干净通过: {pass_n}")
    lines.append(f"- 含 BUG 标记的截图: {len({(b[0], b[1]) for b in bugs})}")
    lines.append("")
    return "\n".join(lines)


async def main() -> int:
    t0 = time.time()
    print(f"=== Agent J responsive-diff start, BASE={BASE_URL} ===")
    # 先拿一个 project_id（用 manager token）
    try:
        auth = _pb_login()
        project_id = _pb_get_first_project_id(auth["token"])
        print(f"  first project_id = {project_id}")
    except Exception as e:
        print(f"  PB pre-fetch fail: {e}")
        return 2

    all_results: list[ShotResult] = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            for vp_name, w, h, expected in VIEWPORTS:
                print(f"\n--- viewport: {vp_name} ({w}x{h}, expect={expected}) ---")
                rs = await run_for_viewport(browser, vp_name, w, h, expected, project_id)
                all_results.extend(rs)
        finally:
            await browser.close()

    elapsed = time.time() - t0
    md = to_markdown(all_results, elapsed)
    LOG_PATH.write_text(md, encoding="utf-8")
    print(f"\n=== done in {elapsed:.1f}s, log → {LOG_PATH} ===")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
