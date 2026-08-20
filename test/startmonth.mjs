import { chromium } from 'playwright'
import path from 'node:path'; import fs from 'node:fs'; import http from 'node:http'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json' }
const server = http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html'
  const f=path.join(dist,p); if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end()}
  res.writeHead(200,{'Content-Type':MIME[path.extname(f)]??'application/octet-stream'}); fs.createReadStream(f).pipe(res)})
await new Promise(r=>server.listen(4174,r))
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await b.newContext({ viewport:{width:1280,height:900}, locale:'es-ES' })
const page = await ctx.newPage()
const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>m.type()==='error'&&errs.push(m.text()))
await page.goto('http://localhost:4174/')

const i = page.locator('input')
await i.nth(0).fill('Uno'); await i.nth(1).fill('Dos')
await i.nth(2).fill('PERSONA UNO APELLIDO'); await i.nth(3).fill('PERSONA DOS APELLIDO')
await page.getByRole('button',{name:'Seguir'}).click()
await page.locator('input[type=month]').fill('2026-08')
console.log('mes de inicio elegido: 2026-08')
await page.getByRole('button',{name:'Empezar'}).click()
await page.waitForTimeout(400)

await page.locator('aside button').filter({hasText:'Importar'}).first().click()
await page.waitForTimeout(300)
await page.locator('input[type=file]').first().setInputFiles(
  ['lhv','wise','revolut'].map(f=>path.join(root,`test/${f}.csv`)))
await page.waitForTimeout(900)
const sels = page.locator('.card select')
for (let k=0;k<await sels.count();k++){const s=sels.nth(k); if(await s.inputValue())continue
  const o=await s.locator('option').evaluateAll(os=>os.map(x=>({v:x.value,t:x.textContent})))
  const pick=o.find(x=>x.v&&/Uno|Compartida/.test(x.t)); if(pick)await s.selectOption(pick.v); await page.waitForTimeout(150)}
await page.waitForTimeout(600)
const hist = await page.locator('text=/movimientos son anteriores a/').textContent().catch(()=>null)
console.log('aviso de histórico en la vista previa:', hist ? hist.trim().slice(0,72) : 'NO APARECIÓ')
await page.screenshot({path:path.join(root,'shots/s1-import.png'), fullPage:true})
await page.getByRole('button',{name:/Importar \d+ movimientos/}).click()
await page.waitForTimeout(1500)

const opts = await page.locator('header select').locator('option').allTextContents()
console.log('meses en el selector:', opts.join(' | '))

await page.locator('aside button').filter({hasText:'Inicio'}).first().click()
await page.waitForTimeout(600)
await page.screenshot({path:path.join(root,'shots/s2-inicio.png'), fullPage:true})

await page.locator('aside button').filter({hasText:'Ahorros'}).first().click()
await page.waitForTimeout(900)
const filas = await page.locator('table tbody tr').count()
console.log('filas en la tabla de ahorros (debería ser 1: agosto):', filas)
await page.screenshot({path:path.join(root,'shots/s3-ahorros.png'), fullPage:true})

await page.locator('aside button').filter({hasText:'Gastos'}).first().click()
await page.waitForTimeout(400)
const tabs = await page.locator('.flex.rounded-lg.border button').allTextContents()
console.log('pestañas en Gastos:', tabs.join(' | '))
await page.getByRole('button',{name:/Histórico/}).click()
await page.waitForTimeout(500)
const nHist = await page.locator('ul.divide-y > li').count()
console.log('movimientos visibles en Histórico:', nHist)
await page.screenshot({path:path.join(root,'shots/s4-historico.png'), fullPage:true})

console.log('errores de consola:', errs.length, errs.slice(0,3).join(' | '))
await b.close(); server.close()
