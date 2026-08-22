import type { Category, MonthPlan, Settings, Txn } from '../types'
import { SHARED, UNCLASSIFIED } from '../types'
import { mentionsPerson } from './text'

/**
 * Prefijo del renglón que representa la plata de una persona cuya cuenta no está
 * importada. No es una cuenta real: es el espejo de una transferencia de la que
 * solo tenemos un lado.
 */
const SIN_CUENTA = 'sin-cuenta:'

export const monthKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return monthKey(d)
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function monthLabel(month: string, long = false): string {
  const [y, m] = month.split('-').map(Number)
  const name = MONTHS[m - 1] ?? ''
  const cap = name.charAt(0).toUpperCase() + name.slice(1)
  return long ? `${cap} ${y}` : `${cap} ${String(y).slice(2)}`
}

export const eur = (n: number, opts: { sign?: boolean; decimals?: 0 | 2 } = {}) => {
  const { sign = false, decimals = 2 } = opts
  const s = Math.abs(n).toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  const pre = sign ? (n > 0 ? '+' : n < 0 ? '−' : '') : n < 0 ? '−' : ''
  return `${pre}${s} €`
}

/** Movimientos que cuentan como gasto o ingreso: ni internos ni excluidos. */
export const isLive = (t: Txn) => !t.excluded && t.kind !== 'internal'

/**
 * Movimientos que cuentan para el SALDO: acá sí entran los internos.
 *
 * Son dos preguntas distintas y hasta opuestas. Para saber cuánto se gastó hay
 * que excluir las transferencias entre cuentas propias, porque si no se cuenta
 * dos veces la misma plata. Pero para saber cuánta plata le quedó a cada uno hay
 * que incluirlas, porque esa plata efectivamente cambió de bolsillo.
 */
export const isLiveForBalance = (t: Txn) => !t.excluded

export interface CatLine {
  categoryId: string
  planned: number
  real: number
  /** real − planeado. Positivo = te pasaste. */
  diff: number
  count: number
}

export interface MonthSummary {
  month: string
  incomePlanned: number
  incomeReal: number
  /** gasto en positivo (lo que salió del bolsillo) */
  expensePlanned: number
  expenseReal: number
  savingsGoal: number
  savingsReal: number
  byCategory: CatLine[]
  /** gasto por persona (y la cuenta compartida) */
  byOwner: Array<{ ownerId: string; real: number; count: number }>
  /** ingreso por persona */
  byOwnerIncome: Array<{ ownerId: string; real: number; count: number }>
  /**
   * Cuánto le quedó a cada bolsillo este mes: ingresos menos gastos, contando
   * también lo que se pasaron entre cuentas. La suma de los tres da el ahorro
   * total del mes, porque las transferencias internas se cancelan entre sí.
   */
  netByOwner: Array<{ ownerId: string; net: number }>
  /** el mismo reparto abierto por cuenta, para el detalle de "dónde quedó" */
  netByAccount: Array<{
    key: string
    accountId?: string
    ownerId: string
    label: string
    bank?: string
    sinCuenta: boolean
    net: number
  }>
  /** cuánto puso cada uno en la cuenta compartida */
  aportes: Array<{ ownerId: string; monto: number }>
  /**
   * Plata que entra o sale por una transferencia interna cuya contrapartida no
   * está importada ni se pudo atribuir a nadie. Si esto no es cero, el reparto
   * por bolsillo no cuadra con el ahorro del mes y hay que avisarlo.
   */
  netUnmatched: number
  unclassifiedCount: number
  txnCount: number
  hasData: boolean
  /** hay gastos pero ningún ingreso: seguramente falta importar la cuenta donde entra el sueldo */
  missingIncome: boolean
}

export function emptyPlan(month: string): MonthPlan {
  return { month, incomes: {}, budgets: {}, savingsGoal: 0 }
}

