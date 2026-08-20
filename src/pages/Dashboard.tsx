import { useMemo } from 'react'
import { useStore, usePlan } from '../lib/store'
import { catById, deudas, eur, monthLabel, summarize } from '../lib/calc'
import { ownerLabel } from '../lib/classify'
import { BudgetBar, Card, Delta, Empty, Hero, Progress, SectionTitle, Stat, cx } from '../components/ui'
import type { Route } from '../App'
import { SHARED, UNCLASSIFIED } from '../types'

const OWNER_COLOR: Record<string, string> = { [SHARED]: '#1baf7a' }

/**
 * Desglose por persona debajo de una cifra. Compacto a propósito: el detalle
 * con barras y porcentajes vive más abajo, en "Por persona".
 */
function Desglose({ filas }: { filas: Array<{ ownerId: string; real: number }> }) {
  const settings = useStore((st) => st.settings)
  if (!filas.length) return null
  return (
    <ul className="mt-2.5 space-y-1">
      {filas.map((f) => (
        <li key={f.ownerId} className="flex items-baseline gap-1.5 text-[12px]">
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ background: settings.members.find((m) => m.id === f.ownerId)?.color ?? OWNER_COLOR[f.ownerId] ?? '#898781' }}
            aria-hidden
          />
          <span className="text-ink-mute truncate">{ownerLabel(f.ownerId, settings.members)}</span>
          <span className="grow" />
          <span className="num text-ink-soft whitespace-nowrap">{eur(f.real, { decimals: 0 })}</span>
        </li>
      ))}
    </ul>
  )
}

