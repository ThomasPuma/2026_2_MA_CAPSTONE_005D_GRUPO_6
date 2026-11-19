const crypto = require('crypto');
const pool = require('../config/database');
const {
  POLIGONO_PADRE_HURTADO,
  UBICACION_TIENDA_POR_DEFECTO,
  calcularDespacho,
  redondear,
} = require('../utils/delivery');
const {
  crearPagoWebpay,
  reembolsarPagoWebpay,
  obtenerConfiguracionWebpay,
} = require('../services/webpay');

const ESTADOS = [
  'pendiente',
  'confirmado',
  'en_preparacion',
  'listo',
  'entregado',
  'cancelado',
];
// Flujo lineal del pedido. Cancelar es posible hasta la entrega; un pedido
// cancelado solo puede reactivarse a Pendiente (con verificación de cupo).
const TRANSICIONES = {
  pendiente: ['confirmado', 'cancelado'],
  confirmado: ['en_preparacion', 'cancelado'],
  en_preparacion: ['listo', 'cancelado'],
  listo: ['entregado', 'cancelado'],
  entregado: [],
  cancelado: ['pendiente'],
};
// Campos que se pueden mostrar a cualquiera que conozca el código del pedido.
// Datos personales (nombre, teléfono, email, dirección, coordenadas) quedan fuera.
const CAMPOS_PUBLICOS = [
  'codigo',
  'tipo_entrega',
  'fecha_entrega',
  'metodo_pago',
  'estado',
  'estado_pago',
  'pagado_en',
  'webpay_autorizacion',
  'webpay_tipo_pago',
  'webpay_cuotas',
  'webpay_fecha_pago',
  'monto_abono',
  'saldo_pendiente',
  'abono_pagado',
  'abono_pagado_en',
  'subtotal',
  'costo_despacho',
  'total',
  'distancia_km',
  'despacho_gratis',
  'creado_en',
  'items',
];

function pedidoPublico(pedido) {
  const publico = {};
  CAMPOS_PUBLICOS.forEach((campo) => {
    publico[campo] = pedido[campo];
  });
  return publico;
}
const METODOS_PAGO = ['efectivo', 'tarjeta', 'transferencia', 'webpay'];
const MONTO_PEDIDO_GRANDE = 60000;
const PORCENTAJE_ABONO = 0.25;
const TIPOS_ENTREGA = ['retiro', 'despacho'];
const DIAS_SEMANA = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];

class ErrorSolicitud extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.status = status;
  }
}

/* ------------------------------------------------------------------ */
/* Utilidades de fechas y números                                     */
/* ------------------------------------------------------------------ */

function fechaISO(valor) {
  const fecha =
    valor instanceof Date ? valor : new Date(`${String(valor)}T00:00:00`);

  if (Number.isNaN(fecha.getTime())) return null;

  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function sumarDias(fecha, cantidad) {
  const base = new Date(`${fecha}T00:00:00`);
  base.setDate(base.getDate() + cantidad);
  return fechaISO(base);
}

function parseFecha(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor || ''))) return null;

  const fecha = new Date(`${valor}T00:00:00`);
  if (Number.isNaN(fecha.getTime())) return null;

  // Evita que JavaScript "corrija" fechas inválidas como 2026-02-30.
  if (fechaISO(fecha) !== valor) return null;
  return fecha;
}

