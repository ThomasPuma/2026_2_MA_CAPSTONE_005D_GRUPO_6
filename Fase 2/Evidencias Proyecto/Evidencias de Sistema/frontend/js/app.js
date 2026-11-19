const API_URL = '/api';

let gruposCatalogo = [];
let filtroActual = 'todos';

document.addEventListener('DOMContentLoaded', () => {
  cargarCatalogo();
  configurarEnlacesFiltro();
  configurarMenuMovil();
});

// Menú desplegable para móvil y tablet. En escritorio la navegación se
// muestra siempre y el botón queda oculto por CSS.
function configurarMenuMovil() {
  const boton = document.getElementById('btn-nav');
  const nav = document.getElementById('nav-principal');
  if (!boton || !nav) return;

  const cerrar = () => {
    nav.classList.remove('abierto');
    boton.setAttribute('aria-expanded', 'false');
    boton.setAttribute('aria-label', 'Abrir menú');
  };

  boton.addEventListener('click', () => {
    const abierto = !nav.classList.contains('abierto');
    nav.classList.toggle('abierto', abierto);
    boton.setAttribute('aria-expanded', String(abierto));
    boton.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
  });

  nav.querySelectorAll('a').forEach((enlace) => {
    enlace.addEventListener('click', cerrar);
  });

  document.addEventListener('click', (evento) => {
    if (!nav.classList.contains('abierto')) return;
    if (nav.contains(evento.target) || boton.contains(evento.target)) return;
    cerrar();
  });

  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') cerrar();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) cerrar();
  });
}

// Los enlaces de categorías del footer activan el mismo filtro del catálogo.
function configurarEnlacesFiltro() {
  document.querySelectorAll('[data-filtro-link]').forEach((enlace) => {
    enlace.addEventListener('click', () => {
      const filtro = enlace.dataset.filtroLink;
      const boton = document.querySelector(
        `.filtro-btn[data-filtro="${filtro}"]`
      );
      if (boton) boton.click();
    });
  });
}

async function cargarCatalogo() {
  const contenedor = document.getElementById('grid-productos');
  if (!contenedor) return;

  try {
    const respuesta = await fetch(`${API_URL}/productos`);
    const resultado = await respuesta.json();

    if (resultado.exito && resultado.datos.length > 0) {
      gruposCatalogo = agruparProductos(resultado.datos);
      renderizarGrupos(gruposCatalogo, contenedor);
      configurarFiltros(contenedor);
    } else {
      contenedor.innerHTML = '<p class="grid-vacio">No hay productos disponibles en este momento.</p>';
    }
  } catch (error) {
    console.error('Error al conectar con la API REST:', error);
    contenedor.innerHTML = `
      <div class="grid-vacio">
        <p>No pudimos cargar el catálogo. Revisa tu conexión.</p>
        <button class="btn-secundario" id="btn-reintentar-catalogo" type="button">Reintentar</button>
      </div>
    `;
    document
      .getElementById('btn-reintentar-catalogo')
      ?.addEventListener('click', cargarCatalogo);
  }
}

// Une productos que son variantes del mismo artículo (ej: Pan de Completo
// normal, cóctel y choripán) para mostrarlos en una sola tarjeta con selector.
function agruparProductos(productos) {
  const mapa = new Map();

  productos.forEach((producto) => {
    const clave = producto.grupo || `producto-${producto.id_producto}`;

    if (!mapa.has(clave)) {
      mapa.set(clave, {
        clave,
        nombre: producto.grupo || producto.nombre,
        categoria: producto.categoria,
        variantes: [],
      });
    }

    mapa.get(clave).variantes.push(producto);
  });

  return Array.from(mapa.values());
}

function configurarFiltros(contenedor) {
  const botones = document.querySelectorAll('.filtro-btn');

  botones.forEach((boton) => {
    boton.addEventListener('click', () => {
      filtroActual = boton.dataset.filtro;

      botones.forEach((otroBoton) => {
        const activo = otroBoton === boton;
        otroBoton.classList.toggle('activo', activo);
        otroBoton.setAttribute('aria-pressed', String(activo));
      });

      aplicarFiltros(contenedor);
    });
  });

  document
    .getElementById('buscar-producto')
    ?.addEventListener('input', () => aplicarFiltros(contenedor));
}

