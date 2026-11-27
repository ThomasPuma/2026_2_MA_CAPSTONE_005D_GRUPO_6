# Proyecto Capstone: Sistema Web de Pedidos por Encargo — Matteo Masas

Asignatura / Sección: 2026_2_MA_CAPSTONE_005D
Grupo: GRUPO_6
Institución: DUOC UC, Sede Maipú — Escuela de Informática y Telecomunicaciones

## 📋 Descripción del Proyecto

El proyecto corresponde al desarrollo de una plataforma web de comercio electrónico y gestión operativa para **Matteo Masas**, una amasandería artesanal de Padre Hurtado que trabaja exclusivamente por encargo.

El negocio no mantiene inventario de productos terminados: prepara cada pedido para la fecha comprometida según una **capacidad diaria de producción configurable**. La plataforma resuelve esa operación de punta a punta:

- Catálogo con formatos y precios en CLP, buscador y filtros por categoría.
- Carrito persistente y checkout sin registro de usuario.
- Selección de fecha de entrega según los cupos disponibles del día.
- Entrega dual: retiro en el local o despacho a domicilio con tarifa por distancia.
- Pago con **Webpay Plus de Transbank**, transferencia, efectivo o tarjeta presencial, con abono del 25 % en pedidos sobre $60.000.
- Comprobante con código único de seguimiento.
- Panel privado para la dueña: pedidos del día, cambios de estado, registro de pagos, mantenimiento de productos y configuración de capacidad, anticipación, días cerrados y tarifas de despacho.

El servidor garantiza la integridad del cupo diario mediante un bloqueo de transacción por fecha y protege contra pedidos duplicados con claves de solicitud idempotentes. La aplicación está desplegada en **Render** sobre HTTPS y respaldada por PostgreSQL.

Sitio en producción: <https://matteo-masas.onrender.com>

## 👥 Integrantes

| Integrante | Rol en el proyecto |
| --- | --- |
| Thomas Alexander Puma Valdebenito | Product Owner · Backend & DB Architect · QA Lead |
| Alyson Cuevas | Scrum Master · Frontend & UX/UI · Enlace de Requerimientos |

Contacto: th.puma@duocuc.cl · aly.cuevas@duocuc.cl

## 📁 Estructura del Repositorio

```text
2026_2_MA_CAPSTONE_005D_GRUPO_6/
│
├── Fase 1/
│   ├── Evidencias Grupales/        # Informes, propuestas y entregables de la Fase 1
│   └── Evidencias Individuales/    # Bitácoras y evaluaciones individuales de la Fase 1
│
├── Fase 2/
│   ├── Evidencias Grupales/        # Entregables grupales de la Fase 2
│   ├── Evidencias Individuales/    # Bitácoras y avances individuales de la Fase 2
│   └── Evidencias Proyecto/
│       ├── Evidencias de Documentación/   # Análisis, backlog, arquitectura, modelo de datos, QA
│       └── Evidencias de Sistema/         # Código fuente, scripts de BD y despliegue
│
└── Fase 3/
    ├── Evidencias Grupales/        # Informe final y entregables de cierre
    └── Evidencias Individuales/    # Evaluaciones finales y bitácoras individuales
```

## 🚀 Ubicación del Código y la Documentación

- **Código y artefactos del sistema:** `Fase 2/Evidencias Proyecto/Evidencias de Sistema`
- **Documentación técnica y de gestión:** `Fase 2/Evidencias Proyecto/Evidencias de Documentación`

## 🛠️ Tecnologías Utilizadas

**Frontend**
- HTML5, CSS3 y JavaScript (Vanilla), sin frameworks ni dependencias de compilación.
- Leaflet + OpenStreetMap para la selección de la dirección de despacho.

**Backend**
- Node.js + Express.
- API REST con validaciones de negocio en el servidor.

**Base de Datos y Persistencia**
- PostgreSQL (modelo relacional de seis tablas).
- LocalStorage para la persistencia del carrito en el navegador.

**Servicios e Infraestructura**
- Transbank Webpay Plus (pagos en línea).
- Nominatim (búsqueda de direcciones).
- Render (servicio web y base de datos administrada).
- Git, GitHub, pgAdmin 4 y Postman.

## ⚙️ Puesta en Marcha Local

### Prerrequisitos

- Node.js 20 o superior (el proyecto declara `>=20 <23`).
- PostgreSQL 14 o superior.
- Git.

### Pasos

1. Clonar el repositorio:

   ```bash
   git clone https://github.com/ThomasPuma/2026_2_MA_CAPSTONE_005D_GRUPO_6.git
   cd 2026_2_MA_CAPSTONE_005D_GRUPO_6
   ```

2. Entrar a la carpeta del sistema:

   ```bash
   cd "Fase 2/Evidencias Proyecto/Evidencias de Sistema"
   ```

3. Crear la base de datos `matteo_masas_db` en PostgreSQL y cargar el esquema:

   ```bash
   psql -U postgres -d matteo_masas_db -f matteo-masas-db.sql
   ```

4. Configurar las variables de entorno en `backend/.env` (hay una plantilla en `backend/.env.example`):

   ```env
   DB_HOST=localhost
   DB_USER=postgres
   DB_PASSWORD=admin
   DB_NAME=matteo_masas_db
   DB_PORT=5432
   PORT=3000
   ADMIN_KEY=cambia_esta_clave_por_una_larga
   ```

5. Instalar dependencias, sincronizar el catálogo y levantar el servidor:

   ```bash
   cd backend
   npm install
   npm run migrate
   npm run seed
   npm start
   ```

6. Abrir la tienda y el panel interno:

   - Tienda: <http://localhost:3000>
   - Panel: <http://localhost:3000/admin>

> El servidor Express sirve también los archivos del frontend, por lo que no es necesario abrir `index.html` por separado. El panel solicita la clave definida en `ADMIN_KEY`.

## ☁️ Despliegue en Render

El repositorio incluye un `render.yaml` en la raíz que declara el servicio web, su directorio de trabajo (`Fase 2/Evidencias Proyecto/Evidencias de Sistema`) y las variables de entorno. Las variables sensibles (`DATABASE_URL`, `ADMIN_KEY`, `PUBLIC_BASE_URL`) se completan manualmente en el panel de Render.

El ambiente de pago de Webpay permanece en **integración** hasta contar con las credenciales de producción del comercio (`WEBPAY_ENVIRONMENT=production`, código de comercio y API key de Transbank).

## 📚 Documentación del Proyecto

| Documento | Contenido |
| --- | --- |
| 01 | Análisis del caso y visión del proyecto |
| 02 | Mapas y Product Backlog (16 HU, 76 SP) |
| 03 | Épicas e historias de usuario con criterios de aceptación |
| 04 | Impact Mapping y User Story Mapping |
| 05 | Modelos de datos y arquitectura (con diagramas de ingeniería) |
| 06 | Sprint Backlog y Scrumboard |
| 07 | Burndown chart y métricas ágiles |
| 08 | Daily meetings y bitácora Scrum (66 sesiones) |
| 09 | Registro de impedimentos y riesgos |
| 10 | Sprint Reviews y retrospectivas |
| 11 | Documento de pruebas (60 casos) |
| 12 | Pruebas de rendimiento (latencia y Lighthouse) |
| — | Informe Final Capstone e Informe de Evidencias QA |
| — | Mejora post-cierre HU17: seguimiento del pedido y notificaciones por correo |

## 📌 Notas Finales

Proyecto elaborado como parte del proceso de la asignatura Capstone de la carrera de Ingeniería en Informática, sección 2026_2_MA_CAPSTONE_005D, Grupo 6.