function etiquetaFecha(fecha) {
  const valor = fecha instanceof Date ? fecha : new Date(`${fecha}T00:00:00`);
  const texto = new Intl.DateTimeFormat('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(valor);

  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function normalizarDias(valor) {
  if (Array.isArray(valor)) return valor.map(Number).filter(Number.isInteger);

  if (typeof valor === 'string') {
    return valor
      .replace(/[{}]/g, '')
      .split(',')
      .filter((dia) => dia !== '')
      .map(Number)
      .filter(Number.isInteger);
  }

  return [];
}

function numeroConfig(valor, respaldo) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : respaldo;
}

function normalizarConfig(fila) {
  return {
    capacidadPedidosPorDia: Number(fila.capacidad_pedidos_por_dia),
    diasAnticipacionMinima: Number(fila.dias_anticipacion_minima),
    diasMaximosReserva: Number(fila.dias_maximos_reserva),
    diasCerradosSemana: normalizarDias(fila.dias_cerrados_semana),
    // Compatibilidad: la tarifa plana anterior ya no se usa para calcular.
    costoDespacho: redondear(fila.costo_despacho),
    latTienda: numeroConfig(
      fila.lat_tienda,
      UBICACION_TIENDA_POR_DEFECTO.lat
    ),
    lngTienda: numeroConfig(
      fila.lng_tienda,
      UBICACION_TIENDA_POR_DEFECTO.lng
    ),
    montoDespachoGratis: redondear(numeroConfig(fila.monto_despacho_gratis, 15000)),
    tarifaBaseDespacho: redondear(numeroConfig(fila.tarifa_base_despacho, 1500)),
    kmBaseDespacho: redondear(numeroConfig(fila.km_base_despacho, 3)),
    tarifaKmAdicional: redondear(numeroConfig(fila.tarifa_km_adicional, 750)),
  };
}

async function obtenerConfiguracion(consultador = pool) {
  const resultado = await consultador.query(
    'SELECT * FROM CONFIGURACION_NEGOCIO WHERE id_configuracion = 1'
  );

  if (resultado.rows.length === 0) {
    throw new ErrorSolicitud(
      'No existe la configuración del negocio. Ejecuta la migración de la base de datos.',
      503
    );
  }

  return normalizarConfig(resultado.rows[0]);
}

function esTablaFaltante(error) {
  return error && error.code === '42P01';
}

function responderErrorBaseDatos(res, error) {
  if (esTablaFaltante(error)) {
    return res.status(503).json({
      exito: false,
      mensaje:
        'La base de datos aún no tiene el modelo de pedidos. Ejecuta "npm run migrate" en la carpeta backend.',
    });
  }

  console.error('Error de base de datos en pedidos:', error);
  return res.status(500).json({
    exito: false,
    mensaje: 'Ocurrió un error al procesar la solicitud.',
  });
}

/* ------------------------------------------------------------------ */
/* Pagos online                                                       */
/* ------------------------------------------------------------------ */

/**
 * Libera los cupos de pedidos que quedaron esperando un pago:
 *  - Webpay que nunca volvió de Transbank.
 *  - Transferencias con abono pendiente que no fueron verificadas.
 * Los pagos cuya confirmación falló se dejan para revisión manual.
 */
async function liberarPagosExpirados() {
  const configurados = Number(process.env.WEBPAY_EXPIRA_MINUTOS);
  const minutos =
    Number.isFinite(configurados) && configurados > 0
      ? Math.min(configurados, 24 * 60)
      : 60;
  const horasTransferencia = Number(
    process.env.ABONO_TRANSFERENCIA_EXPIRA_HORAS
  );
  const horas =
    Number.isFinite(horasTransferencia) && horasTransferencia > 0
      ? Math.min(horasTransferencia, 24 * 14)
      : 24;

  try {
    await pool.query(
      `
      UPDATE PEDIDO
      SET
        estado = 'cancelado',
        estado_pago = 'expirado',
        actualizado_en = NOW()
      WHERE webpay_token IS NOT NULL
        AND estado_pago = 'pendiente'
        AND estado = 'pendiente'
        AND (webpay_detalle IS NULL
             OR webpay_detalle->>'confirmacion_fallida' IS DISTINCT FROM 'true')
        AND creado_en < NOW() - ($1::int * INTERVAL '1 minute')
      `,
      [minutos]
    );

    await pool.query(
      `
      UPDATE PEDIDO
      SET
        estado = 'cancelado',
        estado_pago = 'expirado',
        actualizado_en = NOW()
      WHERE metodo_pago = 'transferencia'
        AND estado_pago = 'abono_pendiente'
        AND estado = 'pendiente'
        AND creado_en < NOW() - ($1::int * INTERVAL '1 hour')
      `,
      [horas]
    );
  } catch (error) {
    // La limpieza no debe impedir que el cliente vea la agenda o compre.
    if (!esTablaFaltante(error)) {
      console.error('No se pudieron liberar pagos expirados:', error);
    }
  }
}

function estadoPagoWebpayPublico() {
  const webpay = obtenerConfiguracionWebpay();
  return {
    habilitado: webpay.habilitado,
    ambiente: webpay.ambiente,
    montoPedidoGrande: MONTO_PEDIDO_GRANDE,
    porcentajeAbono: Math.round(PORCENTAJE_ABONO * 100),
  };
}

/* ------------------------------------------------------------------ */
/* Disponibilidad y cupos                                             */
/* ------------------------------------------------------------------ */

function generarDias(config, conteos) {
  const hoy = fechaISO(new Date());
  const dias = [];

  for (
    let desplazamiento = config.diasAnticipacionMinima;
    desplazamiento <= config.diasMaximosReserva;
    desplazamiento += 1
  ) {
    const fecha = sumarDias(hoy, desplazamiento);
    const fechaObjeto = new Date(`${fecha}T00:00:00`);
    const cerrado = config.diasCerradosSemana.includes(fechaObjeto.getDay());
    const ocupados = Number(conteos.get(fecha) || 0);
    const disponibles = cerrado
      ? 0
      : Math.max(0, config.capacidadPedidosPorDia - ocupados);

    let motivo = null;
    if (cerrado) motivo = 'cerrado';
    else if (disponibles === 0) motivo = 'completo';

    dias.push({
      fecha,
      etiqueta: etiquetaFecha(fecha),
      diaSemana: DIAS_SEMANA[fechaObjeto.getDay()],
      pedidosActuales: ocupados,
      capacidad: config.capacidadPedidosPorDia,
      disponibles,
      disponible: !cerrado && disponibles > 0,
      motivo,
    });
  }

  return dias;
}

/**
 * Toma un lock de transacción asociado a una fecha de entrega concreta.
 * Se libera automáticamente al hacer COMMIT o ROLLBACK.
 */
async function bloquearCupo(consultador, fecha) {
  const llaveFecha = Number(String(fecha).replace(/-/g, ''));
  await consultador.query('SELECT pg_advisory_xact_lock($1, $2)', [
    727001,
    llaveFecha,
  ]);
}

async function conteosDelRango(config) {
  const hoy = fechaISO(new Date());
  const desde = sumarDias(hoy, config.diasAnticipacionMinima);
  const hasta = sumarDias(hoy, config.diasMaximosReserva);

  const resultado = await pool.query(
    `
    SELECT to_char(fecha_entrega, 'YYYY-MM-DD') AS fecha, COUNT(*)::int AS total
    FROM PEDIDO
    WHERE estado <> 'cancelado'
      AND fecha_entrega BETWEEN $1::date AND $2::date
    GROUP BY 1
    `,
    [desde, hasta]
  );

  return new Map(
    resultado.rows.map((fila) => [fila.fecha, Number(fila.total)])
  );
}

exports.obtenerDisponibilidad = async (req, res) => {
  try {
    await liberarPagosExpirados();

    const config = await obtenerConfiguracion();
    const conteos = await conteosDelRango(config);
    const dias = generarDias(config, conteos);

    return res.status(200).json({
      exito: true,
      config,
      pagoWebpay: estadoPagoWebpayPublico(),
      zonaEntrega: {
        nombre: 'Padre Hurtado',
        poligono: POLIGONO_PADRE_HURTADO,
        centro: UBICACION_TIENDA_POR_DEFECTO,
      },
      dias,
    });
  } catch (error) {
    if (error instanceof ErrorSolicitud) {
      return res
        .status(error.status)
        .json({ exito: false, mensaje: error.message });
    }
    return responderErrorBaseDatos(res, error);
  }
};

/* ------------------------------------------------------------------ */
/* Creación de pedidos                                                */
/* ------------------------------------------------------------------ */

async function generarCodigoUnico(client, fecha) {
  const base = fecha.replace(/-/g, '').slice(2);

  for (let intento = 0; intento < 10; intento += 1) {
    const sufijo = crypto.randomBytes(4).toString('hex').toUpperCase();
    const codigo = `MM-${base}-${sufijo}`;
    const existente = await client.query(
      'SELECT 1 FROM PEDIDO WHERE codigo = $1',
      [codigo]
    );
    if (existente.rows.length === 0) return codigo;
  }

  throw new ErrorSolicitud(
    'No se pudo generar el código del pedido. Intenta nuevamente.',
    500
  );
}

function validarPedido(datos) {
  const errores = [];
  const nombre = texto(datos.nombre_cliente || datos.nombre);
  const telefono = texto(datos.telefono);
  const email = texto(datos.email);
  const tipoEntrega = texto(
    datos.tipo_entrega || datos.tipoEntrega
  ).toLowerCase();
  const direccion = texto(datos.direccion);
  const metodoPago = texto(
    datos.metodo_pago || datos.metodoPago
  ).toLowerCase();
  const fechaEntrega = texto(
    datos.fecha_entrega || datos.fechaEntrega || datos.fecha
  );
  const notas = texto(datos.notas);
  const items = Array.isArray(datos.items) ? datos.items : [];
  const origenUbicacion =
    datos.ubicacion && typeof datos.ubicacion === 'object'
      ? datos.ubicacion
      : {};
  const lat = Number(
    datos.lat ?? datos.latitud ?? origenUbicacion.lat ?? origenUbicacion.latitud
  );
  const lng = Number(
    datos.lng ?? datos.longitud ?? origenUbicacion.lng ?? origenUbicacion.longitud
  );
  const ubicacionValida =
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180;

  if (nombre.length < 2 || nombre.length > 150) {
    errores.push('Ingresa tu nombre completo (entre 2 y 150 caracteres).');
  }

  if (!/^[+0-9()\s-]{8,25}$/.test(telefono)) {
    errores.push('Ingresa un teléfono de contacto válido.');
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    errores.push('El email ingresado no es válido.');
  }

  if (email.length > 150) {
    errores.push('El email es demasiado largo.');
  }

  if (!TIPOS_ENTREGA.includes(tipoEntrega)) {
    errores.push('Selecciona si retiras en el local o si necesitas despacho.');
  }

  if (tipoEntrega === 'despacho' && direccion.length < 5) {
    errores.push('Ingresa la dirección de envío.');
  }

  if (tipoEntrega === 'despacho' && !ubicacionValida) {
    errores.push('Selecciona tu dirección en el mapa para calcular el despacho.');
  }

  if (direccion.length > 255) {
    errores.push('La dirección es demasiado larga.');
  }

  if (!METODOS_PAGO.includes(metodoPago)) {
    errores.push('Selecciona un método de pago.');
  }

  if (
    tipoEntrega === 'despacho' &&
    !['webpay', 'transferencia'].includes(metodoPago)
  ) {
    errores.push(
      'Para despacho a domicilio solo se aceptan pagos con Webpay o transferencia.'
    );
  }

  if (
    metodoPago === 'webpay' &&
    !obtenerConfiguracionWebpay().habilitado
  ) {
    errores.push(
      'El pago con tarjeta online no está disponible en este momento. Elige otro método de pago.'
    );
  }

  if (!parseFecha(fechaEntrega)) {
    errores.push('Selecciona una fecha de entrega válida.');
  }

  if (notas.length > 500) {
    errores.push('Las indicaciones no pueden superar los 500 caracteres.');
  }

  if (items.length === 0) {
    errores.push('El carrito está vacío.');
  }

  const claveSolicitud = texto(datos.clave_solicitud);

  if (!/^[A-Za-z0-9-]{16,64}$/.test(claveSolicitud)) {
    errores.push('Falta la clave de la solicitud. Vuelve a enviar el pedido.');
  }

  const itemsMap = new Map();

  for (const item of items) {
    const idPresentacion = Number(item.id_presentacion);
    const cantidad = Number(item.cantidad);

    if (!Number.isInteger(idPresentacion) || idPresentacion <= 0) {
      errores.push('Uno de los productos del carrito no es válido.');
      break;
    }

    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 99) {
      errores.push('La cantidad de cada producto debe estar entre 1 y 99.');
      break;
    }

    const cantidadAcumulada = (itemsMap.get(idPresentacion) || 0) + cantidad;

    if (cantidadAcumulada > 99) {
      errores.push('La cantidad de cada producto no puede superar 99.');
      break;
    }

    itemsMap.set(idPresentacion, cantidadAcumulada);
  }

  if (itemsMap.size > 40) {
    errores.push('El pedido tiene demasiados productos distintos.');
  }

  return {
    errores,
    datos: {
      nombre,
      telefono,
      email: email || null,
      tipoEntrega,
      direccion: tipoEntrega === 'despacho' ? direccion : null,
      lat: tipoEntrega === 'despacho' ? lat : null,
      lng: tipoEntrega === 'despacho' ? lng : null,
      metodoPago,
      fechaEntrega,
      notas: notas || null,
      itemsMap,
      claveSolicitud,
    },
  };
}

