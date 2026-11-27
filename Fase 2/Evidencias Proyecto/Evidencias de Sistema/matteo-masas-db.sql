-- ============================================================
-- MATTEO MASAS - Esquema y catálogo de precios
-- Modelo de negocio: pedidos por encargo, sin stock.
-- Los precios de venta se guardan por PAQUETE en PRESENTACION.
-- Para actualizar una base ya existente:
--   cd backend && npm run migrate && npm run seed
-- ============================================================

-- Tabla CATEGORIA
CREATE TABLE IF NOT EXISTS CATEGORIA (
    id_categoria SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL
);

-- Tabla PRODUCTO
CREATE TABLE IF NOT EXISTS PRODUCTO (
    id_producto SERIAL PRIMARY KEY,
    id_categoria INT REFERENCES CATEGORIA(id_categoria),
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    imagen_url VARCHAR(255),
    activo BOOLEAN DEFAULT TRUE,
    grupo VARCHAR(150),
    variante VARCHAR(100)
);
ALTER TABLE PRODUCTO ADD COLUMN IF NOT EXISTS grupo VARCHAR(150);
ALTER TABLE PRODUCTO ADD COLUMN IF NOT EXISTS variante VARCHAR(100);
ALTER TABLE PRODUCTO ADD COLUMN IF NOT EXISTS creado_en TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE PRODUCTO ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ DEFAULT NOW();

-- Tabla PRESENTACION (precios por paquete / formato de venta)
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

-- ============================================================
-- MODELO POR PEDIDOS (sin stock)
-- La clienta trabaja sola y limita la cantidad de pedidos
-- que puede preparar cada día.
-- ============================================================

