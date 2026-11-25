/**
 * Migración de modelo de negocio:
 *  - La amasandería deja de trabajar con stock y pasa a trabajar por pedidos.
 *  - Se agrega un cupo máximo de pedidos por día (capacidad de trabajo).
 *  - Se crean las tablas PEDIDO y DETALLE_PEDIDO para el carrito sin login.
 *
 * También normaliza bases creadas con versiones anteriores del esquema
 * (por ejemplo, con columnas modalidad / direccion_entrega / precio_historico).
 * Antes de modificar un esquema antiguo se guarda un respaldo con marca de
 * tiempo. Es idempotente: se puede ejecutar varias veces.
 *
 * Uso:  cd backend && npm run migrate
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/database');

/* ------------------------------------------------------------------ */
/* Utilidades                                                         */
/* ------------------------------------------------------------------ */

async function tablaExiste(client, tabla) {
  const resultado = await client.query('SELECT to_regclass($1) AS tabla', [
    `public.${tabla}`,
  ]);
  return Boolean(resultado.rows[0].tabla);
}

async function columnasDe(client, tabla) {
  const resultado = await client.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    `,
    [tabla]
  );

  return new Set(resultado.rows.map((fila) => fila.column_name));
}

function selloTiempo() {
  return new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, '')
    .slice(0, 14);
}

async function respaldarTabla(client, tabla) {
  const destino = `${tabla}_backup_${selloTiempo()}`;
  await client.query(`CREATE TABLE ${destino} AS TABLE ${tabla}`);
  console.log(`   Respaldo creado: ${destino}`);
  return destino;
}

/**
 * Renombra una columna antigua al nombre que usa la aplicación. Si por algún
 * motivo ya existen ambas columnas, conserva los datos de la nueva y elimina
 * la antigua.
 */
async function normalizarColumna(client, tabla, origen, destino, columnas) {
  if (!columnas.has(origen)) return false;

  if (!columnas.has(destino)) {
    await client.query(
      `ALTER TABLE ${tabla} RENAME COLUMN ${origen} TO ${destino}`
    );
    columnas.delete(origen);
    columnas.add(destino);
    console.log(`   ${tabla}.${origen} → ${destino}`);
    return true;
  }

  await client.query(
    `UPDATE ${tabla} SET ${destino} = COALESCE(${destino}, ${origen})`
  );
  await client.query(`ALTER TABLE ${tabla} DROP COLUMN ${origen} CASCADE`);
  columnas.delete(origen);
  console.log(`   ${tabla}.${origen} unificada en ${destino}`);
  return true;
}

async function crearEsquemaCatalogo(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS CATEGORIA (
      id_categoria SERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS PRODUCTO (
      id_producto SERIAL PRIMARY KEY,
      id_categoria INT REFERENCES CATEGORIA(id_categoria),
      nombre VARCHAR(150) NOT NULL,
      descripcion TEXT,
      imagen_url VARCHAR(255),
      activo BOOLEAN DEFAULT TRUE,
      grupo VARCHAR(150),
      variante VARCHAR(100),
      creado_en TIMESTAMPTZ DEFAULT NOW(),
      actualizado_en TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE PRODUCTO ADD COLUMN IF NOT EXISTS grupo VARCHAR(150);
    ALTER TABLE PRODUCTO ADD COLUMN IF NOT EXISTS variante VARCHAR(100);
    ALTER TABLE PRODUCTO ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE;
    ALTER TABLE PRODUCTO ADD COLUMN IF NOT EXISTS imagen_url VARCHAR(255);

    CREATE TABLE IF NOT EXISTS PRESENTACION (
      id_presentacion SERIAL PRIMARY KEY,
      id_producto INT NOT NULL REFERENCES PRODUCTO(id_producto) ON DELETE CASCADE,
      etiqueta VARCHAR(100) NOT NULL,
      cantidad NUMERIC(10, 2) NOT NULL CHECK (cantidad > 0),
      unidad VARCHAR(20) NOT NULL DEFAULT 'unidad',
      precio NUMERIC(10, 2) NOT NULL CHECK (precio > 0),
      orden INT NOT NULL DEFAULT 1,
      UNIQUE (id_producto, etiqueta)
    );
  `);
}

/* ------------------------------------------------------------------ */
/* Esquema actual                                                     */
/* ------------------------------------------------------------------ */