exports.crearPedido = async (req, res) => {
  const { errores, datos } = validarPedido(req.body || {});

  if (errores.length > 0) {
    return res.status(400).json({
      exito: false,
      mensaje: errores[0],
      errores,
    });
  }

  // Libera cupos de pagos Webpay abandonados antes de validar disponibilidad.
  await liberarPagosExpirados();

  // Huella del contenido: la misma clave con otros datos se rechaza.
  const huella = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        nombre: datos.nombre,
        telefono: datos.telefono,
        email: datos.email,
        tipo: datos.tipoEntrega,
        direccion: datos.direccion,
        lat: datos.lat,
        lng: datos.lng,
        metodo: datos.metodoPago,
        fecha: datos.fechaEntrega,
        notas: datos.notas,
        items: Array.from(datos.itemsMap.entries()).sort((a, b) => a[0] - b[0]),
      })
    )
    .digest('hex');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Bloqueo por fecha: serializa la validación del cupo para que dos
    // clientes no puedan tomar el último cupo del mismo día al mismo tiempo.
    await bloquearCupo(client, datos.fechaEntrega);

    // Reenvíos de la misma solicitud (doble clic, reintento de red): se
    // devuelve el pedido ya creado y nunca se consume otro cupo.
    const previo = await client.query(
      `
      SELECT id_pedido, codigo, estado, huella_solicitud, webpay_url,
             webpay_token, webpay_orden_compra, monto_abono, total
      FROM PEDIDO
      WHERE clave_solicitud = $1
      `,
      [datos.claveSolicitud]
    );

    if (previo.rows.length > 0) {
      await client.query('ROLLBACK');
      return responderSolicitudExistente(res, previo.rows[0], huella);
    }

    const config = await obtenerConfiguracion(client);

    const hoy = fechaISO(new Date());
    const fechaMinima = sumarDias(hoy, config.diasAnticipacionMinima);
    const fechaMaxima = sumarDias(hoy, config.diasMaximosReserva);
    const fechaObjeto = parseFecha(datos.fechaEntrega);

    if (datos.fechaEntrega < fechaMinima) {
      throw new ErrorSolicitud(
        `La fecha más próxima disponible es ${etiquetaFecha(fechaMinima)}.`
      );
    }

    if (datos.fechaEntrega > fechaMaxima) {
      throw new ErrorSolicitud(
        `Solo se pueden reservar pedidos hasta ${etiquetaFecha(fechaMaxima)}.`
      );
    }

    if (config.diasCerradosSemana.includes(fechaObjeto.getDay())) {
      throw new ErrorSolicitud('Ese día no hay atención. Elige otra fecha.');
    }

    const cupo = await client.query(
      `
      SELECT COUNT(*)::int AS total
      FROM PEDIDO
      WHERE fecha_entrega = $1::date
        AND estado <> 'cancelado'
      `,
      [datos.fechaEntrega]
    );

    const pedidosDelDia = Number(cupo.rows[0].total);

    if (pedidosDelDia >= config.capacidadPedidosPorDia) {
      throw new ErrorSolicitud(
        'Ya no quedan cupos para esa fecha. Elige otro día, por favor.',
        409
      );
    }

    const ids = Array.from(datos.itemsMap.keys());
    const presentaciones = await client.query(
      `
      SELECT
        pr.id_presentacion,
        pr.id_producto,
        pr.etiqueta,
        pr.cantidad,
        pr.unidad,
        pr.precio::float8 AS precio,
        p.nombre
      FROM PRESENTACION pr
      INNER JOIN PRODUCTO p ON p.id_producto = pr.id_producto
      WHERE pr.id_presentacion = ANY($1::int[])
        AND p.activo = TRUE
      `,
      [ids]
    );

    if (presentaciones.rows.length !== ids.length) {
      throw new ErrorSolicitud(
        'Uno de los productos ya no está disponible. Actualiza el carrito.'
      );
    }

    const mapaPresentaciones = new Map(
      presentaciones.rows.map((fila) => [
        Number(fila.id_presentacion),
        fila,
      ])
    );

    const detalles = [];
    let subtotal = 0;

    for (const [idPresentacion, cantidad] of datos.itemsMap.entries()) {
      const presentacion = mapaPresentaciones.get(idPresentacion);
      const precio = redondear(presentacion.precio);
      const subtotalLinea = redondear(precio * cantidad);

      subtotal = redondear(subtotal + subtotalLinea);

      detalles.push({
        idProducto: Number(presentacion.id_producto),
        idPresentacion,
        nombreProducto: presentacion.nombre,
        etiqueta: presentacion.etiqueta,
        unidad: presentacion.unidad,
        unidadesPorPaquete: Number(presentacion.cantidad),
        precio,
        cantidad,
        subtotal: subtotalLinea,
      });
    }

    const despacho =
      datos.tipoEntrega === 'despacho'
        ? calcularDespacho({
            subtotal,
            lat: datos.lat,
            lng: datos.lng,
            config,
          })
        : null;

    const costoDespacho = despacho ? despacho.costoDespacho : 0;
    const total = redondear(subtotal + costoDespacho);
    const esPedidoGrande = total > MONTO_PEDIDO_GRANDE;

    const montoAbono = esPedidoGrande
      ? Math.ceil(total * PORCENTAJE_ABONO)
      : 0;
    const saldoPendiente = esPedidoGrande
      ? redondear(total - montoAbono)
      : 0;
    const estadoPagoInicial =
      esPedidoGrande && datos.metodoPago === 'transferencia'
        ? 'abono_pendiente'
        : 'pendiente';
    // En pedidos grandes, el abono se cobra con Webpay salvo que el cliente
    // haya elegido transferencia. Así un pedido presencial puede pagar el
    // saldo en efectivo o tarjeta, pero igual deja el 25% de abono.
    const requiereCobroWebpay =
      datos.metodoPago === 'webpay' ||
      (esPedidoGrande && datos.metodoPago !== 'transferencia');
    const montoCobroWebpay = esPedidoGrande ? montoAbono : total;
    const codigo = await generarCodigoUnico(client, datos.fechaEntrega);

    const pedidoInsertado = await client.query(
      `
      INSERT INTO PEDIDO (
        codigo,
        nombre_cliente,
        telefono,
        email,
        tipo_entrega,
        direccion,
        lat_entrega,
        lng_entrega,
        distancia_km,
        fuera_comuna,
        despacho_gratis,
        fecha_entrega,
        metodo_pago,
        notas,
        subtotal,
        costo_despacho,
        total,
        estado,
        estado_pago,
        monto_abono,
        saldo_pendiente,
        clave_solicitud,
        huella_solicitud
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::date, $13, $14,
        $15, $16, $17, 'pendiente', $18, $19, $20, $21, $22
      )
      RETURNING id_pedido, creado_en
      `,
      [
        codigo,
        datos.nombre,
        datos.telefono,
        datos.email,
        datos.tipoEntrega,
        datos.direccion,
        datos.lat,
        datos.lng,
        despacho ? despacho.distanciaKm : null,
        despacho ? despacho.fueraComuna : null,
        despacho ? despacho.gratis : null,
        datos.fechaEntrega,
        datos.metodoPago,
        datos.notas,
        subtotal,
        costoDespacho,
        total,
        estadoPagoInicial,
        montoAbono,
        saldoPendiente,
        datos.claveSolicitud,
        huella,
      ]
    );

    const idPedido = pedidoInsertado.rows[0].id_pedido;

    for (const detalle of detalles) {
      await client.query(
        `
        INSERT INTO DETALLE_PEDIDO (
          id_pedido,
          id_producto,
          id_presentacion,
          nombre_producto,
          presentacion_etiqueta,
          presentacion_unidad,
          unidades_por_paquete,
          precio_unitario,
          cantidad,
          subtotal
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `,
        [
          idPedido,
          detalle.idProducto,
          detalle.idPresentacion,
          detalle.nombreProducto,
          detalle.etiqueta,
          detalle.unidad,
          detalle.unidadesPorPaquete,
          detalle.precio,
          detalle.cantidad,
          detalle.subtotal,
        ]
      );
    }

    await client.query('COMMIT');

    // El pedido ya está reservado. El pago con Webpay se inicia después del
    // COMMIT para no dejar una transacción abierta mientras se llama a
    // Transbank. Si Webpay falla, el pedido se cancela y libera el cupo.
    let pago = null;

    if (requiereCobroWebpay) {
      try {
        pago = await crearPagoWebpay({
          req,
          codigo,
          total: montoCobroWebpay,
        });

        await pool.query(
          `
          UPDATE PEDIDO
          SET
            webpay_token = $2,
            webpay_orden_compra = $3,
            webpay_sesion = $4,
            webpay_url = $5,
            actualizado_en = NOW()
          WHERE id_pedido = $1
          `,
          [idPedido, pago.token, pago.ordenCompra, pago.sesion, pago.url]
        );
      } catch (errorPago) {
        console.error(
          'No se pudo iniciar el pago con Webpay:',
          errorPago?.response?.data || errorPago
        );

        try {
          await pool.query(
            `
            UPDATE PEDIDO
            SET
              estado = 'cancelado',
              estado_pago = 'rechazado',
              actualizado_en = NOW()
            WHERE id_pedido = $1
            `,
            [idPedido]
          );
        } catch (errorCancelacion) {
          console.error(
            'No se pudo liberar el pedido tras fallar Webpay:',
            errorCancelacion
          );
        }

        throw new ErrorSolicitud(
          'No se pudo iniciar el pago con Webpay. No se realizó ningún cargo; intenta nuevamente.',
          502
        );
      }
    }

    return res.status(201).json({
      exito: true,
      mensaje:
        requiereCobroWebpay && esPedidoGrande
          ? `Pedido reservado. Completa el abono del ${Math.round(
              PORCENTAJE_ABONO * 100
            )}% en Webpay.`
          : datos.metodoPago === 'webpay'
            ? 'Pedido reservado. Completa el pago con tarjeta en Webpay.'
            : esPedidoGrande
              ? `Pedido recibido. Debes transferir el abono del ${Math.round(
                  PORCENTAJE_ABONO * 100
                )}% para confirmarlo.`
              : 'Pedido recibido. La dueña se contactará contigo para confirmarlo.',
      pedido: {
        codigo,
        nombre_cliente: datos.nombre,
        telefono: datos.telefono,
        email: datos.email,
        tipo_entrega: datos.tipoEntrega,
        direccion: datos.direccion,
        lat_entrega: datos.lat,
        lng_entrega: datos.lng,
        distancia_km: despacho ? despacho.distanciaKm : null,
        fuera_comuna: despacho ? despacho.fueraComuna : null,
        despacho_gratis: despacho ? despacho.gratis : null,
        fecha_entrega: datos.fechaEntrega,
        metodo_pago: datos.metodoPago,
        estado_pago: estadoPagoInicial,
        pagado_en: null,
        monto_abono: montoAbono,
        saldo_pendiente: saldoPendiente,
        abono_pagado: false,
        abono_pagado_en: null,
        notas: datos.notas,
        subtotal,
        costo_despacho: costoDespacho,
        total,
        estado: 'pendiente',
        creado_en: pedidoInsertado.rows[0].creado_en,
        items: detalles.map((detalle) => ({
          id_producto: detalle.idProducto,
          id_presentacion: detalle.idPresentacion,
          nombre_producto: detalle.nombreProducto,
          presentacion_etiqueta: detalle.etiqueta,
          presentacion_unidad: detalle.unidad,
          unidades_por_paquete: detalle.unidadesPorPaquete,
          precio_unitario: detalle.precio,
          cantidad: detalle.cantidad,
          subtotal: detalle.subtotal,
        })),
      },
      pago: pago
        ? {
            url: pago.url,
            token: pago.token,
            ordenCompra: pago.ordenCompra,
            monto: pago.monto,
            tipo: esPedidoGrande ? 'abono' : 'total',
          }
        : null,
      abono: esPedidoGrande
        ? {
            requerido: true,
            porcentaje: Math.round(PORCENTAJE_ABONO * 100),
            monto: montoAbono,
            saldo: saldoPendiente,
            metodo:
              datos.metodoPago === 'transferencia'
                ? 'transferencia'
                : 'webpay',
          }
        : null,
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // La transacción pudo haber sido abortada por PostgreSQL.
    }

    if (error instanceof ErrorSolicitud) {
      return res
        .status(error.status)
        .json({ exito: false, mensaje: error.message });
    }

    return responderErrorBaseDatos(res, error);
  } finally {
    client.release();
  }
};

