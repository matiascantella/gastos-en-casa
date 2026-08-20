# Gastos en casa

App de seguimiento de gastos y ahorros para una pareja. Funciona en la PC y se
instala en Android. Importa los extractos de **LHV, Swedbank, Wise y Revolut**,
clasifica los gastos sola, y compara mes a mes lo planeado contra lo que pasó
de verdad.

---

## Empezá acá

Abrí **`PASO-A-PASO.html`** con doble clic: es la guía completa, desde probarla
por primera vez hasta usarla todos los meses en pareja.

**Para probarla en dos minutos:** abrí **`gastos-en-casa.html`** con doble clic.
Es la app entera en un archivo, no necesita instalar nada ni tener internet.
Los datos quedan en esa computadora.

**Para usarla en serio** (instalable en Android y sincronizada entre los dos)
hay que publicarla en un proyecto gratuito de Firebase. La app ya viene
compilada en `dist/`, así que no hace falta build:

```bash
npx firebase-tools login
npx firebase-tools use --add
npx firebase-tools deploy
```

El detalle de cada paso está en `PASO-A-PASO.html` y en `GUIA-NUBE.md`.
Cuesta €0 y no pide tarjeta de crédito.

> **Cada pareja necesita su propio proyecto de Firebase.** Es lo que mantiene
> los datos separados: dos parejas distintas nunca se ven entre sí.

---

## Publicarla en GitHub Pages

Alternativa a Firebase Hosting, y la más práctica si van a usarla varias parejas:
**una sola copia publicada sirve para todas**. Cada pareja pega la configuración
de su propio proyecto de Firebase desde Ajustes, y sus datos viven ahí.

1. Subí el repo a GitHub.
2. En el repo: **Settings → Pages → Source: GitHub Actions**.
3. Listo. El workflow de `.github/workflows/deploy.yml` compila y publica en cada
   push a `main`. Queda en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.

**Cada pareja, una única vez:** en su proyecto de Firebase →
**Authentication → Settings → Authorized domains → Add domain** →
`TU-USUARIO.github.io`. Sin eso, el login con Google no funciona en esa dirección.

### Qué NO subir a git

El `.gitignore` ya los cubre, pero conviene saberlo:

- `gastos-respaldo-*.json` — **tiene todos tus movimientos**.
- `.firebaserc` — apunta a tu proyecto.
- `test/*.csv` — extractos reales del banco.

El bloque `firebaseConfig` **no** está en el repo: cada uno lo pega en la app y
queda guardado en su navegador.

---

## Cómo se usa

### Una sola vez

1. **Al abrirla**, cargá los dos nombres, marcá qué cuentas tienen y elegí
   **desde qué mes querés medir**.
2. En **Ajustes → Cuentas**, poné el **IBAN** de cada una. Es lo que permite que
   los CSV se asignen solos, sin que elijas nada.
3. En **Ajustes → Quiénes son**, poné el **nombre completo tal como figura en los
   extractos**. Con eso la app reconoce la plata que se mueve entre ustedes y no
   la cuenta como gasto.

### El mes de inicio

La app mide **desde el mes que elijas en adelante**. Nada anterior aparece en el
tablero, el cierre ni los ahorros, y el selector de mes no te deja ir para atrás.

Si igual subís extractos con meses viejos, se guardan en **Gastos → Histórico**.
No cuentan en ningún número: están ahí para que clasifiques los comercios de una
vez y las reglas queden aprendidas para adelante. Es la forma barata de que la
app arranque ya sabiendo dónde comprás.

Se cambia cuando quieras desde **Ajustes → Desde cuándo se mide**.

### Al principio de cada mes

En **Plan**: el ingreso de cada uno, el presupuesto por categoría y la meta de
ahorro. El botón *Copiar plan anterior* evita arrancar de cero.

### Al final de cada mes

1. **Importar**: arrastrá los CSV de todos los bancos. Todos juntos.
2. **Gastos → Sin clasificar**: asignale categoría a lo que quedó suelto. Una vez
   por comercio: la app crea la regla sola y el mes que viene ya sale clasificado.
3. **Cierre de mes**: mirá plan contra realidad, y armá el mes siguiente con un clic.

---

## De dónde bajar cada extracto

| Banco | Dónde | Formato |
|---|---|---|
| **LHV** | Cuenta → Extracto de cuenta | CSV. Trae el IBAN: se asigna solo. |
| **Swedbank** | Kontod → Konto väljavõte → CSV | Trae el IBAN: se asigna solo. Sirve en estonio o en inglés. |
| **Wise** | Saldo → Extractos → Historial de transacciones | CSV. Trae el titular: se asigna solo. |
| **Revolut** | Cuenta → Extracto | **CSV, no PDF.** No trae número de cuenta: la primera vez elegís de quién es y queda recordado. |

Si subís el mismo archivo dos veces, no se duplica nada.

---

## Qué hace por su cuenta

- **Clasifica el ~90% de los gastos** en la primera importación, con reglas
  precargadas para comercios de Estonia (Rimi, Selver, Maxima, Bolt, Wolt,
  Telia, Elektrilevi, y unos sesenta más).
- **Aprende**: cada vez que clasificás algo a mano, guarda la regla.
- **Excluye los movimientos internos**: la plata que va de tu LHV a la Revolut
  compartida no es un gasto. Sin esto, todo contaría dos veces.
- **Neteea las devoluciones**: un reembolso de Rimi resta del supermercado en
  vez de sumar como ingreso.
- **Convierte a euros** los movimientos en dólares de Wise, usando la cotización
  real que viene en el propio archivo.
- **Descarta** los movimientos revertidos y las autorizaciones canceladas.

---

## Para desarrollar

```bash
npm install
npm run dev              # servidor de desarrollo
npm run build            # build para publicar (carpeta dist/)
SINGLE=1 npm run build   # build en un solo archivo (carpeta dist-single/)

npx tsx test/parse.test.ts     # verifica los parsers contra CSV reales
npx tsx test/pipeline.test.ts  # verifica clasificación, atribución y totales
node test/e2e.mjs              # recorrido completo en un navegador real
```

### Cómo está armado

```
src/
  types.ts            modelo de datos
  lib/
    parsers.ts        lee los CSV de cada banco y los normaliza
    classify.ts       reglas, categorías, dueño de cada movimiento
    calc.ts           resúmenes mensuales, ahorro, series
    seed.ts           categorías y reglas precargadas
    db.ts             IndexedDB (Dexie)
    store.ts          estado de la app (Zustand)
    cloud.ts          sincronización opcional con Firebase
    text.ts           normalización, reparación de acentos, hashes
  pages/              una pantalla por archivo
  components/ui.tsx   piezas compartidas
```

**Para agregar un banco nuevo:** escribí una función `parseX` en `parsers.ts` que
devuelva `ParsedRow[]`, y sumá su firma de columnas a `detectBank`. El resto
—clasificación, atribución, deduplicación— funciona igual sin tocar nada más.

---

## Los datos son tuyos

Todo vive en tu dispositivo (IndexedDB) y, si activás la nube, en **tu propio**
proyecto de Firebase. No hay servidor de terceros en el medio.

**Ajustes → Respaldo** descarga un JSON con todo y lo vuelve a cargar en cualquier
otro dispositivo.