// Combina el filtro de categoría con el texto del buscador.
function aplicarFiltros(contenedor) {
  const textoBuscado = normalizarTexto(
    document.getElementById('buscar-producto')?.value || ''
  );
  const resultado = document.getElementById('buscador-resultado');

  const gruposFiltrados = filtrarGrupos(gruposCatalogo, filtroActual).filter(
    (grupo) => !textoBuscado || coincideBusqueda(grupo, textoBuscado)
  );

  if (resultado) {
    resultado.textContent = textoBuscado
      ? `${gruposFiltrados.length} resultado${gruposFiltrados.length === 1 ? '' : 's'} para "${
          document.getElementById('buscar-producto').value.trim()
        }"`
      : '';
  }

  if (gruposFiltrados.length === 0) {
    contenedor.innerHTML = `
      <div class="grid-vacio">
        <p>No encontramos productos con esos filtros.</p>
        <button class="btn-secundario" id="btn-restablecer-filtros" type="button">Restablecer filtros</button>
      </div>
    `;
    document
      .getElementById('btn-restablecer-filtros')
      ?.addEventListener('click', restablecerFiltros);
    return;
  }

  renderizarGrupos(gruposFiltrados, contenedor);
}

function restablecerFiltros() {
  const buscador = document.getElementById('buscar-producto');
  if (buscador) buscador.value = '';

  document.querySelector('.filtro-btn[data-filtro="todos"]')?.click();
}

