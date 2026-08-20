import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { deudas, deudasSaldadas, eur } from '../lib/calc'
import { Card, Empty, Hero, Modal, SectionTitle } from '../components/ui'
import type { Txn } from '../types'

export default function Deudas() {
  const txns = useStore((s) => s.txns)
  const settings = useStore((s) => s.settings)
  const saldar = useStore((s) => s.saldarPrestamo)
  const quitar = useStore((s) => s.quitarPrestamo)
  const [verSaldadas, setVerSaldadas] = useState(false)
  const [confirmar, setConfirmar] = useState<{ persona: string; movs: Txn[] } | null>(null)

  const { grupos, total, count } = useMemo(() => deudas(txns), [txns])
  const saldadas = useMemo(() => deudasSaldadas(txns), [txns])
  const cuentaDe = (t: Txn) => settings.accounts.find((a) => a.id === t.accountId)?.label ?? 'Cargado a mano'

  if (count === 0 && saldadas.length === 0) {
    return (
      <Card className="p-1">
        <Empty icon="🤝" title="No hay plata prestada">
          Cuando pagues algo por alguien o le prestes plata a un familiar, abrí ese
          movimiento en <strong>Gastos</strong> y tocá <strong>"Nos lo deben"</strong>.
          Va a aparecer acá hasta que te lo devuelvan.
        </Empty>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <Card className="p-5 sm:p-6">
        <div className="grid sm:grid-cols-[1.2fr,1fr] gap-6">
          <Hero
            label="Nos deben"
            value={eur(total, { decimals: 0 })}
            tone={total > 0 ? 'neutral' : 'good'}
            sub={
              count > 0
                ? `${count} ${count === 1 ? 'movimiento' : 'movimientos'} · ${grupos.length} ${grupos.length === 1 ? 'persona' : 'personas'}`
                : 'No queda nada pendiente'
            }
          />
          <div className="sm:border-l sm:border-line sm:pl-6">
            <div className="text-[12px] text-ink-mute">Ya devuelto</div>
            <div className="num text-[19px] font-semibold mt-0.5 text-goodink">
              {eur(saldadas.reduce((a, t) => a + Math.abs(t.amount), 0), { decimals: 0 })}
            </div>
            <div className="text-[12px] text-ink-mute mt-0.5">
              {saldadas.length} {saldadas.length === 1 ? 'movimiento' : 'movimientos'}
            </div>
          </div>
        </div>
      </Card>

      {grupos.map((g) => (
        <Card key={g.persona} className="p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-[15px] font-semibold">{g.persona}</h2>
              <p className="num text-[19px] font-semibold mt-1">{eur(g.total, { decimals: 2 })}</p>
            </div>
            <button
              className="btn-outline btn-sm"
              onClick={() => setConfirmar({ persona: g.persona, movs: g.movs })}
            >
              Marcar todo como devuelto
            </button>
          </div>

          <ul className="divide-y divide-line/70 mt-3 -mx-1">
            {g.movs
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5 px-1">
                  <div className="min-w-0 grow">
                    <div className="text-[14px] truncate">{t.description}</div>
                    <div className="text-[12px] text-ink-mute mt-0.5">
                      <span className="num">{t.date}</span> · {cuentaDe(t)}
                      {t.loan?.settledNote && <> · {t.loan.settledNote}</>}
                    </div>
                  </div>
                  <span className="num text-[14px] font-medium whitespace-nowrap">
                    {eur(Math.abs(t.amount))}
                  </span>
                  <button
                    className="btn-ghost btn-sm shrink-0 whitespace-nowrap"
                    onClick={() => saldar(t.id)}
                  >
                    Devuelto
                  </button>
                </li>
              ))}
          </ul>
        </Card>
      ))}

      {saldadas.length > 0 && (
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <SectionTitle hint="Quedan guardados por si necesitás revisar algo más adelante.">
              Ya devueltos
            </SectionTitle>
            <button className="btn-ghost btn-sm" onClick={() => setVerSaldadas((v) => !v)}>
              {verSaldadas ? 'Ocultar' : `Ver ${saldadas.length}`}
            </button>
          </div>
          {verSaldadas && (
            <ul className="divide-y divide-line/70 -mx-1">
              {saldadas.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5 px-1 opacity-70">
                  <span className="text-goodink shrink-0" aria-hidden>✓</span>
                  <div className="min-w-0 grow">
                    <div className="text-[14px] truncate">{t.description}</div>
                    <div className="text-[12px] text-ink-mute mt-0.5">
                      {t.loan!.person} · devuelto el{' '}
                      {new Date(t.loan!.settledAt!).toLocaleDateString('es-ES')}
                    </div>
                  </div>
                  <span className="num text-[14px] whitespace-nowrap">{eur(Math.abs(t.amount))}</span>
                  <button className="btn-ghost btn-sm shrink-0" onClick={() => quitar(t.id)}>Quitar</button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <p className="text-[12.5px] text-ink-mute leading-relaxed px-1">
        Estos movimientos <strong>siguen contando como gasto</strong> del mes en que salieron,
        porque la plata efectivamente salió de la cuenta. Cuando te la devuelvan por
        transferencia, va a aparecer como ingreso al importar el extracto. Marcar algo como
        devuelto acá es solo para dejar de seguirlo.
      </p>

      <Modal
        open={!!confirmar}
        onClose={() => setConfirmar(null)}
        title="Marcar como devuelto"
        footer={<>
          <button className="btn-ghost" onClick={() => setConfirmar(null)}>Cancelar</button>
          <button
            className="btn-primary"
            onClick={async () => {
              for (const t of confirmar!.movs) await saldar(t.id)
              setConfirmar(null)
            }}
          >
            Sí, devolvió todo
          </button>
        </>}
      >
        {confirmar && (
          <p className="text-[13.5px] leading-relaxed">
            Se marcan como devueltos los <strong>{confirmar.movs.length}</strong> movimientos de{' '}
            <strong>{confirmar.persona}</strong>, por un total de{' '}
            <strong className="num">
              {eur(confirmar.movs.reduce((a, t) => a + Math.abs(t.amount), 0))}
            </strong>.
          </p>
        )}
      </Modal>
    </div>
  )
}
