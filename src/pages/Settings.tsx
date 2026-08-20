import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { BANK_LABEL } from '../lib/parsers'
import { ownerLabel } from '../lib/classify'
import { Card, Field, Modal, SectionTitle } from '../components/ui'
import { exportAll, importAll, wipeAll } from '../lib/db'
import { monthKey, monthLabel } from '../lib/calc'
import { buildInviteLink, canSync, mismoDominioQueAuth, parseConfig, savedConfig } from '../lib/cloud'
import type { Account, Bank, Category } from '../types'
import { SHARED } from '../types'

export default function SettingsPage() {
  return (
    <div className="space-y-5">
      <StartMonth />
      <Members />
      <Accounts />
      <Categories />
      <Rules />
      <Backup />
      <Cloud />
    </div>
  )
}

function StartMonth() {
  const settings = useStore((s) => s.settings)
  const txns = useStore((s) => s.txns)
  const updateSettings = useStore((s) => s.updateSettings)
  const toast = useStore((s) => s.toast)
  const before = txns.filter((t) => t.month < settings.startMonth).length

  return (
    <Card className="p-5">
      <SectionTitle hint="Todo lo anterior a este mes se guarda y sirve para clasificar comercios, pero no aparece en el tablero, el cierre ni los ahorros.">
        Desde cuándo se mide
      </SectionTitle>
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="month"
          className="input w-auto"
          value={settings.startMonth}
          max={monthKey()}
          onChange={async (e) => {
            const v = e.target.value
            if (!/^\d{4}-\d{2}$/.test(v)) return
            await updateSettings({ startMonth: v })
            toast(`Ahora se mide desde ${monthLabel(v, true)}`)
          }}
        />
        <span className="text-[13px] text-ink-mute">
          {before > 0
            ? `${before} movimientos quedan como histórico`
            : 'No hay movimientos anteriores guardados'}
        </span>
      </div>
    </Card>
  )
}

function Members() {
  const settings = useStore((s) => s.settings)
  const upsertMember = useStore((s) => s.upsertMember)
  return (
    <Card className="p-5">
      <SectionTitle hint="El nombre completo es el que figura en los extractos. Con eso la app reconoce la plata que se mueve entre ustedes y no la cuenta como gasto.">
        Quiénes son
      </SectionTitle>
      <div className="space-y-4">
        {settings.members.map((m) => (
          <div key={m.id} className="grid sm:grid-cols-2 gap-3">
            <Field label="Nombre corto">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full shrink-0" style={{ background: m.color }} aria-hidden />
                <input className="input" value={m.name} onChange={(e) => upsertMember({ ...m, name: e.target.value })} />
              </div>
            </Field>
            <Field label="Nombre completo en los extractos">
              <input
                className="input"
                value={m.aliases[0] ?? ''}
                placeholder="NOMBRE APELLIDO COMO FIGURA EN EL BANCO"
                onChange={(e) => upsertMember({ ...m, aliases: e.target.value ? [e.target.value] : [] })}
              />
            </Field>
          </div>
        ))}
      </div>
    </Card>
  )
}

