# Matteo Masas

Amasandería artesanal con **modelo de negocio por pedidos**: la clienta no
mantiene stock, prepara cada pedido según su capacidad de trabajo diaria.

## Modelo de negocio

- No existe stock de productos. Todo se prepara por encargo.
- Cada día tiene un **cupo máximo de pedidos** configurable (por defecto 6).
- Los clientes eligen productos, formato/paquete, fecha de entrega y método de
  pago. No necesitan crear una cuenta.
- La dueña puede revisar los pedidos, cambiar su estado y ajustar el cupo desde
  el panel interno `/admin`.
- Los pedidos se guardan con snapshot de nombre, formato y precio, por lo que
  cambios futuros de catálogo no alteran pedidos antiguos.

## Funcionalidades

- Catálogo agrupado por producto y variantes, con buscador y filtros por categoría.
- Carrito persistente en `localStorage` (sin login).
- Checkout con:
  - nombre,
  - teléfono,
  - email opcional,
  - retiro en local o despacho con dirección seleccionada en un mapa,
  - fecha según cupo disponible,
  - pago en efectivo, tarjeta o transferencia,
  - indicaciones especiales.
- Código único de pedido para seguimiento.
- Validación de cupo en el servidor con bloqueo de transacción para evitar
  sobreventa de cupos.
- Protección contra reenvíos: cada solicitud lleva una clave única; si se
  reenvía, se devuelve el mismo pedido y no se consume otro cupo.
- Días sin atención configurables (por defecto domingo).
- Panel interno con resumen diario, estados, pagos y configuración de capacidad.
  Se actualiza solo cada 10 segundos.

## Requisitos

- Node.js 18+ (Render usa Node 22 según `engines` en `backend/package.json`)
- PostgreSQL

## Puesta en marcha

```bash
cd backend
npm install
npm run migrate   # crea la configuración y las tablas de pedidos
npm run seed      # sincroniza el catálogo y los precios por paquete
npm start
```

`npm run migrate` es idempotente y también normaliza bases creadas con
versiones anteriores del esquema (por ejemplo, con columnas `modalidad`,
`direccion_entrega` o `precio_historico`). Antes de modificar esas tablas deja
un respaldo con marca de tiempo (`pedido_backup_AAAAMMDDhhmmss` y
`detalle_pedido_backup_AAAAMMDDhhmmss`).

La base de datos se configura en `backend/.env`:

```env
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=admin
DB_NAME=matteo_masas_db
DB_PORT=5432
PORT=3000
# TRUST_PROXY=1  (solo si hay un proxy o hosting delante que reenvía X-Forwarded-For)
ADMIN_KEY=cambia_esta_clave_por_una_larga
```

Para un hosting administrado (Render, Neon, Railway, etc.) usa una sola
variable, que tiene prioridad sobre las anteriores:

```env
DATABASE_URL=postgresql://usuario:clave@host:5432/base?sslmode=require
# DB_SSL=false   (solo si el proveedor no usa TLS)
# DB_POOL_MAX=5  (recomendado en planes gratuitos)
```

El TLS se activa solo al usar `DATABASE_URL`. Hay una plantilla completa en
[`backend/.env.example`](backend/.env.example).

`ADMIN_KEY` protege el panel interno y es obligatoria. Si no está definida, el
panel y la API privada responden 503 y no quedan abiertos. Usa una clave larga
y no la compartas en el código ni en capturas.

También puedes crear la base desde cero con el archivo
[`matteo-masas-db.sql`](matteo-masas-db.sql):

```bash
psql -U postgres -d matteo_masas_db -f matteo-masas-db.sql
```

## Despliegue en Render

El repositorio incluye un `render.yaml` en su raíz, que declara el servicio web
y sus variables de entorno. Ese archivo fija el **Root Directory** en
`Fase 2/Evidencias Proyecto/Evidencias de Sistema`, donde vive el código.

