import Papa from 'papaparse'
import type { Bank } from '../types'
import { cleanDescription, fixMojibake, norm } from './text'

export interface ParsedRow {
  date: string // YYYY-MM-DD
  description: string
  rawDescription: string
  amount: number // EUR, con signo. Negativo = sale plata.
  origAmount?: number
  origCurrency?: string
  fxRate?: number
  /** true si no pudimos convertir a EUR con datos del propio archivo */
  fxEstimated?: boolean
  counterparty?: string
  counterpartyIban?: string
  accountIban?: string
  externalRef?: string
  status?: string
  bankCategory?: string
  /** el parser ya sabe que es un movimiento interno (ej. "Dinero añadido") */
  internalHint?: boolean
  /** el extracto dice explícitamente que es una devolución */
  refundHint?: boolean
  /** nombre del titular según el archivo, para adivinar de quién es la cuenta */
  ownerHint?: string
  skip?: boolean
  skipReason?: string
}

export interface ParseResult {
  bank: Bank
  rows: ParsedRow[]
  accountIbans: string[]
  ownerHints: string[]
  warnings: string[]
}

// ── helpers ─────────────────────────────────────────────────────────────────

function stripBom(s: string) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

function readCsv(text: string): Record<string, string>[] {
  const clean = stripBom(text)
  const res = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => fixMojibake(stripBom(h)).trim(),
  })
  return res.data.filter((r) => Object.values(r).some((v) => (v ?? '').toString().trim() !== ''))
}

/** Busca una columna por cualquiera de sus nombres posibles (ES/EN), sin distinguir acentos. */
function pick(row: Record<string, string>, keyIndex: Map<string, string>, ...names: string[]): string {
  for (const n of names) {
    const real = keyIndex.get(norm(n))
    if (real !== undefined) {
      const v = row[real]
      if (v !== undefined && v !== null) return fixMojibake(String(v)).trim()
    }
  }
  return ''
}

function indexKeys(rows: Record<string, string>[]): Map<string, string> {
  const m = new Map<string, string>()
  if (!rows.length) return m
  for (const k of Object.keys(rows[0])) m.set(norm(k), k)
  return m
}