function Accounts() {
  const settings = useStore((s) => s.settings)
  const txns = useStore((s) => s.txns)
  const upsertAccount = useStore((s) => s.upsertAccount)
  const removeAccount = useStore((s) => s.removeAccount)
  const [edit, setEdit] = useState<Account | null>(null)

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of txns) m.set(t.accountId, (m.get(t.accountId) ?? 0) + 1)
    return m
  }, [txns])

  const blank = (): Account => ({
    id: `acc-${Date.now()}`, bank: 'lhv', label: '', ownerId: settings.members[0]?.id ?? SHARED, fileTokens: [],
  })

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <SectionTitle hint="Cargá el IBAN de cada cuenta: es lo que permite que la app sepa sola de quién es cada CSV, sin que elijas nada.">
          Cuentas
        </SectionTitle>
        <button className="btn-outline btn-sm" onClick={() => setEdit(blank())}>+ Cuenta</button>
      </div>

      <ul className="divide-y divide-line/70 -mx-1">
        {settings.accounts.map((a) => (
          <li key={a.id} className="flex items-center gap-3 py-3 px-1">
            <div className="min-w-0 grow">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[14px] font-medium">{a.label || 'Sin nombre'}</span>
                <span className="chip">{BANK_LABEL[a.bank]}</span>
                <span className="chip">{ownerLabel(a.ownerId, settings.members)}</span>
              </div>
              <div className="text-[12px] text-ink-mute mt-1 num truncate">
                {a.iban ? a.iban : <span className="text-[#96620f]">sin IBAN — se identifica por el nombre del archivo</span>}
                {counts.get(a.id) ? ` · ${counts.get(a.id)} movimientos` : ''}
              </div>
            </div>
            <button className="btn-ghost btn-sm shrink-0" onClick={() => setEdit(a)}>Editar</button>
          </li>
        ))}
        {settings.accounts.length === 0 && (
          <li className="py-5 text-[13.5px] text-ink-mute text-center">Todavía no cargaste ninguna cuenta.</li>
        )}
      </ul>

      <AccountModal
        account={edit}
        onClose={() => setEdit(null)}
        onSave={async (a) => { await upsertAccount(a); setEdit(null) }}
        onDelete={async (id) => { await removeAccount(id); setEdit(null) }}
      />
    </Card>
  )
}