export default function Dashboard({ go }: { go: (r: Route) => void }) {
  const settings = useStore((s) => s.settings)
  const txns = useStore((s) => s.txns)
  const month = useStore((s) => s.month)
  const plan = usePlan(month)

  const s = useMemo(() => summarize(month, txns, plan, settings), [month, txns, plan, settings])
  const pendiente = useMemo(() => deudas(txns), [txns])
  const hasPlan = s.incomePlanned > 0 || s.expensePlanned > 0 || s.savingsGoal > 0

  if (!s.hasData && !hasPlan) {
    return (
      <Card className="p-1">
        <Empty icon="🏡" title={`Todavía no hay nada en ${monthLabel(month, true)}`}>
          Empezá por armar el plan del mes, o importá los CSV de los bancos si el mes ya pasó.
          <div className="flex justify-center gap-2 mt-5">
            <button className="btn-primary" onClick={() => go('plan')}>Armar el plan</button>
            <button className="btn-outline" onClick={() => go('importar')}>Importar CSV</button>
          </div>
        </Empty>
      </Card>
    )
  }

  const savingsTone = s.missingIncome ? 'neutral' : s.savingsReal >= s.savingsGoal ? 'good' : 'bad'
  const budgetPct = s.expensePlanned > 0 ? (s.expenseReal / s.expensePlanned) * 100 : 0
  const maxCat = Math.max(...s.byCategory.map((l) => Math.max(l.planned, l.real)), 1)
  const ownerTotal = s.byOwner.reduce((a, o) => a + o.real, 0)

  return (
    <div className="space-y-5">
      {/* pendientes por clasificar */}
      {s.unclassifiedCount > 0 && (
        <button
          onClick={() => go('gastos')}
          className="w-full text-left rounded-xl2 bg-[#fff8ec] border border-warning/40 px-4 py-3 flex items-center gap-3 hover:bg-[#fdf3e3] transition-colors no-print"
        >
          <span className="text-[17px]" aria-hidden>⚠</span>
          <span className="text-[13.5px] grow leading-snug">
            <strong className="font-semibold">{s.unclassifiedCount} gastos sin clasificar.</strong>{' '}
            Asignales categoría una vez y la app aprende para los meses que vienen.
          </span>
          <span className="text-ink-mute shrink-0" aria-hidden>→</span>
        </button>
      )}

      {/* falta el extracto donde entra el sueldo */}
      {s.missingIncome && (
        <div className="rounded-xl2 bg-seq-100/50 border border-seq-200 px-4 py-3 flex items-start gap-3">
          <span className="text-[15px] mt-px" aria-hidden>ℹ</span>
          <span className="text-[13.5px] leading-snug">
            <strong className="font-semibold">Este mes no tiene ingresos registrados</strong>, así que el ahorro
            se ve en negativo. Probablemente falte importar el extracto de la cuenta donde entra el sueldo.
          </span>
        </div>
      )}

      {/* cifra principal */}
      <Card className="p-5 sm:p-6">
        <div className="grid sm:grid-cols-[1.2fr,1fr] gap-6">
          <div>
            <Hero
              label={`Ahorro de ${monthLabel(month, true)}`}
              value={eur(s.savingsReal, { sign: true, decimals: 0 })}
              tone={s.savingsGoal > 0 || s.missingIncome ? savingsTone : 'neutral'}
              sub={
                s.savingsGoal > 0 ? (
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <span>Meta {eur(s.savingsGoal, { decimals: 0 })}</span>
                    <span aria-hidden>·</span>
                    <Delta value={s.savingsReal - s.savingsGoal} invert />
                  </span>
                ) : (
                  <span className="text-ink-mute">Sin meta definida este mes</span>
                )
              }
            />
            {s.savingsGoal > 0 && (
              <div className="mt-4 max-w-xs">
                <Progress
                  pct={s.savingsReal > 0 ? (s.savingsReal / s.savingsGoal) * 100 : 0}
                  tone={s.savingsReal >= s.savingsGoal ? 'good' : s.savingsReal > 0 ? 'neutral' : 'bad'}
                />
                <div className="text-[12px] text-ink-mute mt-1.5">
                  {s.savingsReal <= 0
                    ? 'Este mes se gastó más de lo que entró'
                    : `${Math.round((s.savingsReal / s.savingsGoal) * 100)}% de la meta`}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 sm:border-l sm:border-line sm:pl-6">
            <div className="min-w-0">
              <Stat label="Entró" value={eur(s.incomeReal, { decimals: 0 })} tone="good"
                sub={s.incomePlanned > 0 ? `plan ${eur(s.incomePlanned, { decimals: 0 })}` : undefined} />
              <Desglose filas={s.byOwnerIncome} />
            </div>
            <div className="min-w-0">
              <Stat label="Salió" value={eur(s.expenseReal, { decimals: 0 })}
                sub={s.expensePlanned > 0 ? `plan ${eur(s.expensePlanned, { decimals: 0 })}` : undefined} />
              <Desglose filas={s.byOwner} />
            </div>
            {s.expensePlanned > 0 && (
              <div className="col-span-2">
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-[12px] text-ink-mute">Presupuesto usado</span>
                  <span className={cx('num text-[13px] font-medium', budgetPct > 100 ? 'text-critical' : 'text-ink-soft')}>
                    {Math.round(budgetPct)}%
                  </span>
                </div>
                <Progress pct={budgetPct} tone={budgetPct > 100 ? 'bad' : 'neutral'} />
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* por categoría */}
      <Card className="p-5">
        <SectionTitle hint={hasPlan ? 'La barra gris es lo planeado; la azul, lo que va gastado. Rojo = te pasaste.' : 'Todavía no hay plan para comparar.'}>
          Por categoría
        </SectionTitle>

        {s.byCategory.length === 0 ? (
          <p className="text-[13.5px] text-ink-mute py-4">Sin gastos registrados este mes.</p>
        ) : (
          <ul className="space-y-3.5">
            {s.byCategory.map((l) => {
              const c = catById(settings, l.categoryId)
              const over = l.planned > 0 && l.real > l.planned
              return (
                <li key={l.categoryId}>
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <span className="text-[14px] w-5 text-center shrink-0" aria-hidden>{c.emoji}</span>
                    <span className={cx('text-[13.5px] grow truncate', l.categoryId === UNCLASSIFIED && 'text-[#96620f] font-medium')}>
                      {c.name}
                    </span>
                    <span className="num text-[13.5px] font-medium whitespace-nowrap">{eur(l.real, { decimals: 0 })}</span>
                    {l.planned > 0 && (
                      <span className="num text-[12px] text-ink-mute whitespace-nowrap w-[74px] text-right">
                        de {eur(l.planned, { decimals: 0 })}
                      </span>
                    )}
                  </div>
                  <div className="pl-7 flex items-center gap-3">
                    <div className="grow"><BudgetBar planned={l.planned} real={l.real} max={maxCat} /></div>
                    {l.planned > 0 && (
                      <span className={cx('num text-[12px] whitespace-nowrap w-[70px] text-right', over ? 'text-critical font-medium' : 'text-ink-mute')}>
                        {over ? `+${eur(l.diff, { decimals: 0 })}` : `queda ${eur(-l.diff, { decimals: 0 })}`}
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {/* por persona */}
      {s.byOwner.length > 0 && (
        <Card className="p-5">
          <SectionTitle hint="De qué cuenta salió cada euro. La Revolut compartida se cuenta aparte.">
            Por persona
          </SectionTitle>
          <div className="space-y-3">
            {s.byOwner.map((o) => {
              const color = settings.members.find((m) => m.id === o.ownerId)?.color ?? OWNER_COLOR[o.ownerId] ?? '#898781'
              const pct = ownerTotal > 0 ? (o.real / ownerTotal) * 100 : 0
              return (
                <div key={o.ownerId}>
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} aria-hidden />
                    <span className="text-[13.5px] grow">{ownerLabel(o.ownerId, settings.members)}</span>
                    <span className="num text-[13.5px] font-medium">{eur(o.real, { decimals: 0 })}</span>
                    <span className="num text-[12px] text-ink-mute w-9 text-right">{Math.round(pct)}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-line/60 overflow-hidden ml-0">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* plata prestada */}
      {pendiente.count > 0 && (
        <button
          onClick={() => go('deudas')}
          className="card w-full p-4 text-left hover:bg-line/20 transition-colors no-print"
        >
          <div className="flex items-center gap-3">
            <span className="text-[19px]" aria-hidden>🤝</span>
            <div className="grow min-w-0">
              <div className="text-[14px] font-medium">
                Nos deben <span className="num">{eur(pendiente.total, { decimals: 0 })}</span>
              </div>
              <div className="text-[12.5px] text-ink-mute mt-0.5 truncate">
                {pendiente.grupos.map((g) => g.persona).join(', ')}
              </div>
            </div>
            <span className="text-ink-mute" aria-hidden>→</span>
          </div>
        </button>
      )}

      {/* accesos */}
      <div className="grid sm:grid-cols-2 gap-3 no-print">
        <button onClick={() => go('cierre')} className="card p-4 text-left hover:bg-line/20 transition-colors">
          <div className="flex items-center gap-3">
            <span className="text-[19px]" aria-hidden>✓</span>
            <div className="grow min-w-0">
              <div className="text-[14px] font-medium">Cerrar {monthLabel(month, true)}</div>
              <div className="text-[12.5px] text-ink-mute mt-0.5">Comparar plan y realidad, y ajustar el mes que viene</div>
            </div>
            <span className="text-ink-mute" aria-hidden>→</span>
          </div>
        </button>
        <button onClick={() => go('importar')} className="card p-4 text-left hover:bg-line/20 transition-colors">
          <div className="flex items-center gap-3">
            <span className="text-[19px]" aria-hidden>↧</span>
            <div className="grow min-w-0">
              <div className="text-[14px] font-medium">Importar movimientos</div>
              <div className="text-[12.5px] text-ink-mute mt-0.5">Subí los CSV de LHV, Wise y Revolut</div>
            </div>
            <span className="text-ink-mute" aria-hidden>→</span>
          </div>
        </button>
      </div>
    </div>
  )
}
