import fs from 'node:fs'
import { parseStatement } from '../src/lib/parsers'
import { buildTxn, guessAccount, GUESS_LABEL, ownerLabel } from '../src/lib/classify'
import { CATEGORIES, RULES } from '../src/lib/seed'
import type { Account, Member, Txn } from '../src/types'
import { SHARED, UNCLASSIFIED } from '../src/types'

const members: Member[] = [
  { id: 'm1', name: 'Uno', aliases: ['PERSONA UNO APELLIDO'], color: '#3d5fe8' },
  { id: 'm2', name: 'Dos', aliases: ['PERSONA DOS APELLIDO'], color: '#12916a' },
]
const accounts: Account[] = [
  { id: 'a1', bank: 'lhv', label: 'LHV Uno', ownerId: 'm1', iban: 'EE001234567890123456', fileTokens: [] },
  { id: 'a2', bank: 'wise', label: 'Wise Uno', ownerId: 'm1', fileTokens: ['wise'] },
  { id: 'a3', bank: 'revolut', label: 'Revolut compartida', ownerId: SHARED, fileTokens: ['revolut', 'account-statement'] },
]
const ctx = { members, accounts, rules: RULES }
const catName = (id: string) => CATEGORIES.find((c) => c.id === id)?.name ?? id
const eur = (n: number) => (n < 0 ? '' : '+') + n.toFixed(2) + ' €'

const all: Txn[] = []
for (const [f, name] of [
  ['lhv', 'EE001234567890123456_Account_Statement_01072026_06082026.csv'],
  ['wise', 'transactionhistory2.csv'],
  ['revolut', 'account-statement_2026-04-01_2026-08-19_es-mx.csv'],
] as const) {
  const text = fs.readFileSync(new URL(`./${f}.csv`, import.meta.url), 'utf8')
  const res = parseStatement(text)
  const g = guessAccount(
    { accountIbans: res.accountIbans, ownerHints: res.ownerHints, fileName: name, bank: res.bank },
    accounts, members,
  )
  const acc = accounts.find((a) => a.id === g.accountId)!
  console.log(`\n${name}\n  → ${acc.label} (${ownerLabel(acc.ownerId, members)}) ${GUESS_LABEL[g.reason!]}${g.detail ? ` [${g.detail}]` : ''}`)
  const txns = res.rows.map((r) => buildTxn(r, acc, ctx))
  const dupes = txns.length - new Set(txns.map((t) => t.id)).size
  console.log(`  ${txns.length} movimientos, ${dupes} ids repetidos`)
  all.push(...txns)
}

// ── dedupe global ───────────────────────────────────────────────────────────
const byId = new Map<string, Txn>()
for (const t of all) byId.set(t.id, t)
console.log(`\n════ TOTAL: ${all.length} filas → ${byId.size} movimientos únicos ════`)

const live = [...byId.values()].filter((t) => !t.excluded)
const exp = live.filter((t) => t.kind === 'expense')
const inc = live.filter((t) => t.kind === 'income')
const int = live.filter((t) => t.kind === 'internal')

console.log(`\ngastos:   ${exp.length.toString().padStart(4)}  ${eur(exp.reduce((s, t) => s + t.amount, 0))}`)
console.log(`ingresos: ${inc.length.toString().padStart(4)}  ${eur(inc.reduce((s, t) => s + t.amount, 0))}`)
console.log(`internos: ${int.length.toString().padStart(4)}  (excluidos del cálculo)`)

console.log('\n── movimientos internos detectados (no deben contar como gasto) ──')
for (const t of int.slice(0, 10)) console.log(`  ${t.date} ${eur(t.amount).padStart(11)}  ${t.description.slice(0, 44)}`)

console.log('\n── ingresos detectados ──')
for (const t of inc.slice(0, 8)) console.log(`  ${t.date} ${eur(t.amount).padStart(11)}  ${t.description.slice(0, 44)}`)

const byCat = new Map<string, { n: number; sum: number }>()
for (const t of exp) {
  const e = byCat.get(t.categoryId) ?? { n: 0, sum: 0 }
  e.n++; e.sum += t.amount
  byCat.set(t.categoryId, e)
}
console.log('\n── gasto por categoría ──')
for (const [id, v] of [...byCat.entries()].sort((a, b) => a[1].sum - b[1].sum))
  console.log(`  ${catName(id).padEnd(22)} ${v.n.toString().padStart(4)}  ${eur(v.sum).padStart(11)}`)

const un = exp.filter((t) => t.categoryId === UNCLASSIFIED)
const pct = ((1 - un.length / exp.length) * 100).toFixed(1)
console.log(`\n★ clasificados automáticamente: ${pct}%  (${un.length} sin clasificar de ${exp.length})`)
console.log('\n── sin clasificar (los que tendrías que tocar a mano una vez) ──')
const seen = new Set<string>()
for (const t of un) {
  const k = t.description.slice(0, 28)
  if (seen.has(k)) continue
  seen.add(k)
  if (seen.size > 22) break
  console.log(`  ${eur(t.amount).padStart(11)}  ${t.description.slice(0, 50)}`)
}

console.log('\n── por dueño ──')
for (const o of ['m1', 'm2', SHARED]) {
  const s = exp.filter((t) => t.ownerId === o)
  if (s.length) console.log(`  ${ownerLabel(o, members).padEnd(12)} ${s.length.toString().padStart(4)}  ${eur(s.reduce((a, t) => a + t.amount, 0))}`)
}
