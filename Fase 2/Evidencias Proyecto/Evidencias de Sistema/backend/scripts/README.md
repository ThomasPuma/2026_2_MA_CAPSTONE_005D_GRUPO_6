# Scripts de base de datos

## Scripts vigentes

- **`seed-catalogo.js`**: sincroniza categorías, productos y **precios por paquete**
  (`PRESENTACION`) desde el catálogo oficial de Matteo Masas. Es idempotente.

  ```bash
  cd backend
  npm run seed
  ```

- **`migrate-pedidos.js`**: migra la base desde el modelo con stock al modelo
  por pedidos. Crea `CONFIGURACION_NEGOCIO`, `PEDIDO` y `DETALLE_PEDIDO`, y
  elimina la tabla `INVENTARIO` si está vacía. También normaliza bases creadas
  con versiones anteriores del esquema (por ejemplo, con `modalidad`,
  `direccion_entrega` o `precio_historico`) y deja un respaldo con marca de
  tiempo antes de modificarlas.

  ```bash
  cd backend
  npm run migrate
  ```

  Después de migrar, ejecuta `npm run seed` para dejar el catálogo actualizado.

## Scripts obsoletos

Los siguientes scripts fueron creados por una versión anterior y trabajaban con
precios unitarios calculados (por ejemplo, dividir el valor del paquete entre la
cantidad de unidades). **No deben ejecutarse:**

- `update-precios.js`
- `add-unit-format.js`
- `update-data.js`
- `update-db.js`
- `../setup-database.js` (inserta productos antiguos que ya no están en el catálogo)
- `../fix-db.js`

El precio que se muestra en la web siempre debe ser el precio del paquete o
formato de venta registrado en la tabla `PRESENTACION`.