function AccountModal({
  account, onClose, onSave, onDelete,
}: { account: Account | null; onClose: () => void; onSave: (a: Account) => void; onDelete: (id: string) => void }) {
  const settings = useStore((s) => s.settings)
  const [a, setA] = useState<Account | null>(account)
  const [key, setKey] = useState(account?.id)
  if (key !== account?.id) { setKey(account?.id); setA(account) }
  if (!a) return null

  return (
    <Modal
      open={!!account}
      onClose={onClose}
      title={account?.label ? 'Editar cuenta' : 'Nueva cuenta'}
      footer={<>
        <button className="btn-danger mr-auto" onClick={() => onDelete(a.id)}>Borrar</button>
        <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={() => onSave(a)} disabled={!a.label.trim()}>Guardar</button>
      </>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Banco">
            <select className="input" value={a.bank} onChange={(e) => setA({ ...a, bank: e.target.value as Bank })}>
              {(['lhv', 'swedbank', 'wise', 'revolut', 'otro'] as Bank[]).map((b) => (
                <option key={b} value={b}>{BANK_LABEL[b]}</option>
              ))}
            </select>
          </Field>
          <Field label="De quién es">
            <select className="input" value={a.ownerId} onChange={(e) => setA({ ...a, ownerId: e.target.value })}>
              {settings.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              <option value={SHARED}>Compartida</option>
            </select>
          </Field>
        </div>
        <Field label="Nombre">
          <input className="input" value={a.label} onChange={(e) => setA({ ...a, label: e.target.value })} placeholder="LHV mío" />
        </Field>
        <Field label="IBAN o número de cuenta" hint="Si lo cargás, los CSV de esta cuenta se asignan solos y sin ambigüedad.">
          <input
            className="input num"
            value={a.iban ?? ''}
            onChange={(e) => setA({ ...a, iban: e.target.value.replace(/\s/g, '').toUpperCase() })}
            placeholder="EE001234567890123456"
          />
        </Field>
        <Field label="Palabras clave del nombre del archivo" hint="Separadas por coma. Para Revolut, que no trae número de cuenta en el CSV.">
          <input
            className="input"
            value={a.fileTokens.join(', ')}
            onChange={(e) => setA({ ...a, fileTokens: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
            placeholder="revolut, compartida"
          />
        </Field>
      </div>
    </Modal>
  )
}

function Categories() {
  const settings = useStore((s) => s.settings)
  const upsertCategory = useStore((s) => s.upsertCategory)
  const removeCategory = useStore((s) => s.removeCategory)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('▫️')

  const add = async () => {
    if (!name.trim()) return
    const id = name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')
    const c: Category = { id, name: name.trim(), emoji: emoji || '▫️', kind: 'expense', order: 50 }
    await upsertCategory(c)
    setName(''); setEmoji('▫️'); setOpen(false)
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <SectionTitle hint="Las que usás para presupuestar y para leer en qué se te va la plata.">
          Categorías
        </SectionTitle>
        <button className="btn-outline btn-sm" onClick={() => setOpen(true)}>+ Categoría</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {settings.categories.filter((c) => !c.system).map((c) => (
          <span key={c.id} className="chip group">
            <span aria-hidden>{c.emoji}</span>
            {c.name}
            <button
              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 ml-0.5"
              onClick={() => removeCategory(c.id)}
              aria-label={`Borrar ${c.name}`}
            >✕</button>
          </span>
        ))}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nueva categoría"
        footer={<>
          <button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
          <button className="btn-primary" onClick={add} disabled={!name.trim()}>Crear</button>
        </>}
      >
        <div className="flex gap-3">
          <div className="w-20">
            <Field label="Ícono">
              <input className="input text-center" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} />
            </Field>
          </div>
          <div className="grow">
            <Field label="Nombre">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mascotas" autoFocus />
            </Field>
          </div>
        </div>
      </Modal>
    </Card>
  )
}

function Rules() {
  const rules = useStore((s) => s.rules)
  const settings = useStore((s) => s.settings)
  const removeRule = useStore((s) => s.removeRule)
  const reapplyRules = useStore((s) => s.reapplyRules)
  const updateSettings = useStore((s) => s.updateSettings)
  const toast = useStore((s) => s.toast)
  const [q, setQ] = useState('')
  const [showAll, setShowAll] = useState(false)

  const auto = rules.filter((r) => r.source === 'auto')
  const list = useMemo(() => {
    const base = showAll ? rules : auto
    const nq = q.trim().toLowerCase()
    return base
      .filter((r) => !nq || r.pattern.includes(nq))
      .sort((a, b) => b.createdAt - a.createdAt || a.pattern.localeCompare(b.pattern))
  }, [rules, auto, q, showAll])

  return (
    <Card className="p-5">
      <SectionTitle hint="Cada vez que clasificás un gasto a mano, la app guarda acá la regla para que el mes que viene salga solo.">
        Reglas de clasificación
      </SectionTitle>

      <label className="flex items-center gap-2.5 text-[13.5px] text-ink-soft mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.autoRules}
          onChange={(e) => updateSettings({ autoRules: e.target.checked })}
          className="accent-seq-450"
        />
        Aprender automáticamente al clasificar a mano
      </label>

      <div className="flex flex-wrap gap-2 mb-3">
        <input className="input h-9 w-auto grow min-w-[140px] max-w-xs" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-outline btn-sm h-9" onClick={() => setShowAll((s) => !s)}>
          {showAll ? `Solo las mías (${auto.length})` : `Ver todas (${rules.length})`}
        </button>
        <button
          className="btn-outline btn-sm h-9"
          onClick={async () => {
            const n = await reapplyRules()
            toast(n ? `${n} movimientos reclasificados` : 'No hubo cambios: ya estaba todo al día', n ? 'ok' : 'info')
          }}
        >
          Reaplicar a todo
        </button>
      </div>

      {list.length === 0 ? (
        <p className="text-[13.5px] text-ink-mute py-3">
          {showAll ? 'Ninguna regla coincide.' : 'Todavía no creaste reglas propias. Clasificá un gasto en la pantalla de Gastos y aparece acá.'}
        </p>
      ) : (
        <ul className="divide-y divide-line/70 max-h-72 overflow-y-auto -mx-1">
          {list.slice(0, 200).map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2 px-1">
              <code className="text-[12.5px] bg-line/40 rounded px-1.5 py-0.5 truncate max-w-[45%]">{r.pattern}</code>
              <span className="text-ink-mute text-[12px]" aria-hidden>→</span>
              <span className="text-[13px] grow truncate">
                {settings.categories.find((c) => c.id === r.categoryId)?.name ?? r.categoryId}
              </span>
              {r.source === 'seed' && <span className="chip shrink-0">de fábrica</span>}
              <button className="btn-ghost btn-sm shrink-0 opacity-50 hover:opacity-100" onClick={() => removeRule(r.id)} aria-label="Borrar regla">✕</button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Backup() {
  const toast = useStore((s) => s.toast)
  const init = useStore((s) => s.init)
  const txns = useStore((s) => s.txns)
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)

  const doExport = async () => {
    const data = await exportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gastos-respaldo-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast('Respaldo descargado')
  }

  return (
    <Card className="p-5">
      <SectionTitle hint="Un archivo con todo: movimientos, planes, reglas y ajustes. Sirve para respaldar o para pasar los datos a otro dispositivo.">
        Respaldo
      </SectionTitle>
      <div className="flex flex-wrap gap-2">
        <button className="btn-outline" onClick={doExport}>Descargar respaldo</button>
        <button className="btn-outline" onClick={() => fileRef.current?.click()}>Restaurar desde archivo</button>
        <input
          ref={fileRef} type="file" accept=".json" className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            try {
              await importAll(JSON.parse(await f.text()))
              await init()
              toast('Datos restaurados')
            } catch {
              toast('No pude leer ese archivo de respaldo', 'warn')
            }
            e.target.value = ''
          }}
        />
        <div className="grow" />
        <button className="btn-danger" onClick={() => setConfirmWipe(true)}>Borrar todo</button>
      </div>

      <Modal
        open={confirmWipe}
        onClose={() => setConfirmWipe(false)}
        title="Borrar todos los datos"
        footer={<>
          <button className="btn-ghost" onClick={() => setConfirmWipe(false)}>Cancelar</button>
          <button
            className="btn bg-critical text-white hover:opacity-90"
            onClick={async () => { await wipeAll(); await init(); setConfirmWipe(false); location.reload() }}
          >
            Sí, borrar todo
          </button>
        </>}
      >
        <p className="text-[13.5px] leading-relaxed">
          Se borran los <strong>{txns.length} movimientos</strong>, los planes, las reglas y los ajustes
          de este dispositivo. No se puede deshacer.
        </p>
        <p className="text-[13.5px] text-ink-mute mt-3">Descargá un respaldo antes si tenés dudas.</p>
      </Modal>
    </Card>
  )
}

/**
 * QR del enlace de invitación, para que la otra persona lo escanee con la cámara
 * en vez de recibir un enlace por mensaje.
 *
 * Se dibuja acá mismo, en el dispositivo: el enlace nunca sale a ningún servidor.
 * La librería se carga solo cuando se muestra el QR, así no engorda la app para
 * quien no lo use.
 */
function QrInvitacion({ link }: { link: string }) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let vivo = true
    import('qrcode-generator')
      .then(({ default: qrcode }) => {
        // Corrección de errores baja: el enlace es largo y esto lo mantiene en
        // 77 módulos, que se escanean bien de una pantalla a otra.
        const qr = qrcode(0, 'L')
        qr.addData(link)
        qr.make()
        if (vivo) setSvg(qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }))
      })
      .catch(() => { if (vivo) setError(true) })
    return () => { vivo = false }
  }, [link])

  if (error) return <p className="text-[13px] text-critical">No se pudo generar el QR. Usá el enlace.</p>
  if (!svg) return <p className="text-[13px] text-ink-mute">Generando…</p>

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="w-[280px] max-w-full rounded-xl2 border border-line bg-white p-3"
        // El SVG lo genera la librería a partir del enlace, no viene de afuera.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className="text-[12.5px] text-ink-mute text-center leading-relaxed">
        Que lo apunte con la cámara del celular. Se abre la app ya configurada y solo
        tiene que entrar con su Google.
      </p>
    </div>
  )
}

