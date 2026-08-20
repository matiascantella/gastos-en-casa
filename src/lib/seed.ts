import type { Category, Rule, Member, Account, Settings } from '../types'
import { INCOME_CAT, INTERNAL_CAT, UNCLASSIFIED } from '../types'
import { ruleText } from './classify'

export const CATEGORIES: Category[] = [
  { id: 'vivienda', name: 'Vivienda', emoji: '🏠', kind: 'expense', order: 1 },
  { id: 'servicios', name: 'Servicios', emoji: '💡', kind: 'expense', order: 2 },
  { id: 'supermercado', name: 'Supermercado', emoji: '🛒', kind: 'expense', order: 3 },
  { id: 'restaurantes', name: 'Restaurantes y cafés', emoji: '🍽️', kind: 'expense', order: 4 },
  { id: 'transporte', name: 'Transporte', emoji: '🚕', kind: 'expense', order: 5 },
  { id: 'gasolina', name: 'Gasolina', emoji: '⛽', kind: 'expense', order: 5.4 },
  { id: 'auto', name: 'Auto — cuota', emoji: '🚗', kind: 'expense', order: 5.6 },
  { id: 'salud', name: 'Salud', emoji: '🩺', kind: 'expense', order: 6 },
  { id: 'hogar', name: 'Hogar y muebles', emoji: '🛋️', kind: 'expense', order: 7 },
  { id: 'ropa', name: 'Ropa', emoji: '👕', kind: 'expense', order: 8 },
  { id: 'ocio', name: 'Ocio y deporte', emoji: '🎾', kind: 'expense', order: 9 },
  { id: 'suscripciones', name: 'Suscripciones', emoji: '📱', kind: 'expense', order: 10 },
  { id: 'compras', name: 'Compras online', emoji: '📦', kind: 'expense', order: 11 },
  { id: 'viajes', name: 'Viajes', emoji: '✈️', kind: 'expense', order: 12 },
  { id: 'familia', name: 'Familia y envíos', emoji: '💛', kind: 'expense', order: 13 },
  { id: 'seguros', name: 'Seguros', emoji: '🛡️', kind: 'expense', order: 14 },
  { id: 'tarjeta', name: 'Tarjeta de crédito', emoji: '💳', kind: 'expense', order: 15 },
  { id: 'bancos', name: 'Bancos e impuestos', emoji: '🏦', kind: 'expense', order: 16 },
  { id: 'educacion', name: 'Educación', emoji: '📚', kind: 'expense', order: 17 },
  { id: 'regalos', name: 'Regalos', emoji: '🎁', kind: 'expense', order: 18 },
  { id: 'otros', name: 'Otros', emoji: '▫️', kind: 'expense', order: 19 },
  { id: UNCLASSIFIED, name: 'Sin clasificar', emoji: '❓', kind: 'expense', order: 99, system: true },
  { id: INCOME_CAT, name: 'Ingreso', emoji: '💰', kind: 'income', order: 100, system: true },
  { id: INTERNAL_CAT, name: 'Movimiento interno', emoji: '🔄', kind: 'internal', order: 101, system: true },
]

/**
 * Reglas precargadas. Se comparan en minúsculas contra la descripción.
 * Al hacer match gana el patrón MÁS LARGO, así "bolt food" (restaurantes)
 * le gana a "bolt" (transporte).
 */
