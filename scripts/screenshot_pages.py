#!/usr/bin/env python3
"""
工程项目协同管理系统 - 界面自动截图脚本

使用 Playwright 自动登录系统并截取各个界面截图，用于交付文档。

使用方法：
    1. 安装依赖: pip install playwright
    2. 安装浏览器: playwright install chromium
    3. 运行脚本: python screenshot_pages.py

配置：
    - BASE_URL: 前端地址（默认 http://127.0.0.1）
    - USERNAME: 登录用户名
    - PASSWORD: 登录密码
    - EMPLOYEE_USERNAME: 员工用户名（用于截图员工视角页面）
    - EMPLOYEE_PASSWORD: 员工密码
    - OUTPUT_DIR: 截图输出目录
"""

import os
import asyncio
from datetime import datetime
from playwright.async_api import async_playwright

# ========== 配置 ==========
BASE_URL = os.environ.get('FRONTEND_URL', 'http://127.0.0.1')  # 默认线上演示地址；本地可覆盖 FRONTEND_URL=http://localhost:5173
USERNAME = os.environ.get('TEST_USERNAME', 'wang_manager')  # 演示管理员/经理账号（可访问管理控制台与经理工作台）
PASSWORD = os.environ.get('TEST_PASSWORD', '12345678')
EMPLOYEE_USERNAME = os.environ.get('EMPLOYEE_USERNAME', 'li_audit')  # 演示普通员工账号
EMPLOYEE_PASSWORD = os.environ.get('EMPLOYEE_PASSWORD', PASSWORD)
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'docs', 'screenshots')

# 需要截图的页面配置
PAGES_TO_CAPTURE = [
    # (路由路径, 文件名, 描述, 等待时间ms, 操作)
    ('/login', '01_login', '登录页面', 1000, None),
    ('/my-projects', '04_my_projects', '我的项目', 2000, None),
    ('/my-tasks', '05_my_tasks', '我的任务', 2000, None),
    ('/manager', '06_manager_dashboard', '经理工作台', 2000, None),
    ('/admin', '07_admin_dashboard', '管理控制台', 2500, None),
    ('/review-center', '08_review_center', '审核中心', 2000, None),
    ('/settings', '09_settings', '系统设置', 1500, None),
    ('/notifications', '10_notifications', '消息通知', 2000, None),
    # 动态页面（需要先获取项目ID）
    # ('/project/:id/timeline', '11_timeline', '项目时间轴', 3000, None),
    # ('/project/:id/kanban', '12_kanban', '项目看板', 3000, None),
]


async def login(page, username: str = USERNAME, password: str = PASSWORD):
    """登录系统"""
    print(f'🔐 正在登录... ({username})')
    await page.goto(f'{BASE_URL}/login')
    await page.wait_for_load_state('networkidle')
    await page.wait_for_timeout(1000)  # 等待动画完成
    
    # 填写登录表单 - 使用精确的占位符匹配
    try:
        # 尝试多种选择器
        username_input = page.locator('input[placeholder*="用户名"]').or_(
            page.locator('input[type="text"]').first
        )
        await username_input.fill(username)
        
        password_input = page.locator('input[placeholder*="密码"]').or_(
            page.locator('input[type="password"]')
        )
        await password_input.fill(password)
        
        # 点击登录按钮 - 尝试多种选择器
        login_btn = page.locator('button[type="submit"]').or_(
            page.locator('button:has-text("登")').first
        )
        await login_btn.click()
    except Exception as e:
        print(f'⚠️ 表单填写错误: {e}')
        # 尝试直接使用 JavaScript
        await page.evaluate(f'''() => {{
            const inputs = document.querySelectorAll('input');
            if (inputs.length >= 2) {{
                inputs[0].value = '{username}';
                inputs[0].dispatchEvent(new Event('input', {{ bubbles: true }}));
                inputs[1].value = '{password}';
                inputs[1].dispatchEvent(new Event('input', {{ bubbles: true }}));
            }}
        }}''')
        await page.wait_for_timeout(500)
        await page.locator('button[type="submit"]').click()
    
    # 等待登录成功（可能跳转到 /app 或 /admin 或 /manager）
    try:
        # 等待 URL 变化（离开登录页）
        await page.wait_for_timeout(2000)
        current_url = page.url
        if '/login' not in current_url:
            print(f'✅ 登录成功，跳转到: {current_url}')
            return True
        else:
            # 再等一下
            await page.wait_for_timeout(3000)
            current_url = page.url
            if '/login' not in current_url:
                print(f'✅ 登录成功，跳转到: {current_url}')
                return True
            print(f'❌ 登录失败: 仍在登录页')
            await page.screenshot(path=os.path.join(OUTPUT_DIR, 'login_failed_debug.png'))
            return False
    except Exception as e:
        print(f'❌ 登录失败: {e}')
        await page.screenshot(path=os.path.join(OUTPUT_DIR, 'login_failed_debug.png'))
        return False


