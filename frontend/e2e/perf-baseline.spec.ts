import { test, expect } from '@playwright/test'

/** ---------------------------------------------------------------------
 * Performance baseline – Agent I (perf+bundle)
 *
 * 仅测前端 chunk 加载 & 首屏渲染（无后端 / 无登录），用静态 vite preview。
 * 数据写入 stdout 让父 agent 抓取。
 * --------------------------------------------------------------------*/

const PERF_URL = process.env.PERF_URL ?? 'http://localhost:4173'

interface NavMetrics {
  domContentLoaded: number
  loadEvent: number
  firstPaint: number
  firstContentfulPaint: number
  transferSize: number
  encodedBodySize: number
}

async function collectMetrics(page: import('@playwright/test').Page): Promise<NavMetrics> {
  return await page.evaluate(() => {
    const [nav] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
    const paints = performance.getEntriesByType('paint') as PerformancePaintTiming[]
    const fp = paints.find(p => p.name === 'first-paint')?.startTime ?? -1
    const fcp = paints.find(p => p.name === 'first-contentful-paint')?.startTime ?? -1
    return {
      domContentLoaded: nav ? nav.domContentLoadedEventEnd - nav.startTime : -1,
      loadEvent: nav ? nav.loadEventEnd - nav.startTime : -1,
      firstPaint: fp,
      firstContentfulPaint: fcp,
      transferSize: nav?.transferSize ?? -1,
      encodedBodySize: nav?.encodedBodySize ?? -1,
    }
  })
}

test('cold-load /login renders, capture FP/FCP/load + resources', async ({ page }) => {
  const requests: { url: string; size: number; type: string }[] = []
  page.on('response', async (resp) => {
    try {
      const url = resp.url()
      if (!url.endsWith('.js') && !url.endsWith('.css')) return
      const headers = resp.headers()
      const ce = parseInt(headers['content-length'] ?? '0', 10)
      requests.push({ url: url.split('/').pop() || url, size: ce, type: url.endsWith('.js') ? 'js' : 'css' })
    } catch { /* noop */ }
  })

  const t0 = Date.now()
  await page.goto(PERF_URL + '/', { waitUntil: 'networkidle' })
  const wallMs = Date.now() - t0
  const m = await collectMetrics(page)
  const html = await page.content()
  const sawLogin = html.includes('登') || html.includes('Login') || html.includes('login')

  // chrome devtools metrics
  type CdpClient = { send: (m: string) => Promise<{ metrics?: { name: string; value: number }[] }> }
  let jsHeapMb = -1
  try {
    const ctx = page.context()
    const cdp = await ctx.newCDPSession(page) as unknown as CdpClient
    await cdp.send('Performance.enable')
    const { metrics } = await cdp.send('Performance.getMetrics')
    const heap = metrics?.find(x => x.name === 'JSHeapUsedSize')?.value ?? 0
    jsHeapMb = heap / 1024 / 1024
  } catch { /* ignore */ }

  console.log('PERF_RESULT', JSON.stringify({
    scenario: 'cold-login',
    wallMs,
    firstPaintMs: m.firstPaint,
    firstContentfulPaintMs: m.firstContentfulPaint,
    domContentLoadedMs: m.domContentLoaded,
    loadEventMs: m.loadEvent,
    jsHeapMb,
    transferSize: m.transferSize,
    encodedBodySize: m.encodedBodySize,
    sawLogin,
    chunks: requests.sort((a, b) => b.size - a.size).slice(0, 25),
  }, null, 2))

  expect(m.firstContentfulPaint).toBeGreaterThan(0)
})

test('navigate /login -> simulate static route bundle fetch', async ({ page }) => {
  // First load login (cold) then click navigate to /admin (lazy chunk fetch)
  await page.goto(PERF_URL + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(300)

  const t0 = Date.now()
  // direct URL navigation triggers admin chunk; we don't have auth so it'll redirect
  await page.goto(PERF_URL + '/admin', { waitUntil: 'networkidle' })
  const navMs = Date.now() - t0
  console.log('PERF_RESULT', JSON.stringify({ scenario: 'nav-to-admin', navMs }, null, 2))
})