1. Verifica que la rama `main` del repositorio tenga la versión final.
2. En Render, **New → Postgres** (plan Free, misma región que el servicio web).
   Copia la **Internal Database URL**.
3. **New → Blueprint** y selecciona el repositorio. Si prefieres crear el
   servicio a mano, usa los mismos valores:
   - Root Directory: `Fase 2/Evidencias Proyecto/Evidencias de Sistema`
   - Build command: `cd backend && npm ci --omit=dev`
   - Start command: `cd backend && npm start`
   - Health check path: `/`
4. Define las variables: `DATABASE_URL`, `ADMIN_KEY` (nueva y larga),
   `PUBLIC_BASE_URL` (`https://matteo-masas.onrender.com`), `TRUST_PROXY=1`,
   `NODE_ENV=production`, `TZ=America/Santiago`,
   `WEBPAY_ENVIRONMENT=integration`, `WEBPAY_EXPIRA_MINUTOS=60`,
   `ABONO_TRANSFERENCIA_EXPIRA_HORAS=24` y `DB_POOL_MAX=5`.
5. Inicializa la base **desde tu equipo**, apuntando a la URL de Render:

   ```powershell
   $env:DATABASE_URL="postgresql://...@.../matteo_masas_db"
   cd backend
   npm run migrate
   npm run seed
   ```

6. Verifica el sitio publicado: catálogo, `/admin`, creación de un pedido y el
   flujo de Webpay en ambiente `integration`.

### Consideraciones del plan gratuito

- El servicio web **se suspende a los 15 minutos** sin tráfico y tarda cerca de
  un minuto en despertar. Abre la URL antes de una demostración.
- La base **Free de Render Postgres expira a los 30 días**. Tiene 14 días de
  gracia para pasarla a un plan pagado; después Render la elimina con sus datos.
  No se cobra nada automáticamente: sin método de pago, el servicio se suspende
  en vez de facturarse.
- No hay respaldos automáticos en el plan Free. Antes de la fecha de expiración:

  ```powershell
  pg_dump "$env:DATABASE_URL" --no-owner --no-acl -f respaldo_matteo_masas.sql
  ```

  Para recuperar el sitio gratis, crea otra base Free, ejecuta `npm run migrate`
  y `npm run seed`, y restaura el respaldo si necesitas conservar los pedidos.

## URLs

- Tienda: <http://localhost:3000>
- Panel interno: <http://localhost:3000/admin>

El panel pedirá la clave configurada en `ADMIN_KEY`.

## API principal

| Método | Ruta | Acceso | Descripción |
| --- | --- | --- | --- |
| GET | `/api/productos` | Público | Catálogo activo con formatos y precios |
| GET | `/api/pedidos/disponibilidad` | Público | Cupos por día y configuración pública |
| GET | `/api/pedidos/codigo/:codigo` | Público (30/min por IP) | Comprobante sin datos personales |
| POST | `/api/pedidos` | Público (20/min por IP) | Crear pedido; requiere `clave_solicitud` |
| POST, GET | `/api/pagos/webpay/retorno` | Transbank | Retorno de Webpay y confirmación del pago |
| GET | `/api/productos/admin` | Admin | Productos activos e inactivos y categorías |
| GET | `/api/productos/categorias` | Admin | Lista de categorías |
| POST | `/api/productos` | Admin | Crear producto con sus formatos |
| PUT | `/api/productos/:id` | Admin | Editar producto y formatos |
| PATCH | `/api/productos/:id/estado` | Admin | Activar o desactivar producto |
| GET | `/api/pedidos?fecha=YYYY-MM-DD` | Admin | Pedidos del día y resumen |
| PATCH | `/api/pedidos/:id/estado` | Admin | Cambiar estado (solo transiciones válidas) |
| PATCH | `/api/pedidos/:id/pago` | Admin | Registrar abono, saldo o pago manual |
| GET | `/api/pedidos/configuracion` | Admin | Obtener configuración |
| PUT | `/api/pedidos/configuracion` | Admin | Actualizar cupo y reglas |