export function summarize(
  month: string,
  txns: Txn[],
  plan: MonthPlan | undefined,
  settings: Settings,
): MonthSummary {
  const p = plan ?? emptyPlan(month)
  const rows = txns.filter((t) => t.month === month)
  const live = rows.filter(isLive)
  const expenses = live.filter((t) => t.kind === 'expense')
  const incomes = live.filter((t) => t.kind === 'income')

  const incomeReal = incomes.reduce((s, t) => s + t.amount, 0)
  // los gastos se guardan en negativo; acá los pasamos a positivo.
  // una devolución llega en positivo y por lo tanto resta. Es lo correcto.
  const expenseReal = expenses.reduce((s, t) => s - t.amount, 0)

  const incomePlanned = Object.values(p.incomes).reduce((s, n) => s + (n || 0), 0)
  const expensePlanned = Object.values(p.budgets).reduce((s, n) => s + (n || 0), 0)

  const catIds = new Set<string>([...Object.keys(p.budgets), ...expenses.map((t) => t.categoryId)])
  const order = new Map(settings.categories.map((c) => [c.id, c.order]))
  const byCategory: CatLine[] = [...catIds]
    .map((categoryId) => {
      const real = expenses.filter((t) => t.categoryId === categoryId).reduce((s, t) => s - t.amount, 0)
      const planned = p.budgets[categoryId] || 0
      return {
        categoryId,
        planned,
        real,
        diff: real - planned,
        count: expenses.filter((t) => t.categoryId === categoryId).length,
      }
    })
    .filter((l) => l.planned !== 0 || l.real !== 0)
    .sort((a, b) => (order.get(a.categoryId) ?? 50) - (order.get(b.categoryId) ?? 50))

  const ownerIds = [...settings.members.map((m) => m.id), SHARED]
  const byOwner = ownerIds
    .map((ownerId) => {
      const s = expenses.filter((t) => t.ownerId === ownerId)
      return { ownerId, real: s.reduce((a, t) => a - t.amount, 0), count: s.length }
    })
    .filter((o) => o.count > 0)
  const byOwnerIncome = ownerIds
    .map((ownerId) => {
      const s = incomes.filter((t) => t.ownerId === ownerId)
      return { ownerId, real: s.reduce((a, t) => a + t.amount, 0), count: s.length }
    })
    .filter((o) => o.count > 0)

  // ── Saldo del mes por bolsillo ──
  //
  // Cuando una transferencia entre cuentas propias tiene los dos lados importados,
  // se cancela sola: sale de un bolsillo y entra en el otro. Pero si solo está
  // importada una de las dos cuentas, esa plata aparecería de la nada (o se
  // esfumaría), y el reparto dejaría de sumar el ahorro del mes.
  //
  // Por eso: los internos se emparejan primero, y al que quedó sin contrapartida
  // se le anota el movimiento espejo en el bolsillo de la persona que figura en
  // la descripción. Es la verdad de los hechos: esa plata salió de su bolsillo
  // aunque no tengamos su extracto.
  const forBalance = rows.filter(isLiveForBalance)
  const universo = txns.filter(isLiveForBalance)
  const net = new Map<string, number>()
  const sumar = (owner: string, v: number) => net.set(owner, (net.get(owner) ?? 0) + v)

  // El mismo reparto, un nivel más abajo: en qué cuenta concreta quedó la plata.
  // La clave es el accountId, salvo el espejo sintético de abajo, que por
  // definición no tiene cuenta importada.
  const netAcc = new Map<string, number>()
  const sumarAcc = (key: string, v: number) => netAcc.set(key, (netAcc.get(key) ?? 0) + v)

  for (const t of forBalance) {
    sumar(t.ownerId, t.amount)
    sumarAcc(t.accountId, t.amount)
  }

  const dia = (d: string) => new Date(d).getTime() / 86400000
  const internos = forBalance.filter((t) => t.kind === 'internal')
  let netUnmatched = 0

  for (const a of internos) {
    // Un ajuste de saldo no tiene contrapartida por definición: representa plata
    // que ya estaba en la cuenta antes de empezar a usar la app.
    if (a.opening) continue
    const tieneEspejo = universo.some(
      (b) =>
        b.id !== a.id &&
        b.kind === 'internal' &&
        b.ownerId !== a.ownerId &&
        Math.abs(b.amount + a.amount) < 0.01 &&
        Math.abs(dia(b.date) - dia(a.date)) <= 5,
    )
    if (tieneEspejo) continue
    // Si el texto menciona a más de una persona, no hay forma de saber de quién
    // salió: adivinar sería peor que no atribuirlo. Va a "sin atribuir" y la
    // pantalla avisa, que es la única salida honesta.
    const candidatos = settings.members.filter(
      (m) =>
        m.id !== a.ownerId &&
        mentionsPerson(`${a.counterparty ?? ''} ${a.description}`, [m.name, ...m.aliases]),
    )
    const otro = candidatos.length === 1 ? candidatos[0] : undefined
    if (otro) {
      sumar(otro.id, -a.amount)
      // Sabemos de quién es esa plata, pero no de qué cuenta suya salió: su
      // extracto no está importado. Va a un renglón propio para que el detalle
      // por cuenta siga sumando lo mismo que el bolsillo.
      sumarAcc(`${SIN_CUENTA}${otro.id}`, -a.amount)
    } else netUnmatched += a.amount
  }

  const netByOwner = ownerIds
    .filter((id) => net.has(id))
    .map((ownerId) => ({ ownerId, net: net.get(ownerId) ?? 0 }))

  // Detalle por cuenta, ya ordenado de mayor a menor dentro de cada bolsillo.
  const netByAccount = [...netAcc.entries()]
    .map(([key, valor]) => {
      const sinCuenta = key.startsWith(SIN_CUENTA)
      const cuenta = sinCuenta ? undefined : settings.accounts.find((a) => a.id === key)
      const ownerId = sinCuenta ? key.slice(SIN_CUENTA.length) : (cuenta?.ownerId ?? UNCLASSIFIED)
      return {
        key,
        accountId: sinCuenta ? undefined : key,
        ownerId,
        label: sinCuenta ? 'Cuentas sin importar' : (cuenta?.label ?? 'Cuenta desconocida'),
        bank: cuenta?.bank,
        sinCuenta,
        net: Math.round(valor * 100) / 100,
      }
    })
    .filter((a) => Math.abs(a.net) >= 0.01)
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))

  // Aportes a la cuenta compartida: entradas internas, atribuidas a quien las mandó.
  const aportes = settings.members
    .map((m) => {
      const nombres = [m.name, ...m.aliases]
      const monto = forBalance
        .filter((t) => t.ownerId === SHARED && t.kind === 'internal' && t.amount > 0)
        .filter((t) => mentionsPerson(`${t.counterparty ?? ''} ${t.description}`, nombres))
        .reduce((a, t) => a + t.amount, 0)
      return { ownerId: m.id, monto }
    })
    .filter((a) => a.monto > 0)

  return {
    month,
    incomePlanned,
    incomeReal,
    expensePlanned,
    expenseReal,
    savingsGoal: p.savingsGoal || 0,
    savingsReal: incomeReal - expenseReal,
    byCategory,
    byOwner,
    byOwnerIncome,
    netByOwner,
    netByAccount,
    aportes,
    netUnmatched: Math.round(netUnmatched * 100) / 100,
    unclassifiedCount: expenses.filter((t) => t.categoryId === UNCLASSIFIED).length,
    txnCount: rows.length,
    hasData: rows.length > 0,
    missingIncome: expenseReal > 0 && incomeReal <= 0,
  }
}

