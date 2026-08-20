import { useMemo, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { BANK_LABEL, parseStatement, type ParseResult } from '../lib/parsers'
import { buildTxn, GUESS_LABEL, guessAccount, ownerLabel, type AccountGuess } from '../lib/classify'
import { Card, Empty, SectionTitle, cx } from '../components/ui'
import { eur, monthLabel } from '../lib/calc'
import type { Route } from '../App'
import type { Txn } from '../types'
import { UNCLASSIFIED } from '../types'

interface Staged {
  key: string
  fileName: string
  res: ParseResult
  guess: AccountGuess
  accountId: string | null
  remember: boolean
}

export default function Import({ go }: { go: (r: Route) => void }) {
  const settings = useStore((s) => s.settings)
  const rules = useStore((s) => s.rules)
  const addTxns = useStore((s) => s.addTxns)
  const upsertAccount = useStore((s) => s.upsertAccount)
  const toast = useStore((s) => s.toast)
  const setMonth = useStore((s) => s.setMonth)

  const [staged, setStaged] = useState<Staged[]>([])
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const ctx = { members: settings.members, accounts: settings.accounts, rules }

  const handleFiles = async (files: FileList | File[]) => {
    const next: Staged[] = []
    for (const f of Array.from(files)) {
      if (!/\.(csv|txt|tsv)$/i.test(f.name)) {
        toast(`"${f.name}" no es un CSV. Revolut y Wise también exportan PDF: bajá la versión CSV.`, 'warn')
        continue
      }
      const text = await f.text()
      const res = parseStatement(text)
      if (!res.rows.length) {
        toast(`No encontré movimientos en "${f.name}"`, 'warn')
        continue
      }
      const guess = guessAccount(
        { accountIbans: res.accountIbans, ownerHints: res.ownerHints, fileName: f.name, bank: res.bank },
        settings.accounts,
        settings.members,
      )
      next.push({
        key: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 7)}`,
        fileName: f.name,
        res,
        guess,
        accountId: guess.accountId,
        remember: guess.reason === null,
      })
    }
    setStaged((s) => [...s, ...next])
  }

  const preview = useMemo(() => {
    const rows: Txn[] = []
    for (const st of staged) {
      const acc = settings.accounts.find((a) => a.id === st.accountId)
      if (!acc) continue
      for (const r of st.res.rows) rows.push(buildTxn(r, acc, ctx))
    }
    const byId = new Map(rows.map((t) => [t.id, t]))
    return [...byId.values()]
  }, [staged, settings.accounts, rules])

  const start = settings.startMonth
  const stats = useMemo(() => {
    // lo anterior al mes de inicio se guarda para clasificar, pero no se mide
    const counted = preview.filter((t) => t.month >= start)
    const live = counted.filter((t) => !t.excluded)
    const exp = live.filter((t) => t.kind === 'expense')
    const months = [...new Set(counted.map((t) => t.month))].sort()
    return {
      total: preview.length,
      historic: preview.length - counted.length,
      expenses: exp.length,
      expenseSum: exp.reduce((s, t) => s - t.amount, 0),
      income: live.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0),
      internal: live.filter((t) => t.kind === 'internal').length,
      skipped: counted.filter((t) => t.excluded).length,
      unclassified: exp.filter((t) => t.categoryId === UNCLASSIFIED).length,
      months,
    }
  }, [preview, start])

  const allAssigned = staged.length > 0 && staged.every((s) => s.accountId)

  const commit = async () => {
    setBusy(true)
    try {
      for (const st of staged) {
        if (!st.remember || !st.accountId) continue
        const acc = settings.accounts.find((a) => a.id === st.accountId)
        if (!acc) continue
        const patch = { ...acc }
        // guardamos el IBAN si el archivo lo traía, y una palabra clave del nombre
        const iban = st.res.accountIbans[0]
        if (iban && !patch.iban) patch.iban = iban
        const stem = st.fileName.replace(/\.[^.]+$/, '').toLowerCase()
        const tok = stem.split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !/^\d+$/.test(w))[0]
        if (tok && !patch.fileTokens.includes(tok)) patch.fileTokens = [...patch.fileTokens, tok]
        await upsertAccount(patch)
      }
      const { added, duplicates } = await addTxns(preview)
      if (stats.months.length) setMonth(stats.months[stats.months.length - 1])
      setStaged([])
      if (added === 0 && duplicates > 0) {
        toast(`Nada nuevo: los ${duplicates} movimientos ya estaban importados.`, 'info')
      } else {
        toast(
          duplicates > 0
            ? `${added} movimientos importados. ${duplicates} ya estaban y no se duplicaron.`
            : `${added} movimientos importados.`,
        )
      }
      go(stats.unclassified > 0 ? 'gastos' : 'inicio')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* zona de drop */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        className={cx(
          'rounded-xl2 border-2 border-dashed p-8 sm:p-10 text-center cursor-pointer transition-colors',
          drag ? 'border-seq-450 bg-seq-100/50' : 'border-line-strong bg-surface hover:border-seq-300 hover:bg-seq-100/20',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt,.tsv"
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }}
        />
        <div className="text-[30px] leading-none mb-3" aria-hidden>↧</div>
        <div className="text-[15px] font-semibold">Arrastrá los CSV del mes</div>
        <p className="text-[13px] text-ink-mute mt-1.5 max-w-sm mx-auto leading-relaxed">
          LHV, Wise y Revolut a la vez. Si subís algo dos veces no se duplica nada.
        </p>
      </div>

      {staged.length === 0 ? (
        <Card className="p-1">
          <Empty icon="🗂" title="Cómo bajar cada extracto">
            <ul className="text-left mt-3 space-y-2 max-w-sm mx-auto">
              <li><strong className="text-ink-soft">LHV:</strong> Cuenta → Extracto → descargar CSV. Trae el IBAN, así que se asigna solo.</li>
              <li><strong className="text-ink-soft">Wise:</strong> Saldo → Extractos → CSV. Trae el titular, así que se asigna solo.</li>
              <li><strong className="text-ink-soft">Revolut:</strong> Cuenta → Extracto → <em>Excel/CSV</em> (no PDF). No trae número de cuenta: la primera vez elegís de quién es y lo recuerda.</li>
            </ul>
          </Empty>
        </Card>
      ) : (
        <>
          <div className="space-y-2.5">
            {staged.map((st) => (
              <FileRow
                key={st.key}
                st={st}
                onChange={(patch) => setStaged((s) => s.map((x) => (x.key === st.key ? { ...x, ...patch } : x)))}
                onRemove={() => setStaged((s) => s.filter((x) => x.key !== st.key))}
              />
            ))}
          </div>

          {allAssigned && (
            <Card className="p-5">
              <SectionTitle hint={`Así queda antes de guardar. Nada se escribe hasta que confirmes. Los números son de ${monthLabel(start, true)} en adelante.`}>
                Vista previa
              </SectionTitle>

              {stats.historic > 0 && (
                <div className="rounded-lg bg-line/30 border border-line px-4 py-3 text-[13px] text-ink-soft mb-4 leading-relaxed">
                  <strong className="font-semibold text-ink">{stats.historic} movimientos son anteriores a {monthLabel(start, true)}.</strong>{' '}
                  Se guardan para que puedas clasificar los comercios de una vez, pero no entran en el
                  tablero, el cierre ni los ahorros. Los vas a encontrar en Gastos → Histórico.
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3 border-y border-line">
                <div>
                  <div className="text-[12px] text-ink-mute">Gastos</div>
                  <div className="num text-[19px] font-semibold mt-0.5">{eur(stats.expenseSum, { decimals: 0 })}</div>
                  <div className="text-[12px] text-ink-mute">{stats.expenses} movimientos</div>
                </div>
                <div>
                  <div className="text-[12px] text-ink-mute">Ingresos</div>
                  <div className="num text-[19px] font-semibold mt-0.5 text-goodink">{eur(stats.income, { decimals: 0 })}</div>
                </div>
                <div>
                  <div className="text-[12px] text-ink-mute">Movimientos internos</div>
                  <div className="num text-[19px] font-semibold mt-0.5">{stats.internal}</div>
                  <div className="text-[12px] text-ink-mute">no cuentan como gasto</div>
                </div>
                <div>
                  <div className="text-[12px] text-ink-mute">Sin clasificar</div>
                  <div className={cx('num text-[19px] font-semibold mt-0.5', stats.unclassified ? 'text-ink' : 'text-goodink')}>
                    {stats.unclassified}
                  </div>
                  <div className="text-[12px] text-ink-mute">
                    {stats.expenses > 0 ? `${Math.round((1 - stats.unclassified / stats.expenses) * 100)}% automático` : '—'}
                  </div>
                </div>
              </div>

              {stats.months.length > 0 && (
                <p className="text-[13px] text-ink-soft mt-3">
                  Meses cubiertos:{' '}
                  <span className="font-medium">
                    {stats.months.length > 3
                      ? `${monthLabel(stats.months[0], true)} → ${monthLabel(stats.months[stats.months.length - 1], true)}`
                      : stats.months.map((m) => monthLabel(m, true)).join(', ')}
                  </span>
                  {stats.skipped > 0 && <> · {stats.skipped} descartados (revertidos o cancelados)</>}
                </p>
              )}

              <div className="mt-4 max-h-64 overflow-y-auto -mx-1 px-1">
                <table className="w-full text-[13px]">
                  <tbody>
                    {preview.filter((t) => !t.excluded && t.month >= start).slice(0, 40).map((t) => (
                      <tr key={t.id} className="border-b border-line/60 last:border-0">
                        <td className="py-1.5 text-ink-mute num whitespace-nowrap pr-3">{t.date.slice(5)}</td>
                        <td className="py-1.5 pr-3 truncate max-w-[1px] w-full">{t.description}</td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">
                          <span className="chip">{settings.categories.find((c) => c.id === t.categoryId)?.name}</span>
                        </td>
                        <td className={cx('py-1.5 num text-right whitespace-nowrap', t.amount > 0 ? 'text-goodink' : '')}>
                          {eur(t.amount, { sign: true })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.filter((t) => !t.excluded && t.month >= start).length > 40 && (
                  <p className="text-[12px] text-ink-mute text-center py-2">
                    …y {preview.filter((t) => !t.excluded && t.month >= start).length - 40} más
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 mt-5">
                <button className="btn-ghost" onClick={() => setStaged([])}>Cancelar</button>
                <button className="btn-primary" onClick={commit} disabled={busy}>
                  {busy ? 'Guardando…' : `Importar ${preview.length} movimientos`}
                </button>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function FileRow({
  st, onChange, onRemove,
}: { st: Staged; onChange: (p: Partial<Staged>) => void; onRemove: () => void }) {
  const settings = useStore((s) => s.settings)
  const options = settings.accounts.filter((a) => !a.archived)
  const same = options.filter((a) => a.bank === st.res.bank)
  const list = same.length ? same : options
  const acc = options.find((a) => a.id === st.accountId)
  const known = st.guess.reason !== null

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="text-[18px] leading-none mt-0.5" aria-hidden>📄</div>
        <div className="min-w-0 grow">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13.5px] font-medium truncate max-w-full">{st.fileName}</span>
            <span className="chip">{BANK_LABEL[st.res.bank]}</span>
            <span className="chip">{st.res.rows.length} filas</span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="text-[12px] text-ink-soft">Cuenta:</label>
            <select
              className="h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-seq-300"
              value={st.accountId ?? ''}
              onChange={(e) => onChange({ accountId: e.target.value || null, remember: true })}
            >
              <option value="">— elegí de quién es —</option>
              {list.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} · {ownerLabel(a.ownerId, settings.members)}
                </option>
              ))}
            </select>

            {known && st.accountId === st.guess.accountId ? (
              <span className="text-[12px] text-goodink inline-flex items-center gap-1">
                <span aria-hidden>✓</span> detectada {GUESS_LABEL[st.guess.reason!]}
                {st.guess.detail && <span className="text-ink-mute">({st.guess.detail})</span>}
              </span>
            ) : (
              acc && (
                <label className="text-[12px] text-ink-soft inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={st.remember}
                    onChange={(e) => onChange({ remember: e.target.checked })}
                    className="accent-seq-450"
                  />
                  Recordar para la próxima
                </label>
              )
            )}
          </div>

          {!known && (
            <p className="text-[12px] text-ink-soft mt-2 leading-relaxed">
              {st.res.accountIbans.length > 0 ? (
                <>El archivo dice que la cuenta es <code className="num bg-line/40 rounded px-1">{st.res.accountIbans[0]}</code>. Elegila una vez y queda guardada.</>
              ) : st.res.ownerHints.length > 0 ? (
                <>El titular que figura es <strong>{st.res.ownerHints[0]}</strong>. Elegí la cuenta una vez y queda guardada.</>
              ) : (
                <>Este extracto no trae número de cuenta. Elegí de quién es y la próxima se reconoce por el nombre del archivo.</>
              )}
            </p>
          )}

          {st.res.warnings.length > 0 && (
            <p className="text-[12px] text-[#96620f] mt-2 leading-relaxed">
              ⚠ {st.res.warnings[0]}
              {st.res.warnings.length > 1 && ` (y ${st.res.warnings.length - 1} aviso más)`}
            </p>
          )}
        </div>
        <button className="btn-ghost btn-sm shrink-0" onClick={onRemove} aria-label="Quitar archivo">✕</button>
      </div>
    </Card>
  )
}
