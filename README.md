# Gastos en casa

**Control de gastos y ahorro para dos.** Subís los extractos del banco, la app
clasifica sola, y cada mes ves cuánto entró, cuánto salió y cuánto quedó —
separado por persona y por cuenta.

### → **[Abrir la app](https://matiascantella.github.io/gastos-en-casa/)**

Funciona en el navegador, se instala en Android como una app más, y anda sin
internet. Los datos son del hogar que la usa: no hay servidor de terceros en el medio.

---

## Qué resuelve

Llevar las cuentas en pareja se rompe siempre por lo mismo: cada uno tiene sus
cuentas en bancos distintos, hay una compartida, la plata se mueve entre ellas, y
a fin de mes nadie sabe cuánto gastaron de verdad ni cuánto le quedó a cada uno.
Una planilla no lo resuelve porque hay que cargar todo a mano y porque cuenta dos
veces cada transferencia interna.

Esta app arranca del extracto del banco y llega al número real.

- **Importa los CSV de cuatro bancos** y los asigna solos a su dueño por IBAN.
- **Clasifica el ~90% de los movimientos** en la primera importación, con reglas
  precargadas para más de sesenta comercios de Estonia.
- **Aprende de vos**: cada corrección a mano se guarda como regla y el mes
  siguiente ya sale clasificada.
- **Distingue el gasto real del movimiento interno.** La plata que va de una
  cuenta propia a la compartida no es un gasto, y contarla lo sería todo dos veces.
- **Atribuye por persona y por bolsillo**, incluido quién puso cuánto en la
  cuenta compartida.
- **Convierte a euros** los movimientos en otra moneda, con la cotización real
  que viene en el propio archivo.
- **Netea devoluciones y descarta reversos**, autorizaciones canceladas y
  duplicados: reimportar el mismo archivo no ensucia nada.
- **Plan contra realidad**: al principio del mes fijás ingresos, presupuesto por
  categoría y meta de ahorro; al final comparás y armás el mes siguiente con un clic.
- **Préstamos aparte.** La plata que sale porque se la prestaste a alguien se
  sigue en su propia pantalla hasta que te la devuelven, sin ensuciar el gasto del mes.
- **Sincroniza entre dispositivos** en tiempo real, con respaldo exportable a JSON.

## Bancos soportados

| Banco | Dónde bajar el extracto | Asignación |
|---|---|---|
| **LHV** | Cuenta → Extracto de cuenta | Automática por IBAN |
| **Swedbank** | Kontod → Konto väljavõte → CSV | Automática por IBAN (estonio o inglés) |
| **Wise** | Saldo → Extractos → Historial de transacciones | Automática por titular |
| **Revolut** | Cuenta → Extracto (CSV) | Se elige una vez y queda recordada |

## Empezar

1. Abrí **[la app](https://matiascantella.github.io/gastos-en-casa/)** y cargá
   los dos nombres, las cuentas de cada uno y desde qué mes querés medir.
2. En **Ajustes → Cuentas**, poné el IBAN de cada cuenta. Es lo que hace que los
   CSV se asignen solos.
3. En **Ajustes → Nube**, pegá la configuración de tu proyecto de Firebase para
   que los dos vean lo mismo desde el celular y la PC. El paso a paso está en
   **[GUIA-NUBE.md](GUIA-NUBE.md)**.

La app mide desde el mes que elijas en adelante. Los extractos más viejos se
guardan en **Gastos → Histórico**: no cuentan en ningún número, pero sirven para
clasificar los comercios de una vez y arrancar con las reglas ya aprendidas.

## Arquitectura de datos

Cada hogar es dueño de su backend. La app corre desde una única copia publicada,
pero los datos de cada pareja viven en **su propio proyecto de Firebase**, con
reglas de seguridad que solo dejan entrar a los miembros de ese hogar. Dos
parejas que usan la misma dirección nunca se ven entre sí, y quien publica la
app no tiene acceso a los datos de nadie.

Sin nube configurada, todo queda en IndexedDB en el dispositivo y la app funciona igual.

La configuración de Firebase se pega desde Ajustes y se guarda en el navegador
de cada uno — no vive en este repositorio.

## Publicar tu propia copia

```bash
npm ci
npm run build
```

El workflow de `.github/workflows/deploy.yml` compila y publica en GitHub Pages
en cada push a `main`. Para que el login con Google funcione en tu dirección,
agregala una vez en tu proyecto de Firebase → **Authentication → Settings →
Authorized domains**.

## Desarrollo

```bash
npm install
npm run dev              # servidor de desarrollo
npm run build            # build de producción → dist/
SINGLE=1 npm run build   # build en un único archivo HTML → dist-single/

npx tsx test/parse.test.ts     # parsers contra extractos reales
npx tsx test/pipeline.test.ts  # clasificación, atribución y totales
node test/e2e.mjs              # recorrido completo en un navegador real
```

**Stack:** React 19 · TypeScript · Vite · Tailwind · Dexie (IndexedDB) · Zustand ·
Recharts · Firebase (Auth + Firestore) · PWA con service worker.

```
src/
  types.ts            modelo de datos
  lib/
    parsers.ts        lee los CSV de cada banco y los normaliza
    classify.ts       reglas, categorías, dueño de cada movimiento
    calc.ts           resúmenes mensuales, ahorro, series
    seed.ts           categorías y reglas precargadas
    db.ts             persistencia local (Dexie)
    store.ts          estado de la app (Zustand)
    cloud.ts          sincronización con Firebase
    text.ts           normalización, reparación de acentos, hashes
  pages/              una pantalla por archivo
  components/ui.tsx   piezas compartidas
```

**Para sumar un banco:** escribí una función `parseX` en `parsers.ts` que
devuelva `ParsedRow[]` y agregá su firma de columnas a `detectBank`. El resto
—clasificación, atribución, deduplicación, conversión— funciona sin tocar nada más.

## Licencia

MIT