/* ------------------------------------------------------------------ */
/* Consulta pública de un pedido por código                           */
/* ------------------------------------------------------------------ */

/**
 * Respuesta para un reenvío de una solicitud ya creada. Si el pago con Webpay
 * ya fue iniciado, se devuelve la misma dirección de pago.
 */
async function responderSolicitudExistente(res, fila, huella) {
  if (fila.huella_solicitud !== huella) {
    return res.status(409).json({
      exito: false,
      mensaje:
        'Esta solicitud ya fue enviada con otros datos. Recarga la página y vuelve a intentarlo.',
    });
  }

  if (fila.estado === 'cancelado') {
    return res.status(409).json({
      exito: false,
      mensaje:
        'Este pedido ya fue cancelado. Vuelve a enviar tu pedido para crear uno nuevo.',
    });
  }

  const pedido = await buscarPedidoPorCodigo(fila.codigo);
  const montoAbono = Number(fila.monto_abono) || 0;
  const pago =
    fila.webpay_url && fila.webpay_token
      ? {
          url: fila.webpay_url,
          token: fila.webpay_token,
          ordenCompra: fila.webpay_orden_compra,
          monto: montoAbono > 0 ? montoAbono : Number(fila.total),
          tipo: montoAbono > 0 ? 'abono' : 'total',
        }
      : null;

  return res.status(200).json({
    exito: true,
    duplicado: true,
    mensaje: 'Ya recibimos esta solicitud. Te mostramos tu pedido.',
    pedido: pedidoPublico(pedido),
    pago,
  });
}

