(() => {
  const API_PEDIDOS = '/api/pedidos';
  const API_PRODUCTOS = '/api/productos';

  const ESTADOS = [
    'pendiente',
    'confirmado',
    'en_preparacion',
    'listo',
    'entregado',
    'cancelado',
  ];

  const ETIQUETAS_ESTADO = {
    pendiente: 'Pendiente',
    confirmado: 'Confirmado',
    en_preparacion: 'En preparación',
    listo: 'Listo',
    entregado: 'Entregado',
    cancelado: 'Cancelado',
  };

  const NOMBRES_PAGO = {
    efectivo: 'Efectivo',
    tarjeta: 'Tarjeta',
    transferencia: 'Transferencia',
    webpay: 'Webpay',
  };

  const ETIQUETAS_PAGO = {
    pendiente: 'Pago pendiente',
    abono_pendiente: 'Abono pendiente',
    abono_pagado: 'Abono pagado',
    pagado: 'Pagado',
    rechazado: 'Pago rechazado',
    anulado: 'Pago anulado',
    reembolsado: 'Reembolsado',
    expirado: 'Pago expirado',
  };

  const CLASES_PAGO = {
    pendiente: 'estado-pendiente',
    abono_pendiente: 'estado-pendiente',
    abono_pagado: 'estado-en-preparacion',
    pagado: 'estado-confirmado',
    rechazado: 'estado-cancelado',
    anulado: 'estado-cancelado',
    reembolsado: 'estado-listo',
    expirado: 'estado-cancelado',
  };

  // Mismo flujo que valida el servidor: lineal, cancelar hasta la entrega y
  // reactivar un cancelado a Pendiente.
  const TRANSICIONES = {
    pendiente: ['confirmado', 'cancelado'],
    confirmado: ['en_preparacion', 'cancelado'],
    en_preparacion: ['listo', 'cancelado'],
    listo: ['entregado', 'cancelado'],
    entregado: [],
    cancelado: ['pendiente'],
  };

  const INTERVALO_ACTUALIZACION_MS = 10000;
  let ultimaSincronizacion = null;

  const UNIDADES = [
    'unidad',
    'kg',
    'g',
    'litro',
    'docena',
    'bandeja',
    'caja',
    'pack',
  ];

  let adminKey = sessionStorage.getItem('matteoAdminKey') || '';
  let pidiendoClave = false;
  let pedidos = [];
  let filtroEstado = 'todos';
  let configActual = null;
  let temporizadorToast = null;

  let vistaActual = 'pedidos';
  let productosAdmin = [];
  let categorias = [];
  let productosCargados = false;
  let productoEditando = null;

  const $ = (id) => document.getElementById(id);

  document.addEventListener('DOMContentLoaded', iniciar);

  function iniciar() {
    $('filtro-fecha').value = hoyISO();

    $('filtro-fecha').addEventListener('change', cargarPedidos);
    $('filtro-estado').addEventListener('change', () => {
      filtroEstado = $('filtro-estado').value;
      renderizarPedidos();
    });

    $('btn-hoy').addEventListener('click', () => {
      $('filtro-fecha').value = hoyISO();
      cargarPedidos();
    });

    $('btn-manana').addEventListener('click', () => {
      $('filtro-fecha').value = sumarDias(hoyISO(), 1);
      cargarPedidos();
    });

    $('btn-refrescar').addEventListener('click', cargarTodo);
    $('admin-pedidos').addEventListener('click', manejarClickPedido);
    $('config-form').addEventListener('submit', guardarConfiguracion);

    document.querySelectorAll('.admin-tab').forEach((tab) => {
      tab.addEventListener('click', () => cambiarVista(tab.dataset.vista));
    });

    $('filtro-busqueda').addEventListener('input', renderizarProductos);
    $('filtro-categoria').addEventListener('change', renderizarProductos);
    $('filtro-activo').addEventListener('change', renderizarProductos);

    $('btn-nuevo-producto').addEventListener('click', () => abrirModalProducto());
    $('lista-productos').addEventListener('click', manejarClickProducto);
    $('form-producto').addEventListener('submit', guardarProducto);
    $('btn-agregar-presentacion').addEventListener('click', () => {
      agregarFilaPresentacion();
    });
    $('presentaciones-lista').addEventListener('click', manejarClickPresentacion);

    $('btn-cerrar-modal').addEventListener('click', cerrarModalProducto);
    $('btn-cancelar-producto').addEventListener('click', cerrarModalProducto);
    $('modal-producto').addEventListener('click', (evento) => {
      if (evento.target === $('modal-producto')) cerrarModalProducto();
    });
    document.addEventListener('keydown', (evento) => {
      if (
        evento.key === 'Escape' &&
        !$('modal-producto').classList.contains('oculto')
      ) {
        cerrarModalProducto();
      }
    });

    cargarTodo();
    setInterval(actualizarPedidosAutomaticamente, INTERVALO_ACTUALIZACION_MS);
  }

  function actualizarPedidosAutomaticamente() {
    if (document.hidden || vistaActual !== 'pedidos') return;
    if (!adminKey || pidiendoClave) return;
    // No se redibuja si la dueña cambió un estado y aún no lo guardó.
    if (hayCambiosSinGuardar()) return;

    cargarPedidos(true);
  }

  function hayCambiosSinGuardar() {
    return Array.from(
      document.querySelectorAll('select[data-accion="estado"]')
    ).some((select) => {
      const pedido = pedidos.find(
        (item) => String(item.id_pedido) === select.dataset.id
      );
      return pedido && select.value !== pedido.estado;
    });
  }

  function transicionPermitida(desde, hasta) {
    return desde === hasta || (TRANSICIONES[desde] || []).includes(hasta);
  }

  function actualizarSincronizacion(ok) {
    const aviso = $('admin-sync');
    if (!aviso) return;

    if (ok) {
      ultimaSincronizacion = new Date();
      aviso.className = 'admin-sync';
      aviso.textContent = `Última sincronización: ${formatearHora(
        ultimaSincronizacion
      )}. Se actualiza cada 10 segundos.`;
      return;
    }

    aviso.className = 'admin-sync admin-sync-error';
    aviso.textContent = `Sin conexión. Última sincronización: ${
      ultimaSincronizacion ? formatearHora(ultimaSincronizacion) : 'nunca'
    }.`;
  }

  function formatearHora(fecha) {
    return new Intl.DateTimeFormat('es-CL', { timeStyle: 'short' }).format(fecha);
  }

  /* ------------------------------------------------------------------ */
  /* API                                                                */
  /* ------------------------------------------------------------------ */

  async function apiFetch(ruta, opciones = {}, base = API_PEDIDOS) {
    const headers = new Headers(opciones.headers || {});
    if (adminKey) headers.set('x-admin-key', adminKey);

    const respuesta = await fetch(`${base}${ruta}`, {
      ...opciones,
      headers,
    });

    if (respuesta.status === 401) {
      // Si otra petición ya obtuvo la clave mientras esta estaba en curso,
      // se reintenta sin volver a mostrar el prompt.
      if (adminKey && !opciones._reintentado) {
        return apiFetch(ruta, { ...opciones, _reintentado: true }, base);
      }

      if (!pidiendoClave) {
        pidiendoClave = true;
        const clave = window.prompt('Ingresa la clave del panel de administración:');
        pidiendoClave = false;

        if (clave) {
          adminKey = clave;
          sessionStorage.setItem('matteoAdminKey', clave);
          return apiFetch(ruta, { ...opciones, _reintentado: true }, base);
        }
      }

      throw new Error('Se requiere la clave del panel de administración.');
    }

    const datos = await respuesta.json().catch(() => ({}));

    if (!respuesta.ok || datos.exito === false) {
      throw new Error(datos.mensaje || `Error ${respuesta.status}`);
    }

    return datos;
  }

  async function cargarTodo() {
    await Promise.all([cargarPedidos(), cargarConfiguracion(), cargarProductos()]);
  }

  async function cargarPedidos(silencioso = false) {
    const soloActualizacion = silencioso === true;
    const contenedor = $('admin-pedidos');
    const fecha = $('filtro-fecha').value || hoyISO();

    if (!soloActualizacion) {
      contenedor.innerHTML = '<p class="admin-cargando">Cargando pedidos…</p>';
    }

    try {
      const datos = await apiFetch(`?fecha=${encodeURIComponent(fecha)}`);
      pedidos = Array.isArray(datos.pedidos) ? datos.pedidos : [];
      configActual = datos.config || configActual;
      renderizarResumen(datos);
      renderizarPedidos();
      actualizarSincronizacion(true);
    } catch (error) {
      console.error(error);
      actualizarSincronizacion(false);
      if (soloActualizacion) return;
      contenedor.innerHTML = `<p class="admin-error">${escaparHtml(
        error.message
      )}</p>`;
      $('admin-resumen').innerHTML = `<p class="admin-error">${escaparHtml(
        error.message
      )}</p>`;
    }
  }

  async function cargarConfiguracion() {
    try {
      const datos = await apiFetch('/configuracion');
      aplicarConfiguracion(datos.config);
    } catch (error) {
      console.error(error);
      $('config-mensaje').textContent = error.message;
      $('config-mensaje').className = 'config-mensaje config-mensaje-error';
    }
  }

  async function cargarProductos() {
    const contenedor = $('lista-productos');
    contenedor.innerHTML = '<p class="admin-cargando">Cargando productos…</p>';

    try {
      const datos = await apiFetch('/admin', {}, API_PRODUCTOS);
      productosAdmin = Array.isArray(datos.productos) ? datos.productos : [];
      categorias = Array.isArray(datos.categorias) ? datos.categorias : [];
      productosCargados = true;

      llenarFiltroCategorias();
      renderizarProductos();
    } catch (error) {
      console.error(error);
      contenedor.innerHTML = `<p class="admin-error">${escaparHtml(
        error.message
      )}</p>`;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Navegación entre secciones                                         */
  /* ------------------------------------------------------------------ */

  function cambiarVista(vista) {
    if (!vista) return;
    vistaActual = vista;

    document.querySelectorAll('.admin-tab').forEach((tab) => {
      const activo = tab.dataset.vista === vista;
      tab.classList.toggle('activo', activo);
      tab.setAttribute('aria-selected', String(activo));
    });

    document.querySelectorAll('.admin-vista').forEach((seccion) => {
      seccion.classList.toggle(
        'oculto',
        seccion.id !== `vista-${vista}`
      );
    });

    if (vista === 'productos' && !productosCargados) {
      cargarProductos();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Resumen                                                            */
  /* ------------------------------------------------------------------ */

  function renderizarResumen(datos) {
    const resumen = datos.resumen;
    if (!resumen) return;

    const estadoDia = resumen.diaCerrado
      ? 'Día cerrado'
      : resumen.cuposDisponibles === 0
        ? 'Cupo completo'
        : 'Con cupo disponible';

    const tarjetas = [
      {
        etiqueta: 'Pedidos activos',
        valor: `${resumen.pedidosActivos} / ${resumen.cupo}`,
        nota: `${resumen.cuposDisponibles} cupo(s) disponible(s)`,
      },
      {
        etiqueta: 'Pendientes por confirmar',
        valor: resumen.pendientes,
        nota: 'Revisa y contacta a estos clientes',
      },
      {
        etiqueta: 'En proceso',
        valor: resumen.enProceso,
        nota: 'Confirmados, en preparación o listos',
      },
      {
        etiqueta: 'Ingresos estimados',
        valor: `$${formatearPrecio(resumen.ingresosEstimados)}`,
        nota: 'Sin contar pedidos cancelados',
      },
    ];

    $('admin-resumen').innerHTML = `
      <div class="resumen-dia">
        <span class="estado-badge ${resumen.diaCerrado ? 'estado-cancelado' : 'estado-confirmado'}">
          ${escaparHtml(estadoDia)}
        </span>
        <span>${escaparHtml(datos.fecha)}</span>
      </div>
      <div class="resumen-grid">
        ${tarjetas
          .map(
            (tarjeta) => `
              <article class="resumen-card">
                <span>${escaparHtml(tarjeta.etiqueta)}</span>
                <strong>${escaparHtml(tarjeta.valor)}</strong>
                <small>${escaparHtml(tarjeta.nota)}</small>
              </article>
            `
          )
          .join('')}
      </div>
    `;
  }

  /* ------------------------------------------------------------------ */
  /* Listado de pedidos                                                 */
  /* ------------------------------------------------------------------ */

  function renderizarPedidos() {
    const contenedor = $('admin-pedidos');
    const visibles =
      filtroEstado === 'todos'
        ? pedidos
        : pedidos.filter((pedido) => pedido.estado === filtroEstado);

    if (visibles.length === 0) {
      contenedor.innerHTML = `
        <div class="admin-vacio">
          <span aria-hidden="true">📭</span>
          <h3>No hay pedidos para mostrar</h3>
          <p>
            ${
              filtroEstado === 'todos'
                ? 'Cuando recibas un pedido para esta fecha aparecerá aquí.'
                : 'No hay pedidos con el estado seleccionado.'
            }
          </p>
        </div>
      `;
      return;
    }

    contenedor.innerHTML = visibles
      .map((pedido) => {
        const items = (pedido.items || [])
          .map(
            (item) => `
              <li>
                <span>${item.cantidad} × ${escaparHtml(item.nombre_producto)}</span>
                <small>${escaparHtml(item.presentacion_etiqueta)}</small>
                <strong>$${formatearPrecio(item.subtotal)}</strong>
              </li>
            `
          )
          .join('');

        const estadoClase = String(pedido.estado).replace(/_/g, '-');
        const mostrarPago =
          pedido.metodo_pago === 'webpay' ||
          Number(pedido.monto_abono) > 0 ||
          ['pagado', 'abono_pagado', 'reembolsado'].includes(
            pedido.estado_pago
          );
        const clasePago =
          CLASES_PAGO[pedido.estado_pago] || 'estado-pendiente';
        const etiquetaPago =
          ETIQUETAS_PAGO[pedido.estado_pago] || pedido.estado_pago || '';
        const ultimos4 = pedido.webpay_detalle?.tarjeta;
        const detallePago = [
          ultimos4 ? `**** ${ultimos4}` : '',
          pedido.webpay_autorizacion
            ? `aut. ${pedido.webpay_autorizacion}`
            : '',
        ]
          .filter(Boolean)
          .join(' · ');
        const alertaPago = pedido.webpay_detalle?.monto_inconsistente
          ? 'El monto pagado en Webpay no coincide con el total del pedido. Revisa la transacción antes de continuar.'
          : pedido.webpay_detalle?.confirmacion_fallida
            ? 'No se pudo confirmar el pago con Webpay. Revisa el portal de Transbank antes de cancelar el pedido.'
            : pedido.estado_pago === 'expirado'
              ? 'El plazo para pagar expiró y el cupo fue liberado. Si el cliente alcanzó a pagar, revisa la orden en el portal de Transbank.'
              : '';
        const montoAbono = Number(pedido.monto_abono) || 0;
        const saldoPendiente = Number(pedido.saldo_pendiente) || 0;
        const esPedidoConAbono = montoAbono > 0;
        const abonoPagado =
          Boolean(pedido.abono_pagado) ||
          pedido.estado_pago === 'abono_pagado';
        const porcentajeAbono =
          Number(pedido.total) > 0
            ? Math.round((montoAbono / Number(pedido.total)) * 100)
            : 25;
        const abonoMetodoAdmin =
          pedido.metodo_pago === 'transferencia' ? 'Transferencia' : 'Webpay';
        const puedeAccionPago = pedido.estado !== 'cancelado';
        const distancia =
          pedido.distancia_km === null || pedido.distancia_km === undefined
            ? null
            : Number(pedido.distancia_km);
        const detalleDespacho =
          pedido.tipo_entrega === 'despacho'
            ? [
                Number.isFinite(distancia)
                  ? `${distancia.toLocaleString('es-CL', {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })} km`
                  : '',
                pedido.fuera_comuna
                  ? 'fuera de Padre Hurtado'
                  : pedido.fuera_comuna === false
                    ? 'dentro de Padre Hurtado'
                    : '',
                pedido.despacho_gratis ? 'despacho gratis' : '',
              ]
                .filter(Boolean)
                .join(' · ')
            : '';

        const accionesPago = [
          puedeAccionPago &&
          pedido.metodo_pago === 'transferencia' &&
          pedido.estado_pago === 'abono_pendiente'
            ? `<button class="btn-secundario btn-pago" type="button" data-accion="pago" data-pago="registrar_abono" data-id="${pedido.id_pedido}">Registrar abono recibido</button>`
            : '',
          puedeAccionPago && pedido.estado_pago === 'abono_pagado'
            ? `<button class="btn-secundario btn-pago" type="button" data-accion="pago" data-pago="registrar_saldo" data-id="${pedido.id_pedido}">Registrar saldo pagado</button>`
            : '',
          puedeAccionPago &&
          pedido.estado_pago === 'pendiente' &&
          pedido.metodo_pago !== 'webpay' &&
          !(Number(pedido.monto_abono) > 0)
            ? `<button class="btn-secundario btn-pago" type="button" data-accion="pago" data-pago="marcar_pagado" data-id="${pedido.id_pedido}">Marcar pago recibido</button>`
            : '',
        ]
          .filter(Boolean)
          .join('');

        return `
          <article class="pedido-card" data-id="${pedido.id_pedido}">
            <header class="pedido-card-header">
              <div class="pedido-card-titulo">
                <strong>${escaparHtml(pedido.codigo)}</strong>
                <span class="estado-badge estado-${estadoClase}">
                  ${escaparHtml(ETIQUETAS_ESTADO[pedido.estado] || pedido.estado)}
                </span>
                ${
                  mostrarPago
                    ? `<span class="estado-badge ${clasePago}">${escaparHtml(
                        etiquetaPago
                      )}</span>`
                    : ''
                }
              </div>
              <strong class="pedido-total">$${formatearPrecio(pedido.total)}</strong>
            </header>

            <div class="pedido-datos">
              <p><strong>${escaparHtml(pedido.nombre_cliente)}</strong></p>
              <p>
                📞 <a href="tel:${telefonoEnlace(pedido.telefono)}">${escaparHtml(
                  pedido.telefono
                )}</a>
                ${
                  pedido.email
                    ? ` · ✉️ <a href="mailto:${escaparHtml(pedido.email)}">${escaparHtml(
                        pedido.email
                      )}</a>`
                    : ''
                }
              </p>
              <p>
                ${
                  pedido.tipo_entrega === 'retiro'
                    ? '🏠 Retiro en el local'
                    : `🚚 Despacho: ${escaparHtml(pedido.direccion || '')}${
                        detalleDespacho
                          ? `<br><small class="pedido-despacho-detalle">${escaparHtml(
                              detalleDespacho
                            )}</small>`
                          : ''
                      }`
                }
              </p>
              <p>
                💳 ${escaparHtml(NOMBRES_PAGO[pedido.metodo_pago] || pedido.metodo_pago)}${
                  detallePago ? ` · ${escaparHtml(detallePago)}` : ''
                }
                · Recibido: ${escaparHtml(formatearFechaHora(pedido.creado_en))}
              </p>
            </div>

            <ul class="pedido-items">${items}</ul>

            ${
              esPedidoConAbono
                ? `<div class="pedido-abono">
                    <p>
                      <strong>Abono (${porcentajeAbono}%) · ${abonoMetodoAdmin}:</strong>
                      $${formatearPrecio(montoAbono)}
                      <span class="estado-badge ${
                        abonoPagado ? 'estado-confirmado' : 'estado-pendiente'
                      }">
                        ${abonoPagado ? 'Recibido' : 'Pendiente'}
                      </span>
                    </p>
                    <p><strong>Saldo:</strong> ${
                      pedido.estado === 'cancelado'
                        ? 'No aplica'
                        : pedido.estado_pago === 'pagado'
                          ? 'Pagado'
                          : `$${formatearPrecio(saldoPendiente)} pendiente`
                    }</p>
                  </div>`
                : ''
            }

            ${
              pedido.notas
                ? `<p class="pedido-notas">📝 ${escaparHtml(pedido.notas)}</p>`
                : ''
            }

            ${
              alertaPago
                ? `<p class="pedido-alerta">⚠️ ${escaparHtml(alertaPago)}</p>`
                : ''
            }

            ${
              accionesPago
                ? `<div class="pedido-pago-acciones">${accionesPago}</div>`
                : ''
            }

            <footer class="pedido-footer">
              <label class="campo campo-estado-pedido">
                <span>Estado del pedido</span>
                <select data-accion="estado" data-id="${pedido.id_pedido}">
                  ${ESTADOS.map(
                    (estado) => `
                      <option value="${estado}" ${
                        estado === pedido.estado ? 'selected' : ''
                      } ${
                        transicionPermitida(pedido.estado, estado)
                          ? ''
                          : 'disabled'
                      }>
                        ${ETIQUETAS_ESTADO[estado]}
                      </option>
                    `
                  ).join('')}
                </select>
              </label>
              <button
                class="btn-primario btn-actualizar-estado"
                type="button"
                data-accion="guardar-estado"
                data-id="${pedido.id_pedido}"
              >
                Guardar estado
              </button>
            </footer>
          </article>
        `;
      })
      .join('');
  }

  async function registrarPagoPedido(boton) {
    const idPedido = Number(boton.dataset.id);
    const accion = boton.dataset.pago;
    const pedido = pedidos.find((item) => item.id_pedido === idPedido);

    const mensajes = {
      registrar_abono: `¿Registrar el abono de $${formatearPrecio(
        pedido?.monto_abono || 0
      )} como recibido?`,
      registrar_saldo: `¿Registrar el saldo de $${formatearPrecio(
        pedido?.saldo_pendiente || 0
      )} como pagado?`,
      marcar_pagado: '¿Marcar este pedido como pagado?',
    };

    if (!window.confirm(mensajes[accion] || '¿Registrar el pago?')) {
      return;
    }

    const textoOriginal = boton.textContent;
    boton.disabled = true;
    boton.textContent = 'Guardando…';

    try {
      const resultado = await apiFetch(`/${idPedido}/pago`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion }),
      });

      mostrarToast(resultado.mensaje || 'Pago actualizado.');
      await cargarPedidos();
    } catch (error) {
      console.error(error);
      mostrarToast(error.message);
      boton.disabled = false;
      boton.textContent = textoOriginal;
    }
  }

  async function manejarClickPedido(evento) {
    const botonPago = evento.target.closest('button[data-accion="pago"]');
    if (botonPago) {
      await registrarPagoPedido(botonPago);
      return;
    }

    const boton = evento.target.closest('button[data-accion="guardar-estado"]');
    if (!boton) return;

    const idPedido = Number(boton.dataset.id);
    const tarjeta = boton.closest('.pedido-card');
    const select = tarjeta?.querySelector('select[data-accion="estado"]');
    if (!select) return;

    const estado = select.value;
    const pedidoActual = pedidos.find(
      (pedido) => pedido.id_pedido === idPedido
    );

    if (estado === 'cancelado') {
      let mensaje =
        '¿Cancelar este pedido? Se liberará el cupo de esa fecha.';
      const estadoPago = pedidoActual?.estado_pago;
      const esWebpay = pedidoActual?.metodo_pago === 'webpay';
      const esTransferencia = pedidoActual?.metodo_pago === 'transferencia';
      const montoAbono = Number(pedidoActual?.monto_abono) || 0;
      const tieneCobroWebpay =
        esWebpay || (montoAbono > 0 && !esTransferencia);

      if (
        tieneCobroWebpay &&
        montoAbono > 0 &&
        estadoPago !== 'pendiente'
      ) {
        mensaje += ` Se reembolsará el abono de $${formatearPrecio(
          montoAbono
        )} en Webpay${
          estadoPago === 'pagado'
            ? ' (el saldo se pagó por otro medio)'
            : '; el saldo aún no se ha pagado'
        }.`;
      } else if (tieneCobroWebpay && estadoPago === 'pagado') {
        mensaje +=
          ' El pago ya fue recibido: se intentará reembolsar el monto completo en Webpay.';
      } else if (
        esTransferencia &&
        ['pagado', 'abono_pagado'].includes(estadoPago)
      ) {
        mensaje +=
          ' El pago fue por transferencia: deberás gestionar la devolución manualmente.';
      } else if (estadoPago === 'abono_pendiente') {
        mensaje +=
          ' El abono todavía no ha sido recibido; no se reembolsará nada.';
      } else if (
        tieneCobroWebpay &&
        montoAbono > 0 &&
        estadoPago === 'pendiente'
      ) {
        mensaje += ' El abono con Webpay aún no se ha confirmado.';
      }

      if (!window.confirm(mensaje)) {
        select.value = pedidoActual?.estado || 'pendiente';
        return;
      }
    }

    const textoOriginal = boton.textContent;
    boton.disabled = true;
    boton.textContent = 'Guardando…';

    try {
      await apiFetch(`/${idPedido}/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado }),
      });

      mostrarToast('Estado del pedido actualizado.');
      await cargarPedidos();
    } catch (error) {
      console.error(error);
      mostrarToast(error.message);
      boton.disabled = false;
      boton.textContent = textoOriginal;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Productos                                                          */
  /* ------------------------------------------------------------------ */

  function llenarFiltroCategorias() {
    const select = $('filtro-categoria');
    const valorActual = select.value;
    select.innerHTML =
      '<option value="todos">Todas</option>' +
      categorias
        .map(
          (categoria) =>
            `<option value="${categoria.id_categoria}">${escaparHtml(
              categoria.nombre
            )}</option>`
        )
        .join('');

    if (
      valorActual !== 'todos' &&
      categorias.some((categoria) => String(categoria.id_categoria) === valorActual)
    ) {
      select.value = valorActual;
    }
  }

  function renderizarProductos() {
    const contenedor = $('lista-productos');
    const busqueda = $('filtro-busqueda').value.trim().toLowerCase();
    const categoria = $('filtro-categoria').value;
    const estado = $('filtro-activo').value;

    const visibles = productosAdmin.filter((producto) => {
      if (
        categoria !== 'todos' &&
        String(producto.id_categoria) !== categoria
      ) {
        return false;
      }

      if (estado === 'activos' && !producto.activo) return false;
      if (estado === 'inactivos' && producto.activo) return false;

      if (busqueda) {
        const contenido = [
          producto.nombre,
          producto.grupo,
          producto.variante,
          producto.categoria,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!contenido.includes(busqueda)) return false;
      }

      return true;
    });

    if (visibles.length === 0) {
      contenedor.innerHTML = `
        <div class="admin-vacio">
          <span aria-hidden="true">🥖</span>
          <h3>No hay productos para mostrar</h3>
          <p>
            ${
              productosAdmin.length === 0
                ? 'Crea el primer producto con el botón "Nuevo producto".'
                : 'Prueba con otra búsqueda o filtro.'
            }
          </p>
        </div>
      `;
      return;
    }

    contenedor.innerHTML = `
      <div class="productos-tabla-wrap">
        <table class="productos-tabla">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Categoría</th>
              <th>Formatos y precios</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${visibles.map(filaProducto).join('')}
          </tbody>
        </table>
      </div>
    `;

    contenedor.querySelectorAll('.producto-mini').forEach((imagen) => {
      imagen.addEventListener('error', () => {
        imagen.classList.add('producto-mini-error');
        imagen.removeAttribute('src');
      });
    });
  }

  function filaProducto(producto) {
    const formatos = (producto.presentaciones || [])
      .map(
        (presentacion) => `
          <li>
            <span>${escaparHtml(presentacion.etiqueta)}</span>
            <strong>$${formatearPrecio(presentacion.precio)}</strong>
          </li>
        `
      )
      .join('');

    const detalle = [producto.grupo, producto.variante]
      .filter(Boolean)
      .map(escaparHtml)
      .join(' · ');

    return `
      <tr data-id="${producto.id_producto}">
        <td data-label="Producto">
          <div class="producto-info">
            ${
              producto.imagen_url
                ? `<img class="producto-mini" src="${escaparHtml(
                    producto.imagen_url
                  )}" alt="">`
                : '<span class="producto-mini producto-mini-vacio" aria-hidden="true">🥖</span>'
            }
            <div>
              <strong>${escaparHtml(producto.nombre)}</strong>
              <small>${detalle || 'Sin grupo ni variante'}</small>
            </div>
          </div>
        </td>
        <td data-label="Categoría"><span class="producto-categoria">${escaparHtml(producto.categoria)}</span></td>
        <td data-label="Formatos y precios">
          <ul class="producto-formatos">
            ${formatos || '<li><span>Sin formatos</span></li>'}
          </ul>
        </td>
        <td data-label="Estado">
          <span class="estado-badge ${producto.activo ? 'estado-confirmado' : 'estado-cancelado'}">
            ${producto.activo ? 'Activo' : 'Inactivo'}
          </span>
        </td>
        <td data-label="Acciones">
          <div class="producto-acciones">
            <button type="button" class="btn-tabla" data-accion="editar">
              Editar
            </button>
            <button
              type="button"
              class="btn-tabla ${producto.activo ? 'btn-tabla-peligro' : 'btn-tabla-ok'}"
              data-accion="cambiar-estado"
            >
              ${producto.activo ? 'Desactivar' : 'Activar'}
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  async function manejarClickProducto(evento) {
    const boton = evento.target.closest('button[data-accion]');
    if (!boton) return;

    const fila = boton.closest('tr[data-id]');
    const idProducto = Number(fila?.dataset.id);
    const producto = productosAdmin.find(
      (item) => item.id_producto === idProducto
    );

    if (!producto) return;

    if (boton.dataset.accion === 'editar') {
      abrirModalProducto(producto);
      return;
    }

    if (boton.dataset.accion === 'cambiar-estado') {
      await cambiarEstadoProducto(producto, boton);
    }
  }

  async function cambiarEstadoProducto(producto, boton) {
    const activo = !producto.activo;

    if (
      !activo &&
      !window.confirm(
        `¿Desactivar "${producto.nombre}"? Dejará de mostrarse en la tienda.`
      )
    ) {
      return;
    }

    const textoOriginal = boton.textContent;
    boton.disabled = true;
    boton.textContent = 'Guardando…';

    try {
      const datos = await apiFetch(
        `/${producto.id_producto}/estado`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activo }),
        },
        API_PRODUCTOS
      );

      mostrarToast(datos.mensaje || 'Estado del producto actualizado.');
      await cargarProductos();
    } catch (error) {
      console.error(error);
      mostrarToast(error.message);
      boton.disabled = false;
      boton.textContent = textoOriginal;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Modal de producto                                                  */
  /* ------------------------------------------------------------------ */

  function llenarSelectCategorias(select, seleccionada) {
    select.innerHTML = categorias
      .map(
        (categoria) =>
          `<option value="${categoria.id_categoria}">${escaparHtml(
            categoria.nombre
          )}</option>`
      )
      .join('');

    if (seleccionada) select.value = String(seleccionada);
  }

  function abrirModalProducto(producto = null) {
    productoEditando = producto;
    $('form-producto').reset();
    $('producto-mensaje').textContent = '';
    $('producto-mensaje').className = 'config-mensaje';

    $('modal-titulo').textContent = producto
      ? 'Editar producto'
      : 'Nuevo producto';
    $('modal-subtitulo').textContent = producto
      ? `Editando: ${producto.nombre}`
      : 'Completa los datos del catálogo.';

    llenarSelectCategorias(
      $('prod-categoria'),
      producto ? producto.id_categoria : null
    );

    $('prod-nombre').value = producto?.nombre || '';
    $('prod-grupo').value = producto?.grupo || '';
    $('prod-variante').value = producto?.variante || '';
    $('prod-descripcion').value = producto?.descripcion || '';
    $('prod-imagen').value = producto?.imagen_url || '';
    $('prod-activo').checked = producto ? Boolean(producto.activo) : true;

    const contenedor = $('presentaciones-lista');
    contenedor.innerHTML = '';

    const presentaciones =
      producto && producto.presentaciones.length > 0
        ? producto.presentaciones
        : [{}];

    presentaciones.forEach((presentacion) =>
      agregarFilaPresentacion(presentacion)
    );

    $('modal-producto').classList.remove('oculto');
    document.body.classList.add('modal-abierto');
    setTimeout(() => $('prod-nombre').focus(), 50);
  }

  function cerrarModalProducto() {
    $('modal-producto').classList.add('oculto');
    document.body.classList.remove('modal-abierto');
    productoEditando = null;
  }

  function agregarFilaPresentacion(presentacion = {}) {
    const contenedor = $('presentaciones-lista');
    const fila = document.createElement('div');
    fila.className = 'presentacion-fila';

    if (presentacion.id_presentacion) {
      fila.dataset.id = presentacion.id_presentacion;
    }

    const unidades = UNIDADES.includes(presentacion.unidad)
      ? UNIDADES
      : [...UNIDADES, presentacion.unidad].filter(Boolean);

    fila.innerHTML = `
      <label class="campo">
        <span>Formato *</span>
        <input
          type="text"
          data-campo="etiqueta"
          maxlength="100"
          placeholder="Ej. 20 unidades"
          value="${escaparHtml(presentacion.etiqueta || '')}"
          required
        >
      </label>

      <label class="campo">
        <span>Cantidad</span>
        <input
          type="number"
          data-campo="cantidad"
          min="0.01"
          step="0.01"
          value="${presentacion.cantidad ?? 1}"
          required
        >
      </label>

      <label class="campo">
        <span>Unidad</span>
        <select data-campo="unidad">
          ${unidades
            .map(
              (unidad) =>
                `<option value="${escaparHtml(unidad)}" ${
                  (presentacion.unidad || 'unidad') === unidad ? 'selected' : ''
                }>${escaparHtml(unidad)}</option>`
            )
            .join('')}
        </select>
      </label>

      <label class="campo">
        <span>Precio *</span>
        <input
          type="number"
          data-campo="precio"
          min="1"
          step="1"
          placeholder="0"
          value="${presentacion.precio ?? ''}"
          required
        >
      </label>

      <button
        type="button"
        class="btn-quitar-formato"
        data-accion="quitar-formato"
        aria-label="Quitar formato"
        title="Quitar formato"
      >
        &times;
      </button>
    `;

    contenedor.appendChild(fila);
  }

  function manejarClickPresentacion(evento) {
    const boton = evento.target.closest('button[data-accion="quitar-formato"]');
    if (!boton) return;

    const filas = document.querySelectorAll(
      '#presentaciones-lista .presentacion-fila'
    );

    if (filas.length <= 1) {
      mostrarToast('Debe quedar al menos un formato con precio.');
      return;
    }

    boton.closest('.presentacion-fila').remove();
  }

  function leerPresentaciones() {
    return Array.from(
      document.querySelectorAll('#presentaciones-lista .presentacion-fila')
    ).map((fila, indice) => {
      const presentacion = {
        etiqueta: fila.querySelector('[data-campo="etiqueta"]').value.trim(),
        cantidad: Number(fila.querySelector('[data-campo="cantidad"]').value),
        unidad: fila.querySelector('[data-campo="unidad"]').value,
        precio: Number(fila.querySelector('[data-campo="precio"]').value),
        orden: indice + 1,
      };

      if (fila.dataset.id) {
        presentacion.id_presentacion = Number(fila.dataset.id);
      }

      return presentacion;
    });
  }

  function validarFormularioProducto(datos) {
    if (datos.nombre.length < 2) {
      return 'Ingresa el nombre del producto (mínimo 2 caracteres).';
    }

    if (!datos.id_categoria) {
      return 'Selecciona una categoría.';
    }

    if (datos.presentaciones.length === 0) {
      return 'Agrega al menos un formato con su precio.';
    }

    for (let indice = 0; indice < datos.presentaciones.length; indice += 1) {
      const presentacion = datos.presentaciones[indice];
      const posicion = indice + 1;

      if (!presentacion.etiqueta) {
        return `Formato ${posicion}: escribe el nombre del formato.`;
      }

      if (!Number.isFinite(presentacion.cantidad) || presentacion.cantidad <= 0) {
        return `Formato ${posicion}: la cantidad debe ser mayor que 0.`;
      }

      if (!Number.isFinite(presentacion.precio) || presentacion.precio <= 0) {
        return `Formato ${posicion}: el precio debe ser mayor que 0.`;
      }
    }

    return null;
  }

  async function guardarProducto(evento) {
    evento.preventDefault();

    const boton = $('btn-guardar-producto');
    const mensaje = $('producto-mensaje');
    const datos = {
      nombre: $('prod-nombre').value.trim(),
      id_categoria: Number($('prod-categoria').value),
      grupo: $('prod-grupo').value.trim(),
      variante: $('prod-variante').value.trim(),
      descripcion: $('prod-descripcion').value.trim(),
      imagen_url: $('prod-imagen').value.trim(),
      activo: $('prod-activo').checked,
      presentaciones: leerPresentaciones(),
    };

    const errorValidacion = validarFormularioProducto(datos);

    if (errorValidacion) {
      mensaje.textContent = errorValidacion;
      mensaje.className = 'config-mensaje config-mensaje-error';
      return;
    }

    const textoOriginal = boton.textContent;
    boton.disabled = true;
    boton.textContent = 'Guardando…';
    mensaje.textContent = '';
    mensaje.className = 'config-mensaje';

    try {
      const respuesta = await apiFetch(
        productoEditando ? `/${productoEditando.id_producto}` : '',
        {
          method: productoEditando ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(datos),
        },
        API_PRODUCTOS
      );

      cerrarModalProducto();
      mostrarToast(respuesta.mensaje || 'Producto guardado correctamente.');
      await cargarProductos();
    } catch (error) {
      console.error(error);
      mensaje.textContent = error.message;
      mensaje.className = 'config-mensaje config-mensaje-error';
      mostrarToast(error.message);
    } finally {
      boton.disabled = false;
      boton.textContent = textoOriginal;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Configuración                                                      */
  /* ------------------------------------------------------------------ */

  function aplicarConfiguracion(config) {
    if (!config) return;
    configActual = config;

    $('config-capacidad').value = config.capacidadPedidosPorDia;
    $('config-anticipacion').value = config.diasAnticipacionMinima;
    $('config-maximos').value = config.diasMaximosReserva;
    $('config-monto-gratis').value = config.montoDespachoGratis;
    $('config-tarifa-base').value = config.tarifaBaseDespacho;
    $('config-km-base').value = config.kmBaseDespacho;
    $('config-tarifa-km').value = config.tarifaKmAdicional;
    $('config-lat').value = config.latTienda;
    $('config-lng').value = config.lngTienda;

    document.querySelectorAll('input[name="dias_cerrados"]').forEach((input) => {
      input.checked = config.diasCerradosSemana.includes(Number(input.value));
    });
  }

  async function guardarConfiguracion(evento) {
    evento.preventDefault();

    const boton = $('btn-guardar-config');
    const textoOriginal = boton.textContent;
    const diasCerrados = Array.from(
      document.querySelectorAll('input[name="dias_cerrados"]:checked')
    ).map((input) => Number(input.value));

    const configuracion = {
      capacidadPedidosPorDia: Number($('config-capacidad').value),
      diasAnticipacionMinima: Number($('config-anticipacion').value),
      diasMaximosReserva: Number($('config-maximos').value),
      montoDespachoGratis: Number($('config-monto-gratis').value),
      tarifaBaseDespacho: Number($('config-tarifa-base').value),
      kmBaseDespacho: Number($('config-km-base').value),
      tarifaKmAdicional: Number($('config-tarifa-km').value),
      latTienda: Number($('config-lat').value),
      lngTienda: Number($('config-lng').value),
      diasCerradosSemana: diasCerrados,
    };

    boton.disabled = true;
    boton.textContent = 'Guardando…';
    $('config-mensaje').textContent = '';
    $('config-mensaje').className = 'config-mensaje';

    try {
      const datos = await apiFetch('/configuracion', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configuracion),
      });

      aplicarConfiguracion(datos.config);
      $('config-mensaje').textContent = 'Configuración guardada correctamente.';
      $('config-mensaje').className = 'config-mensaje config-mensaje-ok';
      mostrarToast('Configuración actualizada.');
      await cargarPedidos();
    } catch (error) {
      console.error(error);
      $('config-mensaje').textContent = error.message;
      $('config-mensaje').className = 'config-mensaje config-mensaje-error';
      mostrarToast(error.message);
    } finally {
      boton.disabled = false;
      boton.textContent = textoOriginal;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                         */
  /* ------------------------------------------------------------------ */

  function hoyISO() {
    const fecha = new Date();
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  }

  function sumarDias(fecha, cantidad) {
    const base = new Date(`${fecha}T00:00:00`);
    base.setDate(base.getDate() + cantidad);
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(base.getDate()).padStart(2, '0')}`;
  }

  function formatearPrecio(valor) {
    const numero = Math.round(Number(valor));
    return Number.isFinite(numero) ? numero.toLocaleString('es-CL') : '0';
  }

  function formatearFechaHora(valor) {
    if (!valor) return '';

    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return '';

    return new Intl.DateTimeFormat('es-CL', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(fecha);
  }

  function telefonoEnlace(telefono) {
    return String(telefono || '').replace(/[^\d+]/g, '');
  }

  function escaparHtml(valor) {
    return String(valor ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function mostrarToast(mensaje) {
    const toast = $('toast');
    if (!toast) return;

    toast.textContent = mensaje;
    toast.classList.add('visible');

    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => {
      toast.classList.remove('visible');
    }, 3800);
  }
})();