function num(s: string): number {
  if (!s) return 0
  // "1 234,56" / "1,234.56" / "-139.42"
  let t = s.replace(/\s| /g, '')
  if (/,\d{1,2}$/.test(t) && !/\.\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
  else t = t.replace(/,/g, '')
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : 0
}

function toDate(s: string): string {
  if (!s) return ''
  const t = s.trim()
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  const d = new Date(t)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return ''
}

// ── detección de banco ──────────────────────────────────────────────────────

export function detectBank(headers: string[]): Bank {
  const h = headers.map(norm)
  const has = (...names: string[]) => names.some((n) => h.includes(norm(n)))
  // Swedbank primero: comparte la columna de cuenta con LHV, pero es el único
  // que trae "Reatüüp" (tipo de fila), porque mezcla saldos con movimientos.
  if (has('Reatüüp', 'Reatuup', 'Row type', 'Rindas tips', 'Eilutės tipas')) return 'swedbank'
  if (has('Customer account no', 'Kliendi konto', 'Kliendi konto nr')) return 'lhv'
  if (has('Identificador de la transferencia', 'TransferWise ID', 'Wise ID', 'ID de Wise')) return 'wise'
  if (has('Tipo', 'Type') && has('Producto', 'Product') && has('Saldo', 'Balance')) return 'revolut'
  return 'otro'
}

// ── LHV ─────────────────────────────────────────────────────────────────────

function parseLhv(rows: Record<string, string>[]): ParseResult {
  const K = indexKeys(rows)
  const out: ParsedRow[] = []
  const ibans = new Set<string>()
  const warnings: string[] = []

  for (const r of rows) {
    const accountIban = pick(r, K, 'Customer account no', 'Kliendi konto')
    const date = toDate(pick(r, K, 'Date', 'Kuupäev'))
    if (!date) continue
    const dc = pick(r, K, 'Debit/Credit (D/C)', 'Deebet/Kreedit (D/C)').toUpperCase()
    let amount = num(pick(r, K, 'Amount', 'Summa'))
    // LHV ya trae el signo, pero por si acaso lo forzamos con la columna D/C
    if (dc === 'D' && amount > 0) amount = -amount
    if (dc === 'C' && amount < 0) amount = -amount
    const currency = (pick(r, K, 'Currency', 'Valuuta') || 'EUR').toUpperCase()
    const name = pick(r, K, 'Sender/receiver name', 'Saaja/maksja nimi')
    const rawDesc = pick(r, K, 'Description', 'Selgitus')
    const description = name || cleanDescription(rawDesc) || 'Movimiento'

    if (currency !== 'EUR') warnings.push(`LHV: movimiento en ${currency} el ${date} — se importó sin convertir`)
    if (accountIban) ibans.add(accountIban)

    out.push({
      date,
      description,
      rawDescription: rawDesc || description,
      amount,
      refundHint: amount > 0 && /\b(refund|tagastus|reembolso|devoluci)/i.test(`${rawDesc} ${pick(r, K, 'Document no', 'Dokumendi nr')}`),
      counterparty: name,
      counterpartyIban: pick(r, K, 'Sender/receiver account', 'Saaja/maksja konto'),
      accountIban,
      externalRef:
        pick(r, K, 'Account servicer reference') ||
        pick(r, K, 'Transaction reference') ||
        pick(r, K, 'Archiving code'),
    })
  }
  return { bank: 'lhv', rows: out, accountIbans: [...ibans], ownerHints: [], warnings }
}

// ── Swedbank ────────────────────────────────────────────────────────────────

/**
 * Swedbank (Báltico) exporta con punto y coma y mezcla saldos con movimientos:
 * la columna "Reatüüp" marca 10 = saldo inicial, 20 = movimiento, 82 = totales,
 * 86 = saldo final. Solo nos quedamos con las filas 20.
 *
 * El importe viene sin signo; el signo lo da la columna Deebet/Kreedit, que
 * según el idioma del extracto usa D/K (estonio) o D/C (inglés).
 */
function parseSwedbank(rows: Record<string, string>[]): ParseResult {
  const K = indexKeys(rows)
  const out: ParsedRow[] = []
  const ibans = new Set<string>()
  const warnings: string[] = []

  for (const r of rows) {
    const tipoFila = pick(r, K, 'Reatüüp', 'Reatuup', 'Row type', 'Rindas tips', 'Eilutės tipas').trim()
    // 20 es el movimiento; el resto son líneas de saldo y totales
    if (tipoFila && tipoFila !== '20') continue

    const date = toDate(pick(r, K, 'Kuupäev', 'Kuupaev', 'Date', 'Datums', 'Data'))
    if (!date) continue

    const accountIban = pick(r, K, 'Kliendi konto', 'Customer account no', 'Klienta konts', 'Kliento sąskaita')
    const dc = pick(r, K, 'Deebet/Kreedit', 'Deebet/Kreedit (D/K)', 'Debit/Credit', 'Debets/Kredīts', 'Debetas/Kreditas')
      .trim().toUpperCase().slice(0, 1)

    let amount = Math.abs(num(pick(r, K, 'Summa', 'Amount', 'Suma')))
    // D = débito (sale). K en estonio y letón, C en inglés = crédito (entra).
    if (dc === 'D') amount = -amount
    else if (dc !== 'K' && dc !== 'C') {
      // sin columna de signo, confiamos en el signo del propio importe
      amount = num(pick(r, K, 'Summa', 'Amount', 'Suma'))
    }
    if (amount === 0) continue

    const currency = (pick(r, K, 'Valuuta', 'Currency', 'Valūta', 'Valiuta') || 'EUR').toUpperCase()
    const name = pick(r, K, 'Saaja/Maksja', 'Saaja/maksja nimi', 'Beneficiary/Payer', 'Saņēmējs/Maksātājs')
    const rawDesc = pick(r, K, 'Selgitus', 'Details', 'Description', 'Maksājuma mērķis', 'Paskirtis')
    const description = name || cleanDescription(rawDesc) || 'Movimiento'

    if (currency !== 'EUR') warnings.push(`Swedbank: movimiento en ${currency} el ${date} — se importó sin convertir`)
    if (accountIban) ibans.add(accountIban)

    out.push({
      date,
      description,
      rawDescription: rawDesc || description,
      amount,
      refundHint: amount > 0 && /\b(refund|tagastus|reembolso|devoluci)/i.test(rawDesc),
      counterparty: name,
      counterpartyIban: pick(r, K, 'Saaja/Maksja konto', 'Beneficiary/Payer account', 'Saaja/maksja konto'),
      accountIban,
      externalRef:
        pick(r, K, 'Arhiveerimistunnus', 'Archiving code') ||
        pick(r, K, 'Dokumendi number', 'Document number') ||
        pick(r, K, 'Viitenumber', 'Reference number'),
    })
  }
  return { bank: 'swedbank', rows: out, accountIbans: [...ibans], ownerHints: [], warnings }
}

// ── Wise ────────────────────────────────────────────────────────────────────

function parseWise(rows: Record<string, string>[]): ParseResult {
  const K = indexKeys(rows)
  const warnings: string[] = []

  type Raw = {
    id: string
    status: string
    dir: string
    date: string
    srcName: string
    srcAmt: number
    srcCur: string
    tgtName: string
    tgtAmt: number
    tgtCur: string
    rate: number
    ref: string
    cat: string
    fee: number
    feeCur: string
  }

  const raws: Raw[] = rows.map((r) => ({
    id: pick(r, K, 'Identificador de la transferencia', 'TransferWise ID', 'ID'),
    status: pick(r, K, 'Estado', 'Status').toUpperCase(),
    dir: pick(r, K, 'Dirección', 'Direction').toUpperCase(),
    date: toDate(pick(r, K, 'Terminada el', 'Finished on') || pick(r, K, 'Creada el', 'Created on')),
    srcName: pick(r, K, 'Nombre de origen', 'Source name'),
    srcAmt: num(pick(r, K, 'Cantidad de origen (tras comisiones)', 'Source amount (after fees)')),
    srcCur: pick(r, K, 'Moneda de origen', 'Source currency').toUpperCase(),
    tgtName: pick(r, K, 'Nombre del destinatario', 'Target name'),
    tgtAmt: num(pick(r, K, 'Cantidad de destino (tras comisiones)', 'Target amount (after fees)')),
    tgtCur: pick(r, K, 'Moneda de destino', 'Target currency').toUpperCase(),
    rate: num(pick(r, K, 'Tipo de cambio', 'Exchange rate')),
    ref: pick(r, K, 'Referencia', 'Reference'),
    cat: pick(r, K, 'Categoría', 'Category'),
    fee: num(pick(r, K, 'Importe de la comisión de origen', 'Source fee amount')),
    feeCur: pick(r, K, 'Moneda de la comisión de origen', 'Source fee currency').toUpperCase(),
  }))

  // Tabla de cambio a EUR construida con los propios datos del archivo:
  // toda fila que cruza una moneda contra EUR nos da una cotización real y fechada.
  const fxTable = new Map<string, Array<{ date: string; rate: number }>>()
  const addRate = (cur: string, date: string, rate: number) => {
    if (!cur || cur === 'EUR' || !date || !Number.isFinite(rate) || rate <= 0) return
    if (!fxTable.has(cur)) fxTable.set(cur, [])
    fxTable.get(cur)!.push({ date, rate })
  }
  for (const r of raws) {
    if (r.srcCur !== 'EUR' && r.tgtCur === 'EUR' && r.srcAmt > 0) addRate(r.srcCur, r.date, r.tgtAmt / r.srcAmt)
    if (r.srcCur === 'EUR' && r.tgtCur !== 'EUR' && r.tgtAmt > 0) addRate(r.tgtCur, r.date, r.srcAmt / r.tgtAmt)
  }
  for (const list of fxTable.values()) list.sort((a, b) => a.date.localeCompare(b.date))

  const rateFor = (cur: string, date: string): number | null => {
    const list = fxTable.get(cur)
    if (!list || !list.length) return null
    let best = list[0]
    let bestGap = Infinity
    for (const e of list) {
      const gap = Math.abs(new Date(e.date).getTime() - new Date(date).getTime())
      if (gap < bestGap) { bestGap = gap; best = e }
    }
    return best.rate
  }

  const out: ParsedRow[] = []
  const ownerHints = new Map<string, number>()

  for (const r of raws) {
    if (!r.date) continue
    const isOut = r.dir === 'OUT'
    const isIn = r.dir === 'IN'
    if (!isOut && !isIn) continue // NEUTRAL: conversiones internas de saldo, se ignoran

    // Lado que representa el movimiento en NUESTRA cuenta
    const myAmt = isOut ? r.srcAmt : r.tgtAmt
    const myCur = isOut ? r.srcCur : r.tgtCur
    const other = isOut ? r.tgtName : r.srcName
    const holder = isOut ? r.srcName : r.tgtName
    if (holder) ownerHints.set(holder, (ownerHints.get(holder) ?? 0) + 1)

    let eur = myAmt
    let origAmount: number | undefined
    let origCurrency: string | undefined
    let fxRate: number | undefined
    let fxEstimated = false

    if (myCur !== 'EUR') {
      origAmount = myAmt
      origCurrency = myCur
      // Si el otro lado es EUR, Wise ya nos dio el importe exacto en euros
      const otherAmt = isOut ? r.tgtAmt : r.srcAmt
      const otherCur = isOut ? r.tgtCur : r.srcCur
      if (otherCur === 'EUR' && otherAmt > 0) {
        eur = otherAmt
        fxRate = otherAmt / myAmt
      } else {
        const rate = rateFor(myCur, r.date)
        if (rate) { eur = myAmt * rate; fxRate = rate; fxEstimated = true }
        else {
          eur = myAmt
          fxEstimated = true
          warnings.push(`Wise: no encontré cotización de ${myCur} el ${r.date} — se importó al valor nominal`)
        }
      }
    }

    let amount = isOut ? -Math.abs(eur) : Math.abs(eur)
    // La comisión de Wise sale de nuestro bolsillo
    if (isOut && r.fee > 0 && r.feeCur === 'EUR') amount -= r.fee

    const refunded = r.status === 'REFUNDED' || r.status === 'REEMBOLSADO'
    const cancelled = ['CANCELLED', 'CANCELADO', 'FAILED'].includes(r.status)

    out.push({
      date: r.date,
      description: other || r.ref || 'Movimiento Wise',
      rawDescription: [other, r.ref].filter(Boolean).join(' · ') || 'Movimiento Wise',
      amount,
      origAmount,
      origCurrency,
      fxRate,
      fxEstimated,
      counterparty: other,
      externalRef: r.id,
      status: r.status,
      bankCategory: r.cat,
      ownerHint: holder,
      internalHint: norm(r.cat) === 'dinero anadido',
      skip: cancelled,
      skipReason: cancelled ? 'cancelado' : refunded ? 'reembolsado' : undefined,
    })
  }

  const hints = [...ownerHints.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0])
  return { bank: 'wise', rows: out, accountIbans: [], ownerHints: hints.slice(0, 3), warnings }
}