/**
 * Meses visibles, del más nuevo al más viejo. Nunca antes del mes de inicio:
 * lo anterior existe en la base pero no se mide.
 */
export function knownMonths(txns: Txn[], plans: MonthPlan[], startMonth?: string): string[] {
  const s = new Set<string>([...txns.map((t) => t.month), ...plans.map((p) => p.month)])
  s.add(monthKey())
  const list = [...s].filter(Boolean).sort().reverse()
  return startMonth ? list.filter((m) => m >= startMonth) : list
}

/** true si el movimiento es anterior al mes de inicio: sirve para clasificar, no para medir. */
export const isHistoric = (t: Txn, startMonth: string) => t.month < startMonth

/**
 * Categorías de gasto, siempre en el mismo orden y en un solo lugar, para que
 * todas las listas de la app muestren exactamente lo mismo.
 */
export function catsGasto(settings: Settings, sinLaDeSinClasificar = false): Category[] {
  return settings.categories
    .filter((c) => c.kind === 'expense' && (!sinLaDeSinClasificar || c.id !== UNCLASSIFIED))
    .sort((a, b) => a.order - b.order)
}

export function catById(settings: Settings, id: string): Category {
  return (
    settings.categories.find((c) => c.id === id) ?? {
      id, name: id, emoji: '▫️', kind: 'expense', order: 50,
    }
  )
}

