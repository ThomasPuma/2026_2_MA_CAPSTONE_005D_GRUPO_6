# Scripts de base de datos

## Scripts disponibles

- **`migrate-pedidos.js`**: crea y actualiza el esquema de Matteo Masas (`CATEGORIA`, `PRODUCTO`, `PRESENTACION`, `CONFIGURACION_NEGOCIO`, `PEDIDO`, `DETALLE_PEDIDO`, `HISTORIAL_ESTADO_PEDIDO` y `NOTIFICACION_CORREO`). También normaliza bases creadas con versiones anteriores del esquema y deja un respaldo con marca de tiempo antes de modificarlas. Es idempotente.

  ```bash
  cd backend
  npm run migrate
  ```

- **`seed-catalogo.js`**: sincroniza categorías, productos y **precios por paquete** (`PRESENTACION`) desde el catálogo oficial de Matteo Masas. Es idempotente.

  ```bash
  cd backend
  npm run seed
  ```

- **`tmp-test-cupo.js`**: prueba de concurrencia que verifica que múltiples solicitudes simultáneas por los cupos de una fecha respeten la capacidad diaria sin sobreventa.