async function buscarPedidoPorCodigo(codigo) {
  const resultado = await pool.query(
    `
    SELECT
      p.id_pedido,
      p.codigo,
      p.nombre_cliente,
      p.telefono,
      p.email,
      p.tipo_entrega,
      p.direccion,
      p.lat_entrega::float8 AS lat_entrega,
      p.lng_entrega::float8 AS lng_entrega,
      p.distancia_km::float8 AS distancia_km,
      p.fuera_comuna,
      p.despacho_gratis,
      to_char(p.fecha_entrega, 'YYYY-MM-DD') AS fecha_entrega,
      p.metodo_pago,
      p.estado_pago,
      p.pagado_en,
      p.webpay_autorizacion,
      p.webpay_tipo_pago,
      p.webpay_cuotas,
      p.webpay_fecha_pago,
      p.webpay_detalle,
      p.monto_abono::float8 AS monto_abono,
      p.saldo_pendiente::float8 AS saldo_pendiente,
      p.abono_pagado,
      p.abono_pagado_en,
      p.notas,
      p.subtotal::float8 AS subtotal,
      p.costo_despacho::float8 AS costo_despacho,
      p.total::float8 AS total,
      p.estado,
      p.creado_en,
      COALESCE(
        json_agg(
          json_build_object(
            'id_detalle', d.id_detalle,
            'id_producto', d.id_producto,
            'id_presentacion', d.id_presentacion,
            'nombre_producto', d.nombre_producto,
            'presentacion_etiqueta', d.presentacion_etiqueta,
            'presentacion_unidad', d.presentacion_unidad,
            'unidades_por_paquete', d.unidades_por_paquete::float8,
            'precio_unitario', d.precio_unitario::float8,
            'cantidad', d.cantidad,
            'subtotal', d.subtotal::float8
          )
          ORDER BY d.id_detalle
        ) FILTER (WHERE d.id_detalle IS NOT NULL),
        '[]'::json
      ) AS items
    FROM PEDIDO p
    LEFT JOIN DETALLE_PEDIDO d ON d.id_pedido = p.id_pedido
    WHERE p.codigo = $1
    GROUP BY p.id_pedido
    `,
    [codigo]
  );

  return resultado.rows[0] || null;
}

exports.obtenerPedidoPorCodigo = async (req, res) => {
  try {
    const codigo = texto(req.params.codigo).toUpperCase();
    const pedido = await buscarPedidoPorCodigo(codigo);

    if (!pedido) {
      return res
        .status(404)
        .json({ exito: false, mensaje: 'No encontramos un pedido con ese código.' });
    }

    return res.status(200).json({ exito: true, pedido: pedidoPublico(pedido) });
  } catch (error) {
    return responderErrorBaseDatos(res, error);
  }
};

