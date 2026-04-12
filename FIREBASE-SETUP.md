# 🚀 Guía: Despliegue en Firebase + GitHub Pages

## ¿Qué vamos a conseguir?
Una URL pública (ej. `https://tuempresa.github.io/facturatec`) donde:
- Los técnicos entran desde su móvil
- Las facturas se guardan en la nube (Firebase)
- Tú ves TODO desde cualquier sitio como administrador

---

## PASO 1 — Crear el proyecto Firebase (5 minutos)

1. Ve a **https://console.firebase.google.com**
2. Inicia sesión con tu cuenta Google
3. Haz clic en **"Añadir proyecto"**
4. Nombre del proyecto: `facturatec` (o el que quieras)
5. **Desactiva Google Analytics** (no es necesario) → Crear proyecto
6. Espera que se cree (30 segundos) → **Continuar**

---

## PASO 2 — Activar Firestore (Base de datos)

1. En el menú izquierdo → **Firestore Database**
2. Haz clic en **"Crear base de datos"**
3. Selecciona **"Iniciar en modo de producción"**
4. Elige la región: **`europe-west1`** (Europa, ideal para España)
5. Haz clic en **Listo**

---

## PASO 3 — Activar Authentication (Inicio de sesión)

1. En el menú izquierdo → **Authentication**
2. Haz clic en **"Comenzar"**
3. En la pestaña **"Sign-in method"** → habilita **"Correo electrónico/contraseña"**
4. Guarda

---

## PASO 4 — Obtener las claves de configuración

1. En el menú izquierdo → ⚙️ **Configuración del proyecto** (icono rueda)
2. Scroll hacia abajo → sección **"Tus apps"**
3. Haz clic en el icono `</>` (Web)
4. Ponle un nombre: `facturatec-web`
5. **NO** actives Firebase Hosting (usaremos GitHub Pages)
6. Haz clic en **"Registrar app"**
7. Copia el bloque `firebaseConfig` que aparece, algo así:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "facturatec-xxxxx.firebaseapp.com",
  projectId: "facturatec-xxxxx",
  storageBucket: "facturatec-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

**Dime ese bloque y yo configuro el resto automáticamente.**

---

## PASO 5 — Configurar reglas de seguridad en Firestore

En Firestore → pestaña **"Reglas"**, reemplaza el contenido con:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Solo usuarios autenticados pueden leer/escribir
    match /invoices/{doc} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null 
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    match /users/{doc} {
      allow read: if request.auth != null;
      allow write: if request.auth != null 
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    match /company/{doc} {
      allow read: if request.auth != null;
      allow write: if request.auth != null 
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
  }
}
```

Haz clic en **Publicar**.

---

## PASO 6 — GitHub Pages

Una vez que me pases las claves Firebase, yo:
1. Actualizo el código para usar Firebase SDK
2. Tú subes los archivos a un repositorio GitHub
3. Activas GitHub Pages en ese repositorio
4. ¡Listo! URL pública para todos los técnicos

---

## ⏭️ Próximo paso para ti

**Completa los pasos 1 al 5** y pégame el bloque `firebaseConfig` del paso 4.
Con eso tardo menos de 10 minutos en tener la versión Firebase lista.
