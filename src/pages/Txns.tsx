import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { catById, catsGasto, eur, monthLabel } from '../lib/calc'
import { looksLikePerson, ownerLabel } from '../lib/classify'
import { Card, Empty, EuroInput, Field, Modal, cx } from '../components/ui'
import type { Txn } from '../types'
import { INCOME_CAT, INTERNAL_CAT, SHARED, UNCLASSIFIED } from '../types'

type Tab = 'todos' | 'pendientes' | 'historico'

export default function Txns() {
  const settings = useStore((s) => s.settings)
  const txns = useStore((s) => s.txns)
  const month = useStore((s) => s.month)
  const setCategoryBulk = useStore((s) => s.setCategoryBulk)
  const deleteTxns = useStore((s) => s.deleteTxns)
  const updateTxn = useStore((s) => s.updateTxn)

  const [tab, setTab] = useState<Tab>('todos')
  const [q, setQ] = useState('')
  const [owner, setOwner] = useState('')
  const [cuenta, setCuenta] = useState('')
  const [cat, setCat] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [addOpen, setAddOpen] = useState(false)
  const [prestamoDe, setPrestamoDe] = useState<Txn | null>(null)

  const start = settings.startMonth
  const monthTxns = useMemo(() => txns.filter((t) => t.month === month), [txns, month])
  const pending = useMemo(
    () => monthTxns.filter((t) => t.kind === 'expense' && t.categoryId === UNCLASSIFIED && !t.excluded),
    [monthTxns],
  )
  // Movimientos anteriores al mes de inicio: no cuentan para nada, pero sirven
  // para clasificar de una vez y que las reglas queden aprendidas.
  const historic = useMemo(() => txns.filter((t) => t.month < start), [txns, start])
  const historicPending = useMemo(
    () => historic.filter((t) => t.kind === 'expense' && t.categoryId === UNCLASSIFIED && !t.excluded),
    [historic],
  )

  const rows = useMemo(() => {
    const base = tab === 'pendientes' ? pending : tab === 'historico' ? historic : monthTxns
    const nq = q.trim().toLowerCase()
    return base
      .filter((t) => (!owner || t.ownerId === owner) && (!cat || t.categoryId === cat) && (!cuenta || t.accountId === cuenta))
      .filter((t) => !nq || t.description.toLowerCase().includes(nq) || t.rawDescription.toLowerCase().includes(nq))
      .sort((a, b) => b.date.localeCompare(a.date) || Math.abs(b.amount) - Math.abs(a.amount))
  }, [tab, monthTxns, pending, historic, q, owner, cuenta, cat])

  const toggle = (id: string) =>
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const expenseCats = catsGasto(settings, true)

  return (
    <div className="space-y-4">
      {/* filtros */}
      <div className="flex flex-wrap items-center gap-2 no-print">
        <div className="flex rounded-lg border border-line-strong overflow-hidden">
          {(['todos', 'pendientes', ...(historic.length ? (['historico'] as Tab[]) : [])] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setSel(new Set()) }}
              className={cx(
                'h-9 px-3 text-[13.5px] font-medium transition-colors',
                tab === t ? 'bg-seq-450 text-white' : 'bg-surface text-ink-soft hover:bg-line/40',
              )}
            >
              {t === 'todos'
                ? 'Todos'
                : t === 'pendientes'
                  ? `Sin clasificar${pending.length ? ` (${pending.length})` : ''}`
                  : `Histórico${historicPending.length ? ` (${historicPending.length})` : ''}`}
            </button>
          ))}
        </div>

        <input
          className="input h-9 w-auto grow min-w-[140px] max-w-xs"
          placeholder="Buscar comercio…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-[13.5px]" value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">Todos</option>
          {settings.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          <option value={SHARED}>Compartida</option>
        </select>
        <select
          className="h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-[13.5px] max-w-[150px]"
          value={cuenta}
          onChange={(e) => setCuenta(e.target.value)}
          aria-label="Cuenta"
        >
          <option value="">Toda cuenta</option>
          {settings.accounts.filter((a) => !a.archived).map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
          <option value="manual">Cargado a mano</option>
        </select>
        <select className="h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-[13.5px] max-w-[150px]" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Toda categoría</option>
          {settings.categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
        </select>
        <button className="btn-outline btn-sm h-9" onClick={() => setAddOpen(true)}>+ A mano</button>
      </div>

      {/* barra de selección */}
      {sel.size > 0 && (
        <div className="sticky top-14 z-20 flex flex-wrap items-center gap-2 rounded-xl2 bg-ink text-white px-4 py-2.5 shadow-pop no-print">
          <span className="text-[13.5px] font-medium">{sel.size} seleccionados</span>
          <div className="grow" />
          <select
            className="h-8 rounded-md bg-white/10 border border-white/20 px-2 text-[13px] text-white"
            defaultValue=""
            onChange={async (e) => {
              if (!e.target.value) return
              await setCategoryBulk([...sel], e.target.value)
              setSel(new Set())
              e.target.value = ''
            }}
          >
            <option value="" className="text-ink">Clasificar como…</option>
            {expenseCats.map((c) => <option key={c.id} value={c.id} className="text-ink">{c.emoji} {c.name}</option>)}
          </select>
          <button className="btn-sm text-white/80 hover:text-white" onClick={() => { deleteTxns([...sel]); setSel(new Set()) }}>Borrar</button>
          <button className="btn-sm text-white/60 hover:text-white" onClick={() => setSel(new Set())}>✕</button>
        </div>
      )}

      {rows.length === 0 ? (
        <Card className="p-1">
          {tab === 'pendientes' ? (
            <Empty icon="✓" title="No queda nada sin clasificar">
              Todos los gastos de {monthLabel(month, true)} tienen categoría.
            </Empty>
          ) : tab === 'historico' ? (
            <Empty icon="🗄" title="Sin movimientos anteriores">
              No hay nada guardado de antes de {monthLabel(start, true)}.
            </Empty>
          ) : (
            <Empty icon="🗂" title={monthTxns.length ? 'Ningún movimiento coincide' : `Sin movimientos en ${monthLabel(month, true)}`}>
              {monthTxns.length ? 'Probá quitando algún filtro.' : 'Importá los CSV del mes para empezar.'}
            </Empty>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {tab === 'pendientes' && (
            <div className="px-4 py-3 bg-seq-100/40 border-b border-line text-[13px] text-ink-soft leading-relaxed">
              Clasificá cada uno una sola vez: la app crea la regla sola y el mes que viene
              ese comercio ya viene clasificado.
            </div>
          )}
          {tab === 'historico' && (
            <div className="px-4 py-3 bg-line/30 border-b border-line text-[13px] text-ink-soft leading-relaxed">
              Movimientos anteriores a {monthLabel(start, true)}.{' '}
              <strong className="font-semibold">No cuentan en ningún número</strong> — ni en el
              tablero, ni en el cierre, ni en los ahorros. Están acá solo para que clasifiques
              los comercios de una vez y las reglas queden aprendidas para adelante.
            </div>
          )}
          <ul className="divide-y divide-line/70">
            {rows.map((t) => (
              <Row
                key={t.id}
                t={t}
                selected={sel.has(t.id)}
                onToggle={() => toggle(t.id)}
                onCategory={(c) => setCategoryBulk([t.id], c)}
                onExclude={() => updateTxn(t.id, { excluded: !t.excluded })}
                onPrestamo={() => setPrestamoDe(t)}
              />
            ))}
          </ul>
        </Card>
      )}

      <AddManual open={addOpen} onClose={() => setAddOpen(false)} />
      <PrestamoModal txn={prestamoDe} onClose={() => setPrestamoDe(null)} />
    </div>
  )
}

function Row({
  t, selected, onToggle, onCategory, onExclude, onPrestamo,
}: {
  t: Txn; selected: boolean; onToggle: () => void; onCategory: (c: string) => void
  onExclude: () => void; onPrestamo: () => void
}) {
  const settings = useStore((s) => s.settings)
  const cat = catById(settings, t.categoryId)
  const acc = settings.accounts.find((a) => a.id === t.accountId)
  const [open, setOpen] = useState(false)
  const isRefund = t.kind === 'expense' && t.amount > 0
  const unclassified = t.categoryId === UNCLASSIFIED
  const personHint = unclassified && looksLikePerson(t.description)

  return (
    <li className={cx('px-3 sm:px-4 py-2.5 transition-colors', selected ? 'bg-seq-100/50' : 'hover:bg-line/25', t.excluded && 'opacity-45')}>
      <div className="flex items-center gap-3">
        <input type="checkbox" checked={selected} onChange={onToggle} className="accent-seq-450 shrink-0" aria-label="Seleccionar" />

        <div className="min-w-0 grow cursor-pointer" onClick={() => setOpen((o) => !o)}>
          <div className="flex items-center gap-2">
            <span className="text-[14px] truncate">{t.description}</span>
            {isRefund && <span className="chip bg-good/15 text-goodink">devolución</span>}
            {t.kind === 'internal' && <span className="chip">interno</span>}
            {t.kind === 'income' && <span className="chip bg-good/15 text-goodink">ingreso</span>}
            {t.source === 'manual' && !t.opening && <span className="chip bg-seq-100 text-seq-600">a mano</span>}
            {t.opening && <span className="chip bg-seq-100 text-seq-600">ajuste de saldo</span>}
            {t.loan && !t.loan.settledAt && (
              <span className="chip bg-warning/20 text-[#96620f]">nos lo debe {t.loan.person}</span>
            )}
            {t.loan?.settledAt && <span className="chip bg-good/15 text-goodink">devuelto</span>}
            {t.origCurrency && <span className="chip">{t.origAmount?.toFixed(2)} {t.origCurrency}</span>}
          </div>
          <div className="text-[12px] text-ink-mute mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span className="num">{t.date.slice(8)}/{t.date.slice(5, 7)}</span>
            <span aria-hidden>·</span>
            <span>{acc?.label ?? (t.source === 'manual' ? 'Cargado a mano' : 'Cuenta desconocida')}</span>
            <span aria-hidden>·</span>
            <span style={{ color: settings.members.find((m) => m.id === t.ownerId)?.color }} className="font-medium">
              {ownerLabel(t.ownerId, settings.members)}
            </span>
          </div>
        </div>

        {t.kind === 'expense' && (
          <div className="shrink-0 hidden sm:block">
            <select
              className={cx(
                'h-8 rounded-md border px-2 text-[13px] max-w-[170px] cursor-pointer focus:outline-none focus:ring-2 focus:ring-seq-300',
                unclassified ? 'border-warning bg-[#fff8ec] text-ink font-medium' : 'border-line-strong bg-surface text-ink-soft',
              )}
              value={t.categoryId}
              onChange={(e) => onCategory(e.target.value)}
            >
              {catsGasto(settings).map((c) => (
                <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className={cx('num text-[14px] font-medium text-right shrink-0 w-[86px]', t.amount > 0 ? 'text-goodink' : 'text-ink')}>
          {eur(t.amount, { sign: true })}
        </div>
      </div>

      {/* selector de categoría en celular */}
      {t.kind === 'expense' && (
        <div className="sm:hidden mt-2 flex items-center gap-2">
          <select
            className={cx(
              'h-8 rounded-md border px-2 text-[13px] grow focus:outline-none focus:ring-2 focus:ring-seq-300',
              unclassified ? 'border-warning bg-[#fff8ec] font-medium' : 'border-line-strong bg-surface text-ink-soft',
            )}
            value={t.categoryId}
            onChange={(e) => onCategory(e.target.value)}
          >
            {catsGasto(settings).map((c) => (
              <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
            ))}
          </select>
        </div>
      )}

      {personHint && (
        <div className="mt-2 text-[12px] text-ink-mute flex items-center gap-2 flex-wrap pl-7">
          <span>Parece una transferencia a una persona.</span>
          <button className="text-seq-600 font-medium underline underline-offset-2" onClick={() => onCategory('familia')}>
            Clasificar como Familia y envíos
          </button>
        </div>
      )}

      {open && (
        <div className="mt-2 ml-7 rounded-lg bg-line/25 p-3 text-[12.5px] text-ink-soft space-y-1.5">
          <div><span className="text-ink-mute">Texto del extracto:</span> {t.rawDescription}</div>
          {t.origCurrency && (
            <div>
              <span className="text-ink-mute">Original:</span> {t.origAmount?.toFixed(2)} {t.origCurrency}
              {t.fxRate && <> · cambio {t.fxRate.toFixed(4)}</>}
            </div>
          )}
          {t.status && <div><span className="text-ink-mute">Estado:</span> {t.status}</div>}
          <div><span className="text-ink-mute">Categoría:</span> {cat.name} {t.pinned ? '(fijada a mano)' : '(automática)'}</div>
          {t.note && <div><span className="text-ink-mute">Nota:</span> {t.note}</div>}
          {t.source === 'manual' && (
            <div className="text-ink-mute">Cargado a mano, no vino de ningún extracto.</div>
          )}
          {t.loan && (
            <div>
              <span className="text-ink-mute">Préstamo:</span> {t.loan.person}
              {t.loan.settledAt && ` · devuelto el ${new Date(t.loan.settledAt).toLocaleDateString('es-ES')}`}
            </div>
          )}
          <div className="flex flex-wrap gap-1 mt-1">
            <button className="btn-ghost btn-sm -ml-2.5" onClick={onExclude}>
              {t.excluded ? 'Volver a incluir' : 'Excluir de los cálculos'}
            </button>
            {t.amount < 0 && (
              <button className="btn-ghost btn-sm" onClick={onPrestamo}>
                {t.loan ? 'Editar préstamo' : 'Nos lo deben'}
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

function PrestamoModal({ txn, onClose }: { txn: Txn | null; onClose: () => void }) {
  const marcar = useStore((s) => s.marcarPrestamo)
  const saldar = useStore((s) => s.saldarPrestamo)
  const quitar = useStore((s) => s.quitarPrestamo)
  const [person, setPerson] = useState('')
  const [nota, setNota] = useState('')
  const [key, setKey] = useState<string | undefined>(undefined)
  if (key !== txn?.id) {
    setKey(txn?.id)
    setPerson(txn?.loan?.person ?? '')
    setNota(txn?.loan?.settledNote ?? '')
  }
  if (!txn) return null
  const yaEs = !!txn.loan
  const saldado = !!txn.loan?.settledAt

  return (
    <Modal
      open={!!txn}
      onClose={onClose}
      title={yaEs ? 'Préstamo' : 'Marcar como préstamo'}
      footer={<>
        {yaEs && <button className="btn-danger mr-auto" onClick={async () => { await quitar(txn.id); onClose() }}>Quitar</button>}
        <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button
          className="btn-primary"
          onClick={async () => { await marcar(txn.id, person, nota); onClose() }}
          disabled={!person.trim()}
        >Guardar</button>
      </>}
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-line/25 px-4 py-3 text-[13px]">
          <div className="font-medium">{txn.description}</div>
          <div className="text-ink-mute num mt-0.5">{txn.date} · {eur(txn.amount, { sign: true })}</div>
        </div>

        <p className="text-[13px] text-ink-mute leading-relaxed">
          Para plata que sale pero vuelve: un préstamo, o algo que pagaste por otra
          persona. Sigue contando como gasto del mes —la plata salió de la cuenta— pero
          además queda anotado en <strong>Nos deben</strong> hasta que se salde.
        </p>

        <Field label="¿Quién lo debe?">
          <input className="input" value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Franco" autoFocus />
        </Field>
        <Field label="Nota (opcional)">
          <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Le presté para el pasaje" />
        </Field>

        {yaEs && !saldado && (
          <button
            className="btn-outline w-full"
            onClick={async () => { await saldar(txn.id, nota); onClose() }}
          >
            Marcar como devuelto
          </button>
        )}
        {saldado && (
          <div className="rounded-lg bg-good/10 px-4 py-3 text-[13px]">
            Devuelto el {new Date(txn.loan!.settledAt!).toLocaleDateString('es-ES')}.
          </div>
        )}
      </div>
    </Modal>
  )
}

function AddManual({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useStore((s) => s.settings)
  const month = useStore((s) => s.month)
  const addManualTxn = useStore((s) => s.addManualTxn)
  const [tipo, setTipo] = useState<'expense' | 'income' | 'opening'>('expense')
  const [date, setDate] = useState(`${month}-01`)
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState(0)
  const [ownerId, setOwnerId] = useState(settings.members[0]?.id ?? SHARED)
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('otros')
  const [nota, setNota] = useState('')

  // al cambiar de mes en la app, el diálogo propone una fecha de ese mes
  const [mKey, setMKey] = useState(month)
  if (mKey !== month) { setMKey(month); setDate(`${month}-01`) }

  const esIngreso = tipo === 'income'
  const esAjuste = tipo === 'opening'
  const cuentas = settings.accounts.filter((a) => !a.archived)
  const cuenta = cuentas.find((a) => a.id === accountId)
  // si elegís una cuenta, el dueño sale de ahí: es la misma regla que usan
  // los CSV, así no puede quedar un movimiento atribuido a dos personas distintas
  const dueñoFinal = cuenta ? cuenta.ownerId : ownerId

  const save = async () => {
    if (!desc.trim() || !amount) return
    await addManualTxn({
      date,
      description: desc.trim(),
      rawDescription: nota.trim() ? `${desc.trim()} · ${nota.trim()}` : desc.trim(),
      amount: tipo === 'expense' ? -Math.abs(amount) : Math.abs(amount) * (amount < 0 ? -1 : 1),
      accountId: accountId || 'manual',
      ownerId: dueñoFinal,
      categoryId: esAjuste ? INTERNAL_CAT : esIngreso ? INCOME_CAT : categoryId,
      // el ajuste se guarda como movimiento interno: mueve el saldo del bolsillo
      // pero no aparece ni en ingresos ni en gastos
      kind: esAjuste ? 'internal' : tipo,
      opening: esAjuste || undefined,
      pinned: true,
      note: nota.trim() || undefined,
    })
    setDesc(''); setAmount(0); setNota(''); setAccountId('')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={esIngreso ? 'Agregar un ingreso a mano' : 'Agregar un gasto a mano'}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={save} disabled={!desc.trim() || !amount}>Guardar</button>
      </>}
    >
      <div className="space-y-4">
        <div className="flex rounded-lg border border-line-strong overflow-hidden">
          {([['expense', 'Gasto'], ['income', 'Ingreso'], ['opening', 'Ajuste de saldo']] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setTipo(v)}
              className={cx(
                'h-10 grow text-[13.5px] font-medium transition-colors',
                tipo === v ? 'bg-seq-450 text-white' : 'bg-surface text-ink-soft hover:bg-line/40',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <p className="text-[13px] text-ink-mute leading-relaxed">
          {esAjuste
            ? 'Para dejar una cuenta en el saldo real el día que empiezan a usar la app. Cuenta para el saldo del bolsillo, pero no figura como ingreso ni como gasto: esa plata ya estaba, no entró este mes. Poné el importe en negativo si el ajuste es para abajo.'
            : esIngreso
              ? 'Para plata que entró y no figura en los extractos del mes: un sueldo que cayó unos días antes, un cobro en efectivo, una venta.'
              : 'Para lo que pagaste en efectivo y no aparece en ningún extracto.'}
        </p>

        <Field label="Descripción">
          <input
            className="input"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder={esAjuste ? 'Saldo inicial' : esIngreso ? 'Sueldo' : 'Feria del barrio'}
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Fecha"
            hint={esIngreso ? 'Poné una fecha del mes al que querés que cuente.' : undefined}
          >
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Importe">
            <EuroInput value={amount} onChange={setAmount} />
          </Field>
        </div>

        <Field
          label={esAjuste ? '¿Qué cuenta querés ajustar?' : esIngreso ? '¿A qué cuenta entró?' : '¿De qué cuenta salió?'}
          hint={
            cuenta
              ? `Queda a nombre de ${ownerLabel(cuenta.ownerId, settings.members)}, igual que el resto de los movimientos de esa cuenta.`
              : 'Dejalo en efectivo si no pasó por ninguna cuenta.'
          }
        >
          <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Efectivo / ninguna cuenta</option>
            {cuentas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} · {ownerLabel(a.ownerId, settings.members)}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          {!cuenta && (
            <Field label="De quién">
              <select className="input" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                {settings.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                <option value={SHARED}>Compartida</option>
              </select>
            </Field>
          )}
          {!esIngreso && !esAjuste && (
            <Field label="Categoría">
              <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {catsGasto(settings, true).map((c) => (
                  <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
                ))}
              </select>
            </Field>
          )}
        </div>

        <Field label="Nota (opcional)" hint="Queda guardada con el movimiento, para acordarte de por qué lo cargaste.">
          <input
            className="input"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder={esIngreso ? 'Cobrado el 31/07 por excepción' : ''}
          />
        </Field>

        <div className="rounded-lg bg-seq-100/40 border border-seq-200/60 px-4 py-3 text-[12.5px] text-ink-soft leading-relaxed">
          Los movimientos cargados a mano quedan marcados con una etiqueta{' '}
          <span className="chip bg-seq-100 text-seq-600">a mano</span> en la lista, para
          distinguirlos de los que vienen del banco.
        </div>
      </div>
    </Modal>
  )
}