/* ------------------------------------------------------------------ */
/* Panel interno: listado, estados y configuración                    */
/* ------------------------------------------------------------------ */

exports.listarPedidos = async (req, res) => {
  try {
    const fecha = texto(req.query.fecha) || fechaISO(new Date());

    if (!parseFecha(fecha)) {
      return res
        .status(400)
        .json({ exito: false, mensaje: 'La fecha indicada no es válida.' });
    }

    const config = await obtenerConfiguracion();
    const resultado = await pool.query(
      `
      SELECT
        p.id_pedido,
        p.codigo,
        p.nombre_cliente,
        p.telefono,
        p.email,
        p.tipo_entrega,
        p.direccion,
        p.lat_entrega::float8 AS lat_entrega,
        p.lng_entrega::float8 AS lng_entrega,
        p.distancia_km::float8 AS distancia_km,
        p.fuera_comuna,
        p.despacho_gratis,
        to_char(p.fecha_entrega, 'YYYY-MM-DD') AS fecha_entrega,
        p.metodo_pago,
        p.estado_pago,
        p.pagado_en,
        p.webpay_autorizacion,
        p.webpay_tipo_pago,
        p.webpay_cuotas,
        p.webpay_fecha_pago,
        p.webpay_detalle,
        p.monto_abono::float8 AS monto_abono,
        p.saldo_pendiente::float8 AS saldo_pendiente,
        p.abono_pagado,
        p.abono_pagado_en,
        p.notas,
        p.subtotal::float8 AS subtotal,
        p.costo_despacho::float8 AS costo_despacho,
        p.total::float8 AS total,
        p.estado,
        p.creado_en,
        p.actualizado_en,
        COALESCE(
          json_agg(
            json_build_object(
              'id_detalle', d.id_detalle,
              'id_producto', d.id_producto,
              'id_presentacion', d.id_presentacion,
              'nombre_producto', d.nombre_producto,
              'presentacion_etiqueta', d.presentacion_etiqueta,
              'presentacion_unidad', d.presentacion_unidad,
              'unidades_por_paquete', d.unidades_por_paquete::float8,
              'precio_unitario', d.precio_unitario::float8,
              'cantidad', d.cantidad,
              'subtotal', d.subtotal::float8
            )
            ORDER BY d.id_detalle
          ) FILTER (WHERE d.id_detalle IS NOT NULL),
          '[]'::json
        ) AS items
      FROM PEDIDO p
      LEFT JOIN DETALLE_PEDIDO d ON d.id_pedido = p.id_pedido
      WHERE p.fecha_entrega = $1::date
      GROUP BY p.id_pedido
      ORDER BY p.creado_en ASC
      `,
      [fecha]
    );

    const pedidos = resultado.rows.map((pedido) => ({
      ...pedido,
      subtotal: Number(pedido.subtotal),
      costo_despacho: Number(pedido.costo_despacho),
      total: Number(pedido.total),
      monto_abono: Number(pedido.monto_abono),
      saldo_pendiente: Number(pedido.saldo_pendiente),
      items: pedido.items.map((item) => ({
        ...item,
        unidades_por_paquete: Number(item.unidades_por_paquete),
        precio_unitario: Number(item.precio_unitario),
        subtotal: Number(item.subtotal),
      })),
    }));

    const activos = pedidos.filter((pedido) => pedido.estado !== 'cancelado');
    const fechaObjeto = new Date(`${fecha}T00:00:00`);
    const diaCerrado = config.diasCerradosSemana.includes(
      fechaObjeto.getDay()
    );

    return res.status(200).json({
      exito: true,
      fecha,
      config,
      resumen: {
        cupo: config.capacidadPedidosPorDia,
        pedidosTotales: pedidos.length,
        pedidosActivos: activos.length,
        cuposDisponibles: diaCerrado
          ? 0
          : Math.max(0, config.capacidadPedidosPorDia - activos.length),
        pendientes: pedidos.filter((pedido) => pedido.estado === 'pendiente')
          .length,
        enProceso: pedidos.filter((pedido) =>
          ['confirmado', 'en_preparacion', 'listo'].includes(pedido.estado)
        ).length,
        entregados: pedidos.filter((pedido) => pedido.estado === 'entregado')
          .length,
        cancelados: pedidos.filter((pedido) => pedido.estado === 'cancelado')
          .length,
        ingresosEstimados: redondear(
          activos.reduce((suma, pedido) => suma + pedido.total, 0)
        ),
        diaCerrado,
      },
      pedidos,
    });
  } catch (error) {
    if (error instanceof ErrorSolicitud) {
      return res
        .status(error.status)
        .json({ exito: false, mensaje: error.message });
    }
    return responderErrorBaseDatos(res, error);
  }
};

