import Dexie, { type Table } from 'dexie'
import type { MonthPlan, Rule, Settings, Txn } from '../types'
import { defaultSettings, RULES } from './seed'

export interface KV {
  key: string
  value: unknown
}

class GastosDB extends Dexie {
  txns!: Table<Txn, string>
  plans!: Table<MonthPlan, string>
  rules!: Table<Rule, string>
  kv!: Table<KV, string>

  constructor() {
    super('gastos-hogar')
    this.version(1).stores({
      txns: 'id, date, month, accountId, ownerId, categoryId, kind',
      plans: 'month',
      rules: 'id, pattern, categoryId',
      kv: 'key',
    })
  }
}

export const db = new GastosDB()

export async function loadSettings(): Promise<Settings> {
  const row = await db.kv.get('settings')
  if (!row) {
    const s = defaultSettings()
    await db.kv.put({ key: 'settings', value: s })
    return s
  }
  return mergeSettings(row.value as Settings)
}

/**
 * Combina unos ajustes guardados con los de fábrica.
 *
 * Las categorías que agregamos en versiones nuevas se suman a las que ya tenía
 * el usuario, sin pisar las suyas. Hay que aplicarlo tanto al leer del disco
 * como al recibir los ajustes de la nube: si no, la copia vieja que está en
 * Firestore sobreescribe la lista migrada y las categorías nuevas nunca aparecen.
 */
export function mergeSettings(guardado: Settings | undefined | null): Settings {
  const base = defaultSettings()
  if (!guardado) return base
  const propias = new Set((guardado.categories ?? []).map((c) => c.id))
  const categories = [
    ...(guardado.categories ?? base.categories),
    ...base.categories.filter((c) => !propias.has(c.id)),
  ].sort((a, b) => a.order - b.order)
  return { ...base, ...guardado, categories }
}

export async function saveSettings(s: Settings) {
  await db.kv.put({ key: 'settings', value: s })
}

export async function loadRules(): Promise<Rule[]> {
  const n = await db.rules.count()
  if (n === 0) {
    await db.rules.bulkPut(RULES)
    return RULES
  }
  return db.rules.toArray()
}

/** Exporta todo para respaldo o para mover los datos a otro dispositivo. */
export async function exportAll() {
  const [txns, plans, rules, settings] = await Promise.all([
    db.txns.toArray(),
    db.plans.toArray(),
    db.rules.toArray(),
    loadSettings(),
  ])
  return { version: 1, exportedAt: new Date().toISOString(), settings, txns, plans, rules }
}

export async function importAll(data: Awaited<ReturnType<typeof exportAll>>) {
  await db.transaction('rw', db.txns, db.plans, db.rules, db.kv, async () => {
    if (data.settings) await saveSettings(data.settings)
    if (data.rules?.length) { await db.rules.clear(); await db.rules.bulkPut(data.rules) }
    if (data.plans?.length) { await db.plans.clear(); await db.plans.bulkPut(data.plans) }
    if (data.txns?.length) await db.txns.bulkPut(data.txns)
  })
}

export async function wipeAll() {
  await db.transaction('rw', db.txns, db.plans, db.rules, db.kv, async () => {
    await db.txns.clear()
    await db.plans.clear()
    await db.rules.clear()
    await db.kv.clear()
  })
}
