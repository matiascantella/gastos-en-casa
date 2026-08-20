# Activar la sincronización entre los dos

La app funciona perfecto sin esto: los datos quedan guardados en el dispositivo.
Esta guía es para que **los dos vean y editen lo mismo** desde el celular y la PC.

**Costo: €0.** El plan gratuito de Firebase (Spark) no pide tarjeta de crédito, así que
no existe la posibilidad de un cobro sorpresa. Da 50.000 lecturas y 20.000 escrituras
por día; ustedes dos van a usar unas 300 en un día movido.

Se hace una sola vez y lleva unos diez minutos.

---

## Parte 1 — Crear el proyecto (lo hace uno solo de los dos)

### 1. Crear el proyecto

Entrá a **console.firebase.google.com** con tu cuenta de Google y hacé clic en
**Crear un proyecto**. Ponele el nombre que quieras (por ejemplo `gastos-casa`).

Cuando te pregunte por Google Analytics, **desactivalo** — no hace falta y simplifica todo.

### 2. Activar el login con Google

En el menú de la izquierda: **Compilación → Authentication → Comenzar**.

En la pestaña **Sign-in method**, elegí **Google** de la lista, activá el interruptor,
poné un correo de contacto y **Guardar**.

### 3. Crear la base de datos

En el menú de la izquierda: **Compilación → Firestore Database → Crear base de datos**.

- Ubicación: **eur3 (europe-west)** — es la más cercana a Estonia.
- Modo: elegí **modo de producción** (las reglas las ponemos en el paso siguiente).

### 4. Poner las reglas de seguridad

Esto es lo que hace que **solo ustedes dos** puedan leer sus datos. No lo saltees.

Dentro de Firestore, andá a la pestaña **Reglas**, borrá todo lo que haya y pegá esto:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /hogares/{hid} {
      allow read: if request.auth != null;

      allow create: if request.auth != null
                    && hid == request.auth.uid
                    && request.auth.uid in request.resource.data.miembros;

      allow update: if request.auth != null
                    && request.auth.uid in request.resource.data.miembros
                    && resource.data.miembros.hasOnly(request.resource.data.miembros)
                    && request.resource.data.miembros.size() <= resource.data.miembros.size() + 1;

      allow delete: if request.auth != null && request.auth.uid == hid;

      match /{documento=**} {
        allow read, write: if request.auth != null
          && request.auth.uid in get(/databases/$(database)/documents/hogares/$(hid)).data.miembros;
      }
    }
  }
}
```

Hacé clic en **Publicar**.

### 5. Copiar la configuración

Arriba a la izquierda, el engranaje ⚙ → **Configuración del proyecto**.

Bajá hasta **Tus apps** y hacé clic en el ícono web **`</>`**. Ponele un apodo
(`gastos`) y registrala. **No** marques Firebase Hosting todavía.

Te va a mostrar un bloque como este:

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

**Copiá ese bloque completo.** Lo vas a necesitar en el paso siguiente y también
en el dispositivo de tu pareja.

> Ese bloque no es una contraseña: es información pública de identificación del
> proyecto. Lo que protege los datos son las reglas del paso 4.

### 6. Pegarlo en la app

Abrí la app → **Ajustes → Sincronización con tu pareja → Activar sincronización**.
Pegá el bloque en el recuadro, dejá vacío el campo de código de invitación
(sos el primero) y hacé clic en **Conectar**.

Después tocá **Entrar con Google** y elegí tu cuenta.

Cuando diga *Sincronizando*, tocá **Subir todo ahora** para mandar a la nube los
datos que ya tenías en el dispositivo.

---

## Parte 2 — Sumar a tu pareja

En la app, en **Ajustes → Sincronización**, vas a ver un **código de invitación**
(una cadena larga de letras y números). Copialo y pasáselo.

En el dispositivo de tu pareja:

1. Abrir la app y hacer la configuración inicial.
2. **Ajustes → Sincronización → Activar sincronización**.
3. Pegar **la misma configuración de Firebase** que copiaste en el paso 5.
4. Pegar el **código de invitación** en el segundo campo.
5. **Conectar** → **Entrar con Google** (con su propia cuenta).

Listo. A partir de ahí, cualquier cambio de uno aparece en el otro en el momento.

---

## Parte 3 — Publicar la app en internet (opcional pero recomendado)

Hasta acá la app funciona abriendo el archivo `index.html`. Publicarla le da una
dirección web propia, permite instalarla en Android como una app de verdad, y hace
que el login con Google funcione sin fricción.

En una terminal, dentro de la carpeta del proyecto:

```bash
npm install
npm run build

npx firebase-tools login
npx firebase-tools use --add        # elegí el proyecto que creaste
npx firebase-tools deploy
```

Te va a devolver una dirección tipo `https://gastos-casa.web.app`.

**Un paso más:** volvé a Firebase → **Authentication → Settings → Authorized domains**
y verificá que esa dirección esté en la lista (normalmente se agrega sola).

### Instalarla en Android

Abrí la dirección en Chrome → menú de tres puntos → **Instalar app** (o *Agregar a
pantalla de inicio*). Queda con su propio ícono, pantalla completa y funciona sin
conexión.

### Instalarla en la PC

Abrí la dirección en Chrome o Edge → el ícono de instalar ⊕ en la barra de
direcciones → **Instalar**.

---

## Si algo no funciona

**"Firestore rechazó la conexión"**
Faltan las reglas del paso 4, o no le diste a *Publicar*. Volvé a Firestore → Reglas.

**"Este dominio no está autorizado"**
Firebase → Authentication → Settings → Authorized domains → **Add domain**, y agregá
la dirección desde la que estás abriendo la app.

**"Falta activar el proveedor Google"**
Volvé al paso 2: Authentication → Sign-in method → Google → activar.

**La ventana de login no se abre en el celular**
Chrome bloquea las ventanas emergentes. La app se pasa sola al método de redirección;
si no, permití las ventanas emergentes para ese sitio.

**Quiero volver al modo local**
Ajustes → Sincronización → **Desactivar**. Los datos siguen intactos en el dispositivo.