exports.actualizarEstadoPedido = async (req, res) => {
  const idPedido = Number(req.params.id);
  const estado = texto(req.body?.estado).toLowerCase();

  if (!Number.isInteger(idPedido) || idPedido <= 0) {
    return res
      .status(400)
      .json({ exito: false, mensaje: 'El pedido indicado no es válido.' });
  }

  if (!ESTADOS.includes(estado)) {
    return res
      .status(400)
      .json({ exito: false, mensaje: 'El estado indicado no es válido.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const pedidoActual = await client.query(
      'SELECT * FROM PEDIDO WHERE id_pedido = $1 FOR UPDATE',
      [idPedido]
    );

    if (pedidoActual.rows.length === 0) {
      throw new ErrorSolicitud('No encontramos ese pedido.', 404);
    }

    const pedido = pedidoActual.rows[0];

    if (pedido.estado === estado) {
      throw new ErrorSolicitud('El pedido ya está en ese estado.', 409);
    }

    if (!(TRANSICIONES[pedido.estado] || []).includes(estado)) {
      throw new ErrorSolicitud(
        `No se puede pasar un pedido de "${pedido.estado}" a "${estado}".`,
        409
      );
    }

    // Si se cancela un pedido ya pagado con Webpay, se intenta reembolsar el
    // monto cobrado antes de liberar el cupo. En pedidos grandes solo se
    // devuelve el abono que se pagó online. Si el reembolso falla, el pedido
    // no se cancela para evitar dejar un cobro sin devolución.
    let reembolso = null;
    const montoAbonoPedido = Number(pedido.monto_abono) || 0;
    const tieneCobroWebpay =
      pedido.metodo_pago === 'webpay' ||
      (montoAbonoPedido > 0 && pedido.metodo_pago !== 'transferencia');
    const pagoReembolsable =
      tieneCobroWebpay &&
      ['pagado', 'abono_pagado'].includes(pedido.estado_pago);

    if (
      estado === 'cancelado' &&
      pedido.estado !== 'cancelado' &&
      pagoReembolsable
    ) {
      if (!pedido.webpay_token) {
        throw new ErrorSolicitud(
          'El pedido está pagado con Webpay pero no tiene token de transacción. Reembolsa manualmente desde el portal de Transbank antes de cancelarlo.',
          409
        );
      }

      const montoReembolso =
        montoAbonoPedido > 0 ? montoAbonoPedido : Number(pedido.total);

      try {
        reembolso = await reembolsarPagoWebpay(
          pedido.webpay_token,
          montoReembolso
        );
      } catch (errorReembolso) {
        console.error(
          'No se pudo reembolsar el pago con Webpay:',
          errorReembolso?.response?.data || errorReembolso
        );
        throw new ErrorSolicitud(
          'No se pudo reembolsar el pago en Webpay. El pedido no fue cancelado. Reembolsa manualmente desde el portal de Transbank e intenta nuevamente.',
          502
        );
      }
    }

    let nuevoEstadoPago = null;

    if (reembolso) {
      nuevoEstadoPago = 'reembolsado';
    } else if (
      estado === 'cancelado' &&
      pedido.estado_pago === 'pendiente' &&
      (pedido.metodo_pago === 'webpay' ||
        (montoAbonoPedido > 0 && pedido.metodo_pago !== 'transferencia'))
    ) {
      nuevoEstadoPago = 'anulado';
    } else if (
      estado === 'cancelado' &&
      pedido.metodo_pago === 'transferencia' &&
      pedido.estado_pago === 'abono_pendiente'
    ) {
      nuevoEstadoPago = 'anulado';
    }

    // Si se reactiva un pedido cancelado, se debe verificar que aún haya cupo.
    if (pedido.estado === 'cancelado' && estado !== 'cancelado') {
      const config = await obtenerConfiguracion(client);
      const fecha = fechaISO(pedido.fecha_entrega);

      // Mismo bloqueo que usa la creación de pedidos: si el día está lleno,
      // no se puede reactivar un pedido cancelado.
      await bloquearCupo(client, fecha);

      const cupo = await client.query(
        `
        SELECT COUNT(*)::int AS total
        FROM PEDIDO
        WHERE fecha_entrega = $1::date
          AND estado <> 'cancelado'
          AND id_pedido <> $2
        `,
        [fecha, idPedido]
      );

      if (Number(cupo.rows[0].total) >= config.capacidadPedidosPorDia) {
        throw new ErrorSolicitud(
          'No se puede reactivar el pedido porque ese día ya está lleno.',
          409
        );
      }
    }

    const actualizado = await client.query(
      `
      UPDATE PEDIDO
      SET
        estado = $1,
        estado_pago = COALESCE($2, estado_pago),
        actualizado_en = NOW()
      WHERE id_pedido = $3
      RETURNING
        id_pedido,
        codigo,
        estado,
        estado_pago,
        to_char(fecha_entrega, 'YYYY-MM-DD') AS fecha_entrega,
        actualizado_en
      `,
      [estado, nuevoEstadoPago, idPedido]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      exito: true,
      mensaje: reembolso
        ? Number(pedido.monto_abono) > 0
          ? 'Pedido cancelado y abono reembolsado en Webpay.'
          : 'Pedido cancelado y pago reembolsado en Webpay.'
        : 'Estado del pedido actualizado.',
      pedido: actualizado.rows[0],
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // La transacción pudo haber sido abortada por PostgreSQL.
    }

    if (error instanceof ErrorSolicitud) {
      return res
        .status(error.status)
        .json({ exito: false, mensaje: error.message });
    }

    return responderErrorBaseDatos(res, error);
  } finally {
    client.release();
  }
};

/**
 * Acciones manuales de pago desde el panel:
 *  - registrar_abono: confirma una transferencia de abono.
 *  - registrar_saldo: confirma el saldo restante de un pedido con abono.
 *  - marcar_pagado: confirma el pago de un pedido sin abono (efectivo,
 *    tarjeta presencial o transferencia).
 */
exports.actualizarEstadoPago = async (req, res) => {
  const idPedido = Number(req.params.id);
  const accion = texto(req.body?.accion).toLowerCase();
  const acciones = ['registrar_abono', 'registrar_saldo', 'marcar_pagado'];

  if (!Number.isInteger(idPedido) || idPedido <= 0) {
    return res
      .status(400)
      .json({ exito: false, mensaje: 'El pedido indicado no es válido.' });
  }

  if (!acciones.includes(accion)) {
    return res
      .status(400)
      .json({ exito: false, mensaje: 'La acción de pago no es válida.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const pedidoActual = await client.query(
      'SELECT * FROM PEDIDO WHERE id_pedido = $1 FOR UPDATE',
      [idPedido]
    );

    if (pedidoActual.rows.length === 0) {
      throw new ErrorSolicitud('No encontramos ese pedido.', 404);
    }

    const pedido = pedidoActual.rows[0];
    let estadoPago = null;
    let mensaje = '';

    if (pedido.estado === 'cancelado') {
      throw new ErrorSolicitud(
        'No se puede registrar el pago de un pedido cancelado.',
        409
      );
    }

    if (accion === 'registrar_abono') {
      if (
        pedido.metodo_pago !== 'transferencia' ||
        pedido.estado_pago !== 'abono_pendiente'
      ) {
        throw new ErrorSolicitud(
          'Este pedido no tiene un abono por transferencia pendiente.',
          409
        );
      }

      estadoPago = 'abono_pagado';
      mensaje = 'Abono registrado. El saldo queda pendiente.';
    }

    if (accion === 'registrar_saldo') {
      if (pedido.estado_pago !== 'abono_pagado') {
        throw new ErrorSolicitud(
          'Primero debes registrar el abono del pedido.',
          409
        );
      }

      estadoPago = 'pagado';
      mensaje = 'Saldo registrado. El pedido queda pagado.';
    }

    if (accion === 'marcar_pagado') {
      if (pedido.estado_pago !== 'pendiente') {
        throw new ErrorSolicitud(
          'El pedido no está pendiente de pago.',
          409
        );
      }

      if (Number(pedido.monto_abono) > 0) {
        throw new ErrorSolicitud(
          'Este pedido requiere registrar primero el abono.',
          409
        );
      }

      if (pedido.metodo_pago === 'webpay') {
        throw new ErrorSolicitud(
          'Los pagos con Webpay se actualizan automáticamente al confirmarse.',
          409
        );
      }

      estadoPago = 'pagado';
      mensaje = 'Pago registrado. El pedido queda pagado.';
    }

    const actualizado = await client.query(
      `
      UPDATE PEDIDO
      SET
        estado_pago = $1::varchar,
        abono_pagado = CASE
          WHEN $1::varchar = 'abono_pagado' THEN TRUE
          ELSE abono_pagado
        END,
        abono_pagado_en = CASE
          WHEN $1::varchar = 'abono_pagado' THEN NOW()
          ELSE abono_pagado_en
        END,
        pagado_en = CASE
          WHEN $1::varchar = 'pagado' THEN NOW()
          ELSE pagado_en
        END,
        actualizado_en = NOW()
      WHERE id_pedido = $2
      RETURNING
        id_pedido,
        codigo,
        estado_pago,
        monto_abono::float8 AS monto_abono,
        saldo_pendiente::float8 AS saldo_pendiente,
        abono_pagado,
        pagado_en,
        actualizado_en
      `,
      [estadoPago, idPedido]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      exito: true,
      mensaje,
      pedido: actualizado.rows[0],
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // La transacción pudo haber sido abortada por PostgreSQL.
    }

    if (error instanceof ErrorSolicitud) {
      return res
        .status(error.status)
        .json({ exito: false, mensaje: error.message });
    }

    return responderErrorBaseDatos(res, error);
  } finally {
    client.release();
  }
};

exports.obtenerConfiguracionAdmin = async (req, res) => {
  try {
    const config = await obtenerConfiguracion();
    return res.status(200).json({ exito: true, config });
  } catch (error) {
    if (error instanceof ErrorSolicitud) {
      return res
        .status(error.status)
        .json({ exito: false, mensaje: error.message });
    }
    return responderErrorBaseDatos(res, error);
  }
};

exports.actualizarConfiguracion = async (req, res) => {
  const capacidad = Number(
    req.body?.capacidadPedidosPorDia ?? req.body?.capacidad_pedidos_por_dia
  );
  const anticipacion = Number(
    req.body?.diasAnticipacionMinima ?? req.body?.dias_anticipacion_minima
  );
  const maximos = Number(
    req.body?.diasMaximosReserva ?? req.body?.dias_maximos_reserva
  );
  const latTienda = Number(req.body?.latTienda ?? req.body?.lat_tienda);
  const lngTienda = Number(req.body?.lngTienda ?? req.body?.lng_tienda);
  const montoDespachoGratis = Number(
    req.body?.montoDespachoGratis ?? req.body?.monto_despacho_gratis
  );
  const tarifaBaseDespacho = Number(
    req.body?.tarifaBaseDespacho ?? req.body?.tarifa_base_despacho
  );
  const kmBaseDespacho = Number(
    req.body?.kmBaseDespacho ?? req.body?.km_base_despacho
  );
  const tarifaKmAdicional = Number(
    req.body?.tarifaKmAdicional ?? req.body?.tarifa_km_adicional
  );
  let diasCerrados =
    req.body?.diasCerradosSemana ?? req.body?.dias_cerrados_semana;

  const errores = [];

  if (!Number.isInteger(capacidad) || capacidad < 1 || capacidad > 50) {
    errores.push('El cupo diario debe ser un número entero entre 1 y 50.');
  }

  if (!Number.isInteger(anticipacion) || anticipacion < 0 || anticipacion > 60) {
    errores.push('La anticipación mínima debe estar entre 0 y 60 días.');
  }

  if (!Number.isInteger(maximos) || maximos < 1 || maximos > 90) {
    errores.push('Los días máximos de reserva deben estar entre 1 y 90.');
  } else if (maximos < Math.max(1, anticipacion)) {
    errores.push(
      'Los días máximos de reserva deben ser mayores o iguales a la anticipación mínima.'
    );
  }

  if (!Number.isFinite(latTienda) || latTienda < -90 || latTienda > 90) {
    errores.push('La latitud del local debe estar entre -90 y 90.');
  }

  if (!Number.isFinite(lngTienda) || lngTienda < -180 || lngTienda > 180) {
    errores.push('La longitud del local debe estar entre -180 y 180.');
  }

  if (
    !Number.isFinite(montoDespachoGratis) ||
    montoDespachoGratis < 0 ||
    montoDespachoGratis > 1000000
  ) {
    errores.push('El monto para despacho gratis debe estar entre 0 y 1.000.000.');
  }

  if (
    !Number.isFinite(tarifaBaseDespacho) ||
    tarifaBaseDespacho < 0 ||
    tarifaBaseDespacho > 100000
  ) {
    errores.push('La tarifa base de despacho debe estar entre 0 y 100.000.');
  }

  if (
    !Number.isFinite(kmBaseDespacho) ||
    kmBaseDespacho < 0 ||
    kmBaseDespacho > 100
  ) {
    errores.push('Los kilómetros incluidos deben estar entre 0 y 100.');
  }

  if (
    !Number.isFinite(tarifaKmAdicional) ||
    tarifaKmAdicional < 0 ||
    tarifaKmAdicional > 100000
  ) {
    errores.push('La tarifa por kilómetro adicional debe estar entre 0 y 100.000.');
  }

  if (!Array.isArray(diasCerrados)) {
    errores.push('Los días cerrados deben enviarse como una lista.');
    diasCerrados = [];
  } else {
    diasCerrados = Array.from(
      new Set(diasCerrados.map((dia) => Number(dia)))
    );

    if (
      diasCerrados.some(
        (dia) => !Number.isInteger(dia) || dia < 0 || dia > 6
      )
    ) {
      errores.push('Los días cerrados deben ser números entre 0 (domingo) y 6 (sábado).');
    }

    if (diasCerrados.length >= 7) {
      errores.push('Debe haber al menos un día de atención.');
    }
  }

  if (errores.length > 0) {
    return res.status(400).json({
      exito: false,
      mensaje: errores[0],
      errores,
    });
  }

  try {
    const resultado = await pool.query(
      `
      UPDATE CONFIGURACION_NEGOCIO
      SET
        capacidad_pedidos_por_dia = $1,
        dias_anticipacion_minima = $2,
        dias_maximos_reserva = $3,
        dias_cerrados_semana = $4::int[],
        lat_tienda = $5,
        lng_tienda = $6,
        monto_despacho_gratis = $7,
        tarifa_base_despacho = $8,
        km_base_despacho = $9,
        tarifa_km_adicional = $10,
        actualizado_en = NOW()
      WHERE id_configuracion = 1
      RETURNING *
      `,
      [
        capacidad,
        anticipacion,
        maximos,
        diasCerrados,
        latTienda,
        lngTienda,
        redondear(montoDespachoGratis),
        redondear(tarifaBaseDespacho),
        redondear(kmBaseDespacho),
        redondear(tarifaKmAdicional),
      ]
    );

    if (resultado.rows.length === 0) {
      throw new ErrorSolicitud(
        'No existe la configuración del negocio. Ejecuta la migración.',
        503
      );
    }

    return res.status(200).json({
      exito: true,
      mensaje: 'Configuración actualizada.',
      config: normalizarConfig(resultado.rows[0]),
    });
  } catch (error) {
    if (error instanceof ErrorSolicitud) {
      return res
        .status(error.status)
        .json({ exito: false, mensaje: error.message });
    }
    return responderErrorBaseDatos(res, error);
  }
};