async def capture_page(page, route, filename, description, wait_ms):
    """截取单个页面"""
    print(f'📸 截取: {description} ({route})')
    
    try:
        # 导航到页面
        await page.goto(f'{BASE_URL}{route}')
        await page.wait_for_load_state('networkidle')
        
        # 额外等待，确保动画和数据加载完成
        await page.wait_for_timeout(wait_ms)
        
        # 截图
        filepath = os.path.join(OUTPUT_DIR, f'{filename}.png')
        await page.screenshot(path=filepath, full_page=True)
        print(f'   ✅ 已保存: {filepath}')
        return True
    except Exception as e:
        print(f'   ❌ 失败: {e}')
        return False


async def client_navigate(page, path: str):
    """
    前端路由跳转（不刷新页面）。

    说明：
    - 线上站点构建产物使用了相对路径资源（base=./），如果直接在深层路径刷新（如 /app/tasks、/project/:id/...）
      会导致 ./assets 解析到子目录（/app/assets、/project/assets）从而白屏。
    - 因此这里通过 history.pushState + 触发 popstate 让 React Router 在同一页面内切换路由，避免资源路径问题。
    """
    await page.evaluate(
        """(p) => {
          window.history.pushState({}, '', p);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }""",
        path,
    )
    # 给路由切换一个最小的渲染时间片
    await page.wait_for_timeout(150)


async def capture_dynamic_pages(page, project_id):
    """截取需要动态ID的页面（通过前端路由跳转，避免深层路径直接刷新白屏）"""
    # 1) 项目时间轴
    timeline_path = f'/project/{project_id}/timeline'
    print(f'📸 截取: 项目时间轴（甘特图） ({timeline_path})')
    try:
        if '/project/' not in page.url or '/timeline' not in page.url:
            await client_navigate(page, timeline_path)
        await page.wait_for_selector('.timeline-container', timeout=20000)
        await page.wait_for_timeout(1200)
        filepath = os.path.join(OUTPUT_DIR, '11_timeline.png')
        await page.screenshot(path=filepath, full_page=True)
        print(f'   ✅ 已保存: {filepath}')
    except Exception as e:
        print(f'   ❌ 失败: {e}')

    # 2) 项目看板
    kanban_path = f'/project/{project_id}/kanban'
    print(f'📸 截取: 项目看板 ({kanban_path})')
    try:
        await client_navigate(page, kanban_path)
        await page.wait_for_selector('.kanban-container', timeout=20000)
        await page.wait_for_timeout(1200)
        filepath = os.path.join(OUTPUT_DIR, '12_kanban.png')
        await page.screenshot(path=filepath, full_page=True)
        print(f'   ✅ 已保存: {filepath}')
    except Exception as e:
        print(f'   ❌ 失败: {e}')


async def get_first_project_id(page):
    """获取第一个项目的ID"""
    # 优先从“我的项目”列表进入（更稳定），再尝试从任务页进入
    candidate_routes = ['/my-projects']

    for route in candidate_routes:
        try:
            await page.goto(f'{BASE_URL}{route}')
            await page.wait_for_load_state('networkidle')
            await page.wait_for_timeout(1800)

            # 方案1：直接从链接里解析（不依赖点击）
            href = await page.evaluate("""() => {
              const a = document.querySelector('a[href*="/project/"]');
              return a ? a.getAttribute('href') : '';
            }""")
            if href and '/project/' in href:
                project_id = href.split('/project/')[1].split('/')[0]
                if project_id:
                    print(f'📋 获取到项目ID: {project_id}')
                    return project_id

            # 方案2：点击第一个项目卡片/列表项，再从 URL 提取
            selectors = [
                'a[href*="/project/"]',
                '[class*="project-card"]',
                '[class*="ProjectCard"]',
                '.adm-card',
                '.adm-list-item',
            ]
            for sel in selectors:
                el = await page.query_selector(sel)
                if not el:
                    continue
                await el.click()
                await page.wait_for_timeout(1200)
                url = page.url
                if '/project/' in url:
                    project_id = url.split('/project/')[1].split('/')[0]
                    if project_id:
                        print(f'📋 获取到项目ID: {project_id}')
                        return project_id

        except Exception as e:
            print(f'⚠️ 无法获取项目ID（{route}）: {e}')

    return None


