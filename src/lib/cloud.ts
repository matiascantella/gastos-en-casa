/**
 * Sincronización opcional con Firebase.
 *
 * La app funciona perfecto sin esto: los datos viven en IndexedDB. Cuando se
 * activa la nube, cada cambio se replica a Firestore y llega al otro dispositivo
 * en el momento. Firebase se carga bajo demanda para no engordar la app de quien
 * no la use.
 *
 * Modelo de datos en Firestore:
 *   hogares/{hid}                   → { miembros: [uid], creadoPor, creadoEn }
 *   hogares/{hid}/txns/{id}
 *   hogares/{hid}/plans/{month}
 *   hogares/{hid}/rules/{id}
 *   hogares/{hid}/meta/settings
 */
import type { MonthPlan, Rule, Settings, Txn } from '../types'

export interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket?: string
  messagingSenderId?: string
  appId: string
}

export interface CloudUser {
  uid: string
  name: string
  email: string
  photo?: string
}

export interface CloudState {
  /** 'restaurando' = todavía estamos viendo si había sesión guardada */
  status: 'apagado' | 'restaurando' | 'conectando' | 'conectado' | 'error'
  user?: CloudUser
  householdId?: string
  memberCount?: number
  lastSync?: number
  error?: string
  /** movimientos locales que todavía no llegaron a la nube */
  pending?: number
}

type Remote = {
  txns: Txn[]
  plans: MonthPlan[]
  rules: Rule[]
  settings?: Settings
}

export type CloudHandlers = {
  onState: (s: CloudState) => void
  onRemote: (r: Remote) => void
}

let mod: any = null
let app: any = null
let auth: any = null
let fs: any = null
/** start() puede llamarse más de una vez; Firebase solo tolera una inicialización. */
let started = false
let hid: string | null = null
let handlers: CloudHandlers | null = null
let unsubs: Array<() => void> = []

const LS_CONFIG = 'gastos.firebase.config'
const LS_HID = 'gastos.firebase.hid'

/**
 * La sincronización necesita que la app se sirva por http(s).
 * Abierta con doble clic el origen es "file://", que Firebase no puede autorizar:
 * el login con Google falla siempre.
 */
export const canSync = () => typeof location !== 'undefined' && location.protocol.startsWith('http')

export const savedConfig = (): FirebaseConfig | null => {
  try { return JSON.parse(localStorage.getItem(LS_CONFIG) || 'null') } catch { return null }
}
export const saveConfig = (c: FirebaseConfig | null) =>
  c ? localStorage.setItem(LS_CONFIG, JSON.stringify(c)) : localStorage.removeItem(LS_CONFIG)

export const savedHouseholdId = () => localStorage.getItem(LS_HID) || null
export const saveHouseholdId = (id: string | null) =>
  id ? localStorage.setItem(LS_HID, id) : localStorage.removeItem(LS_HID)

/**
 * Enlace de invitación: lleva la configuración y el código del hogar adentro,
 * para que la otra persona solo tenga que abrirlo y entrar con su Google.
 */
export function buildInviteLink(config: FirebaseConfig, householdId: string): string {
  const payload = btoa(JSON.stringify({ c: config, h: householdId }))
  return `${location.origin}${location.pathname}#unir=${payload}`
}

/**
 * Si venimos de un enlace de invitación, guarda la configuración y el hogar,
 * y limpia la dirección para que no quede el texto raro a la vista.
 */
