import { create } from 'zustand'
import type { Account, Category, Member, MonthPlan, Rule, Settings, Txn } from '../types'
import { db, loadRules, loadSettings, mergeSettings, saveSettings } from './db'
import { defaultSettings } from './seed'
import { buildTxn, categorize, ruleText, suggestPattern } from './classify'
import type { ParsedRow } from './parsers'
import { emptyPlan, monthKey } from './calc'
import { hashId } from './text'
import * as cloud from './cloud'
import type { CloudState, FirebaseConfig } from './cloud'

export interface Toast {
  id: number
  text: string
  tone?: 'ok' | 'info' | 'warn'
  undo?: () => void
}

interface State {
  ready: boolean
  settings: Settings
  txns: Txn[]
  plans: MonthPlan[]
  rules: Rule[]
  month: string
  toasts: Toast[]
  cloud: CloudState

  init: () => Promise<void>
  cloudConnect: (config: FirebaseConfig, householdId?: string) => Promise<void>
  cloudSignIn: () => Promise<void>
  cloudSignOut: () => Promise<void>
  cloudDisable: () => Promise<void>
  cloudPushAll: () => Promise<void>
  setMonth: (m: string) => void
  toast: (text: string, tone?: Toast['tone'], undo?: () => void) => void
  dismissToast: (id: number) => void

  updateSettings: (patch: Partial<Settings>) => Promise<void>
  upsertAccount: (a: Account) => Promise<void>
  removeAccount: (id: string) => Promise<void>
  upsertMember: (m: Member) => Promise<void>
  upsertCategory: (c: Category) => Promise<void>
  removeCategory: (id: string) => Promise<void>

  savePlan: (p: MonthPlan) => Promise<void>
  copyPlanFrom: (from: string, to: string) => Promise<void>

  addTxns: (rows: Txn[]) => Promise<{ added: number; duplicates: number }>
  setCategory: (txnId: string, categoryId: string, opts?: { learn?: boolean }) => Promise<void>
  setCategoryBulk: (txnIds: string[], categoryId: string, opts?: { learn?: boolean }) => Promise<void>
  updateTxn: (id: string, patch: Partial<Txn>) => Promise<void>
  addManualTxn: (t: Omit<Txn, 'id' | 'month' | 'importedAt' | 'source'>) => Promise<void>
  deleteTxns: (ids: string[]) => Promise<void>
  deleteMonthFromAccount: (month: string, accountId: string) => Promise<number>

  marcarPrestamo: (id: string, person: string, nota?: string) => Promise<void>
  saldarPrestamo: (id: string, nota?: string) => Promise<void>
  quitarPrestamo: (id: string) => Promise<void>

  addRule: (pattern: string, categoryId: string) => Promise<void>
  removeRule: (id: string) => Promise<void>
  reapplyRules: () => Promise<number>
}

let toastSeq = 1

/** Mientras aplicamos un cambio que vino de la nube, no lo volvemos a subir. */
let applying = false

async function applyRemote(
  r: { txns: Txn[]; plans: MonthPlan[]; rules: Rule[]; settings?: Settings },
  set: (p: Partial<State>) => void,
  get: () => State,
) {
  // Reconciliación: comparamos lo que hay acá contra lo que llegó de la nube y
  // subimos lo que falte. Así, si se importó algo estando desconectado o una
  // subida falló, se arregla solo sin que nadie tenga que apretar nada.
  if (r.txns.length >= 0 && cloud.needsReconcile()) {
    cloud.markReconciled()
    const remotos = new Set(r.txns.map((t) => t.id))
    const faltan = get().txns.filter((t) => !remotos.has(t.id))
    if (faltan.length) {
      cloud.pushDocs('txns', faltan)
        .then(() => get().toast(`${faltan.length} movimientos que faltaban se subieron a la nube`))
        .catch(() => { /* el error ya se muestra en Ajustes */ })
    }
    const remotosPlan = new Set(r.plans.map((p) => p.month))
    const planesFaltan = get().plans.filter((p) => !remotosPlan.has(p.month))
    if (planesFaltan.length) cloud.pushDocs('plans', planesFaltan).catch(() => {})
    const remotasReglas = new Set(r.rules.map((x) => x.id))
    const reglasFaltan = get().rules.filter((x) => x.source === 'auto' && !remotasReglas.has(x.id))
    if (reglasFaltan.length) cloud.pushDocs('rules', reglasFaltan).catch(() => {})
  }

  applying = true
  try {
    if (r.txns.length) {
      await db.txns.bulkPut(r.txns)
      const m = new Map(get().txns.map((t) => [t.id, t]))
      for (const t of r.txns) m.set(t.id, t)
      set({ txns: [...m.values()] })
    }
    if (r.plans.length) {
      await db.plans.bulkPut(r.plans)
      const m = new Map(get().plans.map((p) => [p.month, p]))
      for (const p of r.plans) m.set(p.month, p)
      set({ plans: [...m.values()] })
    }
    if (r.rules.length) {
      await db.rules.bulkPut(r.rules)
      const m = new Map(get().rules.map((x) => [x.id, x]))
      for (const x of r.rules) m.set(x.id, x)
      set({ rules: [...m.values()] })
    }
    if (r.settings) {
      // Migramos también lo que viene de la nube: puede ser una copia guardada
      // por una versión anterior, sin las categorías nuevas.
      const merged = mergeSettings(r.settings)
      await saveSettings(merged)
      set({ settings: merged })
    }
  } finally {
    applying = false
  }
}

