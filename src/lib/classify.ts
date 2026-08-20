import type { Account, Member, Rule, Txn, TxnKind } from '../types'
import { INCOME_CAT, INTERNAL_CAT, SHARED, UNCLASSIFIED } from '../types'
import type { ParsedRow } from './parsers'
import { hashId, mentionsPerson, norm } from './text'

/**
 * Texto contra el que se comparan las reglas: minúsculas, sin acentos,
 * y toda la puntuación convertida en espacios. Así "BOLT.EU/R/2607010429"
 * y "Bolt" caen en el mismo espacio de búsqueda.
 */
export function ruleText(...parts: (string | undefined)[]): string {
  return norm(parts.filter(Boolean).join(' '))
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Busca la regla que aplica. Gana el patrón MÁS LARGO, así "bolt food"
 * (restaurantes) le gana a "bolt" (transporte).
 * El match es por principio de palabra, para que "hotel" agarre "hotell"
 * pero "coop" no agarre "swoop".
 */
export function matchRule(text: string, rules: Rule[]): Rule | null {
  const hay = ' ' + text
  let best: Rule | null = null
  for (const r of rules) {
    if (!r.pattern) continue
    if (hay.includes(' ' + r.pattern)) {
      if (!best || r.pattern.length > best.pattern.length) best = r
    }
  }
  return best
}

/** Deriva un patrón de regla razonable a partir de la descripción de un movimiento. */
export function suggestPattern(description: string): string {
  const t = ruleText(description)
  const words = t.split(' ').filter(Boolean)
  const keep: string[] = []
  for (const w of words) {
    // corta al llegar a un código de transacción (números sueltos o mezclas largas)
    const isCode = /^\d+$/.test(w) || (/\d/.test(w) && w.length >= 6)
    if (isCode) break
    keep.push(w)
    if (keep.join(' ').length >= 18) break
  }
  const p = keep.join(' ').trim()
  return p.length >= 3 ? p : t.slice(0, 24).trim()
}

export interface ClassifyCtx {
  members: Member[]
  accounts: Account[]
  rules: Rule[]
}

/** Nombres (con alias) de todos los titulares: sirve para detectar plata que se mueve entre nosotros. */
export function ownNames(members: Member[]): string[] {
  return members.flatMap((m) => [m.name, ...m.aliases]).filter((s) => s && s.trim().length > 2)
}

/** IBANs de todas nuestras cuentas. */
export function ownIbans(accounts: Account[]): string[] {
  return accounts.map((a) => (a.iban ?? '').replace(/\s/g, '').toUpperCase()).filter(Boolean)
}

/**
 * El pago del resumen de la tarjeta de crédito parece un movimiento interno
 * —el banco pone el nombre del titular como contraparte, porque la tarjeta es
 * suya— pero no lo es: la tarjeta no es una cuenta que la app siga, así que esa
 * plata sale y no vuelve. Tiene que contar como gasto.
 */
const PAGO_TARJETA =
  /credit\s*(card\s*)?repayment|card\s*repayment|krediidi\s*tagasimakse|krediitkaardi|pago\s*de\s*tarjeta|credit\s*card\s*payment/i

/**
 * Decide si un movimiento es gasto, ingreso, o plata que solo cambió de bolsillo.
 * Los movimientos internos no cuentan ni como gasto ni como ingreso: si no se
 * excluyeran, mandar plata de LHV a la Revolut compartida contaría dos veces.
 */
export function detectKind(row: ParsedRow, ctx: ClassifyCtx): TxnKind {
  if (row.amount < 0 && PAGO_TARJETA.test(`${row.description} ${row.rawDescription}`)) return 'expense'

  const ibans = ownIbans(ctx.accounts)
  const cp = (row.counterpartyIban ?? '').replace(/\s/g, '').toUpperCase()
  if (cp && ibans.includes(cp)) return 'internal'

  const names = ownNames(ctx.members)
  if (names.length && mentionsPerson(`${row.counterparty ?? ''} ${row.description}`, names)) return 'internal'

  if (row.internalHint) return 'internal'

  if (row.amount >= 0) {
    // Un importe positivo de un comercio conocido es una DEVOLUCIÓN, no un ingreso:
    // tiene que restarse de su categoría de gasto, no sumarse al sueldo del mes.
    if (row.refundHint) return 'expense'
    if (matchRule(ruleText(row.description, row.rawDescription), ctx.rules)) return 'expense'
    return 'income'
  }
  return 'expense'
}

/** true si es una devolución: un gasto con importe positivo. */
export function isRefund(t: { kind: TxnKind; amount: number }): boolean {
  return t.kind === 'expense' && t.amount > 0
}

const CORP = /\b(o[üu]|as|sia|uab|ltd|inc|llc|gmbh|sa|srl|bv|ab|oy|plc|corp|co|group|holding|eesti|tallinn)\b/i

/**
 * Heurística: ¿el destinatario parece una persona y no un comercio?
 * Sirve para sugerir "Familia y envíos" en transferencias entre particulares.
 */
export function looksLikePerson(name: string): boolean {
  const raw = (name ?? '').replace(/^(transferencia (a|de)|to|from|pago de)\s+/i, '').trim()
  if (!raw || CORP.test(raw)) return false
  if (/[0-9*@/#]/.test(raw)) return false
  const words = raw.split(/\s+/).filter((w) => w.length > 1)
  return words.length >= 2 && words.length <= 5 && words.every((w) => /^[\p{L}'-]+$/u.test(w))
}

export function categorize(row: ParsedRow, kind: TxnKind, ctx: ClassifyCtx): { categoryId: string; rule?: Rule } {
  if (kind === 'internal') return { categoryId: INTERNAL_CAT }
  if (kind === 'income') return { categoryId: INCOME_CAT }
  const text = ruleText(row.description, row.rawDescription)
  const rule = matchRule(text, ctx.rules)
  if (rule) return { categoryId: rule.categoryId, rule }
  // Wise trae su propia categoría; la usamos como último recurso
  const fromBank = WISE_CATEGORY_MAP[norm(row.bankCategory ?? '')]
  if (fromBank) return { categoryId: fromBank }
  return { categoryId: UNCLASSIFIED }
}

const WISE_CATEGORY_MAP: Record<string, string> = {
  supermercados: 'supermercado',
  groceries: 'supermercado',
  restaurantes: 'restaurantes',
  'eating out': 'restaurantes',
  viajes: 'transporte',
  travel: 'transporte',
  transporte: 'transporte',
  transport: 'transporte',
  'cuidado personal': 'salud',
  'personal care': 'salud',
  compras: 'compras',
  shopping: 'compras',
  ocio: 'ocio',
  entertainment: 'ocio',
  facturas: 'servicios',
  bills: 'servicios',
}

/** Convierte una fila parseada en un movimiento listo para guardar. */
export function buildTxn(row: ParsedRow, account: Account, ctx: ClassifyCtx): Txn {
  const kind = detectKind(row, ctx)
  const { categoryId } = categorize(row, kind, ctx)
  const id = hashId(
    account.id,
    row.externalRef || '',
    row.date,
    row.amount.toFixed(2),
    ruleText(row.description).slice(0, 40),
  )
  return {
    id,
    date: row.date,
    month: row.date.slice(0, 7),
    description: row.description,
    rawDescription: row.rawDescription,
    amount: Math.round(row.amount * 100) / 100,
    origAmount: row.origAmount,
    origCurrency: row.origCurrency,
    fxRate: row.fxRate,
    accountId: account.id,
    ownerId: account.ownerId,
    categoryId,
    kind,
    source: 'csv',
    counterparty: row.counterparty,
    status: row.status,
    importedAt: Date.now(),
    excluded: row.skip || undefined,
    note: row.skipReason ? `Estado: ${row.skipReason}` : undefined,
  }
}

// ── atribución: ¿de qué cuenta es este archivo? ─────────────────────────────

export interface AccountGuess {
  accountId: string | null
  /** cómo lo supimos, para mostrárselo al usuario */
  reason: 'iban' | 'archivo' | 'titular' | 'unico' | null
  detail?: string
}

/**
 * Averigua a qué cuenta pertenece un archivo importado, en cascada:
 * IBAN en las columnas → nombre del archivo → titular que figura en las filas.
 */
export function guessAccount(
  opts: { accountIbans: string[]; ownerHints: string[]; fileName: string; bank: string },
  accounts: Account[],
  members: Member[],
): AccountGuess {
  const active = accounts.filter((a) => !a.archived)

  // 1. IBAN: el camino seguro
  for (const iban of opts.accountIbans) {
    const clean = iban.replace(/\s/g, '').toUpperCase()
    const hit = active.find((a) => (a.iban ?? '').replace(/\s/g, '').toUpperCase() === clean)
    if (hit) return { accountId: hit.id, reason: 'iban', detail: clean }
  }

  const fn = norm(opts.fileName)

  // 2. El IBAN puede venir en el nombre del archivo (LHV los nombra así)
  for (const a of active) {
    const iban = (a.iban ?? '').replace(/\s/g, '').toLowerCase()
    if (iban && fn.includes(iban)) return { accountId: a.id, reason: 'iban', detail: iban.toUpperCase() }
  }

  // 3. Palabras clave del nombre del archivo
  const sameBank = active.filter((a) => a.bank === opts.bank)
  for (const a of active) {
    for (const tok of a.fileTokens) {
      const t = norm(tok)
      if (t.length >= 3 && fn.includes(t)) return { accountId: a.id, reason: 'archivo', detail: tok }
    }
  }

  // 4. Titular que figura en las filas (Wise pone el nombre del dueño en cada fila)
  if (opts.ownerHints.length) {
    for (const m of members) {
      const names = [m.name, ...m.aliases]
      if (opts.ownerHints.some((h) => mentionsPerson(h, names))) {
        const hit = sameBank.find((a) => a.ownerId === m.id)
        if (hit) return { accountId: hit.id, reason: 'titular', detail: opts.ownerHints[0] }
      }
    }
  }

  // 5. Si solo hay una cuenta de ese banco, no hay ambigüedad posible
  if (sameBank.length === 1) return { accountId: sameBank[0].id, reason: 'unico' }

  return { accountId: null, reason: null }
}

export const GUESS_LABEL: Record<NonNullable<AccountGuess['reason']>, string> = {
  iban: 'por el número de cuenta',
  archivo: 'por el nombre del archivo',
  titular: 'por el titular del extracto',
  unico: 'única cuenta de ese banco',
}

export function ownerLabel(ownerId: string, members: Member[]): string {
  if (ownerId === SHARED) return 'Compartida'
  return members.find((m) => m.id === ownerId)?.name ?? 'Sin asignar'
}
