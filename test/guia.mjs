import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
for (const [tag, w, h] of [['guia-desktop', 900, 1200], ['guia-mobile', 390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } })
  const errs = []
  p.on('pageerror', e => errs.push(e.message))
  await p.goto('file:///home/claude/paso-a-paso.html')
  await p.waitForTimeout(300)
  await p.screenshot({ path: `shots/${tag}.png`, fullPage: tag === 'guia-mobile' ? false : true })
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  console.log(`${tag}: desborde horizontal=${overflow} errores=${errs.length}`)
  await p.close()
}
await b.close()
