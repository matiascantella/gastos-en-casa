import { useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { useStore } from '../lib/store'
import { bolsillos, eur, monthLabel, savingsSeries } from '../lib/calc'
import { Card, Empty, Hero, SectionTitle, cx } from '../components/ui'

const INK = '#0b0b0b'
const MUTED = '#898781'
const GRID = '#e1e0d9'
const BASELINE = '#c3c2b7'
const S_REAL = '#2a78d6'
const S_GOAL = '#898781'
const GOOD = '#0ca30c'
const CRIT = '#d03b3b'

/** Miles solo cuando hacen falta: con montos chicos, "0.2k" se repetía en varias marcas. */
const tickEur = (v: number) => {
  const a = Math.abs(v)
  if (a >= 1000) return `${(v / 1000).toFixed(a >= 10000 ? 0 : 1)}k`
  return String(Math.round(v))
}

export default function Savings() {
  const settings = useStore((s) => s.settings)
  const txns = useStore((s) => s.txns)
  const plans = useStore((s) => s.plans)
  const [table, setTable] = useState(false)

  const data = useMemo(() => {
    const set = new Set<string>([...txns.map((t) => t.month), ...plans.map((p) => p.month)])
    const months = [...set].filter(Boolean).sort()
    return savingsSeries(months, txns, plans, settings).filter((d) => d.hasData || d.goal > 0)
  }, [txns, plans, settings])

  if (data.length === 0) {
    return (
      <Card className="p-1">
        <Empty icon="↗" title="Todavía no hay historia de ahorro">
          Cuando importes al menos un mes de movimientos, acá vas a ver cómo evoluciona
          el ahorro contra las metas que te fijaste.
        </Empty>
      </Card>
    )
  }

  const pockets = bolsillos(settings)
  const ultimo = data[data.length - 1]
  const aportesMes = ultimo?.aportes ?? []
  const totalAportes = aportesMes.reduce((a, x) => a + x.monto, 0)
  const descuadre = data.find((d) => Math.abs(d.netUnmatched ?? 0) > 1)

  const totalReal = data.reduce((a, d) => a + d.real, 0)
  const totalGoal = data.reduce((a, d) => a + d.goal, 0)
  const withGoal = data.filter((d) => d.goal > 0)
  const hit = withGoal.filter((d) => d.real >= d.goal).length
  const avg = totalReal / data.length
  const anyGoal = totalGoal > 0

  return (
    <div className="space-y-5">
      <Card className="p-5 sm:p-6">
        <div className="grid sm:grid-cols-[1.1fr,1fr] gap-6">
          <Hero
            label="Ahorro acumulado"
            value={eur(totalReal, { sign: true, decimals: 0 })}
            tone={totalReal >= totalGoal ? 'good' : 'bad'}
            sub={
              anyGoal
                ? `Meta acumulada ${eur(totalGoal, { decimals: 0 })} · ${totalReal >= totalGoal ? 'por encima' : 'por debajo'} por ${eur(Math.abs(totalReal - totalGoal), { decimals: 0 })}`
                : `En ${data.length} ${data.length === 1 ? 'mes' : 'meses'} registrados`
            }
          />
          <div className="grid grid-cols-2 gap-4 sm:border-l sm:border-line sm:pl-6">
            <div>
              <div className="text-[12px] text-ink-mute">Promedio por mes</div>
              <div className={cx('num text-[19px] font-semibold mt-0.5', avg < 0 && 'text-critical')}>
                {eur(avg, { sign: true, decimals: 0 })}
              </div>
            </div>
            <div>
              <div className="text-[12px] text-ink-mute">Metas cumplidas</div>
              <div className="num text-[19px] font-semibold mt-0.5">
                {withGoal.length ? `${hit}/${withGoal.length}` : '—'}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* acumulado */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionTitle hint="Cuánto llevás guardado en total, mes contra mes.">
            Ahorro acumulado
          </SectionTitle>
          <button className="btn-ghost btn-sm no-print" onClick={() => setTable((t) => !t)}>
            {table ? 'Ver gráfico' : 'Ver tabla'}
          </button>
        </div>

        {table ? (
          <SavingsTable data={data} />
        ) : (
          <div className="h-[260px] -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
                <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 12 }} tickLine={false} axisLine={{ stroke: BASELINE }} />
                <YAxis
                  tick={{ fill: MUTED, fontSize: 12 }} tickLine={false} axisLine={false} width={56}
                  tickFormatter={tickEur}
                />
                <ReferenceLine y={0} stroke={BASELINE} strokeWidth={1} />
                <Tooltip content={<TT cumulative />} cursor={{ stroke: BASELINE, strokeWidth: 1 }} />
                {anyGoal && <Legend verticalAlign="top" align="left" height={28} iconType="plainline" wrapperStyle={{ fontSize: 12, color: MUTED, paddingLeft: 8 }} />}
                {anyGoal && (
                  <Line type="monotone" dataKey="cumGoal" name="Meta" stroke={S_GOAL} strokeWidth={2}
                    strokeDasharray="5 4" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fcfcfb' }} />
                )}
                <Line type="monotone" dataKey="cumReal" name="Real" stroke={S_REAL} strokeWidth={2}
                  dot={{ r: 3.5, fill: S_REAL, strokeWidth: 2, stroke: '#fcfcfb' }}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: '#fcfcfb' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* dónde quedó, mes a mes */}
      <Card className="p-5">
        <SectionTitle hint="La altura de cada barra es el ahorro del mes. Los colores muestran en qué bolsillo quedó esa plata.">
          Dónde quedó el ahorro
        </SectionTitle>
        <div className="h-[260px] -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
              <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 12 }} tickLine={false} axisLine={{ stroke: BASELINE }} />
              <YAxis
                tick={{ fill: MUTED, fontSize: 12 }} tickLine={false} axisLine={false} width={56}
                tickFormatter={tickEur}
              />
              <ReferenceLine y={0} stroke={BASELINE} strokeWidth={1} />
              <Tooltip content={<TTReparto pockets={pockets} />} cursor={{ fill: 'rgba(11,11,11,0.04)' }} />
              <Legend verticalAlign="top" align="left" height={28}
                wrapperStyle={{ fontSize: 12, color: MUTED, paddingLeft: 8 }} />
              {pockets.map((p, i) => (
                <Bar
                  key={p.id}
                  dataKey={`net.${p.id}`}
                  name={p.label}
                  stackId="a"
                  fill={p.color}
                  stroke="#fcfcfb"
                  strokeWidth={2}
                  radius={i === pockets.length - 1 ? [4, 4, 0, 0] : undefined}
                  maxBarSize={44}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[12.5px] text-ink-mute mt-3 leading-relaxed">
          Acá sí cuentan las transferencias entre sus cuentas, porque mueven plata de un
          bolsillo a otro. Por eso los tres colores suman el ahorro total: lo que sale de
          uno entra en el otro.
        </p>
        {descuadre && (
          <div className="mt-3 rounded-lg bg-[#fff8ec] border border-warning/40 px-4 py-3 text-[13px] leading-relaxed">
            <strong className="font-semibold">Hay {eur(Math.abs(descuadre.netUnmatched), { decimals: 0 })} que no
            se pudieron atribuir a nadie</strong> en {monthLabel(descuadre.month, true)}. Son transferencias
            entre cuentas donde falta importar la cuenta del otro lado y el nombre de la
            descripción no coincide con ninguno de ustedes dos. Revisá que los nombres
            completos estén bien en Ajustes → Quiénes son.
          </div>
        )}
      </Card>

      {/* aportes a la compartida */}
      {aportesMes.length > 0 && (
        <Card className="p-5">
          <SectionTitle hint={`Lo que cada uno mandó a la cuenta compartida en ${monthLabel(ultimo.month, true)}.`}>
            Quién puso en la compartida
          </SectionTitle>
          <div className="space-y-3">
            {aportesMes.map((a) => {
              const p = pockets.find((x) => x.id === a.ownerId)
              const pct = totalAportes > 0 ? (a.monto / totalAportes) * 100 : 0
              return (
                <div key={a.ownerId}>
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: p?.color }} aria-hidden />
                    <span className="text-[13.5px] grow">{p?.label ?? a.ownerId}</span>
                    <span className="num text-[13.5px] font-medium">{eur(a.monto, { decimals: 0 })}</span>
                    <span className="num text-[12px] text-ink-mute w-9 text-right">{Math.round(pct)}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-line/60 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: p?.color }} />
                  </div>
                </div>
              )
            })}
          </div>
          {aportesMes.length === 2 && (
            <p className="text-[13px] text-ink-soft mt-4 leading-relaxed">
              {Math.abs(aportesMes[0].monto - aportesMes[1].monto) < 1 ? (
                <>Pusieron lo mismo los dos.</>
              ) : (
                <>
                  {(aportesMes[0].monto > aportesMes[1].monto ? pockets.find((x) => x.id === aportesMes[0].ownerId) : pockets.find((x) => x.id === aportesMes[1].ownerId))?.label}{' '}
                  puso <strong className="num">{eur(Math.abs(aportesMes[0].monto - aportesMes[1].monto), { decimals: 0 })}</strong> más
                  que {(aportesMes[0].monto > aportesMes[1].monto ? pockets.find((x) => x.id === aportesMes[1].ownerId) : pockets.find((x) => x.id === aportesMes[0].ownerId))?.label}.
                </>
              )}
            </p>
          )}
        </Card>
      )}

      {!table && (
        <Card className="p-5">
          <SectionTitle>Detalle</SectionTitle>
          <SavingsTable data={data} />
        </Card>
      )}
    </div>
  )
}

