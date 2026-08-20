import { chromium } from 'playwright'
import path from 'node:path'; import fs from 'node:fs'; import http from 'node:http'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root,'dist')
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'}
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html'
 const f=path.join(dist,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end()}
 r.writeHead(200,{'Content-Type':MIME[path.extname(f)]??'application/octet-stream'});fs.createReadStream(f).pipe(r)})
await new Promise(r=>server.listen(4176,r))
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'})
for (const [tag,w,h] of [['desglose-desktop',1150,950],['desglose-mobile',390,844]]) {
  const p=await b.newPage({viewport:{width:w,height:h},locale:'es-ES'})
  const errs=[]; p.on('pageerror',e=>errs.push(e.message))
  await p.goto('http://localhost:4176/')
  const i=p.locator('input')
  await i.nth(0).fill('Uno'); await i.nth(1).fill('Dos')
  await i.nth(2).fill('PERSONA UNO APELLIDO'); await i.nth(3).fill('PERSONA DOS APELLIDO')
  await p.getByRole('button',{name:'Seguir'}).click()
  await p.locator('input[type=month]').fill('2026-08')
  await p.getByRole('button',{name:'Empezar'}).click()
  await p.waitForTimeout(400)
  const nav = w<500 ? 'nav.fixed button' : 'aside button'
  await p.locator(nav).filter({hasText:'Importar'}).first().click()
  await p.waitForTimeout(300)
  await p.locator('input[type=file]').first().setInputFiles(['lhv','wise','revolut'].map(f=>path.join(root,`test/${f}.csv`)))
  await p.waitForTimeout(900)
  const sels=p.locator('.card select')
  for(let k=0;k<await sels.count();k++){const sx=sels.nth(k); if(await sx.inputValue())continue
    const o=await sx.locator('option').evaluateAll(os=>os.map(x=>({v:x.value,t:x.textContent})))
    const pick=o.find(x=>x.v&&/Uno|Compartida/.test(x.t)); if(pick)await sx.selectOption(pick.v); await p.waitForTimeout(120)}
  await p.waitForTimeout(500)
  await p.getByRole('button',{name:/Importar \d+ movimientos/}).click()
  await p.waitForTimeout(1400)
  // ingreso a mano
  await p.locator(nav).filter({hasText:'Gastos'}).first().click()
  await p.waitForTimeout(400)
  await p.getByRole('button',{name:'+ A mano'}).click()
  await p.waitForTimeout(400)
  await p.getByRole('button',{name:'Ingreso',exact:true}).click()
  await p.locator('input[placeholder="Sueldo"]').fill('Sueldo mensual')
  await p.locator('input[type=date]').fill('2026-08-01')
  await p.locator('input[inputmode=decimal]').fill('2764.47')
  const sc=p.locator('.fixed select').first()
  const ops=await sc.locator('option').evaluateAll(o=>o.map(x=>({v:x.value,t:x.textContent})))
  const lhv=ops.find(o=>o.v&&/LHV Uno/.test(o.t)); if(lhv)await sc.selectOption(lhv.v)
  await p.getByRole('button',{name:'Guardar'}).click()
  await p.waitForTimeout(900)
  await p.locator(nav).filter({hasText:'Inicio'}).first().click()
  await p.waitForTimeout(800)
  await p.screenshot({path:`shots/${tag}.png`})
  await p.locator(nav).filter({hasText:'Ahorros'}).first().click()
  await p.waitForTimeout(1200)
  await p.screenshot({path:`shots/${tag}-ahorros.png`, fullPage:true})
  console.log(tag,'| errores:',errs.length)
  await p.close()
}
await b.close(); server.close()