// ── Revolut ─────────────────────────────────────────────────────────────────

function parseRevolut(rows: Record<string, string>[]): ParseResult {
  const K = indexKeys(rows)
  const out: ParsedRow[] = []
  const warnings: string[] = []

  for (const r of rows) {
    const state = pick(r, K, 'Estado', 'State').toUpperCase()
    const started = pick(r, K, 'Fecha de inicio', 'Started Date')
    const completed = pick(r, K, 'Fecha de finalización', 'Completed Date')
    const date = toDate(completed || started)
    if (!date) continue

    const reverted = ['REVERTIDO', 'REVERTED', 'DECLINED', 'RECHAZADO'].includes(state)
    const pending = ['PENDIENTE', 'PENDING'].includes(state)

    const cur = (pick(r, K, 'Divisa', 'Currency') || 'EUR').toUpperCase()
    const amt = num(pick(r, K, 'Importe', 'Amount'))
    const fee = num(pick(r, K, 'Comisión', 'Fee'))
    const desc = pick(r, K, 'Descripción', 'Description') || 'Movimiento Revolut'
    const tipo = pick(r, K, 'Tipo', 'Type')

    if (cur !== 'EUR') warnings.push(`Revolut: movimiento en ${cur} el ${date} — se importó sin convertir`)

    out.push({
      date,
      description: desc,
      rawDescription: `${tipo} · ${desc}`,
      amount: amt - Math.abs(fee),
      counterparty: desc,
      externalRef: `${started}|${desc}|${amt}`,
      status: state,
      skip: reverted,
      skipReason: reverted ? 'revertido' : pending ? 'pendiente' : undefined,
      internalHint: /^(dep[oó]sito|deposit|top-?up)$/i.test(tipo.trim()),
      refundHint: /reembolso|refund|cashback/i.test(tipo),
    })
  }
  return { bank: 'revolut', rows: out, accountIbans: [], ownerHints: [], warnings }
}

