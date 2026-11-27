# Diagramas para la presentación — Matteo Masas

Versiones pensadas para **una diapositiva por diagrama** (16:9). Se generaron con
D2 (`--layout=elk --theme=1 --scale=2 --pad=10`) y se recortó el margen externo
para aprovechar el espacio.

| Orden | Archivo | Qué muestra |
| --- | --- | --- |
| 1 | `p1_er.png` | MER resumido: las 8 tablas con claves y campos principales. |
| 2 | `p2_arquitectura.png` | Arquitectura: tienda, panel, seguimiento, API, PostgreSQL, Webpay y correo. |
| 3 | `p3_despliegue.png` | Desarrollo local y producción en Render (HTTPS, Webpay y API de correo). |
| 4 | `p4_pedido.png` | Proceso de compra como diagrama de secuencia (cliente, servidor, BD, correo y Webpay). |
| 5 | `p5_panel.png` | Operación del panel: pedidos, estados, pagos, configuración y aviso de pedido nuevo. |
| 6 | `p6_estado_pedido.png` | Máquina de estados del pedido. |
| 7 | `p7_estado_pago.png` | Estados del pago (abono, pagado, rechazado, expirado, reembolsado). |

## Notas

- **p1** es una versión resumida del MER para que sea legible en pantalla. El MER
  completo, con todas las columnas, está en `../d1_er.png` y en el documento 05.
- **p4** reemplaza el diagrama de flujo detallado por un diagrama de secuencia,
  más claro para explicar el proceso en una diapositiva. El flujo detallado
  (decisiones de entrega, pago, cupo e idempotencia) sigue en `../d4_pedido.png`
  y en el documento 05.
- **p2, p3, p5, p6 y p7** son las mismas versiones del documento, recompiladas
  con menos margen externo.
- Las fuentes editables de `p1` y `p4` están en esta carpeta. `p4` se recortó
  después de compilar para quitar el margen izquierdo que agrega D2.

## Uso en la presentación

Inserta cada PNG en una diapositiva, déjalo ocupar el ancho útil (debajo del
título) y evita escalarlo por debajo del 60 % de su tamaño original. Los
diagramas están a 2× de resolución, así que se mantienen nítidos al proyectar.