Las rutas de administración requieren el header `x-admin-key`. La clave no se
acepta en la URL. Después de 10 intentos fallidos desde una misma IP, el
panel responde 429 durante 15 minutos.

Estados del pedido: `pendiente` → `confirmado` → `en_preparacion` → `listo` →
`entregado`. Un pedido se puede cancelar hasta `listo`, y un cancelado solo
puede volver a `pendiente`.

> Si ya tienes una base creada, ejecuta `npm run migrate` para agregar las
> columnas `clave_solicitud`, `huella_solicitud` y `webpay_url`.

## Configuración

La tabla `CONFIGURACION_NEGOCIO` contiene una sola fila:

- `capacidad_pedidos_por_dia`: pedidos máximos por día.
- `dias_anticipacion_minima`: días mínimos de anticipación (1 = mañana).
- `dias_maximos_reserva`: hasta cuántos días se puede reservar.
- `dias_cerrados_semana`: días sin atención (`0` domingo ... `6` sábado).
- `lat_tienda` / `lng_tienda`: ubicación exacta del local; se usa para medir
  la distancia de despacho.
- `monto_despacho_gratis`: compra mínima para despacho gratis dentro de Padre
  Hurtado (por defecto $15.000). `0` desactiva la promoción.
- `tarifa_base_despacho`: tarifa base de despacho (por defecto $1.500).
- `km_base_despacho`: kilómetros cubiertos por la tarifa base (por defecto 3).
- `tarifa_km_adicional`: valor por cada kilómetro adicional, redondeando hacia
  arriba (por defecto $750).

Estos valores se pueden editar desde `/admin`.

## Pagos con tarjeta online (Webpay Plus)

El checkout incluye **Webpay Plus de Transbank** para pagar con tarjeta de
crédito o débito. El flujo es:

1. El cliente elige **Tarjeta online (Webpay)** y confirma el pedido.
2. El servidor reserva el cupo y crea la transacción en Transbank.
3. El cliente paga en la pasarela de Webpay.
4. Transbank vuelve a `/api/pagos/webpay/retorno`, el servidor confirma el
   pago y el pedido queda marcado como **Pagado**.
5. Si el pago es rechazado o el cliente cancela, el cupo se libera y el
   carrito se conserva para reintentar.

### Ambiente de integración (gratis)

Por defecto la aplicación parte en `WEBPAY_ENVIRONMENT=integration`. Ese
ambiente usa las credenciales públicas del SDK, **no tiene costo** y permite
probar todo el flujo con tarjetas de prueba. No necesitas pedir una API key
para probar.

```env
WEBPAY_ENVIRONMENT=integration
WEBPAY_EXPIRA_MINUTOS=60
```

Para el flujo más simple usa la VISA de prueba **`4051 8856 0044 6623`**,
CVV **`123`** y cualquier fecha de vencimiento futura. Cuando aparezca la
autenticación del banco usa RUT **`11.111.111-1`** y clave **`123`**.

El detalle completo de tarjetas aprobadas y rechazadas está en
[`backend/WEBPAY_PRUEBAS.md`](backend/WEBPAY_PRUEBAS.md) y también en los
comentarios de `backend/.env`.

La documentación oficial de Transbank está en
<https://www.transbankdevelopers.cl/documentacion/como_empezar#ambiente-de-integracion>.

### Paso a producción

Para recibir pagos reales debes afiliarte a Webpay Plus con Transbank. Ellos
entregan un **código de comercio** y una **API key**. Luego configura:

```env
WEBPAY_ENVIRONMENT=production
WEBPAY_COMMERCE_CODE=tu_codigo_de_comercio
WEBPAY_API_KEY=tu_api_key
PUBLIC_BASE_URL=https://tudominio.cl
```

`PUBLIC_BASE_URL` debe ser el dominio público con **HTTPS**; Transbank
redirige ahí después del pago.

