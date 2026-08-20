import { useEffect, useMemo, useState } from 'react'
import { useStore } from './lib/store'
import { knownMonths, monthKey, monthLabel } from './lib/calc'
import { Modal, Toasts, cx } from './components/ui'
import Dashboard from './pages/Dashboard'
import Plan from './pages/Plan'
import Txns from './pages/Txns'
import Import from './pages/Import'
import Close from './pages/Close'
import Savings from './pages/Savings'
import Deudas from './pages/Deudas'
import SettingsPage from './pages/Settings'
import Onboarding from './pages/Onboarding'

export type Route = 'inicio' | 'gastos' | 'importar' | 'plan' | 'ahorros' | 'deudas' | 'cierre' | 'ajustes'

const TABS: Array<{ id: Route; label: string; icon: string }> = [
  { id: 'inicio', label: 'Inicio', icon: '◈' },
  { id: 'gastos', label: 'Gastos', icon: '≡' },
  { id: 'importar', label: 'Importar', icon: '↧' },
  { id: 'plan', label: 'Plan', icon: '◎' },
  { id: 'ahorros', label: 'Ahorros', icon: '↗' },
]

const EXTRA: Array<{ id: Route; label: string; icon: string }> = [
  { id: 'deudas', label: 'Nos deben', icon: '🤝' },
  { id: 'cierre', label: 'Cierre de mes', icon: '✓' },
  { id: 'ajustes', label: 'Ajustes', icon: '⚙' },
]

