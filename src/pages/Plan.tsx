import { useMemo, useState } from 'react'
import { useStore, usePlan } from '../lib/store'
import { addMonths, catsGasto, eur, monthLabel, summarize } from '../lib/calc'
import { Card, EuroInput, SectionTitle, cx } from '../components/ui'
import type { MonthPlan } from '../types'

export default function Plan() {
  const settings = useStore((s) => s.settings)
  const txns = useStore((s) => s.txns)
  const plans = useStore((s) => s.plans)
  const month = useStore((s) => s.month)
  const savePlan = useStore((s) => s.savePlan)
  const toast = useStore((s) => s.toast)

  const saved = usePlan(month)
  const [draft, setDraft] = useState<MonthPlan>(saved)
  const [key, setKey] = useState(month)
  if (key !== month) { setKey(month); setDraft(saved) }

  const prev = addMonths(month, -1)
  const prevPlan = plans.find((p) => p.month === prev)
  const prevActual = useMemo(
    () => summarize(prev, txns, prevPlan, settings),
    [prev, txns, prevPlan, settings],
  )

  const cats = catsGasto(settings, true)
  const income = Object.values(draft.incomes).reduce((s, n) => s + (n || 0), 0)
  const budget = Object.values(draft.budgets).reduce((s, n) => s + (n || 0), 0)
  const leftover = income - budget
  const goal = draft.savingsGoal || 0
  const gap = leftover - goal
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  const set = (patch: Partial<MonthPlan>) => setDraft((d) => ({ ...d, ...patch }))
  const setBudget = (id: string, n: number) => set({ budgets: { ...draft.budgets, [id]: n } })
  const setIncome = (id: string, n: number) => set({ incomes: { ...draft.incomes, [id]: n } })

  const copyPrev = () => {
    if (!prevPlan) return toast(`No hay plan guardado en ${monthLabel(prev, true)}`, 'warn')
    set({ incomes: { ...prevPlan.incomes }, budgets: { ...prevPlan.budgets }, savingsGoal: prevPlan.savingsGoal })
    toast(`Copiado el plan de ${monthLabel(prev, true)}. Revisá y guardá.`, 'info')
  }

  const copyReal = () => {
    if (!prevActual.hasData) return toast(`No hay movimientos en ${monthLabel(prev, true)}`, 'warn')
    const budgets: Record<string, number> = {}
    for (const l of prevActual.byCategory) if (l.real > 0) budgets[l.categoryId] = Math.round(l.real)
    const incomes: Record<string, number> = { ...draft.incomes }
    set({ budgets, incomes })
    toast(`Cargado el gasto real de ${monthLabel(prev, true)} como plan. Ajustá lo que quieras.`, 'info')
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <SectionTitle hint="Se define al principio del mes. A fin de mes lo comparás contra la realidad.">
            Plan de {monthLabel(month, true)}
          </SectionTitle>
          <div className="flex gap-2 no-print">
            <button className="btn-outline btn-sm" onClick={copyPrev}>Copiar plan anterior</button>
            <button className="btn-outline btn-sm" onClick={copyReal}>Usar gasto real anterior</button>
          </div>
        </div>

        {/* resumen del plan */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 my-1 border-y border-line">
          <div>
            <div className="text-[12px] text-ink-mute">Ingresos</div>
            <div className="num text-[19px] font-semibold mt-0.5">{eur(income, { decimals: 0 })}</div>
          </div>
          <div>
            <div className="text-[12px] text-ink-mute">Gastos planeados</div>
            <div className="num text-[19px] font-semibold mt-0.5">{eur(budget, { decimals: 0 })}</div>
          </div>
          <div>
            <div className="text-[12px] text-ink-mute">Queda libre</div>
            <div className={cx('num text-[19px] font-semibold mt-0.5', leftover < 0 ? 'text-critical' : '')}>
              {eur(leftover, { decimals: 0 })}
            </div>
          </div>
          <div>
            <div className="text-[12px] text-ink-mute">Meta de ahorro</div>
            <div className="num text-[19px] font-semibold mt-0.5 text-seq-600">{eur(goal, { decimals: 0 })}</div>
          </div>
        </div>

        {(income > 0 || budget > 0) && (
          <div
            className={cx(
              'rounded-lg px-4 py-3 text-[13px] leading-relaxed flex items-start gap-2',
              gap < -1 ? 'bg-[#fdecec] text-ink' : 'bg-good/10 text-ink',
            )}
          >
            <span aria-hidden className="mt-px">{gap < -1 ? '⚠' : '✓'}</span>
            {gap < -1 ? (
              <span>
                El plan no cierra: te faltan <strong className="num">{eur(Math.abs(gap), { decimals: 0 })}</strong> para
                llegar a la meta de ahorro. Bajá algún presupuesto o la meta.
              </span>
            ) : (
              <span>
                El plan cierra. Si se cumple, ahorran <strong className="num">{eur(leftover, { decimals: 0 })}</strong>
                {gap > 1 && <> — <strong className="num">{eur(gap, { decimals: 0 })}</strong> por encima de la meta</>}.
              </span>
            )}
          </div>
        )}
      </Card>

      {/* ingresos */}
      <Card className="p-5">
        <SectionTitle hint="Lo que esperás que entre este mes. A fin de mes se compara con lo que entró de verdad.">
          Ingresos
        </SectionTitle>
        <div className="space-y-3">
          {settings.members.map((m) => (
            <div key={m.id} className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: m.color }} aria-hidden />
              <span className="text-[14px] grow">{m.name}</span>
              <EuroInput className="w-32" value={draft.incomes[m.id] || 0} onChange={(n) => setIncome(m.id, n)} />
            </div>
          ))}
        </div>
      </Card>

      {/* presupuesto por categoría */}
      <Card className="p-5">
        <SectionTitle hint="Dejá en cero lo que no aplique este mes. Solo se muestran las que tengan monto o movimientos.">
          Gastos planeados por categoría
        </SectionTitle>
        <div className="space-y-1">
          {cats.map((c) => {
            const prevReal = prevActual.byCategory.find((l) => l.categoryId === c.id)?.real ?? 0
            return (
              <div key={c.id} className="flex items-center gap-3 py-1.5">
                <span className="text-[15px] w-6 text-center shrink-0" aria-hidden>{c.emoji}</span>
                <span className="text-[14px] grow truncate">{c.name}</span>
                {prevReal > 0 && (
                  <button
                    className="text-[12px] text-ink-mute hover:text-seq-600 num whitespace-nowrap no-print"
                    onClick={() => setBudget(c.id, Math.round(prevReal))}
                    title={`Usar el gasto real de ${monthLabel(prev, true)}`}
                  >
                    {monthLabel(prev)}: {eur(prevReal, { decimals: 0 })}
                  </button>
                )}
                <EuroInput className="w-28 shrink-0" value={draft.budgets[c.id] || 0} onChange={(n) => setBudget(c.id, n)} />
              </div>
            )
          })}
        </div>
      </Card>

      {/* meta de ahorro */}
      <Card className="p-5">
        <SectionTitle hint="Lo que querés que quede al final del mes. Es la referencia contra la que se mide el ahorro real.">
          Meta de ahorro
        </SectionTitle>
        <div className="flex items-center gap-3">
          <span className="text-[15px] w-6 text-center" aria-hidden>🎯</span>
          <span className="text-[14px] grow">Ahorro objetivo de {monthLabel(month, true)}</span>
          <EuroInput className="w-32" value={draft.savingsGoal} onChange={(n) => set({ savingsGoal: n })} />
        </div>
      </Card>

      {/* guardar */}
      <div className="sticky bottom-20 sm:bottom-4 flex justify-end gap-2 no-print">
        {dirty && (
          <div className="flex items-center gap-2 rounded-xl2 bg-ink text-white px-4 py-2.5 shadow-pop">
            <span className="text-[13.5px]">Hay cambios sin guardar</span>
            <button className="btn-sm text-white/70 hover:text-white" onClick={() => setDraft(saved)}>Descartar</button>
            <button
              className="btn-sm bg-white text-ink font-medium px-3 rounded-md"
              onClick={async () => { await savePlan(draft); toast('Plan guardado') }}
            >
              Guardar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