type Row = ReturnType<typeof savingsSeries>[number]

function SavingsTable({ data }: { data: Row[] }) {
  return (
    <div className="overflow-x-auto -mx-5 px-5">
      <table className="w-full text-[13.5px] min-w-[440px]">
        <thead>
          <tr className="border-b border-line">
            <th className="th py-2">Mes</th>
            <th className="th py-2 text-right">Entró</th>
            <th className="th py-2 text-right">Salió</th>
            <th className="th py-2 text-right">Ahorro</th>
            <th className="th py-2 text-right">Meta</th>
            <th className="th py-2 text-right">Acumulado</th>
          </tr>
        </thead>
        <tbody>
          {[...data].reverse().map((d) => (
            <tr key={d.month} className="border-b border-line/60 last:border-0">
              <td className="py-2.5 whitespace-nowrap">{monthLabel(d.month, true)}</td>
              <td className="py-2.5 num text-right text-ink-soft">
                {d.missingIncome ? <span className="text-ink-mute" title="Sin ingresos registrados este mes">—</span> : eur(d.income, { decimals: 0 })}
              </td>
              <td className="py-2.5 num text-right text-ink-soft">{eur(d.expense, { decimals: 0 })}</td>
              <td className={cx('py-2.5 num text-right font-medium', !d.missingIncome && d.goal > 0 && (d.real >= d.goal ? 'text-goodink' : 'text-critical'))}>
                {d.goal > 0 && <span className="mr-1" aria-hidden>{d.real >= d.goal ? '✓' : '✕'}</span>}
                {eur(d.real, { sign: true, decimals: 0 })}
              </td>
              <td className="py-2.5 num text-right text-ink-mute">{d.goal > 0 ? eur(d.goal, { decimals: 0 }) : '—'}</td>
              <td className="py-2.5 num text-right">{eur(d.cumReal, { sign: true, decimals: 0 })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TT({ active, payload, cumulative }: any) {
  if (!active || !payload?.length) return null
  const d: Row = payload[0].payload
  return (
    <div className="rounded-lg bg-surface border border-line shadow-pop px-3 py-2.5 text-[12.5px]">
      <div className="font-semibold mb-1.5">{monthLabel(d.month, true)}</div>
      <div className="space-y-1 num">
        {cumulative ? (
          <>
            <Line2 color={S_REAL} label="Acumulado real" value={eur(d.cumReal, { sign: true, decimals: 0 })} />
            {d.cumGoal > 0 && <Line2 color={S_GOAL} label="Acumulado meta" value={eur(d.cumGoal, { decimals: 0 })} />}
          </>
        ) : (
          <>
            <Line2 color={d.goal > 0 ? (d.real >= d.goal ? GOOD : CRIT) : S_REAL} label="Ahorro del mes" value={eur(d.real, { sign: true, decimals: 0 })} />
            {d.goal > 0 && <Line2 color={S_GOAL} label="Meta" value={eur(d.goal, { decimals: 0 })} />}
            <div className="pt-1 mt-1 border-t border-line text-ink-mute" style={{ color: MUTED }}>
              Entró {eur(d.income, { decimals: 0 })} · salió {eur(d.expense, { decimals: 0 })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function TTReparto({ active, payload, pockets }: any) {
  if (!active || !payload?.length) return null
  const d: Row = payload[0].payload
  const total = pockets.reduce((a: number, p: any) => a + (d.net?.[p.id] ?? 0), 0)
  return (
    <div className="rounded-lg bg-surface border border-line shadow-pop px-3 py-2.5 text-[12.5px]">
      <div className="font-semibold mb-1.5">{monthLabel(d.month, true)}</div>
      <div className="space-y-1 num">
        {pockets.filter((p: any) => d.net?.[p.id] !== undefined).map((p: any) => (
          <Line2 key={p.id} color={p.color} label={p.label} value={eur(d.net[p.id], { sign: true, decimals: 0 })} />
        ))}
        <div className="flex items-center gap-2 pt-1 mt-1 border-t border-line font-medium">
          <span className="grow" style={{ color: MUTED }}>Ahorro del mes</span>
          <span>{eur(total, { sign: true, decimals: 0 })}</span>
        </div>
      </div>
    </div>
  )
}

function Line2({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2" style={{ color: INK }}>
      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} aria-hidden />
      <span className="grow" style={{ color: MUTED }}>{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
