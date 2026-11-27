const pool = require('../config/database');
const {
  confirmarPagoWebpay,
  normalizarRespuestaWebpay,
  pagoAprobado,
} = require('../services/webpay');

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function mensajeErrorPago(error) {
  return (
    error?.response?.data?.error_message ||
    error?.response?.data?.message ||
    error?.message ||
    'Error desconocido al comunicarse con Webpay.'
  );
}

async function buscarPedidoPorToken(token) {
  const resultado = await pool.query(
    `
    SELECT
      id_pedido,
      codigo,
      total::float8 AS total,
      monto_abono::float8 AS monto_abono,
      saldo_pendiente::float8 AS saldo_pendiente,
      abono_pagado,
      estado,
      estado_pago,
      webpay_token
    FROM PEDIDO
    WHERE webpay_token = $1
    LIMIT 1
    `,
    [token]
  );

  return resultado.rows[0] || null;
}

async function buscarPedidoPorOrden(orden) {
  if (!orden) return null;

  const resultado = await pool.query(
    `
    SELECT
      id_pedido,
      codigo,
      total::float8 AS total,
      monto_abono::float8 AS monto_abono,
      saldo_pendiente::float8 AS saldo_pendiente,
      abono_pagado,
      estado,
      estado_pago,
      webpay_token,
      webpay_sesion
    FROM PEDIDO
    WHERE webpay_orden_compra = $1
       OR codigo = $1
    ORDER BY creado_en DESC
    LIMIT 1
    `,
    [orden]
  );

  return resultado.rows[0] || null;
}

function redirigirResultado(res, estado, codigo) {
  const parametros = new URLSearchParams({ pago: estado });
  if (codigo) parametros.set('codigo', codigo);
  return res.redirect(303, `/?${parametros.toString()}`);
}

/**
 * Marca un pago pendiente como anulado. Se usa cuando el cliente cierra el
 * formulario de Webpay sin pagar (Transbank devuelve TBK_ORDEN_COMPRA en vez
 * de token_ws).
 */
async function anularPagoPendiente(pedido, idSesion) {
  if (!pedido || pedido.estado_pago !== 'pendiente') return false;

  // Solo Transbank conoce la sesión creada para esta transacción. Si no
  // coincide, se ignora la solicitud para que nadie pueda cancelar pedidos
  // ajenos enviando un código de orden.
  if (!pedido.webpay_sesion || pedido.webpay_sesion !== texto(idSesion)) {
    return false;
  }

  const resultado = await pool.query(
    `
    UPDATE PEDIDO
    SET
      estado_pago = 'anulado',
      estado = 'cancelado',
      actualizado_en = NOW()
    WHERE id_pedido = $1
      AND estado_pago = 'pendiente'
      AND webpay_sesion = $2
    `,
    [pedido.id_pedido, pedido.webpay_sesion]
  );

  if (resultado.rowCount > 0) {
    // La línea de tiempo del seguimiento también refleja la anulación.
    try {
      await pool.query(
        `
        INSERT INTO HISTORIAL_ESTADO_PEDIDO
          (id_pedido, estado_anterior, estado_nuevo, motivo, usuario)
        VALUES ($1, 'pendiente', 'cancelado', $2, 'cliente')
        `,
        [pedido.id_pedido, 'El cliente anuló el pago en Webpay']
      );
    } catch (error) {
      console.error('No se pudo registrar el historial del pedido:', error.message);
    }
  }

  return resultado.rowCount > 0;
}

/**
 * Transbank redirige aquí después del pago. Puede llegar:
 *  - token_ws: el cliente pagó (o intentó pagar).
 *  - TBK_ORDEN_COMPRA + TBK_ID_SESION: el cliente anuló el pago.
 */
