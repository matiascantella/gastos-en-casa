import { chromium } from 'playwright'
import path from 'node:path'; import fs from 'node:fs'; import http from 'node:http'
import { fileURLToPath } from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const dist=path.join(root,'dist')
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'}
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html'
 const f=path.join(dist,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end()}
 r.writeHead(200,{'Content-Type':MIME[path.extname(f)]??'application/octet-stream'});fs.createReadStream(f).pipe(r)})
await new Promise(r=>server.listen(4178,r))
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'})
const p=await b.newPage({viewport:{width:390,height:844},locale:'es-ES'})
const errs=[]; p.on('pageerror',e=>errs.push(e.message))
await p.goto('http://localhost:4178/')
const i=p.locator('input')
await i.nth(0).fill('Uno'); await i.nth(1).fill('Dos')
await p.getByRole('button',{name:'Seguir'}).click()
await p.locator('input[type=month]').fill('2026-08')
await p.getByRole('button',{name:'Empezar'}).click()
await p.waitForTimeout(500)
await p.getByRole('button',{name:'Más secciones'}).click()
await p.waitForTimeout(500)
const opciones = await p.locator('.fixed li button').allTextContents()
console.log('menú ⋯ del celular:', opciones.map(o=>o.replace(/[→\s]+/g,' ').trim()).join(' | '))
await p.screenshot({path:'shots/movil-mas.png'})
await p.getByRole('button',{name:/Nos deben/}).click()
await p.waitForTimeout(600)
const titulo = await p.locator('header').textContent()
console.log('llegué a:', (titulo||'').replace(/\s+/g,' ').trim().slice(0,40))
await p.screenshot({path:'shots/movil-deudas.png'})
console.log('errores:', errs.length)
await b.close(); server.close()
