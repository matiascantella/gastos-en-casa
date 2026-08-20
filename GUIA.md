# guía de uso

todo lo que hace falta para arrancar de a dos, en orden. la configuración se hace
**una sola vez** y lleva unos 20 minutos entre las dos personas. después, usarla
son diez minutos al mes.

- [1. configuración inicial](#1-configuración-inicial)
- [2. activar la nube](#2-activar-la-nube-para-que-los-dos-vean-lo-mismo)
- [3. sumar a tu pareja](#3-sumar-a-tu-pareja)
- [4. instalarla en el celular y en la PC](#4-instalarla-en-el-celular-y-en-la-pc)
- [5. el mes a mes](#5-el-mes-a-mes)
- [6. cosas que conviene saber](#6-cosas-que-conviene-saber)
- [7. si algo no funciona](#7-si-algo-no-funciona)

---

## 1. configuración inicial

abrí **[la app](https://matiascantella.github.io/gastos-en-casa/)**. la primera
vez te pide tres cosas:

**los nombres.** además del nombre corto, cargá el **nombre completo tal como
figura en los extractos del banco** (`NOMBRE APELLIDO` de cada uno). con eso la
app reconoce la plata que se mueven entre ustedes y no la cuenta como gasto —
sin esto, cada transferencia de una cuenta propia a la compartida aparecería
como si hubieran gastado ese dinero.

**las cuentas.** marcá qué banco tiene cada uno y cuál es la cuenta compartida.

**desde qué mes medir.** viene el mes actual. todo lo anterior a esa fecha se
guarda pero no cuenta en ningún número.

después, en **Ajustes → Cuentas**, poné el **IBAN** de cada cuenta. es lo que
hace que los CSV se asignen solos a su dueño sin que elijas nada cada vez.

---

## 2. activar la nube (para que los dos vean lo mismo)

sin esto la app funciona igual, pero los datos quedan en un solo dispositivo.
activarla es lo que hace que los dos vean y editen lo mismo desde el celular y
la PC.

**cuesta €0.** el plan gratuito de Firebase (Spark) no pide tarjeta de crédito,
así que no existe la posibilidad de un cobro sorpresa. da 50.000 lecturas y
20.000 escrituras por día; una pareja usa unas 300 en un día movido.

esta parte **la hace una sola de las dos personas**.

### 2.1 crear el proyecto

entrá a **console.firebase.google.com** con tu cuenta de Google → **crear un
proyecto** → ponele el nombre que quieras (por ejemplo `gastos-casa`).

cuando pregunte por Google Analytics, **desactivalo**: no hace falta y simplifica todo.

### 2.2 activar el login con Google

menú de la izquierda → **Authentication** → **comenzar** → pestaña **Sign-in
method** → elegí **Google** → activá el interruptor → poné un correo de contacto
→ **guardar**.

### 2.3 autorizar la dirección de la app

en **Authentication → Settings → Authorized domains → Add domain**, agregá:

```
matiascantella.github.io
```

sin este paso el login con Google no funciona y no vas a poder sincronizar.

### 2.4 crear la base de datos

menú de la izquierda → **Firestore Database** → **crear base de datos**.

- ubicación: **eur3 (europe-west)** si están en Europa.
- modo: **producción**. las reglas van en el paso que sigue.

### 2.5 pegar las reglas de seguridad

esto es lo que hace que **solo ustedes dos** puedan leer sus datos. no lo saltees.

dentro de Firestore → pestaña **reglas** → borrá todo lo que haya → pegá el
contenido del archivo [`firestore.rules`](firestore.rules) de este repositorio →
**publicar**.

### 2.6 copiar la configuración

engranaje ⚙ arriba a la izquierda → **configuración del proyecto** → bajá hasta
**tus apps** → ícono web **`</>`** → apodo `gastos` → **registrar app**.

te va a mostrar un bloque como este:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "gastos-casa.firebaseapp.com",
  projectId: "gastos-casa",
  storageBucket: "gastos-casa.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

**copiá el bloque completo.** lo vas a necesitar ahora y también en el
dispositivo de tu pareja.

> ese bloque no es una contraseña: identifica al proyecto y es información
> pública. lo que protege los datos son las reglas del paso 2.5.

### 2.7 pegarlo en la app

en la app → **Ajustes → Sincronización → activar sincronización**. pegá el bloque
en el recuadro, dejá **vacío** el campo de código de invitación (sos el primero) y
tocá **conectar**.

después **entrar con Google** y elegí tu cuenta. cuando diga *sincronizando*,
tocá **subir todo ahora** para mandar a la nube lo que ya tenías cargado.

---

## 3. sumar a tu pareja

en **Ajustes → Sincronización** aparece un **código de invitación** (una cadena
larga de letras y números). copialo y pasáselo.

en el dispositivo de la otra persona:

1. abrir la app y hacer la configuración inicial.
2. **Ajustes → Sincronización → activar sincronización**.
3. pegar **la misma configuración de Firebase** del paso 2.6.
4. pegar el **código de invitación** en el segundo campo.
5. **conectar** → **entrar con Google**, con su propia cuenta.

desde ahí, cualquier cambio de uno aparece en el otro al instante.

---

## 4. instalarla en el celular y en la PC

**Android:** abrí la dirección en Chrome → menú de tres puntos → **instalar app**.
queda con su ícono, a pantalla completa, y funciona sin conexión.

**PC:** abrí la dirección en Chrome o Edge → ícono de instalar **⊕** en la barra
de direcciones → **instalar**.

---

## 5. el mes a mes

### al principio del mes — pantalla **Plan**

cargá el ingreso esperado de cada uno, el presupuesto por categoría y la meta de
ahorro. el botón **copiar plan anterior** evita arrancar de cero todos los meses.

### al final del mes — tres pasos

**1. importar.** bajá los CSV de todos los bancos y arrastralos juntos a la
pantalla **Importar**. si subís el mismo archivo dos veces no se duplica nada.

| banco | dónde bajarlo |
|---|---|
| **LHV** | cuenta → extracto de cuenta → CSV |
| **Swedbank** | kontod → konto väljavõte → CSV |
| **Wise** | saldo → extractos → historial de transacciones → CSV |
| **Revolut** | cuenta → extracto → **CSV, no PDF** |

**2. clasificar lo que quedó suelto.** en **Gastos → Sin clasificar**, asignale
categoría a lo que la app no reconoció. una vez por comercio: la app crea la
regla sola y el mes que viene ya sale clasificado. la primera importación deja
sin clasificar cerca del 10%; a partir del segundo mes es un puñado.

**3. cierre de mes.** compará lo planeado contra lo que pasó de verdad, ajustá el
ahorro y armá el mes siguiente con un clic.

---

## 6. cosas que conviene saber

**movimientos a mano.** si un ingreso no aparece en ningún extracto (te pagaron
en efectivo, o el sueldo cayó el último día del mes anterior), cargalo desde
**Gastos → + A mano**, eligiendo a qué cuenta entró. queda marcado como manual
para que sepas de dónde salió ese número.

**ajuste de saldo.** si una cuenta no cierra porque arrancaron a usar la app con
plata ya adentro, cargá un movimiento a mano de tipo **ajuste de saldo**. cuenta
para el saldo de esa cuenta pero **no** se suma como ingreso del mes: no inventa
plata que no entró.

**préstamos.** la plata que sale porque se la prestaste a alguien, o porque
pagaste algo que después te devuelven, marcala como préstamo. se sigue aparte en
**Nos deben** hasta que la saldás, sin ensuciar el gasto del mes.

**histórico.** los extractos de meses anteriores al mes de inicio quedan en
**Gastos → Histórico**. no cuentan en ningún número, pero clasificarlos una vez
deja las reglas aprendidas para adelante. es la forma barata de que la app
arranque sabiendo dónde compran.

**respaldo.** **Ajustes → Respaldo** baja un JSON con absolutamente todo y lo
vuelve a cargar en cualquier otro dispositivo.

---

## 7. si algo no funciona

**"este dominio no está autorizado"**
falta el paso 2.3: Firebase → Authentication → Settings → Authorized domains →
**Add domain**.

**"Firestore rechazó la conexión"**
faltan las reglas del paso 2.5, o quedaron sin **publicar**.

**"falta activar el proveedor Google"**
volvé al paso 2.2: Authentication → Sign-in method → Google → activar.

**los cambios de uno no le llegan al otro**
fijate que los dos estén con la sesión de Google iniciada en
**Ajustes → Sincronización**. si uno dice *desconectado*, volvé a entrar; los
datos locales no se pierden.

**quiero volver al modo local**
**Ajustes → Sincronización → desactivar**. todo sigue intacto en el dispositivo.