export function consumeInviteLink(): boolean {
  try {
    const m = location.hash.match(/#unir=([A-Za-z0-9+/=]+)/)
    if (!m) return false
    const { c, h } = JSON.parse(atob(m[1]))
    if (!c?.apiKey || !c?.projectId) return false
    saveConfig(c)
    if (h) saveHouseholdId(String(h))
    history.replaceState(null, '', location.pathname + location.search)
    return true
  } catch {
    return false
  }
}

/**
 * Acepta el bloque que Firebase muestra en la consola, ya sea JSON puro o el
 * fragmento de JavaScript `const firebaseConfig = { apiKey: "...", ... }`.
 */
export function parseConfig(text: string): FirebaseConfig | null {
  const t = text.trim()
  if (!t) return null
  try {
    const direct = JSON.parse(t)
    if (direct?.apiKey && direct?.projectId) return direct
  } catch { /* seguimos con el modo JS */ }
  const m = t.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const json = m[0]
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
      .replace(/'/g, '"')
      .replace(/,(\s*[}\]])/g, '$1')
    const o = JSON.parse(json)
    if (o?.apiKey && o?.projectId && o?.appId) return o
  } catch { /* no era config válida */ }
  return null
}

async function load() {
  if (mod) return mod
  const [core, authMod, store] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore'),
  ])
  mod = { core, auth: authMod, store }
  return mod
}

let current: CloudState = { status: 'apagado' }

function emit(patch: Partial<CloudState>) {
  current = { ...current, ...patch }
  handlers?.onState(current)
}

export const cloudState = () => current

/** Arranca la conexión: inicializa Firebase y, si ya había sesión, sincroniza. */
export async function start(config: FirebaseConfig, h: CloudHandlers) {
  handlers = h
  if (!canSync()) {
    emit({ status: 'error', error: 'La sincronización necesita que la app esté publicada (http o https). Abierta como archivo suelto no funciona.' })
    return
  }
  // start() puede volver a llamarse (al repegar la configuración, por ejemplo)
  // y Firebase solo tolera una inicialización por app.
  if (started) return
  emit({ status: 'restaurando', error: undefined })
  try {
    const m = await load()
    // El authDomain se usa tal cual viene de Firebase. Es el único dominio que
    // Google tiene registrado como URI de redirección del cliente OAuth: cambiarlo
    // por el de hosting da "redirect_uri_mismatch".
    //
    // Para que el login quede además del mismo origen (y no dependa de cookies de
    // terceros), abrí la app desde https://TU-PROYECTO.firebaseapp.com — Firebase
    // Hosting sirve el mismo sitio en ese dominio y en el .web.app.
    app = m.core.getApps().length ? m.core.getApp() : m.core.initializeApp(config)

    // La persistencia se fija al CREAR la autenticación. Hacerlo después con
    // setPersistence compite con la restauración de la sesión y hacía que al
    // recargar la página te pidiera entrar de nuevo.
    // localStorage primero: sobrevive recargas y no depende de IndexedDB.
    try {
      auth = m.auth.initializeAuth(app, {
        persistence: [m.auth.browserLocalPersistence, m.auth.indexedDBLocalPersistence],
        popupRedirectResolver: m.auth.browserPopupRedirectResolver,
      })
    } catch {
      auth = m.auth.getAuth(app)
    }
    // Sin persistencia IndexedDB en Firestore: los datos ya viven en Dexie, y tener
    // dos bases IndexedDB compitiendo en la misma página rompía el login con Google.
    // initializeFirestore solo admite una llamada por app: si ya se hizo, reusamos.
    try {
      fs = m.store.initializeFirestore(app, {
        ignoreUndefinedProperties: true,
        localCache: m.store.memoryLocalCache(),
      })
    } catch {
      fs = m.store.getFirestore(app)
    }
    started = true

    // Al volver de la redirección, acá se completa el login
    m.auth.getRedirectResult(auth).catch((e: any) => {
      const c = String(e?.code ?? '')
      if (c && !c.includes('no-auth-event')) emit({ status: 'error', error: friendly(e) })
    })

    // Esperamos a saber si había sesión antes de decidir qué mostrar
    if (typeof auth.authStateReady === 'function') await auth.authStateReady()

    m.auth.onAuthStateChanged(auth, async (u: any) => {
      if (!u) { stopListeners(); emit({ status: 'apagado', user: undefined }); return }
      const user: CloudUser = { uid: u.uid, name: u.displayName || u.email || 'Usuario', email: u.email || '', photo: u.photoURL || undefined }
      emit({ status: 'conectando', user })
      try {
        await ensureHousehold(u.uid)
        await listen()
        emit({ status: 'conectado', lastSync: Date.now() })
      } catch (e: any) {
        emit({ status: 'error', error: friendly(e) })
      }
    })
  } catch (e: any) {
    emit({ status: 'error', error: friendly(e) })
  }
}