/** Serie de ahorro mes a mes para el gráfico de evolución. */
export function savingsSeries(months: string[], txns: Txn[], plans: MonthPlan[], settings: Settings) {
  const planMap = new Map(plans.map((p) => [p.month, p]))
  months = months.filter((m) => m >= settings.startMonth)
  let cumReal = 0
  let cumGoal = 0
  return months.map((m) => {
    const s = summarize(m, txns, planMap.get(m), settings)
    cumReal += s.savingsReal
    cumGoal += s.savingsGoal
    return {
      month: m,
      label: monthLabel(m),
      real: Math.round(s.savingsReal * 100) / 100,
      goal: Math.round(s.savingsGoal * 100) / 100,
      cumReal: Math.round(cumReal * 100) / 100,
      cumGoal: Math.round(cumGoal * 100) / 100,
      income: s.incomeReal,
      expense: s.expenseReal,
      hasData: s.hasData,
      missingIncome: s.missingIncome,
      // reparto del ahorro del mes por bolsillo, para el gráfico apilado
      net: Object.fromEntries(s.netByOwner.map((o) => [o.ownerId, Math.round(o.net * 100) / 100])),
      cuentas: s.netByAccount,
      aportes: s.aportes,
      netUnmatched: s.netUnmatched,
    }
  })
}

/** Plata prestada que todavía no volvió, agrupada por persona. */
export function deudas(txns: Txn[]) {
  const abiertas = txns.filter((t) => t.loan && !t.loan.settledAt && !t.excluded)
  const porPersona = new Map<string, { persona: string; total: number; movs: Txn[] }>()
  for (const t of abiertas) {
    const k = t.loan!.person.trim() || 'Sin nombre'
    const e = porPersona.get(k) ?? { persona: k, total: 0, movs: [] }
    e.total += Math.abs(t.amount)
    e.movs.push(t)
    porPersona.set(k, e)
  }
  const grupos = [...porPersona.values()].sort((a, b) => b.total - a.total)
  return { grupos, total: grupos.reduce((a, g) => a + g.total, 0), count: abiertas.length }
}

/** Préstamos ya saldados, del más reciente al más viejo. */
export function deudasSaldadas(txns: Txn[]) {
  return txns
    .filter((t) => t.loan?.settledAt && !t.excluded)
    .sort((a, b) => (b.loan!.settledAt ?? 0) - (a.loan!.settledAt ?? 0))
}

/** Todos los bolsillos que aparecen en la serie, en orden estable. */
export function bolsillos(settings: Settings): Array<{ id: string; label: string; color: string }> {
  return [
    ...settings.members.map((m) => ({ id: m.id, label: m.name, color: m.color })),
    { id: SHARED, label: 'Compartida', color: '#1baf7a' },
  ]
}
