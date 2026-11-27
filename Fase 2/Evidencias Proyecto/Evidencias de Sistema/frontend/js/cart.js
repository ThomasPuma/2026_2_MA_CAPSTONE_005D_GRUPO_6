/**
 * Carrito de compras sin login.
 * El pedido se guarda en localStorage mientras el cliente navega y se envía
 * a la API al finalizar el checkout.
 */
(() => {
  const API_PEDIDOS = '/api/pedidos';
  const STORAGE_KEY = 'matteoMasasCarritoV1';
  const STORAGE_CHECKOUT_KEY = 'matteoMasasCheckoutV1';
  const STORAGE_EMAIL_KEY = 'matteoMasasEmailPedidoV1';
  const STORAGE_CODIGO_PREFIX = 'matteoMasasCodigoGuardado_';

  const NOMBRES_DIA = [
    'domingo',
    'lunes',
    'martes',
    'miércoles',
    'jueves',
    'viernes',
    'sábado',
  ];

  const NOMBRES_PAGO = {
    efectivo: 'Efectivo',
    tarjeta: 'Tarjeta',
    transferencia: 'Transferencia',
    webpay: 'Tarjeta online (Webpay)',
  };

  let items = [];
  let config = null;
  let dias = [];
  let ultimoPedido = null;
  // Recuerda si el comprobante está abierto y el cliente aún no confirmó que
  // guardó su código (solo aplica cuando no dejó correo).
  let avisoCodigoPendiente = false;
  let pagoWebpay = {
    habilitado: false,
    ambiente: 'integration',
    montoPedidoGrande: 60000,
    porcentajeAbono: 25,
  };
  let promesaDisponibilidad = null;
  let temporizadorToast = null;
  let elementoConFoco = null;
  // Clave de la solicitud en curso. Se reutiliza solo si la conexión falla
  // antes de recibir respuesta, para que el reintento no cree otro pedido.
  let claveSolicitudActual = null;

  /* Estado del mapa de entrega */
  const CENTRO_PADRE_HURTADO = [-33.5704813, -70.8156668];
  const NOMINATIM = 'https://nominatim.openstreetmap.org';
  const VIEWBOX_PADRE_HURTADO = '-70.949,-33.509,-70.778,-33.598';
  const RADIO_TIERRA_KM = 6371.0088;
  const TARIFAS_POR_DEFECTO = {
    montoDespachoGratis: 15000,
    tarifaBaseDespacho: 1500,
    kmBaseDespacho: 3,
    tarifaKmAdicional: 750,
  };

  let zonaEntrega = null;
  let mapa = null;
  let marcadorEntrega = null;
  let marcadorTienda = null;
  let poligonoZona = null;
  let ubicacionEntrega = null;
  let resultadosBusqueda = [];
  let temporizadorGeocodificacion = null;
  let colaNominatim = Promise.resolve();
  let ultimaConsultaNominatim = 0;

  const $ = (id) => document.getElementById(id);

  document.addEventListener('DOMContentLoaded', iniciar);

  function iniciar() {
    items = leerItemsGuardados();
    enlazarEventos();
    renderizarCarrito();
    actualizarContador();
    cargarDisponibilidad()
      .then(procesarRetornoPago)
      .catch((error) => console.error('Error al procesar el retorno de pago:', error));
  }

  /* ------------------------------------------------------------------ */
  /* Persistencia local                                                 */
  /* ------------------------------------------------------------------ */

  function leerItemsGuardados() {
    try {
      const crudo = localStorage.getItem(STORAGE_KEY);
      if (!crudo) return [];

      const datos = JSON.parse(crudo);
      if (!Array.isArray(datos)) return [];

      return datos
        .map((item) => {
          const idPresentacion = Number(item.id_presentacion);
          const cantidad = Number(item.cantidad);
          const precio = Number(item.precio);

          if (
            !Number.isInteger(idPresentacion) ||
            idPresentacion <= 0 ||
            !Number.isInteger(cantidad) ||
            cantidad < 1 ||
            !Number.isFinite(precio) ||
            precio < 0
          ) {
            return null;
          }

          return {
            key: String(idPresentacion),
            id_presentacion: idPresentacion,
            id_producto: Number(item.id_producto) || null,
            nombre: String(item.nombre || 'Producto'),
            presentacion: String(item.presentacion || ''),
            precio,
            cantidad: Math.min(99, cantidad),
          };
        })
        .filter(Boolean);
    } catch (error) {
      console.warn('No se pudo leer el carrito guardado:', error);
      return [];
    }
  }

  function guardarItems() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      console.warn('No se pudo guardar el carrito:', error);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Eventos                                                            */
  /* ------------------------------------------------------------------ */

  function enlazarEventos() {
    $('btn-cart')?.addEventListener('click', abrirCarrito);
    $('btn-cerrar-carrito')?.addEventListener('click', cerrarCarrito);
    $('cart-overlay')?.addEventListener('click', cerrarCarrito);
    $('btn-continuar')?.addEventListener('click', irACheckout);
    $('btn-volver-carrito')?.addEventListener('click', () => mostrarPaso('carrito'));
    $('btn-nuevo-pedido')?.addEventListener('click', hacerOtroPedido);
    $('checkout-form')?.addEventListener('submit', enviarPedido);
    $('cliente-fecha')?.addEventListener('change', actualizarCupoFecha);

    document.querySelectorAll('input[name="tipo_entrega"]').forEach((radio) => {
      radio.addEventListener('change', actualizarEntrega);
    });

    document.querySelectorAll('input[name="metodo_pago"]').forEach((radio) => {
      radio.addEventListener('change', () => actualizarResumenCheckout());
    });

    document
      .querySelectorAll('input[name="tipo_pago_pedido"]')
      .forEach((radio) => {
        radio.addEventListener('change', () => actualizarResumenCheckout());
      });

    $('cart-items')?.addEventListener('click', manejarClickCarrito);
    $('cart-items')?.addEventListener('change', manejarCambioCantidad);

    $('btn-buscar-direccion')?.addEventListener('click', buscarDireccion);
    $('btn-usar-ubicacion')?.addEventListener('click', usarUbicacionActual);
    $('mapa-resultados')?.addEventListener('click', manejarClickResultado);

    $('buscar-direccion')?.addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter') {
        evento.preventDefault();
        buscarDireccion();
      }
    });

    document.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape' && $('cart-drawer')?.classList.contains('abierto')) {
        cerrarCarrito();
      }
    });

    $('btn-copiar-codigo')?.addEventListener('click', copiarCodigoPedido);
    $('btn-codigo-guardado')?.addEventListener('click', marcarCodigoGuardado);

    // Solo se muestra el aviso si el cliente no dejó correo y el comprobante
    // sigue abierto.
    window.addEventListener('beforeunload', (evento) => {
      if (!avisoCodigoPendiente) return;
      evento.preventDefault();
      evento.returnValue = '';
      return '';
    });
  }

  /* ------------------------------------------------------------------ */
  /* Carrito                                                            */
  /* ------------------------------------------------------------------ */

  // Centraliza la actualización visual del carrito y del resumen del
  // checkout. Así, si el cliente agrega o quita productos después de pasar
  // al paso de datos, los precios se recalculan de inmediato.
  function refrescarCarrito() {
    guardarItems();
    renderizarCarrito();
    actualizarContador();
    actualizarResumenCheckout();
  }

  function agregar(producto, presentacion) {
    if (!producto || !presentacion) return;

    const idPresentacion = Number(presentacion.id_presentacion);
    const precio = Number(presentacion.precio);

    if (!Number.isInteger(idPresentacion) || !Number.isFinite(precio)) {
      mostrarToast('No se pudo agregar el producto.');
      return;
    }

    const existente = items.find((item) => item.key === String(idPresentacion));

    if (existente) {
      existente.cantidad = Math.min(99, existente.cantidad + 1);
    } else {
      items.push({
        key: String(idPresentacion),
        id_presentacion: idPresentacion,
        id_producto: Number(producto.id_producto) || null,
        nombre: producto.nombre || 'Producto',
        presentacion: presentacion.etiqueta || '',
        precio,
        cantidad: 1,
      });
    }

    refrescarCarrito();

    mostrarToast(
      `Agregado: ${producto.nombre}${
        presentacion.etiqueta ? ` (${presentacion.etiqueta})` : ''
      }`
    );
  }

  function manejarClickCarrito(evento) {
    const boton = evento.target.closest('button[data-accion]');
    if (!boton) return;

    const key = boton.dataset.key;
    const accion = boton.dataset.accion;
    const item = items.find((producto) => producto.key === key);
    if (!item) return;

    if (accion === 'eliminar') {
      items = items.filter((producto) => producto.key !== key);
      refrescarCarrito();
      mostrarToast('Producto eliminado del carrito.');
      return;
    }

    if (accion === 'menos') {
      item.cantidad = Math.max(1, item.cantidad - 1);
    }

    if (accion === 'mas') {
      item.cantidad = Math.min(99, item.cantidad + 1);
    }

    refrescarCarrito();
  }

  function manejarCambioCantidad(evento) {
    const input = evento.target.closest('input[data-accion="cantidad"]');
    if (!input) return;

    const item = items.find((producto) => producto.key === input.dataset.key);
    if (!item) return;

    const cantidad = Number(input.value);
    item.cantidad = Number.isInteger(cantidad)
      ? Math.min(99, Math.max(1, cantidad))
      : 1;

    refrescarCarrito();
  }

  function renderizarCarrito() {
    const lista = $('cart-items');
    const vacio = $('cart-vacio');
    const resumen = $('cart-resumen');
    if (!lista || !vacio || !resumen) return;

    if (items.length === 0) {
      lista.innerHTML = '';
      vacio.hidden = false;
      resumen.hidden = true;
      return;
    }

    vacio.hidden = true;
    resumen.hidden = false;

    lista.innerHTML = items
      .map((item) => {
        const subtotal = item.precio * item.cantidad;

        return `
          <li class="cart-item">
            <div class="cart-item-info">
              <strong>${escaparHtml(item.nombre)}</strong>
              <span class="cart-item-formato">${escaparHtml(item.presentacion)}</span>
              <span class="cart-item-precio">$${formatearPrecio(item.precio)} c/u</span>
            </div>
            <div class="cart-item-acciones">
              <div class="cantidad-control">
                <button type="button" data-accion="menos" data-key="${item.key}" aria-label="Quitar una unidad">−</button>
                <input
                  type="number"
                  min="1"
                  max="99"
                  inputmode="numeric"
                  value="${item.cantidad}"
                  data-accion="cantidad"
                  data-key="${item.key}"
                  aria-label="Cantidad de ${escaparHtml(item.nombre)}"
                >
                <button type="button" data-accion="mas" data-key="${item.key}" aria-label="Agregar una unidad">+</button>
              </div>
              <strong class="cart-item-subtotal">$${formatearPrecio(subtotal)}</strong>
              <button type="button" class="btn-eliminar" data-accion="eliminar" data-key="${item.key}">
                Eliminar
              </button>
            </div>
          </li>
        `;
      })
      .join('');

    $('cart-subtotal').textContent = `$${formatearPrecio(calcularSubtotal())}`;
    actualizarBotonEnviar();
  }

  function actualizarContador() {
    const contador = $('cart-count');
    if (!contador) return;

    const total = items.reduce((suma, item) => suma + item.cantidad, 0);
    contador.textContent = String(total);
  }

  function calcularSubtotal() {
    return redondear(
      items.reduce((suma, item) => suma + item.precio * item.cantidad, 0)
    );
  }

  function cantidadTotal() {
    return items.reduce((suma, item) => suma + item.cantidad, 0);
  }

  /* ------------------------------------------------------------------ */
  /* Drawer y pasos                                                     */
  /* ------------------------------------------------------------------ */

  function abrirCarrito() {
    const drawer = $('cart-drawer');
    const overlay = $('cart-overlay');
    if (!drawer || !overlay) return;

    elementoConFoco = document.activeElement;

    // Si el cliente ya agregó productos después de un pedido exitoso, el
    // drawer vuelve al carrito; si no, conserva el código de su pedido.
    if (items.length > 0 && $('cart-paso-exito') && !$('cart-paso-exito').hidden) {
      mostrarPaso('carrito');
    }

    actualizarResumenCheckout();

    drawer.classList.add('abierto');
    drawer.removeAttribute('inert');
    drawer.setAttribute('aria-hidden', 'false');
    overlay.classList.add('visible');
    document.body.classList.add('sin-scroll');

    setTimeout(() => $('btn-cerrar-carrito')?.focus(), 50);
  }

  function cerrarCarrito() {
    const drawer = $('cart-drawer');
    const overlay = $('cart-overlay');
    if (!drawer || !overlay) return;

    drawer.classList.remove('abierto');
    drawer.setAttribute('inert', '');
    drawer.setAttribute('aria-hidden', 'true');
    overlay.classList.remove('visible');
    document.body.classList.remove('sin-scroll');

    if (elementoConFoco && typeof elementoConFoco.focus === 'function') {
      elementoConFoco.focus();
    }
  }

  function mostrarPaso(paso) {
    const pasos = {
      carrito: $('cart-paso-carrito'),
      datos: $('cart-paso-datos'),
      exito: $('cart-paso-exito'),
    };

    Object.entries(pasos).forEach(([nombre, seccion]) => {
      if (seccion) seccion.hidden = nombre !== paso;
    });

    const titulos = {
      carrito: ['Tu pedido', 'Productos seleccionados'],
      datos: ['Datos del pedido', 'Sin registro ni contraseña'],
      exito: ['Pedido recibido', 'Guarda tu código de pedido'],
    };

    const [titulo, subtitulo] = titulos[paso] || titulos.carrito;
    $('cart-title').textContent = titulo;
    $('cart-subtitle').textContent = subtitulo;

    const cuerpo = $('cart-body');
    if (cuerpo) cuerpo.scrollTop = 0;

    if (paso === 'datos') {
      actualizarResumenCheckout();
      actualizarCupoFecha();
      setTimeout(() => {
        if (mapa) mapa.invalidateSize();
        $('cliente-nombre')?.focus();
      }, 80);
    }
  }

  async function irACheckout() {
    if (items.length === 0) {
      mostrarToast('Agrega al menos un producto antes de continuar.');
      return;
    }

    const boton = $('btn-continuar');
    const textoOriginal = boton?.textContent || 'Continuar con mis datos';

    if (boton) {
      boton.disabled = true;
      boton.textContent = 'Revisando agenda…';
    }

    try {
      await cargarDisponibilidad(true);

      if (!dias.length) {
        mostrarToast('No hay fechas disponibles en este momento.');
        return;
      }

      actualizarEntrega();
      mostrarPaso('datos');
    } finally {
      if (boton) {
        boton.disabled = false;
        boton.textContent = textoOriginal;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Disponibilidad y cupos                                             */
  /* ------------------------------------------------------------------ */

  function cargarDisponibilidad(forzar = false) {
    if (promesaDisponibilidad && !forzar) return promesaDisponibilidad;

    promesaDisponibilidad = (async () => {
      try {
        const respuesta = await fetch(`${API_PEDIDOS}/disponibilidad`);
        const datos = await respuesta.json().catch(() => ({}));

        if (!respuesta.ok || !datos.exito) {
          throw new Error(datos.mensaje || 'No se pudo cargar la agenda.');
        }

        config = datos.config;
        dias = Array.isArray(datos.dias) ? datos.dias : [];
        zonaEntrega = datos.zonaEntrega || null;
        pagoWebpay = datos.pagoWebpay || {
          habilitado: false,
          ambiente: 'integration',
          montoPedidoGrande: 60000,
          porcentajeAbono: 25,
        };

        renderizarInfoPedidos();
        actualizarMetodosPago();
        renderizarFechas();
        actualizarMapaConfiguracion();
        renderizarSeleccionDireccion();
        actualizarResumenCheckout();
      } catch (error) {
        console.error('Error al cargar disponibilidad:', error);
        const info = $('info-pedidos');
        if (info) {
          info.textContent =
            'No pudimos cargar la agenda de pedidos. Intenta recargar la página.';
        }
      } finally {
        promesaDisponibilidad = null;
      }
    })();

    return promesaDisponibilidad;
  }

  function renderizarInfoPedidos() {
    const info = $('info-pedidos');
    if (!info || !config) return;

    const diasMin = config.diasAnticipacionMinima;
    const anticipacion =
      diasMin === 0
        ? 'Puedes pedir para hoy mismo, según cupo.'
        : `Con ${diasMin} día${diasMin === 1 ? '' : 's'} de anticipación.`;

    const cupo = `${config.capacidadPedidosPorDia} pedidos por día.`;

    const cerrados = (config.diasCerradosSemana || [])
      .map((dia) => NOMBRES_DIA[dia])
      .filter(Boolean);

    const proximo = dias.find((dia) => dia.disponible);

    let proximoHtml = '';

    if (proximo) {
      proximoHtml = `<span class="agenda-proximo">Próximo cupo: <strong>${escaparHtml(
        proximo.etiqueta
      )}</strong></span>`;
    } else if (dias.length > 0) {
      proximoHtml =
        '<span class="agenda-proximo">Por ahora no quedan fechas con cupo.</span>';
    }

    info.innerHTML = `
      <span class="agenda-titulo">Agenda de pedidos</span>
      <span class="agenda-linea">${escaparHtml(anticipacion)} ${escaparHtml(cupo)}</span>
      ${
        cerrados.length
          ? `<span class="agenda-linea">Días cerrados: ${escaparHtml(
              cerrados.join(', ')
            )}.</span>`
          : ''
      }
      ${proximoHtml}
    `;

    const promo = $('promo-despacho-texto');
    if (promo) {
      const montoGratis = Number(config.montoDespachoGratis) || 0;
      promo.textContent =
        montoGratis > 0
          ? `Despacho gratis sobre $${formatearPrecio(
              montoGratis
            )} dentro de Padre Hurtado.`
          : 'Despacho con tarifa según la distancia.';
    }
  }

  // El pago online solo se muestra si el servidor tiene Webpay habilitado.
  function umbralPedidoGrande() {
    const valor = Number(pagoWebpay?.montoPedidoGrande);
    return Number.isFinite(valor) && valor > 0 ? valor : 60000;
  }

  function porcentajeAbono() {
    const valor = Number(pagoWebpay?.porcentajeAbono);
    return Number.isFinite(valor) && valor > 0 ? valor : 25;
  }

  function metodoPagoSeleccionado() {
    return (
      document.querySelector('input[name="metodo_pago"]:checked')?.value || ''
    );
  }

  // En pedidos grandes el cliente puede elegir entre pagar el abono del 25% o
  // pagar el total de inmediato.
  function pagoCompletoSeleccionado() {
    return (
      document.querySelector('input[name="tipo_pago_pedido"]:checked')?.value ===
      'total'
    );
  }

  // Centraliza subtotal, despacho y total para que la vista previa y las
  // reglas de pago usen exactamente los mismos números.
  function calcularResumenCompra() {
    const subtotal = calcularSubtotal();
    const tipo =
      document.querySelector('input[name="tipo_entrega"]:checked')?.value ||
      'retiro';
    const cotizacion =
      tipo === 'despacho' ? calcularCotizacion(subtotal) : null;
    const costoDespacho = cotizacion ? cotizacion.costoDespacho : 0;
    const total = redondear(subtotal + costoDespacho);

    return {
      subtotal,
      tipo,
      cotizacion,
      costoDespacho,
      total,
      totalConocido: tipo !== 'despacho' || Boolean(cotizacion),
    };
  }

  // Reglas de disponibilidad de cada medio de pago:
  //  - Despacho: solo Webpay o transferencia.
  //  - Pedidos sobre el monto grande: solo Webpay o transferencia (abono).
  //  - Si se paga el pedido completo ahora: solo Webpay o transferencia.
  //  - Retiro bajo el monto grande: todos los medios.
  function actualizarMetodosPago(resumen = null) {
    const info = resumen || calcularResumenCompra();
    const esDespacho = info.tipo === 'despacho';
    const esGrande = info.total > umbralPedidoGrande();
    const pagoCompleto = esGrande && pagoCompletoSeleccionado();
    const permitidos = {
      efectivo: !esDespacho && !pagoCompleto,
      tarjeta: !esDespacho && !pagoCompleto,
      transferencia: true,
      webpay: Boolean(pagoWebpay?.habilitado),
    };

    const etiquetas = {
      efectivo: 'opcion-pago-efectivo',
      tarjeta: 'opcion-pago-tarjeta',
      transferencia: 'opcion-pago-transferencia',
      webpay: 'opcion-pago-webpay',
    };

    Object.entries(etiquetas).forEach(([metodo, id]) => {
      const etiqueta = $(id);
      if (!etiqueta) return;

      const input = etiqueta.querySelector('input[name="metodo_pago"]');
      const disponible = permitidos[metodo];

      etiqueta.hidden = !disponible;
      if (input) input.disabled = !disponible;
    });

    const grupoPagoGrande = $('grupo-pago-grande');
    if (grupoPagoGrande) {
      grupoPagoGrande.hidden = !esGrande;

      const tituloAbono = $('pago-abono-titulo');
      if (tituloAbono) {
        tituloAbono.textContent = `Pagar abono del ${porcentajeAbono()}% ahora`;
      }

      // Si el carrito baja del monto grande, vuelve a la opción por defecto.
      if (!esGrande) {
        const radioAbono = document.querySelector(
          'input[name="tipo_pago_pedido"][value="abono"]'
        );
        if (radioAbono) radioAbono.checked = true;
      }
    }

    const seleccionado = document.querySelector(
      'input[name="metodo_pago"]:checked'
    );

    if (!seleccionado || seleccionado.disabled) {
      const preferido = permitidos.webpay
        ? 'webpay'
        : permitidos.transferencia
          ? 'transferencia'
          : permitidos.efectivo
            ? 'efectivo'
            : permitidos.tarjeta
              ? 'tarjeta'
              : null;

      if (preferido) {
        const nuevo = document.querySelector(
          `input[name="metodo_pago"][value="${preferido}"]`
        );
        if (nuevo) nuevo.checked = true;
      }
    }

    const webpayEtiqueta = $('opcion-pago-webpay');
    const webpayAyuda = webpayEtiqueta?.querySelector('small');
    if (webpayAyuda) {
      webpayAyuda.textContent =
        pagoWebpay?.ambiente === 'integration'
          ? 'Pago de prueba con Transbank'
          : 'Pago seguro con Transbank';
    }

    const pruebas = $('webpay-pruebas');
    if (pruebas) {
      pruebas.hidden = !(
        permitidos.webpay && pagoWebpay?.ambiente === 'integration'
      );
    }

    const ayuda = $('metodos-pago-ayuda');
    if (ayuda) {
      if (esGrande && pagoCompleto) {
        ayuda.textContent = `Elegiste pagar el pedido completo ahora: se paga con Webpay o transferencia y no queda saldo pendiente.`;
      } else if (esGrande && esDespacho) {
        ayuda.textContent = `Los pedidos superiores a $${formatearPrecio(
          umbralPedidoGrande()
        )} pueden pagarse con un abono del ${porcentajeAbono()}% y el saldo al recibir, o con el total de inmediato por Webpay o transferencia.`;
      } else if (esGrande) {
        ayuda.textContent = `Los pedidos superiores a $${formatearPrecio(
          umbralPedidoGrande()
        )} pueden pagarse con un abono del ${porcentajeAbono()}% y el saldo al retirar, o con el total por adelantado. Si pagas en efectivo o tarjeta presencial, el abono se cobra con Webpay.`;
      } else if (esDespacho) {
        ayuda.textContent =
          'Para despacho a domicilio solo se aceptan pagos con Webpay o transferencia.';
      } else {
        ayuda.textContent = '';
      }
    }

    const aviso = $('abono-aviso');
    if (aviso) {
      if (!esGrande) {
        aviso.hidden = true;
        aviso.innerHTML = '';
      } else if (pagoCompleto) {
        const metodo = metodoPagoSeleccionado();
        const esTransferencia = metodo === 'transferencia';

        aviso.hidden = false;
        aviso.innerHTML = `
          <strong>Pedido grande: pago completo</strong>
          <p>Total del pedido: $${formatearPrecio(info.total)}</p>
          <p>Pagas ahora: <b>$${formatearPrecio(
            info.total
          )}</b> ${esTransferencia ? 'por transferencia' : 'con Webpay'}.</p>
          <p>No queda saldo pendiente al retirar o recibir.</p>
          <p>${
            esTransferencia
              ? 'Al confirmar, te enviaremos los datos para transferir el total.'
              : 'Al confirmar, te redirigiremos a Webpay para pagar el total.'
          }</p>
          ${
            info.totalConocido
              ? ''
              : '<p>El total final se recalcula al seleccionar tu dirección de despacho.</p>'
          }
        `;
      } else {
        const porcentaje = porcentajeAbono();
        const monto = Math.ceil(info.total * (porcentaje / 100));
        const saldo = redondear(info.total - monto);
        const metodo = metodoPagoSeleccionado();
        const esTransferencia = metodo === 'transferencia';
        const textoMetodo = esTransferencia ? 'transferencia' : 'Webpay';

        aviso.hidden = false;
        aviso.innerHTML = `
          <strong>Pedido grande: abono del ${porcentaje}%</strong>
          <p>Total del pedido: $${formatearPrecio(info.total)}</p>
          <p>Abono a pagar ahora: <b>$${formatearPrecio(
            monto
          )}</b> con ${textoMetodo}.</p>
          <p>Saldo al retirar o recibir: <b>$${formatearPrecio(saldo)}</b>.</p>
          <p>${
            esTransferencia
              ? 'Al confirmar, te enviaremos los datos para transferir el abono.'
              : 'Al confirmar, te redirigiremos a Webpay para pagar el abono.'
          }</p>
          ${
            info.totalConocido
              ? ''
              : '<p>El total final se recalcula al seleccionar tu dirección de despacho.</p>'
          }
        `;
      }
    }
  }

  function renderizarFechas() {
    const select = $('cliente-fecha');
    if (!select) return;

    const valorPrevio = select.value;
    select.innerHTML = '<option value="">Selecciona una fecha</option>';

    dias.forEach((dia) => {
      const opcion = document.createElement('option');
      opcion.value = dia.fecha;
      opcion.disabled = !dia.disponible;

      let detalle = '';
      if (dia.disponible) {
        detalle = ` · ${dia.disponibles} cupo${dia.disponibles === 1 ? '' : 's'}`;
      } else if (dia.motivo === 'cerrado') {
        detalle = ' · cerrado';
      } else {
        detalle = ' · sin cupo';
      }

      opcion.textContent = `${dia.etiqueta}${detalle}`;
      select.appendChild(opcion);
    });

    if (dias.length === 0) {
      const opcion = document.createElement('option');
      opcion.value = '';
      opcion.textContent = 'No hay fechas disponibles';
      opcion.disabled = true;
      select.appendChild(opcion);
    }

    const anteriorDisponible = dias.find(
      (dia) => dia.fecha === valorPrevio && dia.disponible
    );

    if (anteriorDisponible) {
      select.value = valorPrevio;
    } else {
      const primero = dias.find((dia) => dia.disponible);
      select.value = primero ? primero.fecha : '';
    }

    actualizarCupoFecha();
  }

  function actualizarCupoFecha() {
    const select = $('cliente-fecha');
    const ayuda = $('cupo-fecha');
    if (!select || !ayuda) return;

    const dia = dias.find((item) => item.fecha === select.value);

    ayuda.className = 'campo-ayuda';

    if (!dia) {
      ayuda.textContent = 'Elige una fecha para ver el cupo disponible.';
      actualizarBotonEnviar();
      return;
    }

    if (dia.motivo === 'cerrado') {
      ayuda.textContent = 'Este día no hay atención. Elige otra fecha.';
      ayuda.classList.add('campo-ayuda-error');
    } else if (dia.motivo === 'completo') {
      ayuda.textContent = 'Este día está completo. Elige otra fecha.';
      ayuda.classList.add('campo-ayuda-error');
    } else {
      ayuda.textContent = `Quedan ${dia.disponibles} de ${dia.capacidad} pedidos disponibles para este día.`;
    }

    actualizarBotonEnviar();
  }

  function actualizarBotonEnviar() {
    const boton = $('btn-enviar-pedido');
    if (!boton) return;

    const select = $('cliente-fecha');
    const dia = dias.find((item) => item.fecha === select?.value);
    const tipo = document.querySelector(
      'input[name="tipo_entrega"]:checked'
    )?.value;
    const faltaUbicacion = tipo === 'despacho' && !ubicacionEntrega;
    const metodo = document.querySelector(
      'input[name="metodo_pago"]:checked'
    );
    const faltaMetodo = !metodo || metodo.disabled;

    boton.disabled =
      items.length === 0 ||
      !dia ||
      !dia.disponible ||
      faltaUbicacion ||
      faltaMetodo;
  }

  /* ------------------------------------------------------------------ */
  /* Checkout                                                           */
  /* ------------------------------------------------------------------ */

  function actualizarEntrega() {
    const seleccionado = document.querySelector(
      'input[name="tipo_entrega"]:checked'
    );
    const tipo = seleccionado ? seleccionado.value : 'retiro';
    const campo = $('campo-direccion');
    const esDespacho = tipo === 'despacho';

    if (campo) campo.hidden = !esDespacho;

    if (esDespacho) {
      inicializarMapa();
      setTimeout(() => {
        if (mapa) mapa.invalidateSize();
      }, 60);
    }

    actualizarResumenCheckout();
  }

  /* ------------------------------------------------------------------ */
  /* Mapa de entrega                                                    */
  /* ------------------------------------------------------------------ */

  function inicializarMapa() {
    if (mapa) return;

    if (!window.L) {
      const ayuda = $('mapa-ayuda');
      if (ayuda) {
        ayuda.textContent =
          'No se pudo cargar el mapa. Usa el buscador de direcciones para seleccionar tu ubicación.';
      }
      return;
    }

    const contenedor = $('mapa-entrega');
    if (!contenedor) return;

    const tienda = obtenerTienda();
    mapa = window.L.map(contenedor, {
      center: [tienda.lat, tienda.lng],
      zoom: 14,
      scrollWheelZoom: false,
    });

    window.L
      .tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      })
      .addTo(mapa);

    mapa.on('click', (evento) => {
      seleccionarPunto(evento.latlng.lat, evento.latlng.lng);
    });

    actualizarMapaConfiguracion();
  }

  function obtenerTienda() {
    const lat = Number(config?.latTienda);
    const lng = Number(config?.lngTienda);

    return {
      lat: Number.isFinite(lat) ? lat : CENTRO_PADRE_HURTADO[0],
      lng: Number.isFinite(lng) ? lng : CENTRO_PADRE_HURTADO[1],
    };
  }

  function actualizarMapaConfiguracion() {
    if (!mapa || !window.L) return;

    const tienda = obtenerTienda();

    if (poligonoZona) {
      poligonoZona.remove();
      poligonoZona = null;
    }

    if (
      zonaEntrega &&
      Array.isArray(zonaEntrega.poligono) &&
      zonaEntrega.poligono.length > 2
    ) {
      poligonoZona = window.L
        .polygon(zonaEntrega.poligono, {
          color: '#C05630',
          weight: 2,
          fillColor: '#DFAE6A',
          fillOpacity: 0.1,
          interactive: false,
        })
        .addTo(mapa);
    }

    if (!marcadorTienda) {
      marcadorTienda = window.L
        .circleMarker([tienda.lat, tienda.lng], {
          radius: 7,
          color: '#7A4B2E',
          weight: 2,
          fillColor: '#DFAE6A',
          fillOpacity: 1,
        })
        .addTo(mapa)
        .bindTooltip('Local Matteo Masas · Calle Parque Villarrica 1209');
    } else {
      marcadorTienda.setLatLng([tienda.lat, tienda.lng]);
    }

    if (!ubicacionEntrega) {
      mapa.setView([tienda.lat, tienda.lng], 14);
    }
  }

  function fijarMarcador(lat, lng, { centrar = false, zoom = null } = {}) {
    if (!mapa || !window.L) return;

    if (!marcadorEntrega) {
      marcadorEntrega = window.L
        .marker([lat, lng], { draggable: true })
        .addTo(mapa);

      marcadorEntrega.on('dragend', () => {
        const punto = marcadorEntrega.getLatLng();
        seleccionarPunto(punto.lat, punto.lng);
      });
    } else {
      marcadorEntrega.setLatLng([lat, lng]);
    }

    if (centrar) {
      mapa.setView([lat, lng], zoom || Math.max(mapa.getZoom(), 16));
    }
  }

  function seleccionarPunto(lat, lng, { centrar = false, zoom = null, direccion = '' } = {}) {
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return;
    }

    fijarMarcador(lat, lng, { centrar, zoom });
    actualizarUbicacion(lat, lng, direccion);

    if (!direccion) {
      programarDireccionInversa(lat, lng);
    }
  }

  function actualizarUbicacion(lat, lng, direccion = '') {
    const textoDireccion = String(direccion || '').slice(0, 255);

    ubicacionEntrega = {
      lat,
      lng,
      direccion: textoDireccion || 'Ubicación seleccionada en el mapa',
    };

    const campoLat = $('cliente-lat');
    const campoLng = $('cliente-lng');
    const campoDireccion = $('cliente-direccion');

    if (campoLat) campoLat.value = String(lat);
    if (campoLng) campoLng.value = String(lng);
    if (campoDireccion) campoDireccion.value = ubicacionEntrega.direccion;

    renderizarSeleccionDireccion();
    actualizarResumenCheckout();
  }

  function limpiarSeleccionEntrega() {
    clearTimeout(temporizadorGeocodificacion);
    ubicacionEntrega = null;
    resultadosBusqueda = [];

    if (marcadorEntrega) {
      marcadorEntrega.remove();
      marcadorEntrega = null;
    }

    ['cliente-lat', 'cliente-lng', 'cliente-direccion'].forEach((id) => {
      const campo = $(id);
      if (campo) campo.value = '';
    });

    const buscador = $('buscar-direccion');
    if (buscador) buscador.value = '';

    const resultados = $('mapa-resultados');
    if (resultados) {
      resultados.innerHTML = '';
      resultados.hidden = true;
    }

    if (mapa) {
      const tienda = obtenerTienda();
      mapa.setView([tienda.lat, tienda.lng], 14);
    }

    renderizarSeleccionDireccion();
    actualizarResumenCheckout();
  }

  function programarDireccionInversa(lat, lng) {
    clearTimeout(temporizadorGeocodificacion);

    temporizadorGeocodificacion = setTimeout(async () => {
      try {
        const datos = await consultarNominatim(
          `/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lng}&accept-language=es&zoom=18`
        );

        if (!ubicacionEntrega) return;

        const mismaUbicacion =
          Math.abs(ubicacionEntrega.lat - lat) < 0.000001 &&
          Math.abs(ubicacionEntrega.lng - lng) < 0.000001;

        if (!mismaUbicacion) return;

        const direccion = String(datos?.display_name || '').slice(0, 255);

        if (direccion) {
          actualizarUbicacion(lat, lng, direccion);
          const buscador = $('buscar-direccion');
          if (buscador) {
            buscador.value = direccionCorta(datos) || direccion;
          }
        }
      } catch (error) {
        console.warn('No se pudo obtener la dirección del mapa:', error);
      }
    }, 650);
  }

  async function buscarDireccion() {
    const input = $('buscar-direccion');
    const boton = $('btn-buscar-direccion');
    const termino = input ? input.value.trim() : '';

    if (termino.length < 4) {
      mostrarToast('Escribe una calle y número para buscar tu dirección.');
      return;
    }

    const textoOriginal = boton?.textContent || 'Buscar';

    if (boton) {
      boton.disabled = true;
      boton.textContent = 'Buscando…';
    }

    try {
      const datos = await consultarNominatim(
        `/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=cl&accept-language=es&viewbox=${VIEWBOX_PADRE_HURTADO}&q=${encodeURIComponent(
          termino
        )}`
      );

      resultadosBusqueda = (Array.isArray(datos) ? datos : []).filter(
        (resultado) => resultado.lat && resultado.lon
      );

      renderizarResultadosBusqueda();

      if (resultadosBusqueda.length === 0) {
        mostrarToast(
          'No encontramos esa dirección. Prueba con calle, número y comuna.'
        );
      }
    } catch (error) {
      console.error('Error al buscar la dirección:', error);
      mostrarToast('No pudimos buscar la dirección. Intenta nuevamente.');
    } finally {
      if (boton) {
        boton.disabled = false;
        boton.textContent = textoOriginal;
      }
    }
  }

  function renderizarResultadosBusqueda() {
    const contenedor = $('mapa-resultados');
    if (!contenedor) return;

    if (resultadosBusqueda.length === 0) {
      contenedor.innerHTML = '';
      contenedor.hidden = true;
      return;
    }

    contenedor.innerHTML = resultadosBusqueda
      .map((resultado, indice) => {
        const comuna = comunaDeResultado(resultado);

        return `
          <button
            class="mapa-resultado"
            type="button"
            role="option"
            data-indice="${indice}"
          >
            ${escaparHtml(resultado.display_name || 'Dirección')}
            ${comuna ? `<small>${escaparHtml(comuna)}</small>` : ''}
          </button>
        `;
      })
      .join('');

    contenedor.hidden = false;
  }

  function manejarClickResultado(evento) {
    const boton = evento.target.closest('button[data-indice]');
    if (!boton) return;

    const indice = Number(boton.dataset.indice);
    const resultado = resultadosBusqueda[indice];
    if (!resultado) return;

    const lat = Number(resultado.lat);
    const lng = Number(resultado.lon);
    const direccion = String(resultado.display_name || '').slice(0, 255);

    const buscador = $('buscar-direccion');
    if (buscador) {
      buscador.value = direccionCorta(resultado) || direccion;
    }

    const contenedor = $('mapa-resultados');
    if (contenedor) {
      contenedor.hidden = true;
      contenedor.innerHTML = '';
    }

    seleccionarPunto(lat, lng, { centrar: true, zoom: 17, direccion });
  }

  function usarUbicacionActual() {
    const boton = $('btn-usar-ubicacion');
    const textoOriginal = boton?.textContent || '📍 Usar mi ubicación';

    if (!navigator.geolocation) {
      mostrarToast('Tu navegador no permite obtener la ubicación.');
      return;
    }

    if (boton) {
      boton.disabled = true;
      boton.textContent = 'Ubicando…';
    }

    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        seleccionarPunto(
          posicion.coords.latitude,
          posicion.coords.longitude,
          { centrar: true, zoom: 17 }
        );

        if (boton) {
          boton.disabled = false;
          boton.textContent = textoOriginal;
        }
      },
      (error) => {
        console.warn('Geolocalización no disponible:', error);
        mostrarToast(
          'No pudimos obtener tu ubicación. Busca tu dirección manualmente.'
        );

        if (boton) {
          boton.disabled = false;
          boton.textContent = textoOriginal;
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  function consultarNominatim(ruta) {
    const ejecutar = async () => {
      const espera = Math.max(
        0,
        1100 - (Date.now() - ultimaConsultaNominatim)
      );

      if (espera > 0) {
        await new Promise((resolver) => setTimeout(resolver, espera));
      }

      ultimaConsultaNominatim = Date.now();

      const respuesta = await fetch(`${NOMINATIM}${ruta}`, {
        headers: { Accept: 'application/json' },
      });

      if (!respuesta.ok) {
        throw new Error('No se pudo consultar el servicio de mapas.');
      }

      return respuesta.json();
    };

    colaNominatim = colaNominatim.then(ejecutar, ejecutar);
    return colaNominatim;
  }

  function comunaDeResultado(resultado) {
    const direccion = resultado?.address || {};
    return (
      direccion.city ||
      direccion.town ||
      direccion.village ||
      direccion.municipality ||
      direccion.county ||
      ''
    );
  }

  function direccionCorta(resultado) {
    const direccion = resultado?.address || {};
    const via = [direccion.road, direccion.house_number]
      .filter(Boolean)
      .join(' ');
    const comuna = comunaDeResultado(resultado);
    const corta = [via, comuna].filter(Boolean).join(', ');

    if (corta) return corta;

    return String(resultado?.display_name || '')
      .split(',')
      .slice(0, 2)
      .join(',')
      .trim();
  }

  function redondear2(valor) {
    return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
  }

  function distanciaHaversine(origen, destino) {
    const lat1 = (origen.lat * Math.PI) / 180;
    const lat2 = (destino.lat * Math.PI) / 180;
    const diferenciaLat = lat2 - lat1;
    const diferenciaLng = ((destino.lng - origen.lng) * Math.PI) / 180;

    const a =
      Math.sin(diferenciaLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(diferenciaLng / 2) ** 2;

    return 2 * RADIO_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function puntoEnPoligono(lat, lng, poligono) {
    let dentro = false;

    for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
      const [latI, lngI] = poligono[i];
      const [latJ, lngJ] = poligono[j];

      const cruza =
        lngI > lng !== lngJ > lng &&
        lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI;

      if (cruza) dentro = !dentro;
    }

    return dentro;
  }

  function tarifasDespacho() {
    const valor = (clave) => {
      const numero = Number(config?.[clave]);
      return Number.isFinite(numero) && numero >= 0
        ? numero
        : TARIFAS_POR_DEFECTO[clave];
    };

    return {
      montoDespachoGratis: valor('montoDespachoGratis'),
      tarifaBaseDespacho: valor('tarifaBaseDespacho'),
      kmBaseDespacho: valor('kmBaseDespacho'),
      tarifaKmAdicional: valor('tarifaKmAdicional'),
    };
  }

  function calcularCotizacion(subtotal) {
    if (!ubicacionEntrega) return null;

    const tienda = obtenerTienda();
    const distanciaKm = redondear2(
      distanciaHaversine(tienda, ubicacionEntrega)
    );

    const dentroComuna =
      Boolean(zonaEntrega?.poligono?.length) &&
      puntoEnPoligono(
        ubicacionEntrega.lat,
        ubicacionEntrega.lng,
        zonaEntrega.poligono
      );

    const tarifas = tarifasDespacho();
    const gratis =
      tarifas.montoDespachoGratis > 0 &&
      dentroComuna &&
      subtotal >= tarifas.montoDespachoGratis;

    let kmAdicionales = 0;
    let costoDespacho = 0;

    if (!gratis) {
      kmAdicionales = Math.max(
        0,
        Math.ceil(distanciaKm - tarifas.kmBaseDespacho - 1e-9)
      );
      costoDespacho =
        tarifas.tarifaBaseDespacho +
        kmAdicionales * tarifas.tarifaKmAdicional;
    }

    return {
      distanciaKm,
      dentroComuna,
      fueraComuna: !dentroComuna,
      gratis,
      kmAdicionales,
      costoDespacho: redondear2(costoDespacho),
      ...tarifas,
    };
  }

  function formatearDistancia(km) {
    return `${Number(km || 0)
      .toFixed(1)
      .replace('.', ',')} km aprox.`;
  }

  function formatearNumero(valor) {
    return String(Number(valor) || 0).replace('.', ',');
  }

  function renderizarSeleccionDireccion() {
    const seleccion = $('direccion-seleccionada');
    const ayuda = $('mapa-ayuda');
    if (!seleccion || !ayuda) return;

    const tarifas = tarifasDespacho();
    const cotizacion = calcularCotizacion(calcularSubtotal());

    ayuda.classList.remove('mapa-ayuda-gratis');

    if (!ubicacionEntrega) {
      seleccion.textContent = 'Aún no has seleccionado una dirección.';
      seleccion.classList.remove('seleccionada');
      ayuda.textContent = `Dentro de Padre Hurtado el despacho es gratis en compras superiores a $${formatearPrecio(
        tarifas.montoDespachoGratis
      )}. Fuera de la comuna: $${formatearPrecio(
        tarifas.tarifaBaseDespacho
      )} hasta ${formatearNumero(
        tarifas.kmBaseDespacho
      )} km y $${formatearPrecio(
        tarifas.tarifaKmAdicional
      )} por km adicional.`;
      return;
    }

    const zona = cotizacion?.dentroComuna
      ? 'Dentro de Padre Hurtado'
      : 'Fuera de Padre Hurtado';

    seleccion.textContent = `${ubicacionEntrega.direccion} · ${formatearDistancia(
      cotizacion?.distanciaKm
    )} · ${zona}.`;
    seleccion.classList.add('seleccionada');

    if (cotizacion?.gratis) {
      seleccion.textContent += ' 🎉 ¡Despacho gratis!';
      ayuda.textContent = `Tu compra supera $${formatearPrecio(
        tarifas.montoDespachoGratis
      )} y estás dentro de Padre Hurtado.`;
      ayuda.classList.add('mapa-ayuda-gratis');
    } else if (cotizacion?.dentroComuna) {
      ayuda.textContent = `Estás dentro de Padre Hurtado. El despacho es gratis en compras superiores a $${formatearPrecio(
        tarifas.montoDespachoGratis
      )}.`;
    } else {
      ayuda.textContent = `Fuera de Padre Hurtado: $${formatearPrecio(
        tarifas.tarifaBaseDespacho
      )} hasta ${formatearNumero(
        tarifas.kmBaseDespacho
      )} km y $${formatearPrecio(
        tarifas.tarifaKmAdicional
      )} por cada km adicional.`;
    }
  }

  function actualizarResumenCheckout() {
    const resumen = $('checkout-resumen');
    if (!resumen) return;

    const info = calcularResumenCompra();
    actualizarMetodosPago(info);

    const { subtotal, tipo, cotizacion, costoDespacho, total } = info;
    const metodo = metodoPagoSeleccionado();
    const esGrande = total > umbralPedidoGrande();
    const pagoCompleto = esGrande && pagoCompletoSeleccionado();
    const porcentaje = porcentajeAbono();
    const montoAbono =
      esGrande && !pagoCompleto ? Math.ceil(total * (porcentaje / 100)) : 0;
    const saldoAbono =
      esGrande && !pagoCompleto ? redondear(total - montoAbono) : 0;
    const abonoMetodo = metodo === 'transferencia' ? 'transferencia' : 'Webpay';
    const mostrarAbono = esGrande && !pagoCompleto && info.totalConocido;

    let etiquetaDespacho = 'Despacho';
    let textoEntrega = 'Retiro en el local (sin costo)';

    if (tipo === 'despacho') {
      etiquetaDespacho = cotizacion
        ? `Despacho (${formatearDistancia(cotizacion.distanciaKm)})`
        : 'Despacho';

      if (!ubicacionEntrega) {
        textoEntrega = 'Selecciona tu dirección';
      } else if (!cotizacion) {
        textoEntrega = 'Por calcular';
      } else if (cotizacion.gratis) {
        textoEntrega = 'Gratis';
      } else {
        textoEntrega = `$${formatearPrecio(costoDespacho)}`;
      }
    }

    const totalTexto =
      tipo === 'despacho' && !cotizacion
        ? 'Por calcular'
        : `$${formatearPrecio(total)}`;

    let notaDespacho = '';

    if (tipo === 'despacho') {
      if (!ubicacionEntrega) {
        notaDespacho =
          'Selecciona tu dirección en el mapa para calcular el costo de despacho.';
      } else if (cotizacion?.gratis) {
        notaDespacho = `Despacho gratis: compra superior a $${formatearPrecio(
          cotizacion.montoDespachoGratis
        )} dentro de Padre Hurtado.`;
      } else if (cotizacion) {
        notaDespacho = cotizacion.dentroComuna
          ? `Dentro de Padre Hurtado. El despacho es gratis en compras superiores a $${formatearPrecio(
              cotizacion.montoDespachoGratis
            )}.`
          : `Fuera de Padre Hurtado: $${formatearPrecio(
              cotizacion.tarifaBaseDespacho
            )} hasta ${formatearNumero(
              cotizacion.kmBaseDespacho
            )} km y $${formatearPrecio(
              cotizacion.tarifaKmAdicional
            )} por km adicional.`;
      }
    }

    resumen.innerHTML = `
      <div class="checkout-resumen-linea">
        <span>Productos (${cantidadTotal()})</span>
        <strong>$${formatearPrecio(subtotal)}</strong>
      </div>
      <div class="checkout-resumen-linea">
        <span>${tipo === 'despacho' ? etiquetaDespacho : 'Entrega'}</span>
        <strong>${textoEntrega}</strong>
      </div>
      <div class="checkout-resumen-total">
        <span>Total del pedido</span>
        <strong>${totalTexto}</strong>
      </div>
      ${
        mostrarAbono
          ? `
            <div class="checkout-resumen-linea">
              <span>Abono (${porcentaje}%)</span>
              <strong>$${formatearPrecio(montoAbono)}</strong>
            </div>
            <div class="checkout-resumen-linea">
              <span>Saldo al retirar/recibir</span>
              <strong>$${formatearPrecio(saldoAbono)}</strong>
            </div>
            <p class="cart-ayuda">
              El abono se paga ahora con ${abonoMetodo}. ${
                metodo === 'transferencia'
                  ? 'Te enviamos los datos para transferir.'
                  : 'Te redirigimos a Webpay al confirmar.'
              }
            </p>
          `
          : ''
      }
      ${
        esGrande && pagoCompleto && info.totalConocido
          ? `
            <div class="checkout-resumen-linea">
              <span>Pago completo ahora</span>
              <strong>$${formatearPrecio(total)}</strong>
            </div>
            <p class="cart-ayuda">
              Pagas el total con ${abonoMetodo}. No queda saldo pendiente al retirar o recibir.
            </p>
          `
          : ''
      }
      ${
        esGrande && !info.totalConocido
          ? `<p class="cart-ayuda">${
              pagoCompleto
                ? 'El total final se calcula al seleccionar tu dirección de despacho.'
                : `El abono del ${porcentaje}% se calcula al seleccionar tu dirección de despacho.`
            }</p>`
          : ''
      }
      ${
        notaDespacho
          ? `<p class="cart-ayuda ${
              cotizacion?.gratis ? 'mapa-ayuda-gratis' : ''
            }">${escaparHtml(notaDespacho)}</p>`
          : ''
      }
    `;

    actualizarBotonEnviar();
    renderizarSeleccionDireccion();
  }

  /* ------------------------------------------------------------------ */
  /* Persistencia del checkout y retorno de Webpay                      */
  /* ------------------------------------------------------------------ */

  function guardarDatosCheckout(carga) {
    try {
      localStorage.setItem(
        STORAGE_CHECKOUT_KEY,
        JSON.stringify({
          nombre: carga.nombre_cliente || '',
          telefono: carga.telefono || '',
          email: carga.email || '',
          tipo_entrega: carga.tipo_entrega || 'retiro',
          direccion: carga.direccion || '',
          lat: carga.lat,
          lng: carga.lng,
          metodo_pago: carga.metodo_pago || 'efectivo',
          fecha_entrega: carga.fecha_entrega || '',
          notas: carga.notas || '',
          pago_completo: Boolean(carga.pago_completo),
        })
      );
    } catch (error) {
      console.warn('No se pudieron guardar los datos del checkout:', error);
    }
  }

  function leerDatosCheckout() {
    try {
      const crudo = localStorage.getItem(STORAGE_CHECKOUT_KEY);
      if (!crudo) return null;
      const datos = JSON.parse(crudo);
      return datos && typeof datos === 'object' ? datos : null;
    } catch (error) {
      return null;
    }
  }

  function limpiarDatosCheckout() {
    try {
      localStorage.removeItem(STORAGE_CHECKOUT_KEY);
    } catch (error) {
      // Sin persistencia disponible: no es un error crítico.
    }
  }

  function leerParametrosPago() {
    const parametros = new URLSearchParams(window.location.search);
    const estado = parametros.get('pago');
    if (!estado) return null;
    return { estado, codigo: parametros.get('codigo') || '' };
  }

  function limpiarParametrosPago() {
    if (!window.history || typeof window.history.replaceState !== 'function') {
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.delete('pago');
    url.searchParams.delete('codigo');
    window.history.replaceState(
      {},
      '',
      `${url.pathname}${url.search}${url.hash}`
    );
  }

  // Devuelve al checkout los datos que el cliente había ingresado antes de
  // irse a Webpay, para que un pago rechazado no le obligue a repetir todo.
  function restaurarCheckoutGuardado() {
    const datos = leerDatosCheckout();
    if (!datos) return;

    const asignar = (id, valor) => {
      const campo = $(id);
      if (campo && valor !== undefined && valor !== null) {
        campo.value = String(valor);
      }
    };

    asignar('cliente-nombre', datos.nombre);
    asignar('cliente-telefono', datos.telefono);
    asignar('cliente-email', datos.email);
    asignar('cliente-notas', datos.notas);

    const tipo = datos.tipo_entrega === 'despacho' ? 'despacho' : 'retiro';
    const radioTipo = document.querySelector(
      `input[name="tipo_entrega"][value="${tipo}"]`
    );
    if (radioTipo) radioTipo.checked = true;

    const metodos = ['efectivo', 'tarjeta', 'transferencia', 'webpay'];
    const metodo = metodos.includes(datos.metodo_pago)
      ? datos.metodo_pago
      : 'efectivo';
    const radioPago = document.querySelector(
      `input[name="metodo_pago"][value="${metodo}"]`
    );

    if (radioPago && !radioPago.disabled) {
      radioPago.checked = true;
    }

    const radioTipoPago = document.querySelector(
      `input[name="tipo_pago_pedido"][value="${
        datos.pago_completo ? 'total' : 'abono'
      }"]`
    );
    if (radioTipoPago) radioTipoPago.checked = true;

    const selectFecha = $('cliente-fecha');

    if (selectFecha && datos.fecha_entrega) {
      const opcion = Array.from(selectFecha.options).find(
        (item) => item.value === datos.fecha_entrega && !item.disabled
      );
      if (opcion) selectFecha.value = datos.fecha_entrega;
    }

    actualizarEntrega();

    const lat = Number(datos.lat);
    const lng = Number(datos.lng);
    const tieneCoordenadas =
      datos.lat !== null &&
      datos.lat !== undefined &&
      datos.lat !== '' &&
      datos.lng !== null &&
      datos.lng !== undefined &&
      datos.lng !== '' &&
      Number.isFinite(lat) &&
      Number.isFinite(lng);

    if (tipo === 'despacho' && tieneCoordenadas) {
      actualizarUbicacion(lat, lng, datos.direccion || '');

      const ubicarMarcador = () => {
        if (!mapa) return;
        fijarMarcador(lat, lng, { centrar: true, zoom: 17 });
      };

      if (mapa) {
        ubicarMarcador();
      } else {
        setTimeout(ubicarMarcador, 120);
      }
    }

    actualizarCupoFecha();
    actualizarResumenCheckout();
  }

  function mostrarAvisoPago(mensaje, esError) {
    const aviso = $('checkout-aviso-pago');
    if (!aviso) return;

    aviso.hidden = !mensaje;
    aviso.textContent = mensaje || '';
    aviso.classList.toggle('checkout-aviso-error', Boolean(esError));
  }

  // Webpay exige enviar el token por POST al formulario de pago.
  function redirigirAWebpay(pago) {
    if (!pago || !pago.url || !pago.token) {
      throw new Error('No se recibió la dirección de pago de Webpay.');
    }

    const formulario = document.createElement('form');
    formulario.method = 'POST';
    formulario.action = pago.url;
    formulario.style.display = 'none';

    const token = document.createElement('input');
    token.type = 'hidden';
    token.name = 'token_ws';
    token.value = pago.token;

    formulario.appendChild(token);
    document.body.appendChild(formulario);
    formulario.submit();
  }

  async function procesarRetornoPago() {
    const retorno = leerParametrosPago();
    if (!retorno) return;

    limpiarParametrosPago();

    const avisos = {
      rechazado:
        'El pago fue rechazado por el banco. No se realizó ningún cargo.',
      cancelado:
        'Cancelaste el pago en Webpay. No se realizó ningún cargo.',
      error:
        'No pudimos confirmar el pago. Si el cargo aparece en tu cartola, contáctanos indicando tu código de pedido.',
    };

    if (retorno.estado === 'exito' && retorno.codigo) {
      try {
        const respuesta = await fetch(
          `${API_PEDIDOS}/codigo/${encodeURIComponent(retorno.codigo)}`
        );
        const datos = await respuesta.json().catch(() => ({}));

        if (!respuesta.ok || !datos.exito || !datos.pedido) {
          throw new Error(datos.mensaje || 'No pudimos consultar tu pedido.');
        }

        ultimoPedido = datos.pedido;

        if (
          ['pagado', 'abono_pagado'].includes(ultimoPedido.estado_pago)
        ) {
          items = [];
          refrescarCarrito();
          limpiarDatosCheckout();
        }

        renderizarExito(ultimoPedido);
        mostrarPaso('exito');
        abrirCarrito();
        return;
      } catch (error) {
        console.error('No se pudo mostrar el resultado del pago:', error);
        retorno.estado = 'error';
      }
    }

    restaurarCheckoutGuardado();

    const mensaje = `${
      avisos[retorno.estado] || avisos.error
    } Tu carrito sigue disponible para que lo intentes nuevamente.`;

    mostrarAvisoPago(
      mensaje,
      retorno.estado === 'rechazado' || retorno.estado === 'cancelado'
    );

    if (items.length > 0) {
      mostrarPaso('datos');
      abrirCarrito();
    } else {
      mostrarToast(mensaje);
    }
  }

  async function enviarPedido(evento) {
    evento.preventDefault();

    const formulario = evento.currentTarget;

    if (!formulario.checkValidity()) {
      formulario.reportValidity();
      return;
    }

    if (items.length === 0) {
      mostrarToast('Tu carrito está vacío.');
      mostrarPaso('carrito');
      return;
    }

    const tipoEntrega = document.querySelector(
      'input[name="tipo_entrega"]:checked'
    )?.value;

    if (tipoEntrega === 'despacho' && !ubicacionEntrega) {
      mostrarToast(
        'Selecciona tu dirección en el mapa para calcular el despacho.'
      );
      return;
    }

    const boton = $('btn-enviar-pedido');
    const textoOriginal = boton?.textContent || 'Enviar pedido';

    if (boton) {
      boton.disabled = true;
      boton.textContent = 'Enviando pedido…';
    }

    const datos = new FormData(formulario);

    if (!claveSolicitudActual) {
      claveSolicitudActual = generarClaveSolicitud();
    }

    const carga = {
      nombre_cliente: datos.get('nombre'),
      telefono: datos.get('telefono'),
      email: datos.get('email'),
      tipo_entrega: datos.get('tipo_entrega'),
      direccion: datos.get('direccion'),
      lat: ubicacionEntrega?.lat ?? null,
      lng: ubicacionEntrega?.lng ?? null,
      metodo_pago: datos.get('metodo_pago'),
      fecha_entrega: datos.get('fecha_entrega'),
      notas: datos.get('notas'),
      // Solo se envía cuando el pedido supera el monto grande y el cliente
      // eligió pagar el total en vez del abono.
      pago_completo:
        calcularResumenCompra().total > umbralPedidoGrande() &&
        pagoCompletoSeleccionado(),
      clave_solicitud: claveSolicitudActual,
      items: items.map((item) => ({
        id_presentacion: item.id_presentacion,
        cantidad: item.cantidad,
      })),
    };

    mostrarAvisoPago('');

    // Se guarda para poder recuperar el formulario si Webpay rechaza el pago.
    guardarDatosCheckout(carga);

    try {
      const respuesta = await fetch(API_PEDIDOS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(carga),
      });

      const resultado = await respuesta.json().catch(() => ({}));

      // El servidor ya respondió: la clave no se reutiliza en un nuevo intento.
      claveSolicitudActual = null;

      if (!respuesta.ok || !resultado.exito) {
        if (respuesta.status === 409) {
          await cargarDisponibilidad(true);
          actualizarCupoFecha();
        }

        throw new Error(
          resultado.mensaje || 'No se pudo enviar el pedido. Intenta nuevamente.'
        );
      }

      // Cualquier pedido con cobro Webpay (pago completo o abono) debe ir a
      // la pasarela. El carrito NO se vacía hasta que Transbank confirme.
      if (resultado.pago) {
        // Se recuerda el correo porque al volver de Webpay la consulta
        // pública no incluye datos personales.
        guardarEmailPedido(carga.email);
        redirigirAWebpay(resultado.pago);
        return;
      }

      if (carga.metodo_pago === 'webpay') {
        throw new Error(
          'Webpay no devolvió la dirección de pago. Intenta nuevamente.'
        );
      }

      ultimoPedido = resultado.pedido;
      guardarEmailPedido(resultado.pedido?.email || carga.email);
      items = [];
      refrescarCarrito();
      limpiarSeleccionEntrega();
      limpiarDatosCheckout();
      renderizarExito(ultimoPedido);
      mostrarPaso('exito');
      cargarDisponibilidad(true);
    } catch (error) {
      console.error('Error al enviar el pedido:', error);
      mostrarToast(error.message || 'No se pudo enviar el pedido.');
    } finally {
      if (boton) {
        boton.textContent = textoOriginal;
        actualizarBotonEnviar();
      }
    }
  }

  function generarClaveSolicitud() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }

    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function renderizarExito(pedido) {
    if (!pedido) return;

    $('exito-codigo').textContent = pedido.codigo || '—';

    const dia = dias.find((item) => item.fecha === pedido.fecha_entrega);
    const fecha = dia ? dia.etiqueta : formatearFecha(pedido.fecha_entrega);
    const distancia = Number(pedido.distancia_km);
    const detalleDistancia = Number.isFinite(distancia)
      ? ` (${formatearDistancia(distancia)})`
      : '';
    const entrega =
      pedido.tipo_entrega === 'retiro'
        ? 'Retiro en el local (Calle Parque Villarrica 1209, Padre Hurtado)'
        : `Despacho a domicilio${detalleDistancia}`;
    const pago = NOMBRES_PAGO[pedido.metodo_pago] || pedido.metodo_pago;
    const costoDespacho = Number(pedido.costo_despacho) || 0;
    const despachoGratis = Boolean(pedido.despacho_gratis);
    const esWebpay = pedido.metodo_pago === 'webpay';
    const estadoPago = pedido.estado_pago || '';
    const montoAbono = Number(pedido.monto_abono) || 0;
    const saldoPendiente = Number(pedido.saldo_pendiente) || 0;
    const esPedidoConAbono = montoAbono > 0;
    const porcentajeAbonoPedido =
      Number(pedido.total) > 0
        ? Math.round((montoAbono / Number(pedido.total)) * 100)
        : porcentajeAbono();
    const abonoPorTransferencia = pedido.metodo_pago === 'transferencia';
    const abonoEtiqueta = abonoPorTransferencia
      ? 'Transferencia'
      : 'Webpay';
    const abonoPagado =
      Boolean(pedido.abono_pagado) || estadoPago === 'abono_pagado';
    const pagoCompleto = estadoPago === 'pagado';
    const detalleWebpay = esWebpay
      ? [
          esPedidoConAbono
            ? pagoCompleto
              ? 'Pagado'
              : abonoPagado
                ? 'Abono pagado'
                : 'Abono pendiente'
            : pagoCompleto
              ? 'Pagado'
              : 'Pago pendiente',
          pedido.webpay_autorizacion
            ? `autorización ${pedido.webpay_autorizacion}`
            : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : '';

    const itemsHtml = (pedido.items || [])
      .map(
        (item) => `
          <li>
            <span>${item.cantidad} × ${escaparHtml(item.nombre_producto)}</span>
            <strong>$${formatearPrecio(item.subtotal)}</strong>
          </li>
        `
      )
      .join('');

    $('exito-detalle').innerHTML = `
      <div class="exito-linea">
        <span>Fecha</span>
        <strong>${escaparHtml(fecha)}</strong>
      </div>
      <div class="exito-linea">
        <span>Entrega</span>
        <strong>${escaparHtml(entrega)}</strong>
      </div>
      <div class="exito-linea">
        <span>Pago</span>
        <strong>${escaparHtml(pago)}${
          detalleWebpay ? ` · ${escaparHtml(detalleWebpay)}` : ''
        }</strong>
      </div>
      <ul class="exito-items">${itemsHtml}</ul>
      <div class="exito-linea">
        <span>Subtotal</span>
        <strong>$${formatearPrecio(pedido.subtotal)}</strong>
      </div>
      ${
        pedido.tipo_entrega === 'despacho'
          ? `<div class="exito-linea">
              <span>Despacho</span>
              <strong>${
                costoDespacho > 0
                  ? `$${formatearPrecio(costoDespacho)}`
                  : despachoGratis
                    ? 'Gratis'
                    : 'A coordinar'
              }</strong>
            </div>`
          : ''
      }
      <div class="exito-total">
        <span>Total del pedido</span>
        <strong>$${formatearPrecio(pedido.total)}</strong>
      </div>
      ${
        esPedidoConAbono
          ? `
            <div class="exito-linea">
              <span>Abono (${porcentajeAbonoPedido}% · ${abonoEtiqueta})</span>
              <strong>$${formatearPrecio(montoAbono)} · ${
                abonoPagado ? 'pagado' : 'pendiente'
              }</strong>
            </div>
            <div class="exito-linea">
              <span>${pagoCompleto ? 'Saldo' : 'Saldo pendiente'}</span>
              <strong>${
                pagoCompleto
                  ? 'Pagado'
                  : `$${formatearPrecio(saldoPendiente)}`
              }</strong>
            </div>
          `
          : ''
      }
    `;

    const notasPago = {
      efectivo: 'Pagarás en efectivo al recibir o retirar tu pedido.',
      tarjeta:
        'El pago con tarjeta presencial se realiza al recibir o retirar tu pedido.',
      transferencia:
        'Te enviaremos los datos de transferencia al confirmar tu pedido.',
      webpay: pagoCompleto
        ? 'Pago aprobado con Webpay. El cargo aparecerá en tu cartola.'
        : 'El pago online quedó pendiente.',
    };

    let notaPago = notasPago[pedido.metodo_pago] || '';

    if (esPedidoConAbono) {
      if (pagoCompleto) {
        notaPago =
          'Abono y saldo pagados. El pedido quedó totalmente pagado.';
      } else if (abonoPagado) {
        notaPago = `Abono de $${formatearPrecio(montoAbono)} pagado${
          abonoPorTransferencia ? ' por transferencia' : ' con Webpay'
        }. El saldo de $${formatearPrecio(
          saldoPendiente
        )} se paga al retirar o recibir tu pedido.`;
      } else {
        notaPago = `Debes pagar un abono de $${formatearPrecio(
          montoAbono
        )} ${
          abonoPorTransferencia ? 'por transferencia' : 'con Webpay'
        } para confirmar tu pedido. El saldo de $${formatearPrecio(
          saldoPendiente
        )} se paga al retirar o recibir.`;
      }
    } else if (
      pedido.metodo_pago === 'transferencia' &&
      Number(pedido.total) > umbralPedidoGrande() &&
      !pagoCompleto
    ) {
      // Pedido grande pagado completo por transferencia: se espera el total.
      notaPago = `Transfiere el total de $${formatearPrecio(
        pedido.total
      )} para confirmar tu pedido.`;
    }

    const cierre =
      pagoCompleto || abonoPagado
        ? 'La dueña se contactará contigo para coordinar la entrega.'
        : 'La dueña se contactará contigo para confirmar el pedido.';

    $('exito-nota-pago').textContent = `${notaPago} ${cierre}`;

    actualizarAvisoExito(pedido);
  }

  /**
   * Ajusta el comprobante según el correo del cliente:
   *  - Con correo: confirma que el código se envió y muestra el seguimiento.
   *  - Sin correo: pide guardar el código y ofrece copiarlo.
   */
  function actualizarAvisoExito(pedido) {
    if (!pedido || !pedido.codigo) return;

    const codigo = String(pedido.codigo).trim();
    const email = String(pedido.email || leerEmailPedido() || '').trim();
    const aviso = $('exito-aviso-codigo');
    const correo = $('exito-correo');
    const enlace = $('btn-seguimiento');

    if (enlace) {
      enlace.href = `/seguimiento/${encodeURIComponent(codigo)}`;
    }

    if (email) {
      avisoCodigoPendiente = false;
      if (aviso) aviso.hidden = true;

      if (correo) {
        correo.hidden = false;
        correo.innerHTML = `Enviamos tu código y el enlace de seguimiento a <strong>${escaparHtml(
          mascararEmail(email)
        )}</strong>.`;
      }

      return;
    }

    if (correo) correo.hidden = true;

    const guardado = Boolean(leerCodigoGuardado(codigo));
    avisoCodigoPendiente = !guardado;

    if (aviso) aviso.hidden = guardado;
  }

  function guardarEmailPedido(email) {
    try {
      localStorage.setItem(STORAGE_EMAIL_KEY, String(email || ''));
    } catch (_) {
      // El navegador puede bloquear localStorage; no es crítico.
    }
  }

  function leerEmailPedido() {
    try {
      return localStorage.getItem(STORAGE_EMAIL_KEY) || '';
    } catch (_) {
      return '';
    }
  }

  function leerCodigoGuardado(codigo) {
    try {
      return localStorage.getItem(STORAGE_CODIGO_PREFIX + codigo) === '1';
    } catch (_) {
      return false;
    }
  }

  function mascararEmail(email) {
    const [usuario, dominio] = String(email).split('@');

    if (!usuario || !dominio) return email;

    const visibles = usuario.slice(0, 2);
    const ocultos = '*'.repeat(Math.max(usuario.length - 2, 2));
    return `${visibles}${ocultos}@${dominio}`;
  }

  async function copiarCodigoPedido() {
    const codigo = ($('exito-codigo')?.textContent || '').trim();

    if (!codigo || codigo === '—') return;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(codigo);
      } else {
        const campo = document.createElement('textarea');
        campo.value = codigo;
        campo.setAttribute('readonly', '');
        campo.style.position = 'fixed';
        campo.style.opacity = '0';
        document.body.appendChild(campo);
        campo.select();
        document.execCommand('copy');
        document.body.removeChild(campo);
      }

      mostrarToast('Código copiado. Guárdalo en un lugar seguro.');
    } catch (_) {
      mostrarToast(`Tu código es ${codigo}. Anótalo antes de cerrar.`);
    }
  }

  function marcarCodigoGuardado() {
    const codigo = ($('exito-codigo')?.textContent || '').trim();

    if (codigo && codigo !== '—') {
      try {
        localStorage.setItem(STORAGE_CODIGO_PREFIX + codigo, '1');
      } catch (_) {
        // Sin localStorage el aviso se oculta igual en esta sesión.
      }
    }

    avisoCodigoPendiente = false;
    if ($('exito-aviso-codigo')) $('exito-aviso-codigo').hidden = true;
    mostrarToast('Listo. Puedes consultar tu pedido cuando quieras.');
  }

  function hacerOtroPedido() {
    ultimoPedido = null;
    avisoCodigoPendiente = false;
    $('checkout-form')?.reset();
    mostrarAvisoPago('');
    limpiarDatosCheckout();
    limpiarSeleccionEntrega();
    actualizarEntrega();
    mostrarPaso('carrito');
    cerrarCarrito();
    cargarDisponibilidad(true);
    mostrarToast('Puedes comenzar un nuevo pedido.');
  }

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                         */
  /* ------------------------------------------------------------------ */

  function formatearPrecio(valor) {
    const numero = Math.round(Number(valor));
    return Number.isFinite(numero) ? numero.toLocaleString('es-CL') : '0';
  }

  function redondear(valor) {
    return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
  }

  function formatearFecha(fechaIso) {
    if (!fechaIso) return '';

    const fecha = new Date(`${fechaIso}T00:00:00`);
    if (Number.isNaN(fecha.getTime())) return fechaIso;

    const texto = new Intl.DateTimeFormat('es-CL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(fecha);

    return texto.charAt(0).toUpperCase() + texto.slice(1);
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

  // API pública para app.js
  window.Carrito = { agregar };
})();