/**
 * Login por REDIRECCIÓN, nunca por ventana emergente.
 *
 * Firebase Auth cierra su base IndexedDB en cuanto la página se marca como
 * oculta (`onPageHide` -> `isHiding = true`), y a partir de ahí cualquier
 * operación falla con "Database is closing/hidden". Abrir la ventana emergente
 * del login es exactamente lo que oculta la página, así que el popup se
 * autosabotea. La redirección navega la página entera y vuelve limpia.
 */
export async function signIn() {
  if (!canSync()) throw new Error('file-protocol')
  const m = await load()
  const provider = new m.auth.GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  await m.auth.signInWithRedirect(auth, provider)
}

export async function signOutCloud() {
  const m = await load()
  stopListeners()
  hid = null
  reconciled = false
  await m.auth.signOut(auth)
  emit({ status: 'apagado', user: undefined })
}

/** Crea el hogar si no existe, o se suma al que indica el código de invitación. */
async function ensureHousehold(uid: string) {
  const m = await load()
  const { doc, getDoc, setDoc, updateDoc, arrayUnion } = m.store
  const wanted = savedHouseholdId()

  if (wanted) {
    const ref = doc(fs, 'hogares', wanted)
    const snap = await getDoc(ref)
    if (snap.exists()) {
      const data = snap.data()
      if (!(data.miembros ?? []).includes(uid)) await updateDoc(ref, { miembros: arrayUnion(uid) })
      hid = wanted
      emit({ householdId: hid, memberCount: ((data.miembros ?? []).includes(uid) ? data.miembros.length : data.miembros.length + 1) })
      return
    }
  }

  // propio: el id es el uid, así siempre podés volver a entrar
  const ref = doc(fs, 'hogares', uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    await setDoc(ref, { miembros: [uid], creadoPor: uid, creadoEn: Date.now() })
    hid = uid
    emit({ householdId: hid, memberCount: 1 })
  } else {
    hid = uid
    emit({ householdId: hid, memberCount: (snap.data().miembros ?? []).length })
  }
  saveHouseholdId(hid)
}

function stopListeners() {
  unsubs.forEach((u) => { try { u() } catch { /* ya estaba cerrado */ } })
  unsubs = []
}

async function listen() {
  const m = await load()
  const { collection, doc, onSnapshot } = m.store
  stopListeners()
  if (!hid) return
  const base = ['hogares', hid]

  const push = (r: Partial<Remote>) => { handlers?.onRemote({ txns: [], plans: [], rules: [], ...r }); emit({ lastSync: Date.now() }) }

  unsubs.push(onSnapshot(collection(fs, ...base, 'txns'), (s: any) =>
    push({ txns: s.docs.map((d: any) => d.data() as Txn) })))
  unsubs.push(onSnapshot(collection(fs, ...base, 'plans'), (s: any) =>
    push({ plans: s.docs.map((d: any) => d.data() as MonthPlan) })))
  unsubs.push(onSnapshot(collection(fs, ...base, 'rules'), (s: any) =>
    push({ rules: s.docs.map((d: any) => d.data() as Rule) })))
  unsubs.push(onSnapshot(doc(fs, ...base, 'meta', 'settings'), (s: any) => {
    if (s.exists()) push({ settings: s.data() as Settings })
  }))
}

const ready = () => !!(fs && hid)

/**
 * Sube documentos en lotes (Firestore acepta 500 operaciones por lote).
 * Si algo falla, se avisa: antes se perdía en silencio y los datos se quedaban
 * en un solo dispositivo sin que nadie se enterara.
 */
