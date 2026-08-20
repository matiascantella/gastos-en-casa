import { useState } from 'react'
import { useStore } from '../lib/store'
import { Card, Field, cx } from '../components/ui'
import type { Account, Bank } from '../types'
import { SHARED } from '../types'

const BANKS: Array<{ id: Bank; label: string }> = [
  { id: 'lhv', label: 'LHV' },
  { id: 'swedbank', label: 'Swedbank' },
  { id: 'wise', label: 'Wise' },
  { id: 'revolut', label: 'Revolut' },
]

export default function Onboarding() {
  const updateSettings = useStore((s) => s.updateSettings)
  const [step, setStep] = useState(0)
  const [n1, setN1] = useState('')
  const [n2, setN2] = useState('')
  const [a1, setA1] = useState('')
  const [a2, setA2] = useState('')
  const [picked, setPicked] = useState<Set<string>>(
    new Set(['m1:lhv', 'm1:wise', 'm2:lhv', 'm2:wise', 'shared:revolut']),
  )
  const [busy, setBusy] = useState(false)
  const [startMonth, setStartMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const toggle = (k: string) =>
    setPicked((s) => {
      const n = new Set(s)
      n.has(k) ? n.delete(k) : n.add(k)
      return n
    })

  const finish = async () => {
    setBusy(true)
    const members = [
      { id: 'm1', name: n1.trim() || 'Persona 1', aliases: a1.trim() ? [a1.trim()] : [], color: '#2a78d6' },
      { id: 'm2', name: n2.trim() || 'Persona 2', aliases: a2.trim() ? [a2.trim()] : [], color: '#eb6834' },
    ]
    const nameOf = (o: string) => (o === SHARED ? 'compartida' : members.find((m) => m.id === o)!.name)
    const accounts: Account[] = [...picked].map((k) => {
      const [ownerId, bank] = k.split(':') as [string, Bank]
      const who = nameOf(ownerId)
      return {
        id: `${ownerId}-${bank}`,
        bank,
        label: `${BANKS.find((b) => b.id === bank)!.label} ${who}`,
        ownerId,
        fileTokens: [who.toLowerCase()],
      }
    })
    await updateSettings({ members, accounts, startMonth, onboarded: true })
  }

  return (
    <div className="min-h-dvh grid place-items-center px-4 py-10 bg-plane">
      <div className="w-full max-w-lg">
        <div className="text-center mb-7">
          <div className="text-[32px] leading-none mb-3">🏡</div>
          <h1 className="text-[22px] font-semibold tracking-tight">Gastos en casa</h1>
          <p className="text-[14px] text-ink-mute mt-1.5">Dos minutos de configuración y listo.</p>
        </div>

        <Card className="p-6">
          {step === 0 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-[15px] font-semibold">¿Quiénes son?</h2>
                <p className="text-[13px] text-ink-mute mt-1">
                  Cada gasto va a quedar identificado con uno de estos nombres.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Nombre">
                  <input className="input" value={n1} onChange={(e) => setN1(e.target.value)} placeholder="Tu nombre" autoFocus />
                </Field>
                <Field label="Nombre">
                  <input className="input" value={n2} onChange={(e) => setN2(e.target.value)} placeholder="El de tu pareja" />
                </Field>
              </div>

              <div className="rounded-lg bg-seq-100/40 border border-seq-200/60 p-4 space-y-4">
                <p className="text-[13px] text-ink-soft leading-relaxed">
                  <strong className="font-semibold">Nombre completo como figura en los extractos.</strong>{' '}
                  Con esto la app reconoce la plata que se mueve entre ustedes y no la cuenta como gasto.
                </p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label={`Nombre completo de ${n1.trim() || 'la persona 1'}`}>
                    <input className="input" value={a1} onChange={(e) => setA1(e.target.value)} placeholder="NOMBRE APELLIDO COMO FIGURA EN EL BANCO" />
                  </Field>
                  <Field label={`Nombre completo de ${n2.trim() || 'la persona 2'}`}>
                    <input className="input" value={a2} onChange={(e) => setA2(e.target.value)} placeholder="NOMBRE APELLIDO COMO FIGURA EN EL BANCO" />
                  </Field>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button className="btn-primary" onClick={() => setStep(1)} disabled={!n1.trim() || !n2.trim()}>
                  Seguir
                </button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-[15px] font-semibold">¿Qué cuentas tienen?</h2>
                <p className="text-[13px] text-ink-mute mt-1">
                  Marcá las que existen. Después podés agregar los IBAN en Ajustes para que la app
                  reconozca sola de quién es cada archivo.
                </p>
              </div>

              <div className="space-y-4">
                {[
                  { id: 'm1', label: n1.trim() || 'Persona 1' },
                  { id: 'm2', label: n2.trim() || 'Persona 2' },
                  { id: SHARED, label: 'Compartida' },
                ].map((o) => (
                  <div key={o.id}>
                    <div className="text-[12px] font-medium text-ink-soft mb-2">{o.label}</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {BANKS.map((b) => {
                        const k = `${o.id}:${b.id}`
                        const on = picked.has(k)
                        return (
                          <button
                            key={k}
                            onClick={() => toggle(k)}
                            className={cx(
                              'h-11 rounded-lg border text-[13.5px] font-medium transition-colors',
                              on
                                ? 'border-seq-450 bg-seq-100/60 text-seq-600'
                                : 'border-line-strong text-ink-mute hover:bg-line/30',
                            )}
                          >
                            {on ? '✓ ' : ''}{b.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg bg-seq-100/40 border border-seq-200/60 p-4">
                <label className="label">¿Desde qué mes querés medir?</label>
                <div className="flex items-center gap-3 flex-wrap">
                  <input
                    type="month"
                    className="input w-auto"
                    value={startMonth}
                    onChange={(e) => e.target.value && setStartMonth(e.target.value)}
                  />
                </div>
                <p className="text-[12.5px] text-ink-soft mt-2 leading-relaxed">
                  Si subís extractos con meses anteriores, se guardan para que puedas clasificar
                  los comercios de una vez, pero no cuentan en ningún número. Se cambia después
                  desde Ajustes.
                </p>
              </div>

              <div className="flex justify-between pt-1">
                <button className="btn-ghost" onClick={() => setStep(0)}>Atrás</button>
                <button className="btn-primary" onClick={finish} disabled={busy || picked.size === 0}>
                  {busy ? 'Creando…' : 'Empezar'}
                </button>
              </div>
            </div>
          )}
        </Card>

        <p className="text-center text-[12px] text-ink-mute mt-5 leading-relaxed">
          Los datos se guardan en este dispositivo. Podés activar la sincronización
          con tu pareja más adelante desde Ajustes.
        </p>
      </div>
    </div>
  )
}