/** Datos crudos para diagnosticar cuando algo no conecta. */
function Diagnostico() {
  const cloudState = useStore((s) => s.cloud)
  const [open, setOpen] = useState(false)
  const cfg = savedConfig()
  const lineas = [
    `estado: ${cloudState.status}`,
    `dominio: ${typeof location !== 'undefined' ? location.hostname : '—'}`,
    `proyecto: ${cfg?.projectId ?? '—'}`,
    `authDomain configurado: ${cfg?.authDomain ?? '—'}`,
    `método de login: ${mismoDominioQueAuth() ? 'redirección (mismo dominio)' : 'ventana emergente (dominio distinto)'}`,
    `usuario: ${cloudState.user?.email ?? 'sin sesión'}`,
    `hogar: ${cloudState.householdId ?? '—'}`,
    cloudState.error ? `error: ${cloudState.error}` : 'error: ninguno',
  ].join('\n')

  return (
    <div className="pt-1">
      <button className="text-[12px] text-ink-mute underline underline-offset-2" onClick={() => setOpen((o) => !o)}>
        {open ? 'Ocultar diagnóstico' : 'Ver diagnóstico'}
      </button>
      {open && (
        <pre className="mt-2 rounded-lg bg-line/30 p-3 text-[11.5px] leading-relaxed overflow-x-auto whitespace-pre-wrap">{lineas}</pre>
      )}
    </div>
  )
}

