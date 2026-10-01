import { summarize, savingsSeries, bolsillos } from '../src/lib/calc'
import { CATEGORIES } from '../src/lib/seed'
import type { Settings, Txn } from '../src/types'
import { SHARED, INCOME_CAT, INTERNAL_CAT } from '../src/types'

/**
 * El saldo de hoy es la suma de los meses.
 *
 * La pantalla de Ahorros muestra dos cosas que tienen que ser el mismo dato visto
 * distinto: cuánto cambió cada cuenta cada mes, y cuánto hay en cada cuenta hoy.
 * Si no cierran entre sí, el usuario deja de creerle a las dos. Esto lo verifica.
 */
const settings: Settings = {
  members: [
    { id: 'm1', name: 'Matías', aliases: ['MATIAS CANTELLA'], color: '#2a78d6' },
    { id: 'm2', name: 'Shadia', aliases: ['SHADIA SAN MARTIN'], color: '#eb6834' },
  ],
  accounts: [
    { id: 'lhv', bank: 'lhv', label: 'LHV Matías', ownerId: 'm1', fileTokens: [] },
    { id: 'wise', bank: 'wise', label: 'Wise Matías', ownerId: 'm1', fileTokens: [] },
    { id: 'rev', bank: 'revolut', label: 'Revolut compartida', ownerId: SHARED, fileTokens: [] },
  ],
  categories: CATEGORIES,
  currency: 'EUR',
  autoRules: true,
  startMonth: '2026-08',
  onboarded: true,
}

let n = 0
const mov = (
  date: string, accountId: string, ownerId: string, amount: number,
  kind: Txn['kind'] = 'expense', description = 'Movimiento', extra: Partial<Txn> = {},
): Txn => ({
  id: `t${++n}`, date, month: date.slice(0, 7), description, rawDescription: description,
  amount, accountId, ownerId,
  categoryId: kind === 'income' ? INCOME_CAT : kind === 'internal' ? INTERNAL_CAT : 'supermercado',
  kind, source: 'csv', importedAt: 0, ...extra,
})

const txns: Txn[] = [
  // agosto: entra el sueldo, gastan, y Matías manda algo a la compartida
  mov('2026-08-01', 'lhv', 'm1', 2800, 'income', 'Deel Inc'),
  mov('2026-08-05', 'lhv', 'm1', -1474, 'expense', 'Alquiler'),
  mov('2026-08-10', 'lhv', 'm1', -500, 'internal', 'A MATIAS CANTELLA'),
  mov('2026-08-10', 'rev', SHARED, 500, 'internal', 'De MATIAS CANTELLA'),
  mov('2026-08-15', 'rev', SHARED, -480, 'expense', 'Rimi'),
  // septiembre: mes flojo, gastan más de lo que entra
  mov('2026-09-01', 'lhv', 'm1', 1400, 'income', 'Deel Inc'),
  mov('2026-09-08', 'lhv', 'm1', -2056, 'expense', 'Alquiler y varios'),
  mov('2026-09-20', 'rev', SHARED, -320, 'expense', 'Selver'),
  // octubre: Shadia manda a la compartida pero su cuenta no está importada
  mov('2026-10-01', 'rev', SHARED, 650, 'internal', 'De SHADIA SAN MARTIN'),
  mov('2026-10-02', 'wise', 'm1', -120, 'expense', 'Suscripciones'),
]

const meses = [...new Set(txns.map((t) => t.month))].sort()
const serie = savingsSeries(meses, txns, [], settings)

// ── 1. acumular por cuenta, que es lo que hace la pantalla ───────────────────
const saldo = new Map<string, { label: string; ownerId: string; net: number }>()
for (const d of serie) {
  for (const c of d.cuentas) {
    const e = saldo.get(c.key) ?? { label: c.label, ownerId: c.ownerId, net: 0 }
    e.net += c.net
    saldo.set(c.key, e)
  }
}

console.log('── cambio mes a mes ──')
for (const d of serie) {
  const partes = d.cuentas.map((c) => `${c.label} ${c.net > 0 ? '+' : ''}${c.net.toFixed(0)}`).join('  ·  ')
  console.log(`  ${d.label.padEnd(12)} ahorro ${d.real.toFixed(2).padStart(10)}   ${partes}`)
}

console.log('\n── saldo hoy ──')
const pockets = bolsillos(settings)
for (const p of pockets) {
  const filas = [...saldo.values()].filter((c) => c.ownerId === p.id)
  if (!filas.length) continue
  console.log(`  ${p.label}`)
  for (const c of filas) console.log(`      ${c.label.padEnd(24)} ${c.net.toFixed(2).padStart(10)}`)
  console.log(`      ${'TOTAL'.padEnd(24)} ${filas.reduce((a, c) => a + c.net, 0).toFixed(2).padStart(10)}`)
}

// ── 2. las invariantes ───────────────────────────────────────────────────────
let fallos = 0
const check = (nombre: string, a: number, b: number) => {
  const ok = Math.abs(a - b) < 0.01
  if (!ok) fallos++
  console.log(`  ${ok ? '✓' : '✗'} ${nombre.padEnd(52)} ${a.toFixed(2)} ${ok ? '=' : '≠'} ${b.toFixed(2)}`)
}

console.log('\n── invariantes ──')

const sumaSaldos = [...saldo.values()].reduce((a, c) => a + c.net, 0)
const sumaAhorros = serie.reduce((a, d) => a + d.real, 0)
const sumaHuerfana = serie.reduce((a, d) => a + (d.netUnmatched ?? 0), 0)

// El saldo total de todas las cuentas es el ahorro acumulado, más lo que no se
// pudo atribuir: esa plata está en una cuenta pero no sabemos de quién salió.
check('saldo total = ahorro acumulado + sin atribuir', sumaSaldos, sumaAhorros + sumaHuerfana)

// Cada mes, el reparto por cuenta tiene que dar lo mismo que el reparto por bolsillo.
for (const m of meses) {
  const s = summarize(m, txns, undefined, settings)
  check(
    `${m}: por cuenta = por bolsillo`,
    s.netByAccount.reduce((a, c) => a + c.net, 0),
    s.netByOwner.reduce((a, o) => a + o.net, 0),
  )
}

// El caso concreto que motivó la pantalla: dos meses que se compensan.
const lhv = saldo.get('lhv')!
check('LHV hoy = agosto + septiembre', lhv.net, (2800 - 1474 - 500) + (1400 - 2056))

console.log(fallos === 0 ? '\n★ el saldo de hoy cierra con el cambio mes a mes' : `\n✗ ${fallos} problemas`)
