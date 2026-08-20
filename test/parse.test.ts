import fs from 'node:fs'
import { parseStatement, BANK_LABEL } from '../src/lib/parsers'

const files = ['lhv', 'wise', 'revolut']

for (const f of files) {
  const text = fs.readFileSync(new URL(`./${f}.csv`, import.meta.url), 'utf8')
  const res = parseStatement(text)
  const usable = res.rows.filter((r) => !r.skip)
  const out = usable.filter((r) => r.amount < 0)
  const inn = usable.filter((r) => r.amount > 0)
  console.log(`\n════ ${f.toUpperCase()} → detectado: ${BANK_LABEL[res.bank]} ════`)
  console.log(`filas: ${res.rows.length}  usables: ${usable.length}  descartadas: ${res.rows.length - usable.length}`)
  console.log(`salidas: ${out.length} (${out.reduce((s, r) => s + r.amount, 0).toFixed(2)} €)`)
  console.log(`entradas: ${inn.length} (+${inn.reduce((s, r) => s + r.amount, 0).toFixed(2)} €)`)
  console.log(`IBANs: ${res.accountIbans.join(', ') || '—'}`)
  console.log(`titulares detectados: ${res.ownerHints.join(' | ') || '—'}`)
  const fx = usable.filter((r) => r.origCurrency)
  console.log(`convertidos de otra moneda: ${fx.length} (estimados: ${fx.filter((r) => r.fxEstimated).length})`)
  if (res.warnings.length) console.log(`avisos: ${res.warnings.length} → ${res.warnings[0]}`)
  const bad = usable.filter((r) => !r.date || !Number.isFinite(r.amount) || !r.description)
  console.log(`filas rotas: ${bad.length}`)
  console.log('muestra:')
  for (const r of usable.slice(0, 5)) {
    const fxs = r.origCurrency ? ` [${r.origAmount?.toFixed(2)} ${r.origCurrency}${r.fxEstimated ? '~' : ''}]` : ''
    console.log(`  ${r.date}  ${r.amount.toFixed(2).padStart(10)} €${fxs}  ${r.description.slice(0, 42)}`)
  }
  const rev = res.rows.filter((r) => r.skip)
  if (rev.length) console.log(`descartadas ej: ${rev.slice(0, 3).map((r) => `${r.description} (${r.skipReason})`).join(', ')}`)
}
