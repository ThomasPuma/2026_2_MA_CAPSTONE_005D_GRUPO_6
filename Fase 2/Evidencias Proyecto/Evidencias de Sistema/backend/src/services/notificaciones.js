/**
 * Notificaciones por correo del ciclo de un pedido.
 *
 * Reglas para no llenar de correos al cliente:
 *  - Confirmación de recepción: una sola vez, al crear el pedido.
 *  - Cambios de estado: solo en "confirmado", "listo" y "cancelado".
 *  - Pago: solo cuando se registra un pago manual o una transferencia; los
 *    pagos con Webpay terminan en la pantalla de confirmación del sitio y no
 *    generan un correo adicional.
 *
 * Cada envío queda registrado en NOTIFICACION_CORREO para poder auditar qué
 * se envió, a quién y con qué resultado.
 */
const pool = require('../config/database');
const { enviarCorreo, proveedorConfigurado } = require('./email');

const MARCA = {
  tinta: '#3E2A1E',
  acento: '#7A4B2E',
  fondo: '#FBF5EA',
  borde: '#E4D6C3',
};

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/* ------------------------------------------------------------------ */
/* Utilidades                                                         */
/* ------------------------------------------------------------------ */

function escaparHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function urlBase() {
  const configurada = (process.env.PUBLIC_BASE_URL || '').trim();
  if (configurada) return configurada.replace(/\/+$/, '');
  return `http://localhost:${process.env.PORT || 3000}`;
}

function urlSeguimiento(codigo) {
  return `${urlBase()}/seguimiento/${encodeURIComponent(codigo)}`;
}

function formatearFecha(fecha) {
  if (!fecha) return '';
  const partes = String(fecha).slice(0, 10).split('-');
  if (partes.length !== 3) return String(fecha);

  const [anio, mes, dia] = partes;
  const nombreMes = MESES[Number(mes) - 1] || mes;
  return `${Number(dia)} de ${nombreMes} de ${anio}`;
}

function formatearMonto(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return '$0';

  return `$${numero.toLocaleString('es-CL', {
    maximumFractionDigits: 0,
  })}`;
}

function etiquetaEntrega(pedido) {
  return pedido.tipo_entrega === 'retiro'
    ? 'Retiro en el local'
    : 'Despacho a domicilio';
}

function etiquetaPago(pedido) {
  const nombres = {
    efectivo: 'Efectivo',
    tarjeta: 'Tarjeta presencial',
    transferencia: 'Transferencia',
    webpay: 'Webpay',
  };

  return nombres[pedido.metodo_pago] || pedido.metodo_pago;
}

function listarItems(pedido) {
  return (pedido.items || [])
    .map(
      (item) =>
        `<li style="margin:0 0 6px;">${escaparHtml(item.cantidad)} × ${escaparHtml(
          item.nombre_producto
        )} <span style="color:#7a6a5a;">(${escaparHtml(
          item.presentacion_etiqueta
        )})</span> — <strong>${formatearMonto(item.subtotal)}</strong></li>`
    )
    .join('');
}

