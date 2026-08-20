import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await b.newPage({ viewport: { width: 1100, height: 900 } })
const msgs = []
p.on('pageerror', e => msgs.push('PAGEERROR ' + e.message))
p.on('console', m => msgs.push(`${m.type()}: ${m.text()}`))
await p.goto('file:///home/claude/gastos-en-casa.html')
const info = await p.evaluate(async () => {
  const out = { protocol: location.protocol, origin: location.origin }
  try {
    const req = indexedDB.open('probe-test', 1)
    out.idb = await new Promise((res) => {
      req.onsuccess = () => res('ok')
      req.onerror = () => res('error: ' + (req.error?.message ?? 'desconocido'))
      req.onblocked = () => res('blocked')
      setTimeout(() => res('timeout'), 2500)
    })
  } catch (e) { out.idb = 'excepción: ' + e.message }
  return out
})
console.log('protocolo:', info.protocol, '| origin:', info.origin, '| IndexedDB:', info.idb)
console.log('mensajes:', msgs.slice(0,4).join(' || ') || 'ninguno')
await b.close()