async def capture_employee_pages(page):
    """截取普通员工视角页面（/app 工作进展 + 个人中心）"""
    # /app 是一级路径（目录为 /），可确保 base=./ 时依然能正确加载 ./assets
    await capture_page(page, '/app', '02_tasks_list', '工作进展（任务列表）', 2500)

    # Home 页面是 Tab 状态切换，不是 /app/me 这种路由。这里通过点击 TabBar 切换到“我的”。
    print('📸 截取: 个人中心（Tab: 我的）')
    try:
        await page.locator('.adm-tab-bar-item:has-text("我的")').click()
    except Exception:
        try:
            await page.get_by_text('我的', exact=True).click()
        except Exception:
            pass

    await page.wait_for_timeout(1200)
    filepath = os.path.join(OUTPUT_DIR, '03_profile.png')
    await page.screenshot(path=filepath, full_page=True)
    print(f'   ✅ 已保存: {filepath}')


async def main():
    """主函数"""
    print('='*60)
    print('工程项目协同管理系统 - 界面自动截图')
    print('='*60)
    print(f'前端地址: {BASE_URL}')
    print(f'测试账号: {USERNAME}')
    print(f'输出目录: {OUTPUT_DIR}')
    print('='*60)
    
    # 创建输出目录
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    async with async_playwright() as p:
        # 启动浏览器
        browser = await p.chromium.launch(
            headless=True,  # 无头模式，设为 False 可看到浏览器操作
        )
        
        # 创建上下文（模拟移动设备）
        context = await browser.new_context(
            viewport={'width': 390, 'height': 844},  # iPhone 14 Pro
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True,
        )
        
        page = await context.new_page()
        
        # 0. 清除浏览器缓存和localStorage（确保获取最新界面）
        print('🧹 清除浏览器缓存和存储...')
        await page.goto(f'{BASE_URL}/login')
        await page.evaluate('''() => {
            localStorage.clear();
            sessionStorage.clear();
            // 清除所有 cookies
            document.cookie.split(";").forEach(function(c) {
                document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
            });
        }''')
        # 刷新页面以应用清除
        await page.reload()
        await page.wait_for_load_state('networkidle')
        await page.wait_for_timeout(1000)
        print('✅ 缓存已清除')
        
        # 1. 截取登录页（未登录状态）
        await capture_page(page, '/login', '01_login', '登录页面', 1000)
        
        # 2. 登录
        if not await login(page):
            print('❌ 登录失败，无法继续截图')
            await browser.close()
            return
        
        # 3. 截取各个页面
        for route, filename, description, wait_ms, action in PAGES_TO_CAPTURE[1:]:  # 跳过登录页
            await capture_page(page, route, filename, description, wait_ms)
        
        # 4. 获取项目ID并截取动态页面
        project_id = await get_first_project_id(page)
        if project_id:
            await capture_dynamic_pages(page, project_id)
        
        # 5. 创建 PC 端截图（宽屏）
        print('\n📺 创建 PC 端截图...')
        await context.close()
        
        pc_context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            device_scale_factor=1,
        )
        pc_page = await pc_context.new_page()
        
        # 清除PC端缓存
        await pc_page.goto(f'{BASE_URL}/login')
        await pc_page.evaluate('''() => {
            localStorage.clear();
            sessionStorage.clear();
        }''')
        await pc_page.reload()
        
        # 重新登录
        await pc_page.goto(f'{BASE_URL}/login')
        await pc_page.wait_for_load_state('networkidle')
        await pc_page.wait_for_timeout(1000)
        
        # 使用与移动端相同的登录逻辑
        try:
            username_input = pc_page.locator('input[placeholder*="用户名"]').or_(
                pc_page.locator('input[type="text"]').first
            )
            await username_input.fill(USERNAME)
            
            password_input = pc_page.locator('input[placeholder*="密码"]').or_(
                pc_page.locator('input[type="password"]')
            )
            await password_input.fill(PASSWORD)
            
            await pc_page.locator('button[type="submit"]').click()
        except:
            await pc_page.evaluate(f'''() => {{
                const inputs = document.querySelectorAll('input');
                if (inputs.length >= 2) {{
                    inputs[0].value = '{USERNAME}';
                    inputs[0].dispatchEvent(new Event('input', {{ bubbles: true }}));
                    inputs[1].value = '{PASSWORD}';
                    inputs[1].dispatchEvent(new Event('input', {{ bubbles: true }}));
                }}
            }}''')
            await pc_page.wait_for_timeout(500)
            await pc_page.locator('button[type="submit"]').click()
        
        # 等待 URL 变化
        await pc_page.wait_for_timeout(3000)
        if '/login' in pc_page.url:
            await pc_page.wait_for_timeout(3000)
        
        # 截取 PC 端关键页面
        pc_pages = [
            ('/admin', '20_admin_pc', '管理控制台（PC）', 3000),
            ('/manager', '21_manager_pc', '经理工作台（PC）', 2500),
        ]

        for route, filename, description, wait_ms in pc_pages:
            await capture_page(pc_page, route, filename, description, wait_ms)

        # 深层路径（/project/:id/..）用前端路由跳转，避免 base=./ 导致 ./assets 解析到子目录白屏
        if project_id:
            # 项目时间轴（PC）
            timeline_path = f'/project/{project_id}/timeline'
            print(f'📸 截取: 项目时间轴（PC） ({timeline_path})')
            try:
                await client_navigate(pc_page, timeline_path)
                await pc_page.wait_for_selector('.timeline-container', timeout=20000)
                await pc_page.wait_for_timeout(1200)
                filepath = os.path.join(OUTPUT_DIR, '22_timeline_pc.png')
                await pc_page.screenshot(path=filepath, full_page=True)
                print(f'   ✅ 已保存: {filepath}')
            except Exception as e:
                print(f'   ❌ 失败: {e}')

            # 项目看板（PC）
            kanban_path = f'/project/{project_id}/kanban'
            print(f'📸 截取: 项目看板（PC） ({kanban_path})')
            try:
                await client_navigate(pc_page, kanban_path)
                await pc_page.wait_for_selector('.kanban-container', timeout=20000)
                await pc_page.wait_for_timeout(1200)
                filepath = os.path.join(OUTPUT_DIR, '23_kanban_pc.png')
                await pc_page.screenshot(path=filepath, full_page=True)
                print(f'   ✅ 已保存: {filepath}')
            except Exception as e:
                print(f'   ❌ 失败: {e}')

        await pc_context.close()

        # 6. 创建员工端截图（移动端）
        print('\n👤 创建员工端截图...')
        employee_context = await browser.new_context(
            viewport={'width': 390, 'height': 844},  # iPhone 14 Pro
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True,
        )
        employee_page = await employee_context.new_page()

        # 清除员工端缓存
        print('🧹 清除员工端浏览器缓存和存储...')
        await employee_page.goto(f'{BASE_URL}/login')
        await employee_page.evaluate('''() => {
            localStorage.clear();
            sessionStorage.clear();
            document.cookie.split(";").forEach(function(c) {
                document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
            });
        }''')
        await employee_page.reload()
        await employee_page.wait_for_load_state('networkidle')
        await employee_page.wait_for_timeout(800)
        print('✅ 员工端缓存已清除')

        # 员工登录并截图
        if not await login(employee_page, EMPLOYEE_USERNAME, EMPLOYEE_PASSWORD):
            print('❌ 员工登录失败，跳过员工端截图')
        else:
            await capture_employee_pages(employee_page)

        await employee_context.close()
        
        await browser.close()
    
    print('\n' + '='*60)
    print('✅ 截图完成！')
    print(f'截图保存在: {OUTPUT_DIR}')
    print('='*60)
    
    # 生成截图索引
    generate_index()


def generate_index():
    """生成截图索引 Markdown 文件"""
    index_path = os.path.join(OUTPUT_DIR, 'README.md')
    
    screenshots = sorted([f for f in os.listdir(OUTPUT_DIR) if f.endswith('.png')])
    
    content = f"""# 界面截图

> 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

## 移动端界面

"""
    
    for filename in screenshots:
        if filename.startswith('2'):  # PC 端截图
            continue
        name = filename.replace('.png', '').split('_', 1)[1].replace('_', ' ').title()
        content += f'### {name}\n\n'
        content += f'![{name}](./{filename})\n\n'
    
    content += """
## PC 端界面

"""
    
    for filename in screenshots:
        if not filename.startswith('2'):  # 移动端截图
            continue
        name = filename.replace('.png', '').split('_', 1)[1].replace('_', ' ').title()
        content += f'### {name}\n\n'
        content += f'![{name}](./{filename})\n\n'
    
    with open(index_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f'📄 截图索引已生成: {index_path}')


if __name__ == '__main__':
    asyncio.run(main())