> **Costos:** el ambiente de integración es gratuito. En producción Transbank
> cobra una comisión por transacción según el contrato del comercio; no existe
> procesamiento real de tarjetas sin comisión. La aplicación no agrega cobros
> adicionales.

### Reembolsos

Si desde `/admin` se cancela un pedido pagado con Webpay, el servidor reembolsa
automáticamente **lo que se cobró online**: el total en pedidos pequeños o solo
el abono del 25% en pedidos grandes. Si el reembolso falla, el pedido no se
cancela y se muestra un aviso para hacerlo manualmente desde el portal de
Transbank.

### Consideraciones

- El monto se calcula siempre en el servidor; el navegador no puede alterarlo.
- Los pedidos con Webpay que nunca vuelven de Transbank se cancelan
  automáticamente después de `WEBPAY_EXPIRA_MINUTOS` (60 por defecto) para
  liberar el cupo.
- Se guardan los últimos dígitos de la tarjeta, el código de autorización y
  metadatos de la transacción; nunca el número completo ni el CVV.

## Reglas de pago y abonos

- **Retiro en el local:** se aceptan efectivo, tarjeta presencial, Webpay y
  transferencia.
- **Despacho a domicilio:** solo se aceptan **Webpay** o **transferencia**.
- **Pedidos superiores a $60.000:** por defecto requieren un **abono del 25%**,
  pero el cliente puede elegir **pagar el pedido completo de inmediato**.
  - Si eligen **Webpay**, el abono del 25% se cobra online al crear el pedido.
  - Si eligen **efectivo o tarjeta presencial** (solo retiro), el abono del 25%
    se cobra igual con **Webpay** y el saldo se paga al retirar.
  - Si eligen **transferencia**, el pedido queda con abono pendiente hasta que
    la dueña lo registre en `/admin`.
  - El saldo restante se paga al retirar o recibir el pedido.
  - Si el abono por transferencia no se registra en 24 horas, el pedido se
    cancela y libera el cupo (`ABONO_TRANSFERENCIA_EXPIRA_HORAS`).
  - **Pago completo ahora:** el cliente puede pagar el total con Webpay o
    transferencia. En ese caso no hay abono ni saldo pendiente y el pedido se
    marca como pagado al confirmarse el pago.
- El panel `/admin` permite **registrar el abono recibido**, **registrar el
  saldo pagado** y **marcar pagos recibidos** de pedidos sin abono.

Estas reglas se validan tanto en el navegador como en el servidor; si alguien
intenta enviar un método no permitido, la API rechaza el pedido.

## Despacho con mapa

En el checkout, al elegir **Despacho a domicilio** se muestra un mapa
(Leaflet + OpenStreetMap). El cliente puede buscar su dirección, elegir una
sugerencia, mover el marcador o usar su ubicación actual.

Reglas de cobro (calculadas en el servidor al crear el pedido):

- **Dentro de Padre Hurtado** y compra **superior a `monto_despacho_gratis`**:
  despacho gratis.
- **Dentro de Padre Hurtado** sin alcanzar el monto: se aplica la tarifa por
  distancia.
- **Fuera de Padre Hurtado**: siempre se aplica la tarifa por distancia, sin
  importar el monto de la compra.
- Tarifa por distancia: `tarifa_base_despacho` cubre los primeros
  `km_base_despacho`; cada kilómetro adicional se cobra a
  `tarifa_km_adicional`.

La distancia se calcula en línea recta desde el local (fórmula de Haversine).
La comuna se determina con un polígono de Padre Hurtado incluido en el código
(`backend/src/utils/delivery.js`), sin depender de APIs externas de ruteo.

> La búsqueda de direcciones usa el servicio público de Nominatim. Para un
> volumen alto de visitas conviene reemplazarlo por un proveedor con API key.

Los pedidos guardan latitud, longitud, distancia, si están dentro de la comuna
y si obtuvieron despacho gratis, para que el panel interno muestre el detalle.