function plantilla({ titulo, intro, pedido, lineas = [], nota = '' }) {
  const seguimiento = urlSeguimiento(pedido.codigo);

  const filas = [
    ['Código de pedido', `<strong>${escaparHtml(pedido.codigo)}</strong>`],
    ['Fecha de entrega', escaparHtml(formatearFecha(pedido.fecha_entrega))],
    ['Entrega', escaparHtml(etiquetaEntrega(pedido))],
    ['Forma de pago', escaparHtml(etiquetaPago(pedido))],
    ['Total', `<strong>${formatearMonto(pedido.total)}</strong>`],
    ...lineas,
  ]
    .map(
      ([etiqueta, valor]) => `
        <tr>
          <td style="padding:6px 0;color:#7a6a5a;">${etiqueta}</td>
          <td style="padding:6px 0;text-align:right;color:${MARCA.tinta};">${valor}</td>
        </tr>`
    )
    .join('');

  const html = `
  <div style="margin:0;padding:24px;background:${MARCA.fondo};font-family:Arial,Helvetica,sans-serif;color:${MARCA.tinta};">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid ${MARCA.borde};border-radius:12px;padding:28px;">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${MARCA.acento};">
        Matteo Masas
      </p>
      <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:${MARCA.tinta};">
        ${escaparHtml(titulo)}
      </h1>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:${MARCA.tinta};">
        ${intro}
      </p>

      <div style="background:${MARCA.fondo};border:1px dashed ${MARCA.borde};border-radius:10px;padding:14px;text-align:center;margin:0 0 18px;">
        <div style="font-size:12px;color:#7a6a5a;text-transform:uppercase;letter-spacing:1px;">Tu código</div>
        <div style="font-size:24px;font-weight:bold;letter-spacing:2px;color:${MARCA.acento};">
          ${escaparHtml(pedido.codigo)}
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 16px;">
        ${filas}
      </table>

      <div style="border-top:1px solid ${MARCA.borde};padding-top:14px;margin-bottom:18px;">
        <p style="margin:0 0 8px;font-size:13px;color:#7a6a5a;">Productos</p>
        <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.6;">
          ${listarItems(pedido)}
        </ul>
      </div>

      <p style="margin:0 0 18px;">
        <a href="${seguimiento}" style="display:inline-block;background:${MARCA.acento};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px;font-size:14px;font-weight:bold;">
          Ver el seguimiento de mi pedido
        </a>
      </p>

      <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#7a6a5a;">
        También puedes revisarlo en <a href="${seguimiento}" style="color:${MARCA.acento};">${escaparHtml(
          seguimiento
        )}</a>
      </p>

      ${
        nota
          ? `<p style="margin:16px 0 0;padding:12px;background:#fff7e6;border-left:3px solid #e0a33e;font-size:13px;line-height:1.6;color:#6b4f16;">${nota}</p>`
          : ''
      }

      <p style="margin:22px 0 0;font-size:12px;color:#9a8b7c;">
        Matteo Masas · Calle Parque Villarrica 1209, 9710000 Padre Hurtado, Región Metropolitana · Tel: +56 9 7925 8703<br>
        Este correo se envió automáticamente por un pedido en Matteo Masas.
        Si no reconoces este pedido, contáctanos para revisarlo.
      </p>
    </div>
  </div>`;

  const texto = [
    titulo,
    '',
    intro.replace(/<[^>]+>/g, ''),
    '',
    `Código: ${pedido.codigo}`,
    `Fecha de entrega: ${formatearFecha(pedido.fecha_entrega)}`,
    `Entrega: ${etiquetaEntrega(pedido)}`,
    `Total: ${formatearMonto(pedido.total)}`,
    '',
    `Seguimiento: ${seguimiento}`,
  ].join('\n');

  return { html, texto };
}

/* ------------------------------------------------------------------ */
/* Acceso a datos                                                     */
/* ------------------------------------------------------------------ */

async function obtenerPedido(idPedido) {
  const resultado = await pool.query(
    `
    SELECT
      p.id_pedido,
      p.codigo,
      p.nombre_cliente,
      p.email,
      p.tipo_entrega,
      to_char(p.fecha_entrega, 'YYYY-MM-DD') AS fecha_entrega,
      p.metodo_pago,
      p.estado,
      p.estado_pago,
      p.total::float8 AS total,
      p.monto_abono::float8 AS monto_abono,
      p.saldo_pendiente::float8 AS saldo_pendiente,
      p.email_confirmacion_enviado_en,
      p.email_pago_enviado_en,
      p.ultimo_estado_notificado,
      p.creado_en,
      p.actualizado_en,
      COALESCE(
        json_agg(
          json_build_object(
            'nombre_producto', d.nombre_producto,
            'presentacion_etiqueta', d.presentacion_etiqueta,
            'cantidad', d.cantidad,
            'subtotal', d.subtotal::float8
          )
          ORDER BY d.id_detalle
        ) FILTER (WHERE d.id_detalle IS NOT NULL),
        '[]'::json
      ) AS items
    FROM PEDIDO p
    LEFT JOIN DETALLE_PEDIDO d ON d.id_pedido = p.id_pedido
    WHERE p.id_pedido = $1
    GROUP BY p.id_pedido
    `,
    [idPedido]
  );

  return resultado.rows[0] || null;
}

