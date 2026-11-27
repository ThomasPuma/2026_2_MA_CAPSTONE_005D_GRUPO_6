/**
 * Página pública de seguimiento del pedido.
 * Consulta /api/pedidos/codigo/:codigo y refresca el estado cada 20 segundos.
 */
(() => {
  const API = '/api/pedidos';
  const INTERVALO_MS = 20000;
  const TIEMPO_MAXIMO_MS = 15000;

  const PASOS = [
    {
      id: 'pendiente',
      titulo: 'Pedido recibido',
      detalle: 'Guardamos tu pedido y reservamos el cupo para la fecha elegida.',
    },
    {
      id: 'confirmado',
      titulo: 'Pedido confirmado',
      detalle: 'La dueña confirmó tu pedido y ya está agendado.',
    },
    {
      id: 'en_preparacion',
      titulo: 'En preparación',
      detalle: 'Estamos preparando tus productos de forma artesanal.',
    },
    {
      id: 'listo',
      titulo: 'Listo',
      detalle: 'Tu pedido está listo para retirar o despachar.',
    },
    {
      id: 'entregado',
      titulo: 'Entregado',
      detalle: 'Pedido entregado. ¡Gracias por preferirnos!',
    },
  ];

  const ETIQUETAS_ESTADO = {
    pendiente: 'Pendiente',
    confirmado: 'Confirmado',
    en_preparacion: 'En preparación',
    listo: 'Listo',
    entregado: 'Entregado',
    cancelado: 'Cancelado',
  };

  const ETIQUETAS_PAGO = {
    pendiente: 'Pago pendiente',
    abono_pendiente: 'Abono por transferencia pendiente',
    abono_pagado: 'Abono pagado',
    pagado: 'Pagado',
    rechazado: 'Pago rechazado',
    anulado: 'Pago anulado',
    reembolsado: 'Pago reembolsado',
    expirado: 'Pago expirado',
  };

  const NOMBRES_PAGO = {
    efectivo: 'Efectivo',
    tarjeta: 'Tarjeta presencial',
    transferencia: 'Transferencia',
    webpay: 'Webpay',
  };

  const $ = (id) => document.getElementById(id);

  let codigoActual = '';
  let temporizador = null;
  let cargando = false;

  document.addEventListener('DOMContentLoaded', iniciar);

  function iniciar() {
    $('seg-form').addEventListener('submit', enviarFormulario);

    const codigo = leerCodigoDeUrl();
    if (codigo) {
      $('seg-codigo-input').value = codigo;
      cargar(codigo);
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && codigoActual) cargar(codigoActual, true);
    });
  }

  function leerCodigoDeUrl() {
    const partes = window.location.pathname.split('/').filter(Boolean);
    if (partes[0] === 'seguimiento' && partes[1]) {
      return decodeURIComponent(partes[1]).trim().toUpperCase();
    }

    const parametros = new URLSearchParams(window.location.search);
    return (parametros.get('codigo') || '').trim().toUpperCase();
  }

  function enviarFormulario(evento) {
    evento.preventDefault();
    const codigo = $('seg-codigo-input').value.trim().toUpperCase();

    if (!codigo) {
      mostrarError('Escribe el código de tu pedido para buscarlo.');
      return;
    }

    window.history.replaceState(
      null,
      '',
      `/seguimiento/${encodeURIComponent(codigo)}`
    );

    cargar(codigo);
  }

  async function cargar(codigo, silencioso = false) {
    if (cargando) return;
    cargando = true;
    codigoActual = codigo;

    if (!silencioso) {
      $('seg-error').hidden = true;
      $('seg-cargando').hidden = false;
      $('seg-resultado').hidden = true;
    }

    const controlador = new AbortController();
    const limite = setTimeout(() => controlador.abort(), TIEMPO_MAXIMO_MS);

    try {
      const respuesta = await fetch(
        `${API}/codigo/${encodeURIComponent(codigo)}`,
        {
          signal: controlador.signal,
          headers: { Accept: 'application/json' },
        }
      );

      const datos = await respuesta.json().catch(() => ({}));

      if (!respuesta.ok || !datos.exito) {
        if (respuesta.status === 404) {
          detenerActualizacion();
          mostrarError(
            'No encontramos un pedido con ese código. Revísalo e intenta nuevamente.'
          );
          $('seg-resultado').hidden = true;
          return;
        }

        throw new Error(
          datos.mensaje || 'No pudimos consultar el pedido en este momento.'
        );
      }

      $('seg-error').hidden = true;
      renderizar(datos.pedido);
      programarActualizacion();
    } catch (error) {
      if (error.name === 'AbortError') {
        mostrarError('La consulta tardó demasiado. Intenta nuevamente.');
      } else {
        mostrarError(
          error.message || 'No pudimos consultar el pedido en este momento.'
        );
      }
    } finally {
      clearTimeout(limite);
      $('seg-cargando').hidden = true;
      cargando = false;
    }
  }

  function mostrarError(mensaje) {
    const aviso = $('seg-error');
    aviso.textContent = mensaje;
    aviso.hidden = false;
  }

  function programarActualizacion() {
    clearInterval(temporizador);
    temporizador = setInterval(() => {
      if (document.hidden || !codigoActual) return;
      cargar(codigoActual, true);
    }, INTERVALO_MS);
  }

  function detenerActualizacion() {
    clearInterval(temporizador);
    temporizador = null;
    codigoActual = '';
  }

  /* ------------------------------------------------------------------ */
  /* Render                                                             */
  /* ------------------------------------------------------------------ */

  function renderizar(pedido) {
    $('seg-resultado').hidden = false;

    $('seg-codigo').textContent = pedido.codigo || '—';

    const estado = String(pedido.estado || 'pendiente');
    const etiquetaEstado = ETIQUETAS_ESTADO[estado] || estado;
    const badge = $('seg-estado');
    badge.textContent = etiquetaEstado;
    badge.className = `seg-estado estado-${estado.replace(/_/g, '-')}`;

    renderizarAviso(pedido);
    renderizarLinea(pedido);
    renderizarEntrega(pedido);
    renderizarPago(pedido);
    renderizarItems(pedido);

    const ahora = new Intl.DateTimeFormat('es-CL', {
      timeStyle: 'medium',
    }).format(new Date());
    $('seg-actualizacion').textContent = `Última actualización: ${ahora}. La página se refresca sola cada 20 segundos.`;
  }

  function renderizarAviso(pedido) {
    const aviso = $('seg-aviso');
    const cancelado = pedido.estado === 'cancelado';
    const pagoExpirado = pedido.estado_pago === 'expirado';

    if (!cancelado && !pagoExpirado) {
      aviso.hidden = true;
      aviso.textContent = '';
      return;
    }

    aviso.hidden = false;
    aviso.className = 'seg-aviso';
    aviso.textContent = cancelado
      ? 'Este pedido fue cancelado. Si tienes dudas, contáctanos desde la tienda.'
      : 'El plazo de pago terminó y el pedido fue cancelado. Si pagaste, contáctanos para revisarlo.';
  }

  function renderizarLinea(pedido) {
    const historial = Array.isArray(pedido.historial) ? pedido.historial : [];
    const fechas = new Map();

    historial.forEach((registro) => {
      if (!fechas.has(registro.estado)) {
        fechas.set(registro.estado, registro.fecha);
      }
    });

    const estadoActual = pedido.estado || 'pendiente';
    const indiceActual = PASOS.findIndex((paso) => paso.id === estadoActual);
    const cancelado = estadoActual === 'cancelado';

    const items = PASOS.map((paso, indice) => {
      let clase = 'seg-paso';

      if (cancelado) {
        clase += fechas.has(paso.id) ? ' seg-paso--completado' : ' seg-paso--futuro';
      } else if (indice < indiceActual) {
        clase += ' seg-paso--completado';
      } else if (indice === indiceActual) {
        clase += ' seg-paso--actual';
      } else {
        clase += ' seg-paso--futuro';
      }

      const fecha = fechas.get(paso.id);
      const actual = !cancelado && indice === indiceActual;

      return `
        <li class="${clase}" ${actual ? 'aria-current="step"' : ''}>
          <span class="seg-paso-marca" aria-hidden="true"></span>
          <div class="seg-paso-texto">
            <strong>${escaparHtml(paso.titulo)}</strong>
            <p>${escaparHtml(paso.detalle)}</p>
            ${
              fecha
                ? `<time datetime="${escaparHtml(fecha)}">${escaparHtml(
                    formatearFechaHora(fecha)
                  )}</time>`
                : ''
            }
          </div>
        </li>
      `;
    }).join('');

    const pasoCancelado = cancelado
      ? `
        <li class="seg-paso seg-paso--cancelado" aria-current="step">
          <span class="seg-paso-marca" aria-hidden="true"></span>
          <div class="seg-paso-texto">
            <strong>Pedido cancelado</strong>
            <p>El cupo fue liberado. Si necesitas ayuda, contáctanos.</p>
            ${
              fechas.get('cancelado')
                ? `<time datetime="${escaparHtml(
                    fechas.get('cancelado')
                  )}">${escaparHtml(
                    formatearFechaHora(fechas.get('cancelado'))
                  )}</time>`
                : ''
            }
          </div>
        </li>
      `
      : '';

    $('seg-linea').innerHTML = items + pasoCancelado;
  }

  function renderizarEntrega(pedido) {
    const distancia = Number(pedido.distancia_km);
    const detalles = [];

    if (pedido.tipo_entrega === 'despacho') {
      if (Number.isFinite(distancia)) {
        detalles.push(`${distancia.toLocaleString('es-CL')} km`);
      }
      if (pedido.despacho_gratis) detalles.push('despacho gratis');
    }

    $('seg-entrega').textContent =
      pedido.tipo_entrega === 'retiro'
        ? 'Retiro en el local (Calle Parque Villarrica 1209, Padre Hurtado)'
        : 'Despacho a domicilio';

    const complemento = detalles.length ? ` (${detalles.join(' · ')})` : '';
    $('seg-fecha').textContent = `Fecha de entrega: ${formatearFecha(
      pedido.fecha_entrega
    )}${complemento}`;
  }

  function renderizarPago(pedido) {
    const metodo = NOMBRES_PAGO[pedido.metodo_pago] || pedido.metodo_pago;
    const estadoPago = ETIQUETAS_PAGO[pedido.estado_pago] || pedido.estado_pago;

    $('seg-pago').textContent = `${metodo} · ${estadoPago}`;

    const total = Number(pedido.total) || 0;
    const abono = Number(pedido.monto_abono) || 0;
    const saldo = Number(pedido.saldo_pendiente) || 0;
    const partes = [`Total: ${formatearMonto(total)}`];

    if (abono > 0) {
      partes.push(`Abono: ${formatearMonto(abono)}`);
      partes.push(`Saldo: ${formatearMonto(saldo)}`);
    }

    $('seg-total').textContent = partes.join(' · ');
  }

  function renderizarItems(pedido) {
    const items = Array.isArray(pedido.items) ? pedido.items : [];

    $('seg-items').innerHTML = items
      .map(
        (item) => `
          <li>
            <span>${escaparHtml(item.cantidad)} × ${escaparHtml(
              item.nombre_producto
            )} <small>${escaparHtml(item.presentacion_etiqueta)}</small></span>
            <strong>${formatearMonto(item.subtotal)}</strong>
          </li>
        `
      )
      .join('');

    const subtotal = Number(pedido.subtotal) || 0;
    const despacho = Number(pedido.costo_despacho) || 0;
    const total = Number(pedido.total) || 0;
    const partes = [`Subtotal ${formatearMonto(subtotal)}`];

    if (pedido.tipo_entrega === 'despacho') {
      partes.push(
        despacho > 0 ? `Despacho ${formatearMonto(despacho)}` : 'Despacho gratis'
      );
    }

    partes.push(`Total ${formatearMonto(total)}`);
    $('seg-total-pedido').textContent = partes.join(' · ');
  }

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

  function formatearMonto(valor) {
    const numero = Number(valor);
    if (!Number.isFinite(numero)) return '$0';

    return `$${numero.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`;
  }

  function formatearFecha(valor) {
    if (!valor) return '—';
    const partes = String(valor).slice(0, 10).split('-');
    if (partes.length !== 3) return String(valor);

    const fecha = new Date(
      Number(partes[0]),
      Number(partes[1]) - 1,
      Number(partes[2]),
      12
    );

    return new Intl.DateTimeFormat('es-CL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(fecha);
  }

  function formatearFechaHora(valor) {
    if (!valor) return '';
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return '';

    return new Intl.DateTimeFormat('es-CL', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(fecha);
  }
})();
