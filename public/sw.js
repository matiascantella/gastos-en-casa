// Service worker mínimo: la app queda disponible sin conexión.
// Los datos viven en IndexedDB, así que offline funciona todo salvo la sincronización.
const CACHE = 'gastos-v6'

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest'])).catch(() => {}))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // navegación: red primero, cache como respaldo (para que una versión nueva se vea enseguida)
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((r) => { caches.open(CACHE).then((c) => c.put('./index.html', r.clone())); return r })
        .catch(() => caches.match('./index.html').then((r) => r || fetch(req))),
    )
    return
  }

  // assets: cache primero
  e.respondWith(
    caches.match(req).then((hit) =>
      hit || fetch(req).then((r) => {
        if (r.ok) caches.open(CACHE).then((c) => c.put(req, r.clone()))
        return r
      }),
    ),
  )
})