export const useStore = create<State>((set, get) => ({
  ready: false,
  settings: defaultSettings(),
  txns: [],
  plans: [],
  rules: [],
  month: monthKey(),
  toasts: [],
  cloud: { status: 'apagado' },

  async cloudConnect(config, householdId) {
    const previo = cloud.savedConfig()
    cloud.saveConfig(config)
    if (householdId) cloud.saveHouseholdId(householdId.trim())
    // Firebase no se puede reinicializar con otra configuración en la misma página:
    // si ya había una, recargamos para arrancar limpio.
    if (previo && previo.projectId !== config.projectId) { location.reload(); return }
    await cloud.start(config, {
      onState: (c) => set({ cloud: c }),
      onRemote: (r) => applyRemote(r, set, get),
    })
  },

  async cloudSignIn() {
    try { await cloud.signIn() } catch (e: any) { get().toast(`No pude entrar: ${e?.code ?? e?.message ?? e}`, 'warn') }
  },

  async cloudSignOut() { await cloud.signOutCloud() },

  async cloudDisable() {
    await cloud.signOutCloud().catch(() => {})
    cloud.saveConfig(null)
    cloud.saveHouseholdId(null)
    set({ cloud: { status: 'apagado' } })
    get().toast('Sincronización desactivada. Los datos siguen en este dispositivo.')
  },

  async cloudPushAll() {
    const { txns, plans, rules, settings } = get()
    await cloud.pushEverything({ txns, plans, rules, settings })
    get().toast('Datos subidos a la nube')
  },

  async init() {
    const [settings, rules, txns, plans] = await Promise.all([
      loadSettings(),
      loadRules(),
      db.txns.toArray(),
      db.plans.toArray(),
    ])
    // arrancamos en el último mes con datos, nunca antes del mes de inicio
    const start = settings.startMonth || monthKey()
    const months = [...new Set(txns.map((t) => t.month))].filter((m) => m >= start).sort()
    const month = months.length ? months[months.length - 1] : monthKey() >= start ? monthKey() : start
    set({ settings, rules, txns, plans, month, ready: true })

    // Si abrieron un enlace de invitación, la configuración ya viene adentro
    const invitado = cloud.consumeInviteLink()
    if (invitado) set({ settings: { ...settings, onboarded: true } })

    const cfg = cloud.savedConfig()
    if (cfg) {
      cloud.start(cfg, {
        onState: (c) => set({ cloud: c }),
        onRemote: (r) => applyRemote(r, set, get),
      })
    }
  },

  setMonth: (month) => set({ month }),

  toast(text, tone = 'ok', undo) {
    const id = toastSeq++
    set((s) => ({ toasts: [...s.toasts, { id, text, tone, undo }] }))
    setTimeout(() => get().dismissToast(id), undo ? 7000 : 3500)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  async updateSettings(patch) {
    const settings = { ...get().settings, ...patch }
    await saveSettings(settings)
    set({ settings })
    if (!applying) cloud.pushSettings(settings).catch(() => {})
  },

  async upsertAccount(a) {
    const accounts = [...get().settings.accounts]
    const i = accounts.findIndex((x) => x.id === a.id)
    if (i >= 0) accounts[i] = a
    else accounts.push(a)
    await get().updateSettings({ accounts })
  },

  async removeAccount(id) {
    const n = get().txns.filter((t) => t.accountId === id).length
    if (n > 0) {
      get().toast(`No se puede borrar: la cuenta tiene ${n} movimientos importados`, 'warn')
      return
    }
    await get().updateSettings({ accounts: get().settings.accounts.filter((a) => a.id !== id) })
  },

  async upsertMember(m) {
    const members = [...get().settings.members]
    const i = members.findIndex((x) => x.id === m.id)
    if (i >= 0) members[i] = m
    else members.push(m)
    await get().updateSettings({ members })
  },

  async upsertCategory(c) {
    const categories = [...get().settings.categories]
    const i = categories.findIndex((x) => x.id === c.id)
    if (i >= 0) categories[i] = c
    else categories.push(c)
    await get().updateSettings({ categories })
  },

  async removeCategory(id) {
    const cat = get().settings.categories.find((c) => c.id === id)
    if (cat?.system) return
    const n = get().txns.filter((t) => t.categoryId === id).length
    if (n > 0) {
      get().toast(`Esa categoría tiene ${n} movimientos. Reasignalos antes de borrarla.`, 'warn')
      return
    }
    await get().updateSettings({ categories: get().settings.categories.filter((c) => c.id !== id) })
    await db.rules.where('categoryId').equals(id).delete()
    set({ rules: await db.rules.toArray() })
  },

  async savePlan(p) {
    await db.plans.put(p)
    const plans = [...get().plans.filter((x) => x.month !== p.month), p]
    set({ plans })
    if (!applying) cloud.pushDocs('plans', [p]).catch(() => {})
  },

  async copyPlanFrom(from, to) {
    const src = get().plans.find((p) => p.month === from)
    if (!src) {
      get().toast(`No hay plan guardado en ${from}`, 'warn')
      return
    }
    await get().savePlan({ ...src, month: to, closedAt: undefined })
    get().toast(`Plan copiado desde ${from}`)
  },

  async addTxns(rows) {
    const existing = new Set(get().txns.map((t) => t.id))
    const fresh: Txn[] = []
    let duplicates = 0
    const seen = new Set<string>()
    for (const t of rows) {
      if (existing.has(t.id) || seen.has(t.id)) { duplicates++; continue }
      seen.add(t.id)
      fresh.push(t)
    }
    if (fresh.length) {
      await db.txns.bulkPut(fresh)
      set({ txns: [...get().txns, ...fresh] })
      if (!applying) {
        cloud.pushDocs('txns', fresh).catch(() => {
          get().toast('Los movimientos se guardaron acá, pero no pude subirlos a la nube. Mirá Ajustes → Sincronización.', 'warn')
        })
      }
    }
    return { added: fresh.length, duplicates }
  },

  async setCategory(txnId, categoryId, opts = {}) {
    await get().setCategoryBulk([txnId], categoryId, opts)
  },

  async setCategoryBulk(txnIds, categoryId, opts = {}) {
    const { learn = get().settings.autoRules } = opts
    const all = get().txns
    const targets = all.filter((t) => txnIds.includes(t.id))
    if (!targets.length) return
    const before = targets.map((t) => ({ id: t.id, categoryId: t.categoryId, pinned: t.pinned }))

    const patched = targets.map((t) => ({ ...t, categoryId, pinned: true, kind: 'expense' as const }))
    await db.txns.bulkPut(patched)
    const map = new Map(patched.map((t) => [t.id, t]))
    set({ txns: all.map((t) => map.get(t.id) ?? t) })
    cloud.pushDocs('txns', patched).catch(() => {})

    // Aprender: la próxima vez que aparezca este comercio ya sale clasificado.
    let learned = 0
    if (learn && categoryId !== 'sin-clasificar') {
      const pats = new Set(targets.map((t) => suggestPattern(t.description)))
      for (const p of pats) {
        if (p.length < 3) continue
        const dup = get().rules.find((r) => r.pattern === p)
        if (dup?.categoryId === categoryId) continue
        await get().addRule(p, categoryId)
        learned++
      }
    }

    const undo = async () => {
      const back = before.map((b) => ({ ...map.get(b.id)!, categoryId: b.categoryId, pinned: b.pinned }))
      await db.txns.bulkPut(back)
      const bm = new Map(back.map((t) => [t.id, t]))
      set({ txns: get().txns.map((t) => bm.get(t.id) ?? t) })
      cloud.pushDocs('txns', back).catch(() => {})
    }

    const catName = get().settings.categories.find((c) => c.id === categoryId)?.name ?? categoryId
    const n = targets.length
    get().toast(
      learned
        ? `${n} ${n === 1 ? 'movimiento' : 'movimientos'} → ${catName}. Regla creada: se aplica sola de acá en más.`
        : `${n} ${n === 1 ? 'movimiento' : 'movimientos'} → ${catName}`,
      'ok',
      undo,
    )
  },

  async updateTxn(id, patch) {
    const t = get().txns.find((x) => x.id === id)
    if (!t) return
    const next = { ...t, ...patch }
    await db.txns.put(next)
    set({ txns: get().txns.map((x) => (x.id === id ? next : x)) })
    if (!applying) cloud.pushDocs('txns', [next]).catch(() => {})
  },

  async addManualTxn(input) {
    const id = hashId('manual', input.date, input.amount, input.description, Date.now())
    const t: Txn = { ...input, id, month: input.date.slice(0, 7), source: 'manual', importedAt: Date.now() }
    await db.txns.put(t)
    set({ txns: [...get().txns, t] })
    cloud.pushDocs('txns', [t]).catch(() => {})
    get().toast('Movimiento agregado')
  },

  async deleteTxns(ids) {
    await db.txns.bulkDelete(ids)
    set({ txns: get().txns.filter((t) => !ids.includes(t.id)) })
    cloud.deleteDocs('txns', ids).catch(() => {})
    get().toast(`${ids.length} ${ids.length === 1 ? 'movimiento borrado' : 'movimientos borrados'}`)
  },

  async deleteMonthFromAccount(month, accountId) {
    const ids = get().txns.filter((t) => t.month === month && t.accountId === accountId).map((t) => t.id)
    if (ids.length) await get().deleteTxns(ids)
    return ids.length
  },

  async marcarPrestamo(id, person, nota) {
    await get().updateTxn(id, { loan: { person: person.trim(), settledNote: nota?.trim() || undefined } })
    get().toast(`Anotado: ${person.trim()} nos lo debe`)
  },

  async saldarPrestamo(id, nota) {
    const t = get().txns.find((x) => x.id === id)
    if (!t?.loan) return
    await get().updateTxn(id, { loan: { ...t.loan, settledAt: Date.now(), settledNote: nota?.trim() || t.loan.settledNote } })
    get().toast(`Saldado. ${t.loan.person} ya no debe eso.`, 'ok', async () => {
      await get().updateTxn(id, { loan: { ...t.loan!, settledAt: undefined } })
    })
  },

  async quitarPrestamo(id) {
    await get().updateTxn(id, { loan: undefined })
    get().toast('Ya no figura como préstamo')
  },

  async addRule(pattern, categoryId) {
    const p = ruleText(pattern)
    if (p.length < 2) return
    const existing = get().rules.find((r) => r.pattern === p)
    const rule: Rule = existing
      ? { ...existing, categoryId }
      : { id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, pattern: p, categoryId, source: 'auto', createdAt: Date.now(), hits: 0 }
    await db.rules.put(rule)
    set({ rules: [...get().rules.filter((r) => r.id !== rule.id), rule] })
    if (!applying) cloud.pushDocs('rules', [rule]).catch(() => {})
  },

  async removeRule(id) {
    await db.rules.delete(id)
    set({ rules: get().rules.filter((r) => r.id !== id) })
    cloud.deleteDocs('rules', [id]).catch(() => {})
  },

  /** Reaplica todas las reglas a los movimientos que no se tocaron a mano. */
  async reapplyRules() {
    const { txns, rules, settings } = get()
    const ctx = { members: settings.members, accounts: settings.accounts, rules }
    const changed: Txn[] = []
    for (const t of txns) {
      if (t.pinned || t.kind === 'internal' || t.source === 'manual') continue
      const row = { description: t.description, rawDescription: t.rawDescription, amount: t.amount } as ParsedRow
      const { categoryId } = categorize(row, t.kind, ctx)
      if (categoryId !== t.categoryId) changed.push({ ...t, categoryId })
    }
    if (changed.length) {
      await db.txns.bulkPut(changed)
      const m = new Map(changed.map((t) => [t.id, t]))
      set({ txns: txns.map((t) => m.get(t.id) ?? t) })
      cloud.pushDocs('txns', changed).catch(() => {})
    }
    return changed.length
  },
}))

// ── selectores ──────────────────────────────────────────────────────────────

export const usePlan = (month: string): MonthPlan =>
  useStore((s) => s.plans.find((p) => p.month === month)) ?? emptyPlan(month)

export const useCtx = () =>
  useStore((s) => ({ members: s.settings.members, accounts: s.settings.accounts, rules: s.rules }))

export { buildTxn }