exports.retornoWebpay = async (req, res) => {
  const cuerpo = req.body || {};
  const consulta = req.query || {};
  const token = texto(cuerpo.token_ws || consulta.token_ws);
  const orden = texto(
    cuerpo.TBK_ORDEN_COMPRA || consulta.TBK_ORDEN_COMPRA || ''
  );
  const idSesion = texto(
    cuerpo.TBK_ID_SESION || consulta.TBK_ID_SESION || ''
  );

  // Pago anulado por el cliente antes de ingresar la tarjeta.
  if (!token) {
    try {
      const pedido = await buscarPedidoPorOrden(orden);
      const anulado = await anularPagoPendiente(pedido, idSesion);
      return redirigirResultado(
        res,
        anulado ? 'cancelado' : 'error',
        pedido?.codigo || ''
      );
    } catch (error) {
      console.error('Error al anular pago Webpay:', mensajeErrorPago(error));
      return redirigirResultado(res, 'cancelado', '');
    }
  }

  // Si la página de retorno se recarga, no se vuelve a confirmar el pago.
  try {
    const pedidoExistente = await buscarPedidoPorToken(token);

    if (
      ['pagado', 'abono_pagado'].includes(pedidoExistente?.estado_pago)
    ) {
      return redirigirResultado(res, 'exito', pedidoExistente.codigo);
    }
  } catch (error) {
    console.error(
      'Error al buscar pedido por token de Webpay:',
      mensajeErrorPago(error)
    );
  }

  let respuesta;

  try {
    respuesta = await confirmarPagoWebpay(token);
  } catch (error) {
    console.error(
      'Error al confirmar el pago con Webpay:',
      mensajeErrorPago(error)
    );

    // No podemos saber con certeza si el cargo se realizó. Se deja el pedido
    // pendiente y marcado para revisión manual; no se libera el cupo solo.
    try {
      const pedido = await buscarPedidoPorOrden(orden);
      if (pedido) {
        await pool.query(
          `
          UPDATE PEDIDO
          SET
            webpay_detalle = jsonb_build_object(
              'confirmacion_fallida', true,
              'error', $2::text
            ),
            actualizado_en = NOW()
          WHERE id_pedido = $1
            AND estado_pago <> 'pagado'
          `,
          [pedido.id_pedido, mensajeErrorPago(error)]
        );
      }
    } catch (errorGuardado) {
      console.error(
        'No se pudo registrar el error de confirmación de Webpay:',
        mensajeErrorPago(errorGuardado)
      );
    }

    return redirigirResultado(res, 'error', orden);
  }

  const pedido = await buscarPedidoPorOrden(respuesta?.buy_order || orden);

  if (!pedido) {
    console.error(
      'Pago Webpay confirmado sin pedido asociado:',
      respuesta?.buy_order
    );
    return redirigirResultado(res, 'error', '');
  }

  if (['pagado', 'abono_pagado'].includes(pedido.estado_pago)) {
    return redirigirResultado(res, 'exito', pedido.codigo);
  }

  const detalle = normalizarRespuestaWebpay(respuesta);

  if (pagoAprobado(respuesta)) {
    const montoAbono = Number(pedido.monto_abono) || 0;
    const esAbono = montoAbono > 0;
    const montoEsperado = Math.round(
      esAbono ? montoAbono : Number(pedido.total)
    );
    const montoPagado = Math.round(Number(respuesta?.amount));
    const montoInconsistente = montoPagado !== montoEsperado;

    detalle.tipo_cobro = esAbono ? 'abono' : 'total';

    if (montoInconsistente) {
      detalle.monto_inconsistente = true;
      detalle.monto_esperado = montoEsperado;
      console.error(
        `Pago Webpay con monto distinto al pedido ${pedido.codigo}: ` +
          `esperado ${montoEsperado}, pagado ${montoPagado}`
      );
    }

    await pool.query(
      `
      UPDATE PEDIDO
      SET
        estado_pago = CASE
          WHEN $8::boolean THEN 'abono_pagado'
          ELSE 'pagado'
        END,
        estado = CASE
          WHEN estado_pago = 'expirado' THEN 'pendiente'
          ELSE estado
        END,
        pagado_en = CASE
          WHEN $8::boolean THEN pagado_en
          ELSE NOW()
        END,
        abono_pagado = CASE
          WHEN $8::boolean THEN TRUE
          ELSE abono_pagado
        END,
        abono_pagado_en = CASE
          WHEN $8::boolean THEN NOW()
          ELSE abono_pagado_en
        END,
        saldo_pendiente = CASE
          WHEN $8::boolean THEN GREATEST(total - monto_abono, 0)
          ELSE saldo_pendiente
        END,
        webpay_token = $2,
        webpay_orden_compra = COALESCE(webpay_orden_compra, $3),
        webpay_autorizacion = $4,
        webpay_tipo_pago = $5,
        webpay_cuotas = $6,
        webpay_fecha_pago = NOW(),
        webpay_detalle = $7::jsonb,
        actualizado_en = NOW()
      WHERE id_pedido = $1
        AND estado_pago NOT IN ('pagado', 'abono_pagado')
      `,
      [
        pedido.id_pedido,
        token,
        detalle.orden_compra,
        detalle.codigo_autorizacion,
        detalle.tipo_pago,
        detalle.cuotas,
        JSON.stringify(detalle),
        esAbono,
      ]
    );

    return redirigirResultado(res, 'exito', pedido.codigo);
  }

  // Pago rechazado: se libera el cupo para que el cliente pueda reintentar.
  await pool.query(
    `
    UPDATE PEDIDO
    SET
      estado_pago = 'rechazado',
      estado = 'cancelado',
      webpay_token = $2,
      webpay_orden_compra = COALESCE(webpay_orden_compra, $3),
      webpay_detalle = $4::jsonb,
      actualizado_en = NOW()
    WHERE id_pedido = $1
      AND estado_pago NOT IN ('pagado', 'abono_pagado')
    `,
    [
      pedido.id_pedido,
      token,
      detalle.orden_compra,
      JSON.stringify(detalle),
    ]
  );

  return redirigirResultado(res, 'rechazado', pedido.codigo);
};