function Cloud() {
  const cloudState = useStore((s) => s.cloud)
  const connect = useStore((s) => s.cloudConnect)
  const signIn = useStore((s) => s.cloudSignIn)
  const signOut = useStore((s) => s.cloudSignOut)
  const disable = useStore((s) => s.cloudDisable)
  const pushAll = useStore((s) => s.cloudPushAll)
  const toast = useStore((s) => s.toast)
  const txns = useStore((s) => s.txns)

  const [open, setOpen] = useState(false)
  const [raw, setRaw] = useState('')
  const [invite, setInvite] = useState('')
  const [busy, setBusy] = useState(false)
  /** enlace de invitación mientras se muestra el QR; null = QR oculto */
  const [qr, setQr] = useState<string | null>(null)

  const configured = !!savedConfig()
  const st = cloudState.status

  const chip =
    st === 'conectado' ? { text: 'Sincronizando', cls: 'bg-good/15 text-goodink' }
    : st === 'conectando' ? { text: 'Conectando…', cls: 'bg-seq-100 text-seq-600' }
    : st === 'restaurando' ? { text: 'Recuperando sesión…', cls: 'bg-seq-100 text-seq-600' }
    : st === 'error' ? { text: 'Con problemas', cls: 'bg-critical/15 text-critical' }
    : { text: 'Modo local', cls: '' }

  const doConnect = async () => {
    const cfg = parseConfig(raw)
    if (!cfg) return toast('No pude leer esa configuración. Pegá el bloque completo que muestra Firebase.', 'warn')
    setBusy(true)
    try {
      await connect(cfg, invite.trim() || undefined)
      setOpen(false)
      toast('Firebase configurado. Ahora entrá con tu cuenta de Google.')
    } finally { setBusy(false) }
  }

  return (
    <Card className="p-5">
      <SectionTitle hint="Para que los dos vean y editen lo mismo desde el celular y la PC. Es gratis y no pide tarjeta.">
        Sincronización con tu pareja
      </SectionTitle>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <span className={`chip ${chip.cls}`}>{chip.text}</span>
        {cloudState.user && <span className="chip">{cloudState.user.email}</span>}
        {cloudState.memberCount ? (
          <span className="chip">{cloudState.memberCount === 1 ? '1 dispositivo vinculado' : `${cloudState.memberCount} personas`}</span>
        ) : null}
      </div>

      {cloudState.error && (
        <div className="rounded-lg bg-[#fdecec] border border-critical/30 px-4 py-3 text-[13px] mb-4 leading-relaxed">
          {cloudState.error}
        </div>
      )}

      {!canSync() ? (
        <div className="space-y-3">
          <div className="rounded-lg bg-[#fff8ec] border border-warning/40 px-4 py-3 text-[13.5px] leading-relaxed">
            <strong className="font-semibold">Estás abriendo la app como archivo suelto.</strong>{' '}
            Google no permite entrar con tu cuenta desde un archivo local, así que la sincronización
            todavía no se puede activar. Primero hay que publicar la app.
          </div>
          <p className="text-[13.5px] text-ink-soft leading-relaxed">
            Para probarla en tu compu antes de publicarla, en una terminal dentro de la carpeta
            del proyecto:
          </p>
          <pre className="rounded-lg bg-ink text-[#e8e8e3] px-4 py-3 text-[12.5px] overflow-x-auto leading-relaxed">npx serve dist</pre>
          <p className="text-[13.5px] text-ink-soft leading-relaxed">
            Y abrís <code className="bg-line/40 rounded px-1">http://localhost:3000</code>.
            Firebase autoriza <code className="bg-line/40 rounded px-1">localhost</code> de fábrica,
            así que el login funciona sin configurar nada más.
          </p>
          <p className="text-[13px] text-ink-mute leading-relaxed">
            Mientras tanto la app funciona completa acá: importás, clasificás y planificás igual.
            Los datos quedan en este dispositivo, y en Respaldo tenés cómo llevártelos.
          </p>
        </div>
      ) : !configured ? (
        <>
          <p className="text-[13.5px] text-ink-soft leading-relaxed mb-3">
            Hoy los datos viven solo en este dispositivo. Activá la nube y los cambios de
            cualquiera de los dos aparecen en el acto en el otro.
          </p>
          <button className="btn-primary" onClick={() => setOpen(true)}>Activar sincronización</button>
        </>
      ) : st === 'restaurando' ? (
        <p className="text-[13.5px] text-ink-mute">Recuperando la sesión…</p>
      ) : st === 'conectado' || cloudState.user ? (
        <div className="space-y-4">
          {cloudState.householdId && (
            <div className="space-y-4">
              <div>
                <div className="label">Enlace de invitación</div>
                <p className="text-[13px] text-ink-soft leading-relaxed mb-2">
                  La forma fácil: mandale este enlace por mensaje. Lo abre, entra con su Google
                  y ya están conectados. No tiene que copiar ni pegar nada más.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn-primary"
                    onClick={() => {
                      const cfg = savedConfig()
                      if (!cfg) return toast('Todavía no hay configuración guardada', 'warn')
                      const link = buildInviteLink(cfg, cloudState.householdId!)
                      navigator.clipboard?.writeText(link)
                      toast('Enlace copiado. Mandáselo por mensaje.')
                    }}
                  >Copiar enlace de invitación</button>
                  <button
                    className="btn-outline"
                    onClick={() => {
                      if (qr) return setQr(null)
                      const cfg = savedConfig()
                      if (!cfg) return toast('Todavía no hay configuración guardada', 'warn')
                      setQr(buildInviteLink(cfg, cloudState.householdId!))
                    }}
                  >{qr ? 'Ocultar QR' : 'Mostrar QR'}</button>
                </div>
                {qr && (
                  <div className="mt-3 space-y-2">
                    <QrInvitacion link={qr} />
                    <p className="text-[12px] text-ink-mute leading-relaxed">
                      Este QR es la llave de tus datos: cualquiera que lo escanee entra al
                      hogar. Mostráselo en persona, no lo publiques ni lo mandes a un grupo.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <div className="label">Código del hogar (por si prefiere hacerlo a mano)</div>
                <div className="flex gap-2">
                  <input className="input num text-[12.5px]" readOnly value={cloudState.householdId} onFocus={(e) => e.target.select()} />
                  <button
                    className="btn-outline shrink-0"
                    onClick={() => { navigator.clipboard?.writeText(cloudState.householdId!); toast('Código copiado') }}
                  >Copiar</button>
                </div>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn-outline" onClick={() => pushAll()}>Subir todo ahora ({txns.length})</button>
            <button className="btn-ghost" onClick={() => signOut()}>Cerrar sesión</button>
            <div className="grow" />
            <button className="btn-danger" onClick={() => disable()}>Desactivar</button>
          </div>
          {cloudState.lastSync && (
            <p className="text-[12px] text-ink-mute">
              Última sincronización: {new Date(cloudState.lastSync).toLocaleTimeString('es-ES')}
            </p>
          )}
          <Diagnostico />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[13.5px] text-ink-soft leading-relaxed">
            {mismoDominioQueAuth()
              ? 'Al entrar, la página va a saltar a Google y volver acá sola. Es normal que parpadee una vez.'
              : 'Se abre una ventanita de Google para elegir tu cuenta. Si el navegador la bloquea, permitile abrir ventanas emergentes a este sitio.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => signIn()}>Entrar con Google</button>
            <button className="btn-ghost" onClick={() => setOpen(true)}>Cambiar configuración</button>
            <div className="grow" />
            <button className="btn-danger" onClick={() => disable()}>Desactivar</button>
          </div>
          <Diagnostico />
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Activar la sincronización"
        wide
        footer={<>
          <button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
          <button className="btn-primary" onClick={doConnect} disabled={busy || !raw.trim()}>
            {busy ? 'Conectando…' : 'Conectar'}
          </button>
        </>}
      >
        <div className="space-y-4 text-[13.5px] leading-relaxed">
          <p>
            Hace falta un proyecto gratuito de Firebase — <strong>sin tarjeta de crédito y sin costo</strong>{' '}
            para dos personas. Se hace una sola vez, en unos diez minutos.
          </p>
          <ol className="space-y-2 list-decimal pl-5 text-ink-soft">
            <li>Entrá a <code className="bg-line/40 rounded px-1">console.firebase.google.com</code> con tu Google y creá un proyecto.</li>
            <li>En <strong>Authentication → Sign-in method</strong>, activá <strong>Google</strong>.</li>
            <li>En <strong>Firestore Database</strong>, creá la base y pegá las reglas de seguridad de la guía.</li>
            <li>En <strong>Configuración del proyecto → Tus apps → Web</strong>, copiá el bloque <code className="bg-line/40 rounded px-1">firebaseConfig</code>.</li>
          </ol>

          <Field label="Pegá acá el bloque de configuración" hint="Sirve tal cual lo copiaste de Firebase, con const y todo.">
            <textarea
              className="input h-32 py-2 font-mono text-[12px] leading-relaxed"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={'const firebaseConfig = {\n  apiKey: "AIza...",\n  authDomain: "mi-proyecto.firebaseapp.com",\n  projectId: "mi-proyecto",\n  appId: "1:123:web:abc"\n};'}
            />
          </Field>

          <Field
            label="Código de invitación (solo si te estás sumando al hogar de tu pareja)"
            hint="Dejalo vacío si sos el primero de los dos en activarla."
          >
            <input className="input num text-[12.5px]" value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="Pegá acá el código que te pasó tu pareja" />
          </Field>

          <div className="rounded-lg bg-line/25 p-4 text-[12.5px] text-ink-soft">
            El archivo <code className="bg-surface rounded px-1">GUIA-NUBE.md</code> que viene con la app tiene
            estos pasos con capturas de cada pantalla y las reglas de seguridad listas para copiar.
          </div>
        </div>
      </Modal>
    </Card>
  )
}