async function registrarEnvio({ idPedido, tipo, destinatario, asunto, resultado }) {
  try {
    await pool.query(
      `
      INSERT INTO NOTIFICACION_CORREO
        (id_pedido, tipo, destinatario, asunto, estado, detalle)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        idPedido,
        tipo,
        destinatario,
        asunto.slice(0, 200),
        resultado.estado,
        resultado.detalle || resultado.proveedor || null,
      ]
    );
  } catch (error) {
    // Si la tabla aún no existe (migración pendiente) el correo igual se
    // envió; solo se pierde el registro de auditoría.
    console.error('No se pudo registrar la notificación:', error.message);
  }
}

async function enviarYRegistrar({ pedido, tipo, asunto, plantillaCorreo }) {
  const resultado = await enviarCorreo({
    to: pedido.email,
    subject: asunto,
    html: plantillaCorreo.html,
    text: plantillaCorreo.texto,
  });

  await registrarEnvio({
    idPedido: pedido.id_pedido,
    tipo,
    destinatario: pedido.email,
    asunto,
    resultado,
  });

  return resultado;
}

/* ------------------------------------------------------------------ */
/* Notificaciones                                                     */
/* ------------------------------------------------------------------ */

const AVISOS_ESTADO = {
  confirmado: {
    asunto: (codigo) => `Tu pedido ${codigo} está confirmado — Matteo Masas`,
    titulo: 'Pedido confirmado',
    intro:
      'Confirmamos tu pedido y ya está agendado. Prepararemos todo para la fecha que elegiste.',
  },
  listo: {
    asunto: (codigo) => `Tu pedido ${codigo} está listo — Matteo Masas`,
    titulo: 'Tu pedido está listo',
    intro:
      'Terminamos de preparar tu pedido. Puedes revisar los detalles de entrega en el seguimiento.',
  },
  cancelado: {
    asunto: (codigo) => `Tu pedido ${codigo} fue cancelado — Matteo Masas`,
    titulo: 'Pedido cancelado',
    intro:
      'Tu pedido fue cancelado y el cupo quedó liberado. Si no solicitaste esta cancelación, escríbenos para revisarlo.',
  },
};

/**
 * Correo de recepción del pedido. Se envía una sola vez.
 */
async function notificarPedidoCreado(idPedido) {
  try {
    const pedido = await obtenerPedido(idPedido);
    if (!pedido || !pedido.email) return { estado: 'omitido' };

    const asunto = `Pedido ${pedido.codigo} recibido — Matteo Masas`;
    const nota =
      pedido.metodo_pago === 'webpay'
        ? 'Si aún no completaste el pago con Webpay, vuelve al sitio y reinténtalo. El cupo queda reservado solo hasta que el pago se confirme o expire.'
        : pedido.metodo_pago === 'transferencia'
          ? 'Recuerda transferir el monto indicado para confirmar el pedido. La dueña registrará el pago al recibirlo.'
          : '';

    // La plantilla se construye siempre: así un error de formato se detecta
    // incluso cuando todavía no hay proveedor de correo configurado.
    const contenido = plantilla({
      titulo: 'Recibimos tu pedido',
      intro: `¡Gracias, ${escaparHtml(
        pedido.nombre_cliente.split(' ')[0]
      )}! Reservamos tu pedido para el ${escaparHtml(
        formatearFecha(pedido.fecha_entrega)
      )}.`,
      pedido,
      nota,
    });

    if (!proveedorConfigurado()) {
      await registrarEnvio({
        idPedido,
        tipo: 'confirmacion',
        destinatario: pedido.email,
        asunto,
        resultado: {
          estado: 'omitido',
          detalle: 'Sin proveedor de correo configurado',
        },
      });
      return { estado: 'omitido' };
    }

    const reclamo = await pool.query(
      `
      UPDATE PEDIDO
      SET email_confirmacion_enviado_en = NOW()
      WHERE id_pedido = $1
        AND email IS NOT NULL
        AND btrim(email) <> ''
        AND email_confirmacion_enviado_en IS NULL
      RETURNING id_pedido
      `,
      [idPedido]
    );

    if (reclamo.rowCount === 0) return { estado: 'omitido' };

    return await enviarYRegistrar({
      pedido,
      tipo: 'confirmacion',
      asunto,
      plantillaCorreo: contenido,
    });
  } catch (error) {
    console.error('Error al notificar el pedido creado:', error.message);
    return { estado: 'error', detalle: error.message };
  }
}

/**
 * Correo por cambio de estado. Solo se envía en las etapas definidas en
 * AVISOS_ESTADO; el resto de los cambios se ven en el seguimiento.
 */
async function notificarCambioEstado(idPedido, estadoNuevo) {
  try {
    const aviso = AVISOS_ESTADO[estadoNuevo];
    if (!aviso) return { estado: 'omitido' };

    const pedido = await obtenerPedido(idPedido);
    if (!pedido || !pedido.email) return { estado: 'omitido' };

    const asunto = aviso.asunto(pedido.codigo);
    const nota =
      estadoNuevo === 'listo'
        ? pedido.tipo_entrega === 'retiro'
          ? 'Puedes retirarlo en nuestro local en Calle Parque Villarrica 1209, Padre Hurtado (contacto: +56 9 7925 8703).'
          : 'Coordina la recepción en la dirección indicada al hacer el pedido (contacto: +56 9 7925 8703).'
        : '';

    const contenido = plantilla({
      titulo: aviso.titulo,
      intro: aviso.intro,
      pedido,
      nota,
    });

    if (!proveedorConfigurado()) {
      await registrarEnvio({
        idPedido,
        tipo: `estado_${estadoNuevo}`,
        destinatario: pedido.email,
        asunto,
        resultado: {
          estado: 'omitido',
          detalle: 'Sin proveedor de correo configurado',
        },
      });
      return { estado: 'omitido' };
    }

    const reclamo = await pool.query(
      `
      UPDATE PEDIDO
      SET ultimo_estado_notificado = $2
      WHERE id_pedido = $1
        AND (ultimo_estado_notificado IS NULL OR ultimo_estado_notificado <> $2)
      RETURNING id_pedido
      `,
      [idPedido, estadoNuevo]
    );

    if (reclamo.rowCount === 0) return { estado: 'omitido' };

    return await enviarYRegistrar({
      pedido,
      tipo: `estado_${estadoNuevo}`,
      asunto,
      plantillaCorreo: contenido,
    });
  } catch (error) {
    console.error('Error al notificar el cambio de estado:', error.message);
    return { estado: 'error', detalle: error.message };
  }
}

/**
 * Correo de pago registrado. Se omite en Webpay porque el cliente ve la
 * confirmación en pantalla al volver de Transbank.
 */
async function notificarPago(idPedido) {
  try {
    const pedido = await obtenerPedido(idPedido);

    if (!pedido || !pedido.email) return { estado: 'omitido' };
    if (pedido.metodo_pago === 'webpay') return { estado: 'omitido' };
    if (pedido.email_pago_enviado_en) return { estado: 'omitido' };

    const asunto = `Pago recibido del pedido ${pedido.codigo} — Matteo Masas`;
    const saldo = Number(pedido.saldo_pendiente) || 0;
    const lineas = [
      [
        'Estado del pago',
        `<strong>${escaparHtml(
          pedido.estado_pago === 'abono_pagado'
            ? 'Abono recibido'
            : 'Pagado'
        )}</strong>`,
      ],
    ];

    if (saldo > 0) {
      lineas.push(['Saldo pendiente', formatearMonto(saldo)]);
    }

    const contenido = plantilla({
      titulo: 'Pago registrado',
      intro: 'Registramos el pago de tu pedido. ¡Gracias!',
      pedido,
      lineas,
      nota:
        saldo > 0
          ? `Queda un saldo pendiente de ${formatearMonto(saldo)}, que se paga al retirar o recibir el pedido.`
          : '',
    });

    if (!proveedorConfigurado()) {
      await registrarEnvio({
        idPedido,
        tipo: 'pago',
        destinatario: pedido.email,
        asunto,
        resultado: {
          estado: 'omitido',
          detalle: 'Sin proveedor de correo configurado',
        },
      });
      return { estado: 'omitido' };
    }

    const reclamo = await pool.query(
      `
      UPDATE PEDIDO
      SET email_pago_enviado_en = NOW()
      WHERE id_pedido = $1
        AND email IS NOT NULL
        AND btrim(email) <> ''
        AND email_pago_enviado_en IS NULL
        AND metodo_pago <> 'webpay'
      RETURNING id_pedido
      `,
      [idPedido]
    );

    if (reclamo.rowCount === 0) return { estado: 'omitido' };

    return await enviarYRegistrar({
      pedido,
      tipo: 'pago',
      asunto,
      plantillaCorreo: contenido,
    });
  } catch (error) {
    console.error('Error al notificar el pago:', error.message);
    return { estado: 'error', detalle: error.message };
  }
}

module.exports = {
  notificarPedidoCreado,
  notificarCambioEstado,
  notificarPago,
  urlSeguimiento,
};