const SEED: Array<[string, string]> = [
  // Supermercado
  ['rimi', 'supermercado'], ['selver', 'supermercado'], ['maxima', 'supermercado'],
  ['prisma', 'supermercado'], ['eprisma', 'supermercado'], ['coop', 'supermercado'], ['barbora', 'supermercado'],
  ['lidl', 'supermercado'], ['grocery', 'supermercado'], ['bolt market', 'supermercado'],
  ['la tienda latino', 'supermercado'], ['sanitex', 'supermercado'], ['kaubamaja', 'supermercado'],
  ['redners', 'supermercado'], ['stockmann', 'supermercado'], ['sirbi', 'supermercado'],
  // Restaurantes, cafés y panaderías
  ['wolt', 'restaurantes'], ['bolt food', 'restaurantes'], ['saiapaik', 'restaurantes'],
  ['karjase sai', 'restaurantes'], ['kiosk', 'restaurantes'], ['kopli', 'restaurantes'],
  ['sahvrihiir', 'restaurantes'], ['pagarikoda', 'restaurantes'], ['bakehouse', 'restaurantes'],
  ['lido', 'restaurantes'], ['burger king', 'restaurantes'], ['mcdonald', 'restaurantes'],
  ['kohvik', 'restaurantes'], ['restoran', 'restaurantes'], ['resto', 'restaurantes'],
  ['pizza', 'restaurantes'], ['coffee', 'restaurantes'], ['kafe', 'restaurantes'],
  ['crustum', 'restaurantes'], ['tokumaru', 'restaurantes'], ['guru', 'restaurantes'],
  ['loco rolls', 'restaurantes'], ['bubblebirds', 'restaurantes'], ['samsa', 'restaurantes'],
  ['fika', 'restaurantes'], ['f-hoone', 'restaurantes'], ['veg machine', 'restaurantes'],
  ['nop pood', 'restaurantes'], ['amijami', 'restaurantes'], ['duff puhangu', 'restaurantes'],
  ['charlot', 'restaurantes'], ['kooker', 'restaurantes'], ['luchador', 'restaurantes'],
  ['fat greek', 'restaurantes'], ['jautrais ledus', 'restaurantes'], ['paris pagar', 'restaurantes'],
  ['päris pagar', 'restaurantes'], ['r-kiosk', 'restaurantes'], ['bolt.eu/f', 'restaurantes'],
  ['starbucks', 'restaurantes'], ['subway', 'restaurantes'], ['sushi', 'restaurantes'],
  // Transporte
  ['bolt.eu/r', 'transporte'], ['bolt', 'transporte'], ['uber', 'transporte'],
  ['taxi', 'transporte'], ['pilet', 'transporte'], ['elron', 'transporte'],
  ['tallink', 'transporte'], ['parkimine', 'transporte'], ['paygo', 'transporte'],
  ['bolt drive', 'transporte'], ['citybee', 'transporte'],
  // Gasolina: las estaciones de servicio salen de Transporte para poder verlas
  // aparte ahora que hay auto propio.
  ['neste', 'gasolina'], ['circle k', 'gasolina'], ['olerex', 'gasolina'],
  ['alexela', 'gasolina'], ['terminal oil', 'gasolina'], ['euro oil', 'gasolina'],
  ['jetoil', 'gasolina'], ['statoil', 'gasolina'], ['shell', 'gasolina'],
  ['gasolina', 'gasolina'], ['kutus', 'gasolina'], ['kütus', 'gasolina'],
  ['tankla', 'gasolina'], ['bensiin', 'gasolina'],
  // Auto: la cuota del crédito o del leasing. El préstamo de la casa ya tiene su
  // propia regla ("home loan"), así que no se pisan.
  ['car loan', 'auto'], ['auto loan', 'auto'], ['autolaen', 'auto'],
  ['liising', 'auto'], ['liisingu', 'auto'], ['autoliising', 'auto'],
  ['leasing', 'auto'], ['toyota', 'auto'], ['sixt leasing', 'auto'],
  ['vehicle loan', 'auto'],
  // Servicios
  ['tele2', 'servicios'], ['telia', 'servicios'], ['elisa', 'servicios'],
  ['elektrilevi', 'servicios'], ['eesti energia', 'servicios'], ['imatra', 'servicios'],
  ['tallinna vesi', 'servicios'], ['utilitas', 'servicios'], ['adven', 'servicios'],
  ['starman', 'servicios'],
  // Vivienda
  ['home loan', 'vivienda'], ['korteriühistu', 'vivienda'], ['korteriuhistu', 'vivienda'],
  ['hüpoteek', 'vivienda'], ['üür', 'vivienda'], ['rent', 'vivienda'], ['alquiler', 'vivienda'],
  // Suscripciones
  ['youtubepremium', 'suscripciones'], ['youtube premium', 'suscripciones'],
  ['google play', 'suscripciones'], ['apple.com/bill', 'suscripciones'],
  ['netflix', 'suscripciones'], ['spotify', 'suscripciones'], ['anthropic', 'suscripciones'],
  ['claude', 'suscripciones'], ['cursor', 'suscripciones'], ['openai', 'suscripciones'],
  ['chatgpt', 'suscripciones'], ['github', 'suscripciones'], ['icloud', 'suscripciones'],
  ['disney', 'suscripciones'], ['hbo', 'suscripciones'], ['patreon', 'suscripciones'],
  ['microsoft', 'suscripciones'], ['adobe', 'suscripciones'],
  // Compras online
  ['amazon', 'compras'], ['aliexpress', 'compras'], ['ebay', 'compras'],
  ['temu', 'compras'], ['shein', 'compras'], ['etsy', 'compras'],
  // Hogar
  ['ikea', 'hogar'], ['k-rauta', 'hogar'], ['bauhaus', 'hogar'], ['espak', 'hogar'],
  ['depo', 'hogar'], ['jysk', 'hogar'], ['pepco', 'hogar'], ['runikon retail', 'hogar'],
  ['puukeskus', 'hogar'], ['bricomart', 'hogar'],
  // Ropa
  ['boozt', 'ropa'], ['zara', 'ropa'], ['h&m', 'ropa'], ['reserved', 'ropa'],
  ['deichmann', 'ropa'], ['sportland', 'ropa'], ['decathlon', 'ropa'],
  // Salud
  ['apteek', 'salud'], ['apotheka', 'salud'], ['benu', 'salud'], ['meliva', 'salud'],
  ['synlab', 'salud'], ['confido', 'salud'], ['medicum', 'salud'], ['qvalitas', 'salud'],
  ['sunnitusma', 'salud'], ['sünnitusma', 'salud'], ['hambaravi', 'salud'], ['dental', 'salud'],
  ['farmacia', 'salud'], ['clinic', 'salud'],
  // Ocio y deporte
  ['playtomic', 'ocio'], ['apollo kino', 'ocio'], ['fienta', 'ocio'], ['padel', 'ocio'],
  ['myfitness', 'ocio'], ['my fitness', 'ocio'], ['gym', 'ocio'], ['kino', 'ocio'], ['teater', 'ocio'],
  ['piletilevi', 'ocio'], ['fahrenheit', 'ocio'],
  // Viajes
  ['hotell', 'viajes'], ['hotel', 'viajes'], ['booking.com', 'viajes'], ['airbnb', 'viajes'],
  ['ryanair', 'viajes'], ['airbaltic', 'viajes'], ['wizz', 'viajes'], ['lufthansa', 'viajes'],
  ['finnair', 'viajes'], ['lux express', 'viajes'], ['omniva', 'viajes'],
  // Seguros
  ['kindlustus', 'seguros'], ['if p&c', 'seguros'], ['ergo', 'seguros'], ['seguro', 'seguros'],
  // Tarjeta de crédito: el pago del resumen es el gasto, porque las compras de la
  // tarjeta nunca entran a la app (no importamos el extracto de la tarjeta).
  ['credit repayment', 'tarjeta'], ['card repayment', 'tarjeta'],
  ['krediidi tagasimakse', 'tarjeta'], ['krediitkaart', 'tarjeta'],
  ['krediitkaardi', 'tarjeta'], ['pago de tarjeta', 'tarjeta'],
  ['credit card payment', 'tarjeta'], ['tarjeta de credito', 'tarjeta'],
  ['krediitkaardi arve', 'tarjeta'], ['kaardi arve', 'tarjeta'],
  ['kaardimakse tagasimakse', 'tarjeta'], ['card invoice', 'tarjeta'],
  // Bancos e impuestos
  ['monthly fee', 'bancos'], ['kuutasu', 'bancos'], ['teenustasu', 'bancos'],
  ['maksu- ja tolliamet', 'bancos'], ['service fee', 'bancos'], ['comisión', 'bancos'],
  // Ocio/otros conocidos
  ['sumup', 'otros'], ['farmani group', 'otros'],
]

export const RULES: Rule[] = SEED.map(([pattern, categoryId], i) => ({
  id: `seed-${i}`,
  // los patrones se guardan ya normalizados: "apple.com/bill" -> "apple com bill",
  // que es contra lo que se compara la descripción
  pattern: ruleText(pattern),
  categoryId,
  source: 'seed' as const,
  createdAt: 0,
  hits: 0,
})).filter((r) => r.pattern.length >= 2)

export const DEFAULT_MEMBERS: Member[] = [
  { id: 'm1', name: 'Persona 1', aliases: [], color: '#2a78d6' },
  { id: 'm2', name: 'Persona 2', aliases: [], color: '#eb6834' },
]

export const DEFAULT_ACCOUNTS: Account[] = []

const thisMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const defaultSettings = (): Settings => ({
  members: DEFAULT_MEMBERS,
  accounts: DEFAULT_ACCOUNTS,
  categories: CATEGORIES,
  currency: 'EUR',
  autoRules: true,
  startMonth: thisMonth(),
  onboarded: false,
})
