import fs from 'node:fs'
import { parseStatement } from '../src/lib/parsers'
import { buildTxn, guessAccount } from '../src/lib/classify'
import { CATEGORIES, RULES } from '../src/lib/seed'
import { summarize } from '../src/lib/calc'
import type { Account, Member, Txn, Settings } from '../src/types'
import { SHARED } from '../src/types'

const members: Member[] = [
  { id: 'm1', name: 'Uno', aliases: ['ANA RUIZ'], color: '#3d5fe8' },
  { id: 'm2', name: 'Dos', aliases: ['DIEGO SOSA'], color: '#12916a' },
]
const accounts: Account[] = [
  { id: 'a1', bank: 'lhv', label: 'LHV Uno', ownerId: 'm1', iban: 'EE001234567890123456', fileTokens: [] },
  { id: 'a2', bank: 'wise', label: 'Wise Uno', ownerId: 'm1', fileTokens: ['wise'] },
  { id: 'a3', bank: 'revolut', label: 'Revolut compartida', ownerId: SHARED, fileTokens: ['revolut', 'account-statement'] },
]
const settings = { members, accounts, categories: CATEGORIES, currency: 'EUR', autoRules: true, startMonth: '2026-01', onboarded: true } as Settings
const ctx = { members, accounts, rules: RULES }
const all: Txn[] = []
for (const [f, name] of [
  ['lhv', 'EE001234567890123456_Account_Statement_01072026_06082026.csv'],
  ['wise', 'transactionhistory2.csv'],
  ['revolut', 'account-statement_2026-04-01_2026-08-19_es-mx.csv'],
] as const) {
  const res = parseStatement(fs.readFileSync(new URL(`./${f}.csv`, import.meta.url), 'utf8'))
  const g = guessAccount({ accountIbans: res.accountIbans, ownerHints: res.ownerHints, fileName: name, bank: res.bank }, accounts, members)
  const acc = accounts.find((a) => a.id === g.accountId)!
  all.push(...res.rows.map((r) => buildTxn(r, acc, ctx)))
}
const byId = new Map(all.map((t) => [t.id, t]))
const txns = [...byId.values()]
const meses = [...new Set(txns.map((t) => t.month))].sort()

let fallos = 0
for (const m of meses) {
  const s = summarize(m, txns, undefined, settings)
  const porBolsillo = s.netByOwner.reduce((a, o) => a + o.net, 0)
  const porCuenta = s.netByAccount.reduce((a, c) => a + c.net, 0)
  const ok = Math.abs(porBolsillo - porCuenta) < 0.02
  if (!ok) fallos++
  console.log(`${m}  bolsillos ${porBolsillo.toFixed(2).padStart(10)}   cuentas ${porCuenta.toFixed(2).padStart(10)}   ${ok ? 'OK' : '✗ NO CUADRA'}`)
  // y que cada bolsillo cuadre con la suma de sus cuentas
  for (const o of s.netByOwner) {
    const suma = s.netByAccount.filter((c) => c.ownerId === o.ownerId).reduce((a, c) => a + c.net, 0)
    if (Math.abs(suma - o.net) > 0.02) { console.log(`   ✗ ${o.ownerId}: bolsillo ${o.net.toFixed(2)} vs cuentas ${suma.toFixed(2)}`); fallos++ }
  }
  for (const c of s.netByAccount) console.log(`     ${c.ownerId.padEnd(8)} ${c.label.padEnd(24)} ${c.net.toFixed(2).padStart(10)}`)
}
console.log(fallos === 0 ? '\n★ todo cuadra' : `\n✗ ${fallos} problemas`)

// ── caso del espejo sin importar ──────────────────────────────────────────────
// Entra plata a la compartida mandada por alguien cuya cuenta NO está importada.
// El bolsillo de esa persona baja, pero no hay ninguna cuenta suya donde anotarlo:
// tiene que aparecer el renglón "Cuentas sin importar" y seguir cuadrando.
const espejo: Txn = {
  id: 'x1', date: '2026-08-05', month: '2026-08', description: 'De DIEGO SOSA',
  rawDescription: 'De DIEGO SOSA', amount: 650, accountId: 'a3', ownerId: SHARED,
  categoryId: 'transferencia-interna', kind: 'internal', source: 'csv', importedAt: 0,
  counterparty: 'DIEGO SOSA',
}
const s2 = summarize('2026-08', [...txns, espejo], undefined, settings)
console.log('\n── con el espejo sin contrapartida ──')
for (const c of s2.netByAccount) console.log(`  ${c.ownerId.padEnd(8)} ${c.label.padEnd(24)} ${c.net.toFixed(2).padStart(10)}`)
const b2 = s2.netByOwner.reduce((a, o) => a + o.net, 0)
const c2 = s2.netByAccount.reduce((a, c) => a + c.net, 0)
console.log(`  bolsillos ${b2.toFixed(2)}  cuentas ${c2.toFixed(2)}  ${Math.abs(b2 - c2) < 0.02 ? 'OK' : '✗ NO CUADRA'}`)
const m2 = s2.netByAccount.find((c) => c.sinCuenta)
console.log(`  renglón sin cuenta: ${m2 ? `${m2.label} ${m2.net.toFixed(2)} (dueño ${m2.ownerId})` : '✗ FALTA'}`)
