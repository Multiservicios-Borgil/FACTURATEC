# FacturaTec – Guía de Uso y Configuración

## Acceso a la aplicación

La aplicación está disponible en: `http://localhost:3030`  
Para uso real, puedes alojarla en GitHub Pages, Netlify o cualquier hosting estático **gratuito**.

---

## Credenciales iniciales

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin` | `admin123` | Administrador |

> ⚠️ **Cambia la contraseña de admin** antes de compartir la app con los técnicos.  
> Ve a → Panel de Administración → Técnicos → Editar admin.

---

## Primeros pasos

### 1. Configurar los datos de tu empresa
1. Inicia sesión como **admin**
2. Ve a **Panel de Administración → Empresa**
3. Rellena: Razón Social, CIF, Dirección, Teléfono, Email
4. Establece el **prefijo de serie** de facturas (ej. `A` → genera A2026-0001, A2026-0002...)
5. Pon un texto al pie (ej. *"Garantía de 3 meses en piezas instaladas"*)
6. Pulsa **Guardar Datos Empresa**

### 2. Añadir técnicos
1. Ve a **Panel de Administración → Técnicos → + Añadir**
2. Rellena nombre, usuario y contraseña para cada técnico
3. Cada técnico ve **solo sus propias facturas**
4. El administrador ve **todas las facturas** de todos los técnicos

### 3. Crear una factura
1. Inicia sesión con el usuario de técnico en el móvil
2. Pulsa **Nueva Factura**
3. Rellena los datos del cliente (NIF obligatorio para legalidad)
4. Añade conceptos con los botones: **+ Mano de obra / + Repuesto / + Desplazamiento**
5. El IVA y totales se calculan automáticamente
6. Selecciona la **forma de cobro**
7. Pulsa **Guardar Factura**

### 4. Imprimir en impresora Bluetooth
1. Tras guardar la factura, se abre automáticamente la **Vista Previa**
2. Pulsa **🖨️ Imprimir / Bluetooth**
3. En el móvil, el sistema de impresión del teléfono mostrará las impresoras disponibles
4. Selecciona tu impresora térmica Bluetooth (debe estar vinculada previamente en ajustes del móvil)
5. El ticket está formateado en **58mm** (ancho estándar de impresora de bolsillo)

### 5. Compartir por WhatsApp / Email
1. En la Vista Previa de factura, pulsa **📤 Compartir**
2. En móvil se abre el menú nativo de compartir
3. También funciona directamente a WhatsApp

---

## Como gestor (acceso remoto)
- Abre la URL de la app desde **cualquier dispositivo** (PC, tablet, móvil)
- Inicia sesión con tu usuario **admin**
- Panel de Administración:
  - **Resumen**: totales por técnico del mes
  - **Todas las Facturas**: listado global con búsqueda
  - **⬇️ Exportar CSV**: descarga todas las facturas para la gestoría
  - **Técnicos**: gestión de accesos
  - **Empresa**: configuración global

---

## Instalar como app en el móvil (PWA)
1. Abre la URL en Chrome (Android) o Safari (iOS)
2. Android: menú → **"Añadir a pantalla de inicio"**
3. iOS: botón compartir → **"Añadir a pantalla de inicio"**
4. La app funciona como una aplicación nativa, sin barras del navegador

---

## Datos legales en cada factura
Cada factura generada incluye automáticamente todos los campos obligatorios:
- ✅ Número de factura correlativo (serie + año)
- ✅ Fecha de expedición
- ✅ Datos completos del emisor (empresa)
- ✅ Datos completos del cliente (NIF/CIF, nombre, dirección)
- ✅ Descripción detallada de servicios/piezas
- ✅ Base imponible desglosada
- ✅ Tipo de IVA aplicado y cuota de IVA
- ✅ Total de la factura
- ✅ Forma de cobro

---

## Estructura de archivos
```
facturacion-app/
├── index.html          ← App principal
├── manifest.json       ← Configuración PWA
├── service-worker.js   ← Caché offline
├── css/
│   ├── main.css        ← Estilos principales
│   └── print.css       ← Estilos impresión térmica
├── js/
│   ├── data.js         ← Base de datos (localStorage)
│   ├── invoices.js     ← Lógica de facturas
│   ├── print.js        ← Generación de tickets
│   └── app.js          ← Controlador principal
└── icons/
    └── icon.svg        ← Icono de la app
```

---

## Próximas mejoras (Fase 2)
- [ ] Base de datos en la nube (Firebase) para sincronización entre dispositivos
- [ ] Login online con email/contraseña
- [ ] Copia de seguridad automática en la nube
- [ ] Catálogo de precios habituales (tarifas predefinidas)
- [ ] Firma digital del cliente en pantalla táctil
- [ ] Estadísticas avanzadas y gráficos por período
