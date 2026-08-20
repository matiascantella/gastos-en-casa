import { useMemo, useState } from 'react'
import { useStore, usePlan } from '../lib/store'
import { addMonths, catById, eur, monthLabel, summarize } from '../lib/calc'
import { Card, Delta, Empty, SectionTitle, cx } from '../components/ui'
import type { Route } from '../App'
import type { MonthPlan } from '../types'

export default function Close({ go }: { go: (r: Route) => void }) {
  const settings = useStore((s) => s.settings)
  const txns = useStore((s) => s.txns)
  const month = useStore((s) => s.month)
  const plan = usePlan(month)
  const savePlan = useStore((s) => s.savePlan)
  const setMonth = useStore((s) => s.setMonth)
  const toast = useStore((s) => s.toast)
  const [busy, setBusy] = useState(false)

  const s = useMemo(() => summarize(month, txns, plan, settings), [month, txns, plan, settings])
  const next = addMonths(month, 1)
  const hasPlan = s.incomePlanned > 0 || s.expensePlanned > 0 || s.savingsGoal > 0

  if (!s.hasData) {
    return (
      <Card className="p-1">
        <Empty icon="📭" title={`No hay movimientos en ${monthLabel(month, true)}`}>
          Importá los extractos del mes para poder cerrarlo.
          <div className="mt-5"><button className="btn-primary" onClick={() => go('importar')}>Importar CSV</button></div>
        </Empty>
      </Card>
    )
  }

  const savingsDiff = s.savingsReal - s.savingsGoal
  const incomeDiff = s.incomeReal - s.incomePlanned
  const expenseDiff = s.expenseReal - s.expensePlanned

  /** Arma el plan del mes que viene con lo aprendido: gasto real como base, meta ajustada. */
  const carryForward = async (mode: 'real' | 'plan') => {
    setBusy(true)
    try {
      const budgets: Record<string, number> = {}
      if (mode === 'real') {
        for (const l of s.byCategory) if (l.real > 0) budgets[l.categoryId] = Math.round(l.real)
      } else {
        Object.assign(budgets, plan.budgets)
      }
      const incomes = s.incomeReal > 0 && s.incomePlanned === 0
        ? { ...plan.incomes }
        : { ...plan.incomes }
      const totalBudget = Object.values(budgets).reduce((a, n) => a + n, 0)
      const totalIncome = Object.values(incomes).reduce((a, n) => a + n, 0)
      const suggestedGoal = Math.max(0, Math.round(totalIncome - totalBudget))
      const p: MonthPlan = {
        month: next,
        incomes,
        budgets,
        savingsGoal: suggestedGoal || s.savingsGoal,
      }
      await savePlan(p)
      await savePlan({ ...plan, month, closedAt: Date.now() })
      setMonth(next)
      go('plan')
      toast(`${monthLabel(month, true)} cerrado. Te dejé el plan de ${monthLabel(next, true)} armado para revisar.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <Card className="p-5 sm:p-6">
        <SectionTitle hint="Lo que planeaste contra lo que pasó de verdad.">
          Cierre de {monthLabel(month, true)}
        </SectionTitle>

        {!hasPlan && (
          <div className="rounded-lg bg-[#fff8ec] border border-warning/40 px-4 py-3 text-[13px] mb-4 leading-relaxed">
            No habías cargado un plan para este mes, así que solo se muestra la realidad.
            Igual podés usar estos números como base para el mes que viene.
          </div>
        )}

        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-[13.5px] min-w-[420px]">
            <thead>
              <tr className="border-b border-line">
                <th className="th py-2">Concepto</th>
                <th className="th py-2 text-right">Planeado</th>
                <th className="th py-2 text-right">Real</th>
                <th className="th py-2 text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line/60">
                <td className="py-2.5">Ingresos</td>
                <td className="py-2.5 num text-right text-ink-mute">{eur(s.incomePlanned, { decimals: 0 })}</td>
                <td className="py-2.5 num text-right font-medium">{eur(s.incomeReal, { decimals: 0 })}</td>
                <td className="py-2.5 text-right">{hasPlan ? <Delta value={incomeDiff} invert /> : '—'}</td>
              </tr>
              <tr className="border-b border-line/60">
                <td className="py-2.5">Gastos</td>
                <td className="py-2.5 num text-right text-ink-mute">{eur(s.expensePlanned, { decimals: 0 })}</td>
                <td className="py-2.5 num text-right font-medium">{eur(s.expenseReal, { decimals: 0 })}</td>
                <td className="py-2.5 text-right">{hasPlan ? <Delta value={expenseDiff} /> : '—'}</td>
              </tr>
              <tr className="bg-line/25">
                <td className="py-3 font-semibold">Ahorro</td>
                <td className="py-3 num text-right text-ink-mute">{eur(s.savingsGoal, { decimals: 0 })}</td>
                <td className={cx('py-3 num text-right font-semibold', s.savingsReal >= s.savingsGoal ? 'text-goodink' : 'text-critical')}>
                  {eur(s.savingsReal, { sign: true, decimals: 0 })}
                </td>
                <td className="py-3 text-right">{hasPlan ? <Delta value={savingsDiff} invert /> : '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {hasPlan && (
          <p className="text-[13.5px] text-ink-soft mt-4 leading-relaxed">
            {savingsDiff >= 0 ? (
              <>Cerraron el mes <strong className="num text-goodink">{eur(savingsDiff, { decimals: 0 })} por encima</strong> de la meta de ahorro.</>
            ) : (
              <>Quedaron <strong className="num text-critical">{eur(Math.abs(savingsDiff), { decimals: 0 })} por debajo</strong> de la meta de ahorro.</>
            )}
            {Math.abs(expenseDiff) > 20 && (
              <> El gasto {expenseDiff > 0 ? 'se pasó' : 'quedó'} <strong className="num">{eur(Math.abs(expenseDiff), { decimals: 0 })}</strong> {expenseDiff > 0 ? 'del presupuesto' : 'por debajo del presupuesto'}.</>
            )}
          </p>
        )}
      </Card>

      {/* desvíos por categoría */}
      <Card className="p-5">
        <SectionTitle hint="Ordenado por el tamaño del desvío: arriba está lo que más movió la aguja.">
          Dónde se fue la diferencia
        </SectionTitle>
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-[13.5px] min-w-[420px]">
            <thead>
              <tr className="border-b border-line">
                <th className="th py-2">Categoría</th>
                <th className="th py-2 text-right">Planeado</th>
                <th className="th py-2 text-right">Real</th>
                <th className="th py-2 text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {[...s.byCategory]
                .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
                .map((l) => {
                  const c = catById(settings, l.categoryId)
                  return (
                    <tr key={l.categoryId} className="border-b border-line/60 last:border-0">
                      <td className="py-2.5">
                        <span className="mr-1.5" aria-hidden>{c.emoji}</span>{c.name}
                        <span className="text-ink-mute text-[12px] ml-1.5">({l.count})</span>
                      </td>
                      <td className="py-2.5 num text-right text-ink-mute">
                        {l.planned > 0 ? eur(l.planned, { decimals: 0 }) : '—'}
                      </td>
                      <td className="py-2.5 num text-right font-medium">{eur(l.real, { decimals: 0 })}</td>
                      <td className="py-2.5 text-right">
                        {l.planned > 0 ? <Delta value={l.diff} /> : <span className="text-[12px] text-ink-mute">sin plan</span>}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* llevar al mes siguiente */}
      <Card className="p-5 no-print">
        <SectionTitle hint={`Se guarda como plan de ${monthLabel(next, true)} y podés retocarlo antes de arrancar.`}>
          Armar el plan de {monthLabel(next, true)}
        </SectionTitle>
        <div className="grid sm:grid-cols-2 gap-3">
          <button
            className="rounded-xl2 border border-seq-450 bg-seq-100/40 p-4 text-left hover:bg-seq-100/70 transition-colors disabled:opacity-50"
            onClick={() => carryForward('real')}
            disabled={busy}
          >
            <div className="text-[14px] font-medium text-seq-600">Corregir con la realidad</div>
            <div className="text-[12.5px] text-ink-soft mt-1 leading-relaxed">
              Usa el gasto real de este mes como presupuesto y recalcula la meta de ahorro.
              Es la opción honesta si te pasaste.
            </div>
          </button>
          <button
            className="rounded-xl2 border border-line-strong p-4 text-left hover:bg-line/25 transition-colors disabled:opacity-50"
            onClick={() => carryForward('plan')}
            disabled={busy || !hasPlan}
          >
            <div className="text-[14px] font-medium">Repetir el mismo plan</div>
            <div className="text-[12.5px] text-ink-soft mt-1 leading-relaxed">
              Mantiene los presupuestos que habías fijado. Útil si el desvío fue puntual
              y no querés relajar el objetivo.
            </div>
          </button>
        </div>
      </Card>
    </div>
  )
}
