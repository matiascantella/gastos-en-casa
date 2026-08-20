export type Bank = 'lhv' | 'swedbank' | 'wise' | 'revolut' | 'otro'

/** Un movimiento puede ser gasto, ingreso, o movimiento interno (no cuenta para nada). */
export type TxnKind = 'expense' | 'income' | 'internal'

export interface Member {
  id: string
  name: string
  /** Variantes del nombre que aparecen en los extractos (mayúsculas, orden distinto, etc.) */
  aliases: string[]
  color: string
}

export interface Account {
  id: string
  bank: Bank
  label: string
  /** id de Member, o 'shared' para la cuenta compartida */
  ownerId: string
  /** IBAN o número de cuenta. Es la vía principal para saber de quién es un CSV. */
  iban?: string
  /** Palabras que, si aparecen en el nombre del archivo, identifican esta cuenta */
  fileTokens: string[]
  archived?: boolean
}

export interface Category {
  id: string
  name: string
  emoji: string
  /** 'internal' = transferencias entre cuentas propias, excluidas de todo cálculo */
  kind: TxnKind
  order: number
  system?: boolean
}

export interface Rule {
  id: string
  /** texto en minúsculas que se busca dentro de la descripción */
  pattern: string
  categoryId: string
  /** 'seed' vienen precargadas, 'auto' se crearon al clasificar a mano */
  source: 'seed' | 'auto'
  createdAt: number
  hits: number
}

export interface Txn {
  /** hash determinista: si reimportás el mismo CSV, cae en el mismo id y no se duplica */
  id: string
  date: string // YYYY-MM-DD
  month: string // YYYY-MM
  /** Descripción limpia (el comercio), lista para mostrar */
  description: string
  /** Texto crudo del extracto, para auditar */
  rawDescription: string
  /** Importe en EUR. Negativo = sale plata. Positivo = entra. */
  amount: number
  /** Si el movimiento original era en otra moneda */
  origAmount?: number
  origCurrency?: string
  fxRate?: number
  accountId: string
  ownerId: string
  categoryId: string
  kind: TxnKind
  source: 'csv' | 'manual'
  /** true si el usuario tocó la categoría a mano (no se pisa al reimportar) */
  pinned?: boolean
  /** movimiento excluido a mano de los cálculos */
  excluded?: boolean
  /**
   * Ajuste de saldo inicial: sirve para dejar una cuenta en el número real el
   * día que empiezan a usar la app. Cuenta para el saldo del bolsillo, pero no
   * es ingreso ni gasto — no inventa plata que haya entrado ese mes.
   */
  opening?: boolean
  /**
   * Plata que sale pero que nos van a devolver: un préstamo, algo que pagamos
   * por otro. Se sigue en la pantalla "Nos deben" hasta que se salda.
   */
  loan?: { person: string; settledAt?: number; settledNote?: string }
  note?: string
  importedAt: number
  counterparty?: string
  /** Estado del extracto: pendiente, revertido, etc. */
  status?: string
}

export interface MonthPlan {
  month: string // YYYY-MM
  /** ingreso planeado por miembro: { m1: 2800, m2: 1500 } */
  incomes: Record<string, number>
  /** gasto planeado por categoría */
  budgets: Record<string, number>
  savingsGoal: number
  closedAt?: number
  note?: string
}

export interface Settings {
  members: Member[]
  accounts: Account[]
  categories: Category[]
  currency: 'EUR'
  /** crear reglas automáticamente al clasificar a mano */
  autoRules: boolean
  /**
   * Mes desde el que se mide (YYYY-MM). Todo lo anterior se guarda y sirve para
   * clasificar, pero no aparece en el tablero, el cierre ni los ahorros.
   */
  startMonth: string
  onboarded: boolean
}

export const SHARED = 'shared'
export const UNCLASSIFIED = 'sin-clasificar'
export const INTERNAL_CAT = 'transferencia-interna'
export const INCOME_CAT = 'ingreso'
