import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await b.newPage({ viewport: { width: 1200, height: 900 } })
const logs = []
p.on('console', m => logs.push(`${m.type()}: ${m.text()}`))
p.on('pageerror', e => logs.push('PAGEERROR: ' + e.message))
await p.goto('https://gastos-casa-a82bc.web.app', { waitUntil: 'networkidle', timeout: 30000 })
const html = await p.content()
console.log('protocolo:', await p.evaluate(() => location.protocol))
// ¿la versión publicada tiene la guarda de file:// que agregué?
const js = await p.evaluate(async () => {
  const s = [...document.querySelectorAll('script[src]')].map(x => x.src)
  const txts = await Promise.all(s.map(u => fetch(u).then(r => r.text()).catch(() => '')))
  return txts.join('\n')
})
console.log('build con la guarda file://:', js.includes('archivo suelto') ? 'SÍ (versión nueva)' : 'NO (versión vieja)')
console.log('usa enableIndexedDbPersistence:', js.includes('enableIndexedDbPersistence') || js.includes('IndexedDbPersistence') ? 'sí' : 'no visible')
await p.waitForTimeout(1500)
console.log('--- consola ---')
logs.slice(0, 12).forEach(l => console.log(' ', l.slice(0, 180)))
await p.screenshot({ path: 'shots/live.png' })
await b.close()