async function crearEsquemaPedidos(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS PEDIDO (
      id_pedido SERIAL PRIMARY KEY,
      codigo VARCHAR(24) NOT NULL UNIQUE,
      nombre_cliente VARCHAR(150) NOT NULL,
      telefono VARCHAR(30) NOT NULL,
      email VARCHAR(150),
      tipo_entrega VARCHAR(20) NOT NULL
        CHECK (tipo_entrega IN ('retiro', 'despacho')),
      direccion VARCHAR(255),
      lat_entrega NUMERIC(10, 7),
      lng_entrega NUMERIC(10, 7),
      distancia_km NUMERIC(7, 2),
      fuera_comuna BOOLEAN,
      despacho_gratis BOOLEAN,
      fecha_entrega DATE NOT NULL,
      metodo_pago VARCHAR(20) NOT NULL
        CHECK (metodo_pago IN ('efectivo', 'tarjeta', 'transferencia', 'webpay')),
      estado_pago VARCHAR(20) NOT NULL DEFAULT 'pendiente'
        CHECK (estado_pago IN (
          'pendiente',
          'abono_pendiente',
          'abono_pagado',
          'pagado',
          'rechazado',
          'anulado',
          'reembolsado',
          'expirado'
        )),
      pagado_en TIMESTAMPTZ,
      monto_abono NUMERIC(10, 2) NOT NULL DEFAULT 0
        CHECK (monto_abono >= 0),
      saldo_pendiente NUMERIC(10, 2) NOT NULL DEFAULT 0
        CHECK (saldo_pendiente >= 0),
      abono_pagado BOOLEAN NOT NULL DEFAULT FALSE,
      abono_pagado_en TIMESTAMPTZ,
      webpay_token VARCHAR(255),
      webpay_orden_compra VARCHAR(64),
      webpay_sesion VARCHAR(64),
      webpay_autorizacion VARCHAR(64),
      webpay_tipo_pago VARCHAR(20),
      webpay_cuotas INT,
      webpay_fecha_pago TIMESTAMPTZ,
      webpay_detalle JSONB,
      notas TEXT,
      subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
      costo_despacho NUMERIC(10, 2) NOT NULL DEFAULT 0
        CHECK (costo_despacho >= 0),
      total NUMERIC(10, 2) NOT NULL CHECK (total >= 0),
      estado VARCHAR(20) NOT NULL DEFAULT 'pendiente'
        CHECK (estado IN (
          'pendiente',
          'confirmado',
          'en_preparacion',
          'listo',
          'entregado',
          'cancelado'
        )),
      creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT pedido_despacho_con_direccion CHECK (
        tipo_entrega <> 'despacho'
        OR (direccion IS NOT NULL AND length(trim(direccion)) > 0)
      )
    );

    CREATE TABLE IF NOT EXISTS DETALLE_PEDIDO (
      id_detalle SERIAL PRIMARY KEY,
      id_pedido INT NOT NULL REFERENCES PEDIDO(id_pedido) ON DELETE CASCADE,
      id_producto INT REFERENCES PRODUCTO(id_producto) ON DELETE SET NULL,
      id_presentacion INT REFERENCES PRESENTACION(id_presentacion) ON DELETE SET NULL,
      nombre_producto VARCHAR(150) NOT NULL,
      presentacion_etiqueta VARCHAR(100) NOT NULL,
      presentacion_unidad VARCHAR(20) NOT NULL DEFAULT 'unidad',
      unidades_por_paquete NUMERIC(10, 2) NOT NULL,
      precio_unitario NUMERIC(10, 2) NOT NULL CHECK (precio_unitario >= 0),
      cantidad INT NOT NULL CHECK (cantidad > 0),
      subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0)
    );

    CREATE INDEX IF NOT EXISTS idx_pedido_fecha_entrega
      ON PEDIDO(fecha_entrega);
    CREATE INDEX IF NOT EXISTS idx_pedido_estado
      ON PEDIDO(estado);
    CREATE INDEX IF NOT EXISTS idx_detalle_pedido
      ON DETALLE_PEDIDO(id_pedido);

    ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS lat_entrega NUMERIC(10, 7);
    ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS lng_entrega NUMERIC(10, 7);
    ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS distancia_km NUMERIC(7, 2);
    ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS fuera_comuna BOOLEAN;
    ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS despacho_gratis BOOLEAN;

    -- Datos de pago online (Webpay Plus)
    ALTER TABLE PEDIDO
      ADD COLUMN IF NOT EXISTS estado_pago VARCHAR(20) NOT NULL DEFAULT 'pendiente';
    ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS pagado_en TIMESTAMPTZ;
    ALTER TABLE PEDIDO
      ADD COLUMN IF NOT EXISTS monto_abono NUMERIC(10, 2) NOT NULL DEFAULT 0;
    ALTER TABLE PEDIDO
      ADD COLUMN IF NOT EXISTS saldo_pendiente NUMERIC(10, 2) NOT NULL DEFAULT 0;
    ALTER TABLE PEDIDO
      ADD COLUMN IF NOT EXISTS abono_pagado BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS abono_pagado_en TIMESTAMPTZ;
    ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS webpay_token VARCHAR(255);
    ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS webpay_orden_compra VARCHAR(64);
    ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS webpay_sesion VARCHAR(64);
    ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS webpay_autorizacion VARCHAR(64);
    ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS webpay_tipo_pago VARCHAR(20);
    ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS webpay_cuotas INT;
    ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS webpay_fecha_pago TIMESTAMPTZ;
    ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS webpay_detalle JSONB;

    -- Control de reenvíos: cada solicitud del carrito trae una clave única.
    ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS clave_solicitud VARCHAR(64);
    ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS huella_solicitud VARCHAR(64);
    ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS webpay_url VARCHAR(500);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pedido_clave_solicitud
      ON PEDIDO(clave_solicitud);

    -- Compatibilidad con esquemas anteriores que ya tenían columnas Webpay.
    UPDATE PEDIDO SET estado_pago = 'pendiente' WHERE estado_pago IS NULL;
    ALTER TABLE PEDIDO ALTER COLUMN estado_pago SET DEFAULT 'pendiente';
    ALTER TABLE PEDIDO ALTER COLUMN estado_pago SET NOT NULL;

    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'pedido'
          AND column_name = 'pagado_en'
          AND data_type <> 'timestamp with time zone'
      ) THEN
        ALTER TABLE PEDIDO
          ALTER COLUMN pagado_en TYPE TIMESTAMPTZ
          USING pagado_en::timestamp AT TIME ZONE 'UTC';
      END IF;
    END $$;

    ALTER TABLE PEDIDO DROP CONSTRAINT IF EXISTS pedido_estado_pago_check;
    ALTER TABLE PEDIDO
      ADD CONSTRAINT pedido_estado_pago_check
      CHECK (estado_pago IN (
        'pendiente',
        'abono_pendiente',
        'abono_pagado',
        'pagado',
        'rechazado',
        'anulado',
        'reembolsado',
        'expirado'
      ));

    -- Versiones anteriores exigían distancia > 0, lo que impedía entregas
    -- en el mismo punto del local. La distancia 0 es válida.
    ALTER TABLE PEDIDO DROP CONSTRAINT IF EXISTS pedido_distancia_km_check;
    ALTER TABLE PEDIDO
      ADD CONSTRAINT pedido_distancia_km_check
      CHECK (distancia_km IS NULL OR distancia_km >= 0);

    CREATE INDEX IF NOT EXISTS idx_pedido_webpay_orden
      ON PEDIDO(webpay_orden_compra);
    CREATE INDEX IF NOT EXISTS idx_pedido_webpay_pendiente
      ON PEDIDO(metodo_pago, estado_pago, creado_en);
  `);
}

/**
 * Ajusta una base que ya tiene tablas de pedidos compatibles pero con
 * diferencias de nombres, estados o restricciones.
 */
async function normalizarTablasExistentes(client) {
  let columnasPedido = await columnasDe(client, 'pedido');
  const columnasDetalle = await columnasDe(client, 'detalle_pedido');

  const esquemaAntiguo =
    columnasPedido.has('modalidad') ||
    columnasPedido.has('direccion_entrega') ||
    columnasDetalle.has('precio_historico');

  if (esquemaAntiguo) {
    console.log('ℹ️  Esquema de pedidos de una versión anterior detectado.');
    console.log('   Creando respaldo antes de normalizar...');
    await respaldarTabla(client, 'pedido');
    await respaldarTabla(client, 'detalle_pedido');
  }

  await normalizarColumna(
    client,
    'pedido',
    'modalidad',
    'tipo_entrega',
    columnasPedido
  );
  await normalizarColumna(
    client,
    'pedido',
    'direccion_entrega',
    'direccion',
    columnasPedido
  );
  await normalizarColumna(
    client,
    'detalle_pedido',
    'precio_historico',
    'precio_unitario',
    columnasDetalle
  );

  // Completa columnas opcionales si la base venía de un esquema intermedio.
  await client.query(`
    ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS email VARCHAR(150);
    ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS tipo_entrega VARCHAR(20);
    ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS direccion VARCHAR(255);
    ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS notas TEXT;

    ALTER TABLE DETALLE_PEDIDO
      ADD COLUMN IF NOT EXISTS precio_unitario NUMERIC(10, 2);
    ALTER TABLE DETALLE_PEDIDO
      ADD COLUMN IF NOT EXISTS presentacion_etiqueta VARCHAR(100);
    ALTER TABLE DETALLE_PEDIDO
      ADD COLUMN IF NOT EXISTS presentacion_unidad VARCHAR(20) DEFAULT 'unidad';
    ALTER TABLE DETALLE_PEDIDO
      ADD COLUMN IF NOT EXISTS unidades_por_paquete NUMERIC(10, 2);
  `);

  // Pedidos antiguos con pago online se conservan como 'webpay': ahora ese
  // valor es válido y permite distinguirlos de la tarjeta presencial.

  await client.query(`
    UPDATE PEDIDO
    SET tipo_entrega = 'retiro'
    WHERE tipo_entrega IS NULL
  `);

  await client.query(`
    UPDATE DETALLE_PEDIDO
    SET precio_unitario = 0
    WHERE precio_unitario IS NULL
  `);

  // Se eliminan restricciones antiguas de zona/distancia: el cálculo actual
  // se valida en la aplicación y admite entregas sin coordenadas históricas.
  await client.query(
    'ALTER TABLE PEDIDO DROP CONSTRAINT IF EXISTS pedido_despacho_con_distancia'
  );

  // Reemplaza las restricciones por las del modelo por pedidos actual.
  await client.query(`
    ALTER TABLE PEDIDO DROP CONSTRAINT IF EXISTS pedido_tipo_entrega_check;
    ALTER TABLE PEDIDO
      ADD CONSTRAINT pedido_tipo_entrega_check
      CHECK (tipo_entrega IN ('retiro', 'despacho'));

    ALTER TABLE PEDIDO DROP CONSTRAINT IF EXISTS pedido_metodo_pago_check;
    ALTER TABLE PEDIDO
      ADD CONSTRAINT pedido_metodo_pago_check
      CHECK (metodo_pago IN ('efectivo', 'tarjeta', 'transferencia', 'webpay'));

    ALTER TABLE PEDIDO DROP CONSTRAINT IF EXISTS pedido_estado_check;
    ALTER TABLE PEDIDO
      ADD CONSTRAINT pedido_estado_check
      CHECK (estado IN (
        'pendiente',
        'confirmado',
        'en_preparacion',
        'listo',
        'entregado',
        'cancelado'
      ));

    ALTER TABLE PEDIDO DROP CONSTRAINT IF EXISTS pedido_despacho_con_direccion;
    ALTER TABLE PEDIDO
      ADD CONSTRAINT pedido_despacho_con_direccion
      CHECK (
        tipo_entrega <> 'despacho'
        OR (direccion IS NOT NULL AND length(trim(direccion)) > 0)
      );
  `);

  // En versiones intermedias la clave de idempotencia era obligatoria.
  // La aplicación actual no la usa: se deja opcional sin borrar datos.
  if (columnasPedido.has('idempotency_key')) {
    await client.query(
      'ALTER TABLE PEDIDO ALTER COLUMN idempotency_key DROP NOT NULL'
    );
  }

  console.log('✅ Esquema de pedidos normalizado.');
}

/**
 * Si encuentra tablas de pedidos de una versión incompatible, las respalda
 * con marca de tiempo y las elimina para crearlas de nuevo.
 */
async function prepararTablasDePedidos(client) {
  const hayPedido = await tablaExiste(client, 'pedido');
  const hayDetalle = await tablaExiste(client, 'detalle_pedido');

  if (!hayPedido && !hayDetalle) return;

  const columnasPedido = hayPedido
    ? await columnasDe(client, 'pedido')
    : new Set();
  const columnasDetalle = hayDetalle
    ? await columnasDe(client, 'detalle_pedido')
    : new Set();

  const compatible =
    hayPedido &&
    hayDetalle &&
    columnasPedido.has('codigo') &&
    columnasPedido.has('nombre_cliente') &&
    columnasPedido.has('fecha_entrega') &&
    columnasDetalle.has('id_pedido') &&
    columnasDetalle.has('cantidad');

  if (compatible) {
    await normalizarTablasExistentes(client);
    return;
  }

  console.log('ℹ️  Tablas de pedidos de una versión anterior detectadas.');
  console.log('   Se respaldarán antes de crear el esquema actual.');

  if (hayDetalle) {
    await respaldarTabla(client, 'detalle_pedido');
    await client.query('DROP TABLE DETALLE_PEDIDO CASCADE');
  }

  if (hayPedido) {
    await respaldarTabla(client, 'pedido');
    await client.query('DROP TABLE PEDIDO CASCADE');
  }

  console.log('✅ Datos anteriores respaldados.');
}

async function quitarInventario(client) {
  if (!(await tablaExiste(client, 'inventario'))) return;

  const resultado = await client.query(
    'SELECT COUNT(*)::int AS total FROM INVENTARIO'
  );

  if (resultado.rows[0].total === 0) {
    await client.query('DROP TABLE INVENTARIO');
    console.log('✅ Tabla INVENTARIO eliminada (modelo sin stock)');
  } else {
    console.log(
      'ℹ️  INVENTARIO contiene datos; se conserva para revisión manual.'
    );
  }
}

/* ------------------------------------------------------------------ */
/* Ejecución                                                          */
/* ------------------------------------------------------------------ */

async function main() {
  const client = await pool.connect();

  try {
    console.log('=== Migrando Matteo Masas al modelo por pedidos ===\n');
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS CONFIGURACION_NEGOCIO (
        id_configuracion INT PRIMARY KEY DEFAULT 1 CHECK (id_configuracion = 1),
        capacidad_pedidos_por_dia INT NOT NULL DEFAULT 6
          CHECK (capacidad_pedidos_por_dia > 0),
        dias_anticipacion_minima INT NOT NULL DEFAULT 1
          CHECK (dias_anticipacion_minima >= 0),
        dias_maximos_reserva INT NOT NULL DEFAULT 21
          CHECK (dias_maximos_reserva >= 1),
        dias_cerrados_semana INT[] NOT NULL DEFAULT '{0}',
        costo_despacho NUMERIC(10, 2) NOT NULL DEFAULT 0
          CHECK (costo_despacho >= 0),
        lat_tienda NUMERIC(10, 7) NOT NULL DEFAULT -33.5704813,
        lng_tienda NUMERIC(10, 7) NOT NULL DEFAULT -70.8156668,
        monto_despacho_gratis NUMERIC(10, 2) NOT NULL DEFAULT 15000
          CHECK (monto_despacho_gratis >= 0),
        tarifa_base_despacho NUMERIC(10, 2) NOT NULL DEFAULT 1500
          CHECK (tarifa_base_despacho >= 0),
        km_base_despacho NUMERIC(7, 2) NOT NULL DEFAULT 3
          CHECK (km_base_despacho >= 0),
        tarifa_km_adicional NUMERIC(10, 2) NOT NULL DEFAULT 750
          CHECK (tarifa_km_adicional >= 0),
        actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      INSERT INTO CONFIGURACION_NEGOCIO (
        id_configuracion,
        capacidad_pedidos_por_dia,
        dias_anticipacion_minima,
        dias_maximos_reserva,
        dias_cerrados_semana,
        costo_despacho
      )
      VALUES (1, 6, 1, 21, '{0}', 0)
      ON CONFLICT (id_configuracion) DO NOTHING;

      ALTER TABLE CONFIGURACION_NEGOCIO
        ADD COLUMN IF NOT EXISTS lat_tienda NUMERIC(10, 7) NOT NULL DEFAULT -33.5704813;
      ALTER TABLE CONFIGURACION_NEGOCIO
        ADD COLUMN IF NOT EXISTS lng_tienda NUMERIC(10, 7) NOT NULL DEFAULT -70.8156668;
      ALTER TABLE CONFIGURACION_NEGOCIO
        ADD COLUMN IF NOT EXISTS monto_despacho_gratis NUMERIC(10, 2) NOT NULL DEFAULT 15000;
      ALTER TABLE CONFIGURACION_NEGOCIO
        ADD COLUMN IF NOT EXISTS tarifa_base_despacho NUMERIC(10, 2) NOT NULL DEFAULT 1500;
      ALTER TABLE CONFIGURACION_NEGOCIO
        ADD COLUMN IF NOT EXISTS km_base_despacho NUMERIC(7, 2) NOT NULL DEFAULT 3;
      ALTER TABLE CONFIGURACION_NEGOCIO
        ADD COLUMN IF NOT EXISTS tarifa_km_adicional NUMERIC(10, 2) NOT NULL DEFAULT 750;
    `);
    console.log('✅ CONFIGURACION_NEGOCIO lista (cupo inicial: 6 pedidos/día)');

    await prepararTablasDePedidos(client);
    await crearEsquemaCatalogo(client);
    await crearEsquemaPedidos(client);
    console.log('✅ Tablas PEDIDO y DETALLE_PEDIDO listas');

    await quitarInventario(client);

    await client.query('COMMIT');
    console.log('\n✅ Migración completada correctamente.\n');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error al migrar la base de datos:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