export async function pushDocs(kind: 'txns' | 'plans' | 'rules', items: Array<Txn | MonthPlan | Rule>) {
  if (!ready() || !items.length) return
  const m = await load()
  const { writeBatch, doc } = m.store
  try {
    for (let i = 0; i < items.length; i += 400) {
      const batch = writeBatch(fs)
      for (const it of items.slice(i, i + 400)) {
        const id = (it as any).id ?? (it as any).month
        batch.set(doc(fs, 'hogares', hid!, kind, String(id)), JSON.parse(JSON.stringify(it)))
      }
      await batch.commit()
    }
    emit({ lastSync: Date.now(), error: undefined })
  } catch (e: any) {
    emit({ status: 'error', error: `No pude subir los cambios: ${friendly(e)}` })
    throw e
  }
}

/**
 * Reconciliación automática al conectar: compara lo que hay en este dispositivo
 * contra lo que llegó de la nube y sube lo que falte. Se hace una sola vez por
 * sesión, apenas llega la primera foto de los datos remotos.
 *
 * Esto es lo que hace que no haga falta acordarse de apretar "Subir todo":
 * si algo se importó estando desconectado, o una subida falló, se arregla solo.
 */
let reconciled = false
export function needsReconcile() { return ready() && !reconciled }
export function markReconciled() { reconciled = true }

export async function deleteDocs(kind: 'txns' | 'plans' | 'rules', ids: string[]) {
  if (!ready() || !ids.length) return
  const m = await load()
  const { writeBatch, doc } = m.store
  for (let i = 0; i < ids.length; i += 400) {
    const batch = writeBatch(fs)
    for (const id of ids.slice(i, i + 400)) batch.delete(doc(fs, 'hogares', hid!, kind, id))
    await batch.commit()
  }
}

export async function pushSettings(s: Settings) {
  if (!ready()) return
  const m = await load()
  await m.store.setDoc(m.store.doc(fs, 'hogares', hid!, 'meta', 'settings'), JSON.parse(JSON.stringify(s)))
}

/** Primera sincronización: manda todo lo que hay en este dispositivo. */
export async function pushEverything(data: { txns: Txn[]; plans: MonthPlan[]; rules: Rule[]; settings: Settings }) {
  await pushDocs('txns', data.txns)
  await pushDocs('plans', data.plans)
  await pushDocs('rules', data.rules)
  await pushSettings(data.settings)
  emit({ lastSync: Date.now() })
}

function friendly(e: any): string {
  const c = String(e?.code ?? e?.message ?? e)
  if (c.includes('file-protocol')) return 'La sincronización necesita que la app esté publicada. Abierta como archivo suelto, Google no permite el login.'
  if (/closing|hidden|IndexedDB|indexeddb/i.test(c) && !canSync()) {
    return 'Estás abriendo la app como archivo suelto (file://). Google no permite el login así: hay que publicarla primero.'
  }
  if (c.includes('permission-denied')) return 'Firestore rechazó la conexión. Revisá que hayas publicado las reglas de seguridad de la guía.'
  if (c.includes('auth/unauthorized-domain')) return `El dominio ${typeof location !== 'undefined' ? location.hostname : ''} no está autorizado. Agregalo en Firebase → Authentication → Settings → Authorized domains.`
  if (c.includes('auth/operation-not-supported')) return 'El navegador bloqueó el login. Probá en Chrome, o desactivá el bloqueo de cookies para este sitio.'
  if (c.includes('auth/operation-not-allowed')) return 'Falta activar el proveedor Google en Firebase → Authentication → Sign-in method.'
  if (c.includes('api-key-not-valid') || c.includes('invalid-api-key')) return 'La configuración de Firebase no es válida. Copiala de nuevo desde la consola.'
  if (c.includes('unavailable')) return 'Sin conexión con Firebase. La app sigue funcionando en modo local.'
  if (c.includes('failed-precondition')) {
    return 'Firestore rechazó el arranque. Verificá en Firebase → Firestore Database que la base exista y esté en modo nativo (no Datastore).'
  }
  const detail = e?.message && e.message !== c ? ` — ${e.message}` : ''
  return `No pude conectar: ${c}${detail}`
}