// ── genérico ────────────────────────────────────────────────────────────────

function parseGeneric(rows: Record<string, string>[]): ParseResult {
  const K = indexKeys(rows)
  const out: ParsedRow[] = []
  for (const r of rows) {
    const date = toDate(pick(r, K, 'date', 'fecha', 'Fecha', 'Date', 'Kuupäev'))
    if (!date) continue
    const amount = num(pick(r, K, 'amount', 'importe', 'monto', 'summa', 'Amount', 'Importe'))
    const desc = pick(r, K, 'description', 'descripcion', 'descripción', 'concepto', 'detalle', 'Description') || 'Movimiento'
    out.push({ date, description: desc, rawDescription: desc, amount })
  }
  return { bank: 'otro', rows: out, accountIbans: [], ownerHints: [], warnings: [] }
}

// ── entrada pública ─────────────────────────────────────────────────────────

export function parseStatement(text: string): ParseResult {
  const rows = readCsv(text)
  if (!rows.length) return { bank: 'otro', rows: [], accountIbans: [], ownerHints: [], warnings: ['El archivo está vacío'] }
  const bank = detectBank(Object.keys(rows[0]))
  switch (bank) {
    case 'lhv': return parseLhv(rows)
    case 'swedbank': return parseSwedbank(rows)
    case 'wise': return parseWise(rows)
    case 'revolut': return parseRevolut(rows)
    default: return parseGeneric(rows)
  }
}

export const BANK_LABEL: Record<Bank, string> = {
  lhv: 'LHV',
  swedbank: 'Swedbank',
  wise: 'Wise',
  revolut: 'Revolut',
  otro: 'Otro banco',
}