export default function App() {
  const ready = useStore((s) => s.ready)
  const init = useStore((s) => s.init)
  const settings = useStore((s) => s.settings)
  const txns = useStore((s) => s.txns)
  const plans = useStore((s) => s.plans)
  const month = useStore((s) => s.month)
  const setMonth = useStore((s) => s.setMonth)
  const [route, setRoute] = useState<Route>('inicio')
  const [masOpen, setMasOpen] = useState(false)

  useEffect(() => { init() }, [init])
  useEffect(() => { window.scrollTo(0, 0) }, [route])

  const months = useMemo(() => knownMonths(txns, plans, settings.startMonth), [txns, plans, settings.startMonth])

  if (!ready) {
    return (
      <div className="min-h-dvh grid place-items-center text-ink-mute text-[14px]">
        <div className="animate-pulse">Cargando…</div>
      </div>
    )
  }

  if (!settings.onboarded) return <Onboarding />

  const go = (r: Route) => setRoute(r)

  return (
    <div className="min-h-dvh flex flex-col sm:flex-row">
      {/* ── barra lateral (escritorio) ── */}
      <aside className="hidden sm:flex sm:w-56 lg:w-60 shrink-0 flex-col border-r border-line bg-surface no-print">
        <div className="px-5 pt-6 pb-5">
          <div className="text-[15px] font-semibold tracking-tight">Gastos en casa</div>
          <div className="text-[12px] text-ink-mute mt-0.5">
            {settings.members.map((m) => m.name).join(' y ')}
          </div>
        </div>
        <nav className="px-3 flex flex-col gap-0.5">
          {[...TABS, ...EXTRA].map((t) => (
            <button
              key={t.id}
              onClick={() => go(t.id)}
              className={cx(
                'flex items-center gap-3 h-10 px-3 rounded-lg text-[14px] transition-colors text-left',
                route === t.id ? 'bg-seq-100/70 text-seq-600 font-medium' : 'text-ink-soft hover:bg-line/40',
              )}
            >
              <span className="w-4 text-center text-[13px] opacity-70" aria-hidden>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto px-5 py-4 text-[11px] text-ink-mute leading-relaxed">
          {txns.length.toLocaleString('es-ES')} movimientos guardados
        </div>
      </aside>

      <div className="grow min-w-0 flex flex-col">
        {/* ── encabezado ── */}
        <header className="sticky top-0 z-30 bg-plane/85 backdrop-blur border-b border-line no-print">
          <div className="flex items-center gap-3 px-4 sm:px-6 h-14">
            <div className="sm:hidden text-[15px] font-semibold tracking-tight truncate">
              {EXTRA.some((t) => t.id === route)
                ? EXTRA.find((t) => t.id === route)!.label
                : 'Gastos en casa'}
            </div>
            <div className="hidden sm:block text-[15px] font-semibold tracking-tight">
              {[...TABS, ...EXTRA].find((t) => t.id === route)?.label}
            </div>
            <div className="grow" />
            <MonthPicker months={months} value={month} onChange={setMonth} startMonth={settings.startMonth} />
            <button
              className="sm:hidden btn-ghost btn-sm text-[17px] leading-none"
              onClick={() => setMasOpen(true)}
              aria-label="Más secciones"
            >⋯</button>
          </div>
        </header>

        {/* aviso si la nube dejó de andar: antes fallaba en silencio */}
        <CloudAlert go={go} />

        {/* ── contenido ── */}
        <main className="grow px-4 sm:px-6 py-5 pb-24 sm:pb-8 max-w-5xl w-full">
          {route === 'inicio' && <Dashboard go={go} />}
          {route === 'plan' && <Plan />}
          {route === 'gastos' && <Txns />}
          {route === 'importar' && <Import go={go} />}
          {route === 'cierre' && <Close go={go} />}
          {route === 'ahorros' && <Savings />}
          {route === 'deudas' && <Deudas />}
          {route === 'ajustes' && <SettingsPage />}
        </main>
      </div>

      {/* ── barra inferior (celular) ── */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-surface border-t border-line no-print pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => go(t.id)}
              className={cx(
                'flex flex-col items-center justify-center gap-1 h-16 text-[10.5px] transition-colors',
                route === t.id ? 'text-seq-600 font-medium' : 'text-ink-mute',
              )}
            >
              <span className="text-[15px] leading-none" aria-hidden>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {/* secciones que no entran en la barra de abajo */}
      <Modal open={masOpen} onClose={() => setMasOpen(false)} title="Más">
        <ul className="-my-1">
          {EXTRA.map((t) => (
            <li key={t.id}>
              <button
                className="w-full flex items-center gap-3 py-3.5 text-left border-b border-line/70 last:border-0"
                onClick={() => { go(t.id); setMasOpen(false) }}
              >
                <span className="text-[17px] w-6 text-center" aria-hidden>{t.icon}</span>
                <span className="text-[15px] grow">{t.label}</span>
                <span className="text-ink-mute" aria-hidden>→</span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>

      <Toasts />
    </div>
  )
}

/** Franja de aviso cuando la sincronización tiene problemas. */
function CloudAlert({ go }: { go: (r: Route) => void }) {
  const cloud = useStore((s) => s.cloud)
  if (cloud.status !== 'error') return null
  return (
    <button
      onClick={() => go('ajustes')}
      className="w-full text-left bg-[#fdecec] border-b border-critical/25 px-4 sm:px-6 py-2.5
                 flex items-center gap-3 hover:bg-[#fbe0e0] transition-colors no-print"
    >
      <span className="text-[15px] shrink-0" aria-hidden>⚠</span>
      <span className="text-[13px] grow leading-snug min-w-0">
        <strong className="font-semibold">La sincronización no está funcionando.</strong>{' '}
        Lo que cargues queda solo en este dispositivo hasta que se resuelva.
      </span>
      <span className="text-ink-mute shrink-0 text-[13px]">Ver →</span>
    </button>
  )
}

function MonthPicker({
  months, value, onChange, startMonth,
}: { months: string[]; value: string; onChange: (m: string) => void; startMonth: string }) {
  const list = useMemo(() => {
    const s = new Set(months)
    s.add(monthKey())
    // permitir planear el mes que viene
    const now = new Date()
    s.add(monthKey(new Date(now.getFullYear(), now.getMonth() + 1, 1)))
    return [...s].filter((m) => m >= startMonth).sort().reverse()
  }, [months, startMonth])

  return (
    <div className="relative">
      <select
        className="appearance-none h-9 pl-3 pr-8 rounded-lg border border-line-strong bg-surface text-[13.5px] font-medium
                   focus:outline-none focus:ring-2 focus:ring-seq-300 cursor-pointer"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Mes"
      >
        {list.map((m) => (
          <option key={m} value={m}>{monthLabel(m, true)}</option>
        ))}
      </select>
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-mute text-[10px] pointer-events-none" aria-hidden>▼</span>
    </div>
  )
}
