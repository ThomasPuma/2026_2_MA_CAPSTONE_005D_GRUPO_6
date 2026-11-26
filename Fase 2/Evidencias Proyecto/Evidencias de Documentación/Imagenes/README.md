# Imágenes y Evidencias Visuales — Matteo Masas

Esta carpeta reúne, por separado y en tamaño completo, los diagramas y las capturas que respaldan la documentación del proyecto. Los diagramas están además embebidos en el documento **05 — Modelos de Datos y Arquitectura**, y las capturas se citan en los documentos **11 — Documento de Pruebas** y **12 — Pruebas de Rendimiento**.

## 📐 Diagramas de Ingeniería

Modelos elaborados con el lenguaje **D2** de Terrastruct. Las fuentes editables están en `Diagramas/Fuentes-D2/`.

| Archivo | Contenido |
| --- | --- |
| `d1_er.png` | Modelo entidad-relación: seis tablas normalizadas (categoría, producto, presentación, configuración, pedido y detalle del pedido) con claves y relaciones. |
| `d2_arquitectura.png` | Arquitectura de componentes y stack tecnológico: frontend, API REST, PostgreSQL y servicios externos. |
| `d3_despliegue.png` | Diagrama de despliegue en Render: servicio web, base de datos administrada, HTTPS y pasarela Transbank. |
| `d4_pedido.png` | Flujo de creación de un pedido: catálogo, carrito, validación de cupo, pago y confirmación. |
| `d5_panel.png` | Flujo operativo del panel administrativo: pedidos del día, estados, pagos y configuración. |
| `d6_estado_pedido.png` | Máquina de estados del pedido: Pendiente → Confirmado → En preparación → Listo → Entregado, con cancelación y reactivación. |
| `d7_estado_pago.png` | Máquina de estados del pago: abono, saldo, pago completo, rechazo, expiración y reembolso. |

## 📱 Capturas Responsive

Vistas de la tienda y del panel en los tres tamaños evaluados.

| Archivo | Contenido |
| --- | --- |
| `tienda_360.png` | Tienda pública en móvil (360 px). |
| `tienda_768.png` | Tienda pública en tablet (768 px). |
| `tienda_1280.png` | Tienda pública en escritorio (1280 px). |
| `panel_360.png` | Panel administrativo en móvil (360 px). |
| `panel_768.png` | Panel administrativo en tablet (768 px). |
| `panel_1280.png` | Panel administrativo en escritorio (1280 px). |

## ✅ Evidencias de la Suite QA de Producción

Capturas obtenidas al ejecutar los 60 casos de prueba contra el sitio desplegado en <https://matteo-masas.onrender.com>.

| Archivo | Evidencia |
| --- | --- |
| `nav01_filtro_categoria.png` | Filtro por categoría en el catálogo. |
| `nav02_busqueda_sin_resultados.png` | Estado vacío del buscador sin coincidencias. |
| `nav03_inyeccion_buscador.png` | Intento de inyección en el buscador, neutralizado. |
| `car01_despacho_exige_direccion.png` | Checkout que exige dirección cuando se elige despacho a domicilio. |
| `ped01_comprobante_codigo.png` | Comprobante con código único de seguimiento. |
| `wpay01_formulario_transbank.png` | Formulario de pago de Webpay Plus (ambiente de integración). |
| `est01_estado_pendiente.png` | Pedido en estado Pendiente. |
| `est02_estado_confirmado.png` | Pedido en estado Confirmado. |
| `est03_estado_en_preparacion.png` | Pedido en estado En preparación. |
| `est04_estado_listo.png` | Pedido en estado Listo. |
| `adm01_panel_resumen.png` | Panel con el resumen de pedidos del día. |
| `adm02_cupo_completo.png` | Panel cuando el cupo del día está completo. |
| `cambio_variantes_panes.png` | Catálogo con las variantes de panes separadas (Canapé/Tapadito y Mini Completo/Mini Frica). |
| `conc_reporte.png` | Resultado de la prueba de concurrencia sobre el último cupo. |
| `perf01_latencia.png` | Medición de latencia de la API en producción (p95). |
| `perf02_lighthouse_puntajes.png` | Puntajes de Lighthouse: rendimiento, accesibilidad, buenas prácticas y SEO. |
| `metricas_tablero.png` | Métricas del tablero de seguimiento. |
| `a11y01_foco_buscador.png` | Foco visible en el buscador (accesibilidad con teclado). |
| `seg_reporte.png` | Reporte consolidado de las pruebas de seguridad. |
| `seg05_privacidad_codigo.png` | Consulta pública del comprobante sin datos personales. |
| `seg06_limite_429.png` | Respuesta 429 al superar el límite de solicitudes. |
| `rq01_movil_360.png` | Verificación responsive en móvil (360 px). |
| `rq02_tablet_768.png` | Verificación responsive en tablet (768 px). |
| `rq03_escritorio_1280.png` | Verificación responsive en escritorio (1280 px). |
