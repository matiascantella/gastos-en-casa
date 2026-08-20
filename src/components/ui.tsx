import React, { useEffect, useRef, useState } from 'react'
import { eur } from '../lib/calc'
import { useStore } from '../lib/store'

export const cx = (...p: (string | false | undefined | null)[]) => p.filter(Boolean).join(' ')

export function Card({ children, className = '', ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('card', className)} {...rest}>{children}</div>
}

export function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-[15px] font-semibold text-ink">{children}</h2>
      {hint && <p className="text-[13px] text-ink-mute mt-0.5">{hint}</p>}
    </div>
  )
}

/** Cifra grande. La unidad va en el label, no repetida en cada número. */
export function Hero({
  label, value, sub, tone = 'neutral',
}: { label: string; value: string; sub?: React.ReactNode; tone?: 'neutral' | 'good' | 'bad' }) {
  const color = tone === 'good' ? 'text-goodink' : tone === 'bad' ? 'text-critical' : 'text-ink'
  return (
    <div>
      <div className="text-[12px] font-medium uppercase tracking-wide text-ink-mute">{label}</div>
      <div className={cx('num mt-1 text-[34px] leading-none font-semibold tracking-tight', color)}>{value}</div>
      {sub && <div className="mt-2 text-[13px] text-ink-soft">{sub}</div>}
    </div>
  )
}

export function Stat({
  label, value, tone = 'neutral', sub,
}: { label: string; value: string; tone?: 'neutral' | 'good' | 'bad'; sub?: string }) {
  const color = tone === 'good' ? 'text-goodink' : tone === 'bad' ? 'text-critical' : 'text-ink'
  return (
    <div className="min-w-0">
      <div className="text-[12px] text-ink-mute truncate">{label}</div>
      <div className={cx('num text-[19px] font-semibold mt-0.5 tracking-tight', color)}>{value}</div>
      {sub && <div className="text-[12px] text-ink-mute mt-0.5 truncate">{sub}</div>}
    </div>
  )
}

/**
 * Barra plan vs real. El plan es la referencia gris de fondo; lo real se pinta
 * encima y cambia de color sólo cuando te pasás. El estado nunca va solo en el
 * color: siempre lo acompaña el número de la diferencia.
 */
export function BudgetBar({ planned, real, max }: { planned: number; real: number; max: number }) {
  const scale = (n: number) => (max > 0 ? Math.min(100, (n / max) * 100) : 0)
  const over = planned > 0 && real > planned
  const noPlan = planned === 0
  return (
    <div className="relative h-2 w-full rounded-full bg-line/60 overflow-hidden" aria-hidden>
      {planned > 0 && (
        <div className="absolute inset-y-0 left-0 bg-line-strong/70 rounded-full" style={{ width: `${scale(planned)}%` }} />
      )}
      <div
        className={cx('absolute inset-y-0 left-0 rounded-full', over ? 'bg-critical' : noPlan ? 'bg-ink-mute' : 'bg-seq-450')}
        style={{ width: `${scale(Math.max(0, real))}%`, boxShadow: '0 0 0 2px #fcfcfb' }}
      />
    </div>
  )
}

export function Progress({ pct, tone = 'neutral' }: { pct: number; tone?: 'neutral' | 'good' | 'bad' }) {
  const c = tone === 'good' ? 'bg-good' : tone === 'bad' ? 'bg-critical' : 'bg-seq-450'
  return (
    <div className="h-2 w-full rounded-full bg-line/60 overflow-hidden">
      <div className={cx('h-full rounded-full transition-all', c)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  )
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="text-center py-14 px-6">
      <div className="text-[38px] leading-none mb-3">{icon}</div>
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {children && <div className="text-[13.5px] text-ink-mute mt-2 max-w-md mx-auto leading-relaxed">{children}</div>}
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-[12px] text-ink-mute mt-1">{hint}</p>}
    </div>
  )
}

/** Input de euros: acepta coma o punto, muestra el símbolo. */
export function EuroInput({
  value, onChange, placeholder = '0', className = '',
}: { value: number; onChange: (n: number) => void; placeholder?: string; className?: string }) {
  const [text, setText] = useState(value ? String(value) : '')
  const focused = useRef(false)
  useEffect(() => { if (!focused.current) setText(value ? String(value) : '') }, [value])
  return (
    <div className={cx('relative', className)}>
      <input
        className="input num pr-7 text-right"
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        onFocus={() => (focused.current = true)}
        onBlur={() => { focused.current = false; setText(value ? String(value) : '') }}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.,-]/g, '')
          setText(t)
          const n = parseFloat(t.replace(',', '.'))
          onChange(Number.isFinite(n) ? n : 0)
        }}
      />
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-mute text-[14px] pointer-events-none">€</span>
    </div>
  )
}

export function Modal({
  open, onClose, title, children, wide, footer,
}: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean; footer?: React.ReactNode }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-ink/25 backdrop-blur-[1px]" onClick={onClose} />
      <div
        className={cx(
          'relative bg-surface w-full rounded-t-2xl sm:rounded-xl2 shadow-pop border border-line max-h-[92vh] flex flex-col',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-md',
        )}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line shrink-0">
          <h3 className="text-[15px] font-semibold">{title}</h3>
          <button className="btn-ghost btn-sm -mr-1.5" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="px-5 py-4 overflow-y-auto grow">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-line flex justify-end gap-2 shrink-0">{footer}</div>}
      </div>
    </div>
  )
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 w-[min(92vw,460px)] no-print">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            'flex items-center gap-3 rounded-xl2 px-4 py-3 shadow-pop text-[13.5px] border',
            t.tone === 'warn' ? 'bg-[#fff8ec] border-warning/40 text-ink' : 'bg-ink text-white border-ink',
          )}
        >
          <span className="grow leading-snug">{t.text}</span>
          {t.undo && (
            <button
              className={cx('shrink-0 font-semibold underline underline-offset-2', t.tone === 'warn' ? 'text-ink' : 'text-seq-200')}
              onClick={() => { t.undo!(); dismiss(t.id) }}
            >
              Deshacer
            </button>
          )}
          <button className="shrink-0 opacity-60 hover:opacity-100" onClick={() => dismiss(t.id)} aria-label="Cerrar">✕</button>
        </div>
      ))}
    </div>
  )
}

/** Diferencia con signo y color de estado; el icono evita que el color vaya solo. */
export function Delta({ value, invert = false, decimals = 0 }: { value: number; invert?: boolean; decimals?: 0 | 2 }) {
  if (Math.abs(value) < 0.005) return <span className="text-ink-mute num text-[13px]">en el plan</span>
  const bad = invert ? value < 0 : value > 0
  return (
    <span className={cx('num text-[13px] font-medium inline-flex items-center gap-1', bad ? 'text-critical' : 'text-goodink')}>
      <span aria-hidden>{value > 0 ? '▲' : '▼'}</span>
      {eur(Math.abs(value), { decimals })}
    </span>
  )
}
