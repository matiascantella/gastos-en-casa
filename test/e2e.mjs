import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import http from 'node:http'
import fs from 'node:fs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' }

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0])
  if (p === '/') p = '/index.html'
  const f = path.join(dist, p)
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nope') }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' })
  fs.createReadStream(f).pipe(res)
})
await new Promise((r) => server.listen(4173, r))

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const errors = []
const shots = []

async function run(name, width, height, fn) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'es-ES' })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`[${name}] PAGEERROR ${e.message}`))
  await page.goto('http://localhost:4173/')
  await fn(page, name)
  await ctx.close()
}

const shot = async (page, tag) => {
  const f = path.join(root, 'shots', `${tag}.png`)
  fs.mkdirSync(path.dirname(f), { recursive: true })
  await page.screenshot({ path: f, fullPage: true })
  shots.push(f)
}

await run('desktop', 1280, 900, async (page) => {
  // ── onboarding ──
  await page.waitForSelector('text=Gastos en casa')
  const inputs = page.locator('input')
  await inputs.nth(0).fill('Uno')
  await inputs.nth(1).fill('Dos')
  await inputs.nth(2).fill('PERSONA UNO APELLIDO')
  await inputs.nth(3).fill('PERSONA DOS APELLIDO')
  await shot(page, '01-onboarding')
  await page.getByRole('button', { name: 'Seguir' }).click()
  // marcar Revolut de Uno también (tiene una)
  await page.getByRole('button', { name: /Revolut/ }).first().click()
  await shot(page, '02-cuentas')
  await page.getByRole('button', { name: 'Empezar' }).click()
  await page.waitForTimeout(400)

  // ── importar los 3 CSV ──
  await page.getByRole('button', { name: /Importar/ }).first().click().catch(() => {})
  await page.locator('nav button, aside button').filter({ hasText: 'Importar' }).first().click()
  await page.waitForTimeout(300)
  await page.locator('input[type=file]').first().setInputFiles([
    path.join(root, 'test/lhv.csv'),
    path.join(root, 'test/wise.csv'),
    path.join(root, 'test/revolut.csv'),
  ])
  await page.waitForTimeout(900)
  const detected = await page.locator('text=/detectada por/').count()
  console.log(`  cuentas detectadas automáticamente: ${detected}/3`)
  await shot(page, '03-import-preview')

  // asignar a mano las que no se pudieron detectar (primera vez, sin IBAN cargado)
  const selects = page.locator('.card select')
  for (let i = 0; i < await selects.count(); i++) {
    const s = selects.nth(i)
    if (await s.inputValue()) continue
    const opts = await s.locator('option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent })))
    const pick = opts.find((o) => o.v && /Uno|Compartida/.test(o.t))
    if (pick) await s.selectOption(pick.v)
    await page.waitForTimeout(200)
  }
  await page.waitForTimeout(600)
  await shot(page, '03b-import-asignado')

  const btn = page.getByRole('button', { name: /Importar \d+ movimientos/ })
  const label = await btn.textContent()
  console.log(`  botón: ${label}`)
  await btn.click()
  await page.waitForTimeout(1200)
  await shot(page, '04-despues-import')

  // ── clasificar un pendiente y verificar que aprende ──
  await page.locator('aside button').filter({ hasText: 'Gastos' }).first().click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /Sin clasificar/ }).click()
  await page.waitForTimeout(400)
  await shot(page, '05-sin-clasificar')
  const sel = page.locator('li select:visible').first()
  await sel.selectOption('familia')
  await page.waitForTimeout(700)
  const toast = await page.locator('text=/Regla creada/').count()
  console.log(`  toast "Regla creada": ${toast > 0 ? 'sí' : 'NO'}`)
  await shot(page, '06-regla-creada')

  // ── plan del mes ──
  await page.locator('aside button').filter({ hasText: 'Plan' }).first().click()
  await page.waitForTimeout(400)
  const euroInputs = page.locator('input[inputmode=decimal]')
  await euroInputs.nth(0).fill('2800')
  await euroInputs.nth(1).fill('1600')
  // presupuestos
  for (const [i, v] of [[2, '1300'], [3, '120'], [4, '700'], [5, '450'], [6, '250']]) {
    await euroInputs.nth(i).fill(v)
  }
  await euroInputs.last().fill('900')
  await page.waitForTimeout(300)
  await shot(page, '07-plan')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await page.waitForTimeout(600)

  // ── dashboard ──
  await page.locator('aside button').filter({ hasText: 'Inicio' }).first().click()
  await page.waitForTimeout(600)
  await shot(page, '08-inicio')

  // ── cierre ──
  await page.locator('aside button').filter({ hasText: 'Cierre' }).first().click()
  await page.waitForTimeout(500)
  await shot(page, '09-cierre')

  // ── ahorros ──
  await page.locator('aside button').filter({ hasText: 'Ahorros' }).first().click()
  await page.waitForTimeout(900)
  await shot(page, '10-ahorros')

  // ── ajustes ──
  await page.locator('aside button').filter({ hasText: 'Ajustes' }).first().click()
  await page.waitForTimeout(500)
  await shot(page, '11-ajustes')

  // ── reimportar: no debe duplicar ──
  await page.locator('aside button').filter({ hasText: 'Importar' }).first().click()
  await page.waitForTimeout(300)
  await page.locator('input[type=file]').first().setInputFiles([path.join(root, 'test/lhv.csv')])
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: /Importar \d+ movimientos/ }).click()
  await page.waitForTimeout(900)
  const dup = await page.locator('text=/ya estaban/').count()
  console.log(`  dedupe al reimportar: ${dup > 0 ? 'OK — detectó duplicados' : 'FALLÓ'}`)
  await shot(page, '12-dedupe')
})

await run('mobile', 390, 844, async (page) => {
  const inputs = page.locator('input')
  await inputs.nth(0).fill('Uno')
  await inputs.nth(1).fill('Dos')
  await page.getByRole('button', { name: 'Seguir' }).click()
  await page.getByRole('button', { name: 'Empezar' }).click()
  await page.waitForTimeout(400)
  await page.locator('nav.fixed button').filter({ hasText: 'Importar' }).click()
  await page.waitForTimeout(300)
  await page.locator('input[type=file]').first().setInputFiles([
    path.join(root, 'test/revolut.csv'), path.join(root, 'test/lhv.csv'),
  ])
  await page.waitForTimeout(900)
  const msel = page.locator('.card select')
  for (let i = 0; i < await msel.count(); i++) {
    const s = msel.nth(i)
    if (await s.inputValue()) continue
    const opts = await s.locator('option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent })))
    const pick = opts.find((o) => o.v && /Uno|Compartida/.test(o.t))
    if (pick) await s.selectOption(pick.v)
    await page.waitForTimeout(200)
  }
  await page.waitForTimeout(500)
  await shot(page, 'm1-import')
  await page.getByRole('button', { name: /Importar \d+ movimientos/ }).click()
  await page.waitForTimeout(1200)
  await page.locator('nav.fixed button').filter({ hasText: 'Inicio' }).click()
  await page.waitForTimeout(600)
  await shot(page, 'm2-inicio')
  await page.locator('nav.fixed button').filter({ hasText: 'Gastos' }).click()
  await page.waitForTimeout(500)
  await shot(page, 'm3-gastos')
})

await browser.close()
server.close()
console.log(`\nerrores de consola: ${errors.length}`)
errors.slice(0, 10).forEach((e) => console.log('  ' + e))
console.log(`capturas: ${shots.length}`)
