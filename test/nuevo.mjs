import { chromium } from 'playwright'
import path from 'node:path'; import fs from 'node:fs'; import http from 'node:http'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const dist = path.join(root,'dist')
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'}
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html'
 const f=path.join(dist,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end()}
 r.writeHead(200,{'Content-Type':MIME[path.extname(f)]??'application/octet-stream'});fs.createReadStream(f).pipe(r)})
await new Promise(r=>server.listen(4177,r))
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'})
const p=await b.newPage({viewport:{width:1150,height:980},locale:'es-ES'})
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>m.type()==='error'&&errs.push(m.text()))
await p.goto('http://localhost:4177/')
const i=p.locator('input')
await i.nth(0).fill('Uno'); await i.nth(1).fill('Dos')
await i.nth(2).fill('PERSONA UNO APELLIDO'); await i.nth(3).fill('PERSONA DOS APELLIDO')
await p.getByRole('button',{name:'Seguir'}).click()
await p.locator('input[type=month]').fill('2026-08')
await p.getByRole('button',{name:'Empezar'}).click()
await p.waitForTimeout(400)
// importar
await p.locator('aside button').filter({hasText:'Importar'}).first().click()
await p.waitForTimeout(300)
await p.locator('input[type=file]').first().setInputFiles(['lhv','revolut'].map(f=>path.join(root,`test/${f}.csv`)))
await p.waitForTimeout(900)
const sels=p.locator('.card select')
for(let k=0;k<await sels.count();k++){const sx=sels.nth(k); if(await sx.inputValue())continue
  const o=await sx.locator('option').evaluateAll(os=>os.map(x=>({v:x.value,t:x.textContent})))
  const pick=o.find(x=>x.v&&/Uno|Compartida/.test(x.t)); if(pick)await sx.selectOption(pick.v); await p.waitForTimeout(120)}
await p.waitForTimeout(500)
await p.getByRole('button',{name:/Importar \d+ movimientos/}).click()
await p.waitForTimeout(1500)

await p.locator('aside button').filter({hasText:'Gastos'}).first().click()
await p.waitForTimeout(500)

// ── filtro por cuenta ──
const filtros = p.locator('main .no-print select')
for (let k=0;k<await filtros.count();k++)
  console.log(`  filtro ${k}:`, (await filtros.nth(k).locator('option').allTextContents()).slice(0,7).join(' | '))

// ── ajuste de saldo ──
await p.getByRole('button',{name:'+ A mano'}).click()
await p.waitForTimeout(400)
await p.getByRole('button',{name:'Ajuste de saldo'}).click()
await p.waitForTimeout(300)
await p.locator('input[placeholder="Saldo inicial"]').fill('Saldo inicial Revolut')
await p.locator('input[type=date]').fill('2026-08-01')
await p.locator('input[inputmode=decimal]').fill('9')
const sc=p.locator('.fixed select').first()
const ops=await sc.locator('option').evaluateAll(o=>o.map(x=>({v:x.value,t:x.textContent})))
const rev=ops.find(o=>o.v&&/Revolut/.test(o.t)); if(rev)await sc.selectOption(rev.v)
await p.screenshot({path:'shots/n1-ajuste.png'})
await p.getByRole('button',{name:'Guardar'}).click()
await p.waitForTimeout(800)
const chipAjuste = await p.locator('text=ajuste de saldo').count()
console.log('chip "ajuste de saldo":', chipAjuste>0?'SÍ':'NO')

// ── marcar un préstamo ──
const fila = p.locator('ul.divide-y > li').filter({hasText:'IKEA'}).first()
if (await fila.count()) {
  await fila.locator('div.cursor-pointer').first().click()
  await p.waitForTimeout(400)
  await p.getByRole('button',{name:'Nos lo deben'}).first().click()
  await p.waitForTimeout(400)
  await p.locator('input[placeholder="Franco"]').fill('Alguien')
  await p.screenshot({path:'shots/n2-prestamo.png'})
  await p.getByRole('button',{name:'Guardar'}).click()
  await p.waitForTimeout(800)
  console.log('préstamo marcado')
} else { console.log('no encontré la fila de Alguien') }

await p.locator('aside button').filter({hasText:'Nos deben'}).first().click()
await p.waitForTimeout(700)
await p.screenshot({path:'shots/n3-deudas.png', fullPage:true})
const hero = await p.locator('text=NOS DEBEN').locator('..').textContent().catch(()=>null)
console.log('pantalla Nos deben →', (hero||'').replace(/\s+/g,' ').slice(0,70))
// verificar que el ajuste NO cuenta como ingreso
await p.locator('aside button').filter({hasText:'Inicio'}).first().click()
await p.waitForTimeout(700)
const entro = await p.locator('text=Entró').locator('..').textContent().catch(()=>null)
console.log('Inicio →', (entro||'').replace(/\s+/g,' ').slice(0,70))
console.log('errores:', errs.length, errs.slice(0,2).join(' | '))
await b.close(); server.close()