function normalizarTexto(valor) {
  return String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function coincideBusqueda(grupo, textoBuscado) {
  const campos = [grupo.nombre, grupo.categoria];

  grupo.variantes.forEach((variante) => {
    campos.push(variante.nombre, variante.grupo, variante.variante, variante.descripcion);
  });

  return normalizarTexto(campos.filter(Boolean).join(' ')).includes(textoBuscado);
}

function filtrarGrupos(grupos, filtro) {
  if (filtro === 'todos') return grupos;
  return grupos.filter((grupo) => grupoDeProducto(grupo) === filtro);
}

// Agrupa las categorías de la BD en los tres filtros pedidos.
// Empanadas y pizzetas son preparaciones de masa salada.
function grupoDeProducto(grupo) {
  const categoria = (grupo.categoria || '').toLowerCase();

  if (categoria.startsWith('pan')) return 'panes';
  if (categoria.startsWith('dulce') || categoria.includes('reposter')) return 'dulces';
  return 'masas';
}

function formatearPrecio(precio) {
  const numero = Math.round(Number(precio));
  return Number.isFinite(numero) ? numero.toLocaleString('es-CL') : '0';
}

function escaparHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Crea el selector de formato (paquete, kilo, bandeja, etc.) y el botón para
// agregar el producto al carrito. No se trabaja con stock: todo es por pedido.
function crearBloqueCompra(producto) {
  const bloque = document.createElement('div');
  bloque.className = 'bloque-compra';

  const presentaciones = Array.isArray(producto.presentaciones)
    ? producto.presentaciones
    : [];

  if (presentaciones.length === 0) {
    const consultar = document.createElement('p');
    consultar.className = 'precio-consultar';
    consultar.textContent = 'Precio a consultar';
    bloque.appendChild(consultar);

    const boton = document.createElement('button');
    boton.className = 'btn-add';
    boton.type = 'button';
    boton.disabled = true;
    boton.textContent = 'Consultar disponibilidad';
    bloque.appendChild(boton);
    return bloque;
  }

  let select = null;

  if (presentaciones.length > 1) {
    const etiqueta = document.createElement('label');
    etiqueta.className = 'selector-presentacion';
    etiqueta.innerHTML = '<span>Elige el formato</span>';

    select = document.createElement('select');
    select.className = 'presentacion-select';

    presentaciones.forEach((presentacion) => {
      const opcion = document.createElement('option');
      opcion.value = String(presentacion.id_presentacion);
      opcion.textContent = `${presentacion.etiqueta} — $${formatearPrecio(
        presentacion.precio
      )}`;
      select.appendChild(opcion);
    });

    etiqueta.appendChild(select);
    bloque.appendChild(etiqueta);
  } else {
    const formato = document.createElement('p');
    formato.className = 'formato-unico';
    formato.textContent = presentaciones[0].etiqueta;
    bloque.appendChild(formato);
  }

  const precio = document.createElement('p');
  precio.className = 'precio-seleccionado';
  bloque.appendChild(precio);

  const obtenerPresentacion = () => {
    if (!select) return presentaciones[0];

    return (
      presentaciones.find(
        (presentacion) =>
          String(presentacion.id_presentacion) === select.value
      ) || presentaciones[0]
    );
  };

  const actualizarPrecio = () => {
    const presentacion = obtenerPresentacion();
    precio.innerHTML = `$${formatearPrecio(presentacion.precio)} <small>por ${escaparHtml(
      presentacion.etiqueta
    )}</small>`;
  };

  if (select) {
    select.addEventListener('change', actualizarPrecio);
  }

  actualizarPrecio();

  const boton = document.createElement('button');
  boton.className = 'btn-add';
  boton.type = 'button';
  boton.textContent = 'Agregar al carrito';
  boton.addEventListener('click', () => {
    const presentacion = obtenerPresentacion();

    if (!window.Carrito) {
      console.error('El carrito no está disponible.');
      return;
    }

    window.Carrito.agregar(producto, presentacion);
  });

  bloque.appendChild(boton);
  return bloque;
}

function crearCardGrupo(grupo) {
  const variantes = grupo.variantes;
  const card = document.createElement('div');
  card.className = 'card';

  const imagenWrap = document.createElement('div');
  imagenWrap.className = 'card-imagen-wrap';
  imagenWrap.innerHTML = `
    <img class="card-imagen" alt="${escaparHtml(grupo.nombre)}" loading="lazy">
    <div class="card-imagen-fallback" aria-hidden="true">🥖</div>
  `;
  const imagen = imagenWrap.querySelector('.card-imagen');
  imagen.addEventListener('error', () => {
    imagenWrap.classList.add('sin-imagen');
    imagen.style.display = 'none';
  });
  card.appendChild(imagenWrap);

  const encabezado = document.createElement('div');
  encabezado.innerHTML = `
    <div class="card-categoria">${escaparHtml(grupo.categoria)}</div>
    <h3 class="card-title">${escaparHtml(grupo.nombre)}</h3>
  `;
  card.appendChild(encabezado);

  let selector = null;

  if (variantes.length > 1) {
    const contenedorSelector = document.createElement('label');
    contenedorSelector.className = 'selector-variante';
    contenedorSelector.innerHTML = '<span>Elige una opción</span>';

    selector = document.createElement('select');
    selector.className = 'variante-select';
    selector.innerHTML = variantes
      .map(
        (variante, indice) =>
          `<option value="${indice}">${escaparHtml(
            variante.variante || variante.nombre
          )}</option>`
      )
      .join('');

    contenedorSelector.appendChild(selector);
    card.appendChild(contenedorSelector);
  }

  const detalle = document.createElement('div');
  detalle.className = 'variante-detalle';
  card.appendChild(detalle);

  const actualizarImagen = (producto) => {
    if (producto.imagen_url) {
      imagenWrap.classList.remove('sin-imagen');
      imagen.style.display = '';
      imagen.src = producto.imagen_url;
      imagen.alt = producto.nombre;
    } else {
      imagenWrap.classList.add('sin-imagen');
      imagen.style.display = 'none';
      imagen.removeAttribute('src');
    }
  };

  const mostrarVariante = (producto) => {
    actualizarImagen(producto);
    detalle.innerHTML = '';

    const descripcion = document.createElement('p');
    descripcion.className = 'card-descripcion';
    descripcion.textContent = producto.descripcion || '';
    detalle.appendChild(descripcion);

    detalle.appendChild(crearBloqueCompra(producto));

    const nota = document.createElement('p');
    nota.className = 'card-por-pedido';
    nota.textContent = '🍞 Se prepara para la fecha que elijas';
    detalle.appendChild(nota);
  };

  mostrarVariante(variantes[0]);

  if (selector) {
    selector.addEventListener('change', () => {
      const indice = Number(selector.value);
      mostrarVariante(variantes[indice]);
    });
  }

  return card;
}

function renderizarGrupos(grupos, contenedor) {
  contenedor.innerHTML = '';

  if (grupos.length === 0) {
    contenedor.innerHTML = '<p class="grid-vacio">No hay productos en esta categoría.</p>';
    return;
  }

  grupos.forEach((grupo) => {
    contenedor.appendChild(crearCardGrupo(grupo));
  });
}