CREATE TABLE IF NOT EXISTS CONFIGURACION_NEGOCIO (
    id_configuracion INT PRIMARY KEY DEFAULT 1 CHECK (id_configuracion = 1),
    capacidad_pedidos_por_dia INT NOT NULL DEFAULT 6
        CHECK (capacidad_pedidos_por_dia > 0),
    dias_anticipacion_minima INT NOT NULL DEFAULT 1
        CHECK (dias_anticipacion_minima >= 0),
    dias_maximos_reserva INT NOT NULL DEFAULT 21
        CHECK (dias_maximos_reserva >= 1),
    -- 0 = domingo, 1 = lunes, ... 6 = sábado
    dias_cerrados_semana INT[] NOT NULL DEFAULT '{0}',
    costo_despacho NUMERIC(10, 2) NOT NULL DEFAULT 0
        CHECK (costo_despacho >= 0),
    -- Reglas de despacho por zona y distancia
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
    distancia_km NUMERIC(7, 2) CHECK (distancia_km IS NULL OR distancia_km >= 0),
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
    monto_abono NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (monto_abono >= 0),
    saldo_pendiente NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (saldo_pendiente >= 0),
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

CREATE INDEX IF NOT EXISTS idx_pedido_fecha_entrega ON PEDIDO(fecha_entrega);
CREATE INDEX IF NOT EXISTS idx_pedido_estado ON PEDIDO(estado);
CREATE INDEX IF NOT EXISTS idx_detalle_pedido ON DETALLE_PEDIDO(id_pedido);

-- Compatibilidad con bases creadas antes de Webpay.
ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS estado_pago VARCHAR(20) NOT NULL DEFAULT 'pendiente';
ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS pagado_en TIMESTAMPTZ;
ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS monto_abono NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS saldo_pendiente NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS abono_pagado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS abono_pagado_en TIMESTAMPTZ;
ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS webpay_token VARCHAR(255);
ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS webpay_orden_compra VARCHAR(64);
ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS webpay_sesion VARCHAR(64);
ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS webpay_autorizacion VARCHAR(64);
ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS webpay_tipo_pago VARCHAR(20);
ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS webpay_cuotas INT;
ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS webpay_fecha_pago TIMESTAMPTZ;
ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS webpay_detalle JSONB;
ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS webpay_url VARCHAR(500);
ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS clave_solicitud VARCHAR(64);
ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS huella_solicitud VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pedido_clave_solicitud ON PEDIDO(clave_solicitud);

UPDATE PEDIDO SET estado_pago = 'pendiente' WHERE estado_pago IS NULL;
ALTER TABLE PEDIDO ALTER COLUMN estado_pago SET DEFAULT 'pendiente';
ALTER TABLE PEDIDO ALTER COLUMN estado_pago SET NOT NULL;

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

CREATE INDEX IF NOT EXISTS idx_pedido_webpay_orden ON PEDIDO(webpay_orden_compra);
CREATE INDEX IF NOT EXISTS idx_pedido_webpay_pendiente ON PEDIDO(metodo_pago, estado_pago, creado_en);

-- Notificaciones por correo y seguimiento del pedido
ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS email_confirmacion_enviado_en TIMESTAMPTZ;
ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS email_pago_enviado_en TIMESTAMPTZ;
ALTER TABLE PEDIDO ADD COLUMN IF NOT EXISTS ultimo_estado_notificado VARCHAR(20);

CREATE TABLE IF NOT EXISTS HISTORIAL_ESTADO_PEDIDO (
    id_historial SERIAL PRIMARY KEY,
    id_pedido INT NOT NULL REFERENCES PEDIDO(id_pedido) ON DELETE CASCADE,
    estado_anterior VARCHAR(20),
    estado_nuevo VARCHAR(20) NOT NULL,
    motivo TEXT,
    usuario VARCHAR(30) DEFAULT 'sistema',
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE HISTORIAL_ESTADO_PEDIDO
    ADD COLUMN IF NOT EXISTS estado_anterior VARCHAR(20);
ALTER TABLE HISTORIAL_ESTADO_PEDIDO
    ADD COLUMN IF NOT EXISTS estado_nuevo VARCHAR(20);
ALTER TABLE HISTORIAL_ESTADO_PEDIDO
    ADD COLUMN IF NOT EXISTS motivo TEXT;
ALTER TABLE HISTORIAL_ESTADO_PEDIDO
    ADD COLUMN IF NOT EXISTS usuario VARCHAR(30) DEFAULT 'sistema';

CREATE INDEX IF NOT EXISTS idx_historial_pedido
    ON HISTORIAL_ESTADO_PEDIDO(id_pedido, creado_en);

CREATE TABLE IF NOT EXISTS NOTIFICACION_CORREO (
    id_notificacion SERIAL PRIMARY KEY,
    id_pedido INT NOT NULL REFERENCES PEDIDO(id_pedido) ON DELETE CASCADE,
    tipo VARCHAR(40) NOT NULL,
    destinatario VARCHAR(150) NOT NULL,
    asunto VARCHAR(200) NOT NULL,
    estado VARCHAR(20) NOT NULL
        CHECK (estado IN ('enviado', 'omitido', 'error')),
    detalle TEXT,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notificacion_pedido
    ON NOTIFICACION_CORREO(id_pedido, creado_en);

-- Pedidos existentes: se registra su estado actual en la bitácora.
INSERT INTO HISTORIAL_ESTADO_PEDIDO
    (id_pedido, estado_anterior, estado_nuevo, motivo, usuario, creado_en)
SELECT
    p.id_pedido,
    NULL,
    p.estado,
    'Estado registrado al migrar el seguimiento del pedido',
    'sistema',
    COALESCE(p.actualizado_en, p.creado_en)
FROM PEDIDO p
WHERE NOT EXISTS (
    SELECT 1 FROM HISTORIAL_ESTADO_PEDIDO h WHERE h.id_pedido = p.id_pedido
);

-- CATEGORÍAS
INSERT INTO CATEGORIA (id_categoria, nombre) VALUES
(5, 'Masas'),
(6, 'Panes'),
(7, 'Dulces y Repostería'),
(8, 'Pizzetas'),
(9, 'Empanadas')
ON CONFLICT (id_categoria) DO UPDATE SET nombre = EXCLUDED.nombre;

-- PRODUCTOS
INSERT INTO PRODUCTO (id_producto, id_categoria, nombre, descripcion, imagen_url, activo, grupo, variante) VALUES
(13, 6, 'Pan de Completo Normal', 'Pan fresco ideal para completos. Se vende en paquete de 10 unidades.', 'images/PanCompletos.jpg', true, 'Pan de Completo', 'Normal'),
(14, 6, 'Pan de Completo Cóctel', 'Pan cóctel fresco para completos. Se vende en paquete de 10 unidades.', 'images/PanCompletos.jpg', true, 'Pan de Completo', 'Cóctel'),
(15, 6, 'Pan de Completo Choripán', 'Pan fresco para choripán. Se vende en paquete de 10 unidades.', 'images/PanCompletos.jpg', true, 'Pan de Completo', 'Choripán'),
(16, 6, 'Pan de Frica Normal', 'Pan fresco para fricas. Se vende en paquete de 10 unidades.', 'images/PanFrica.jpg', true, 'Pan de Frica', 'Normal'),
(17, 6, 'Pan de Frica Cóctel', 'Pan cóctel fresco para fricas. Se vende en paquete de 10 unidades.', 'images/PanFrica.jpg', true, 'Pan de Frica', 'Cóctel'),
(18, 6, 'Pan de Canapé', 'Pan de canapé listo. Se vende por kilo.', 'images/PanCanapeyTapadito.jpg', true, 'Pan de Canapé y Tapadito', 'Canapé'),
(44, 6, 'Pan de Tapadito', 'Pan de tapadito listo. Se vende por kilo.', 'images/PanCanapeyTapadito.jpg', true, 'Pan de Canapé y Tapadito', 'Tapadito'),
(19, 6, 'Pan Mini Completo', 'Pan de colores mini para completos. Se vende en paquete de 10 unidades.', 'images/PandeColores.jpg', true, 'Pan Mini Completo / Mini Frica', 'Mini Completo'),
(45, 6, 'Pan Mini Frica', 'Pan de colores mini para fricas. Se vende en paquete de 10 unidades.', 'images/PandeColores.jpg', true, 'Pan Mini Completo / Mini Frica', 'Mini Frica'),
(20, 5, 'Masa Frita 12 cms', 'Masas fritas artesanales de 12 cms. Paquete de 20 unidades.', 'images/MasasFritas.jpg', true, 'Masa Frita', '12 cms'),
(21, 5, 'Masa Frita 15 cms', 'Masas fritas artesanales de 15 cms. Paquete de 20 unidades.', 'images/MasasFritas.jpg', true, 'Masa Frita', '15 cms'),
(22, 5, 'Masa Frita 18 cms', 'Masas fritas artesanales de 18 cms. Paquete de 20 unidades.', 'images/MasasFritas.jpg', true, 'Masa Frita', '18 cms'),
(23, 5, 'Masa Horno 12 cms', 'Masas de horno artesanales de 12 cms. Paquete de 20 unidades.', 'images/MasasHorno.jpg', true, 'Masa Horno', '12 cms'),
(24, 5, 'Masa Horno 15 cms', 'Masas de horno artesanales de 15 cms. Paquete de 20 unidades.', 'images/MasasHorno.jpg', true, 'Masa Horno', '15 cms'),
(25, 5, 'Masa Horno 18 cms', 'Masas de horno artesanales de 18 cms. Paquete de 20 unidades.', 'images/MasasHorno.jpg', true, 'Masa Horno', '18 cms'),
(26, 5, 'Masa Horno 20 cms', 'Masas de horno artesanales de 20 cms. Paquete de 20 unidades.', 'images/MasasHorno.jpg', true, 'Masa Horno', '20 cms'),
(27, 5, 'Masa Horno 22 cms', 'Masas de horno artesanales de 22 cms. Paquete de 20 unidades.', 'images/MasasHorno.jpg', true, 'Masa Horno', '22 cms'),
(28, 5, 'Masa Sopaipilla Cóctel', 'Sopaipillas cóctel de elaboración casera. Paquete de 50 unidades.', 'images/MasasSopaipillaCoctel.jpg', true, 'Sopaipillas', 'Cóctel'),
(29, 5, 'Masa Sopaipilla Normal', 'Sopaipillas de elaboración casera. Paquete de 20 unidades.', 'images/MasasSopaipillaNormal.jpg', true, 'Sopaipillas', 'Normal'),
(30, 5, 'Calzón Roto', 'Calzón roto de elaboración casera. Disponible en paquete de 24 o 12 unidades.', 'images/CalzonRoto.jpg', true, NULL, NULL),
(32, 9, 'Empanada Queso para Freír 12 cms', 'Empanadas de queso para freír de 12 cms. Se venden en paquete de 12 unidades.', 'images/EmpanadasQueso.jpg', true, 'Empanada de Queso para Freír', '12 cms'),
(33, 9, 'Empanada Queso para Freír 18 cms', 'Empanadas de queso para freír de 18 cms. Se venden en paquete de 10 unidades.', 'images/EmpanadasQueso.jpg', true, 'Empanada de Queso para Freír', '18 cms'),
(34, 9, 'Empanadas Cóctel de Horno', 'Mini empanadas de cóctel al horno, sabores pino, pollo-choclo-queso. Paquete de 50 unidades.', 'images/EmpanadasCoctelHorno.jpg', true, NULL, NULL),
(35, 7, 'Mini Cupcakes', 'Mini cupcakes artesanales. Disponibles por unidad o en paquete de 50.', 'images/MiniCupcakes.jpg', true, NULL, NULL),
(36, 7, 'Algodón de Azúcar', 'Algodón de azúcar. Disponible por unidad o en paquetes de 25 y 50 unidades.', 'images/AlgodonAzucar.jpg', true, NULL, NULL),
(37, 7, 'Cabritas en Pote', 'Cabritas en pote. Disponibles por unidad o en paquetes de 25 y 50 unidades.', 'images/Cabritas.jpg', true, NULL, NULL),
(38, 7, 'Mini-Donas', 'Mini-donas con cobertura de chocolate blanco y negro. Paquetes de 50 o 100 unidades.', 'images/MiniDonas.jpg', true, NULL, NULL),
(39, 7, 'Berlines Medianos Horneados', 'Berlines medianos horneados, rellenos de manjar y crema. Por unidad o en paquetes de 50 y 100 unidades.', 'images/BerlinesMedianos.jpg', true, 'Berlines Horneados', 'Medianos'),
(40, 7, 'Mini Berlines Horneados', 'Mini berlines horneados, rellenos de manjar y crema. Por unidad o en paquete de 50 unidades.', 'images/MiniBerlines.jpg', true, 'Berlines Horneados', 'Mini'),
(41, 7, 'Cake-Pops', 'Cake-pops con cobertura de chocolate blanco y negro. Por unidad o en paquetes de 50 y 100 unidades.', 'images/CakePop.jpg', true, NULL, NULL),
(42, 8, 'Mini Pizzetas (8 cms)', 'Mini pizzetas de 8 cms. Variedades: jamón-queso-tomate-aceituna, jamón-queso-chorizo-aceituna y queso-salame-choclo-aceituna. Bandeja de 8 unidades.', 'images/MiniPizzeta.jpg', true, NULL, NULL)
ON CONFLICT (id_producto) DO UPDATE SET
    id_categoria = EXCLUDED.id_categoria,
    nombre = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    imagen_url = EXCLUDED.imagen_url,
    activo = EXCLUDED.activo,
    grupo = EXCLUDED.grupo,
    variante = EXCLUDED.variante;

-- PRESENTACIONES / PRECIOS POR PAQUETE
INSERT INTO PRESENTACION (id_producto, etiqueta, cantidad, unidad, precio, orden) VALUES
(13, '10 unidades', 10.00, 'unidad', 2000.00, 1),
(14, '10 unidades', 10.00, 'unidad', 1200.00, 1),
(15, '10 unidades', 10.00, 'unidad', 1400.00, 1),
(16, '10 unidades', 10.00, 'unidad', 2000.00, 1),
(17, '10 unidades', 10.00, 'unidad', 1200.00, 1),
(18, '1 kilo', 1.00, 'kg', 2500.00, 1),
(44, '1 kilo', 1.00, 'kg', 2500.00, 1),
(19, '10 unidades', 10.00, 'unidad', 1500.00, 1),
(45, '10 unidades', 10.00, 'unidad', 1500.00, 1),
(20, '20 unidades', 20.00, 'unidad', 2200.00, 1),
(21, '20 unidades', 20.00, 'unidad', 3000.00, 1),
(22, '20 unidades', 20.00, 'unidad', 3400.00, 1),
(23, '20 unidades', 20.00, 'unidad', 2400.00, 1),
(24, '20 unidades', 20.00, 'unidad', 3400.00, 1),
(25, '20 unidades', 20.00, 'unidad', 3800.00, 1),
(26, '20 unidades', 20.00, 'unidad', 4000.00, 1),
(27, '20 unidades', 20.00, 'unidad', 5000.00, 1),
(28, '50 unidades', 50.00, 'unidad', 4000.00, 1),
(29, '20 unidades', 20.00, 'unidad', 2000.00, 1),
(30, '24 unidades', 24.00, 'unidad', 2000.00, 1),
(30, '12 unidades', 12.00, 'unidad', 2000.00, 2),
(32, '12 unidades', 12.00, 'unidad', 3500.00, 1),
(33, '10 unidades', 10.00, 'unidad', 6000.00, 1),
(34, '50 unidades', 50.00, 'unidad', 24000.00, 1),
(35, '1 unidad', 1.00, 'unidad', 450.00, 1),
(35, '50 unidades', 50.00, 'unidad', 20000.00, 2),
(36, '1 unidad', 1.00, 'unidad', 350.00, 1),
(36, '25 unidades', 25.00, 'unidad', 8500.00, 2),
(36, '50 unidades', 50.00, 'unidad', 16000.00, 3),
(37, '1 unidad', 1.00, 'unidad', 350.00, 1),
(37, '25 unidades', 25.00, 'unidad', 8500.00, 2),
(37, '50 unidades', 50.00, 'unidad', 16000.00, 3),
(38, '50 unidades', 50.00, 'unidad', 12000.00, 1),
(38, '100 unidades', 100.00, 'unidad', 20000.00, 2),
(39, '1 unidad', 1.00, 'unidad', 400.00, 1),
(39, '50 unidades', 50.00, 'unidad', 19000.00, 2),
(39, '100 unidades', 100.00, 'unidad', 36000.00, 3),
(40, '1 unidad', 1.00, 'unidad', 300.00, 1),
(40, '50 unidades', 50.00, 'unidad', 12500.00, 2),
(41, '1 unidad', 1.00, 'unidad', 350.00, 1),
(41, '50 unidades', 50.00, 'unidad', 17000.00, 2),
(41, '100 unidades', 100.00, 'unidad', 32000.00, 3),
(42, 'Bandeja de 8 unidades', 8.00, 'unidad', 2600.00, 1)
ON CONFLICT (id_producto, etiqueta) DO UPDATE SET
    cantidad = EXCLUDED.cantidad,
    unidad = EXCLUDED.unidad,
    precio = EXCLUDED.precio,
    orden = EXCLUDED.orden;

-- Sincronizar secuencias
SELECT setval(pg_get_serial_sequence('categoria', 'id_categoria'), (SELECT MAX(id_categoria) FROM categoria));
SELECT setval(pg_get_serial_sequence('producto', 'id_producto'), (SELECT MAX(id_producto) FROM producto));
SELECT setval(pg_get_serial_sequence('presentacion', 'id_presentacion'), (SELECT MAX(id_presentacion) FROM presentacion));
