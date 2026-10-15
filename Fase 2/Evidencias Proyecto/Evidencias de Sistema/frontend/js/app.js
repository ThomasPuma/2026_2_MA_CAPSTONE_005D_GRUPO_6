const API_URL = 'http://localhost:3000/api';

document.addEventListener('DOMContentLoaded', () => {
  cargarCatalogo();
});

async function cargarCatalogo() {
  const contenedor = document.getElementById('grid-productos');
  if (!contenedor) return;

  try {
    const respuesta = await fetch(`${API_URL}/productos`);
    const resultado = await respuesta.json();

    if (resultado.exito && resultado.datos.length > 0) {
      renderizarProductosBD(resultado.datos, contenedor);
    } else {
      contenedor.innerHTML = '<p>No hay productos registrados en la base de datos.</p>';
    }
  } catch (error) {
    console.error('Error al conectar con la API REST:', error);
    contenedor.innerHTML = '<p>Error de conexión con el servidor.</p>';
  }
}

function renderizarProductosBD(productos, contenedor) {
  contenedor.innerHTML = '';

  productos.forEach(prod => {
    // Convertimos el precio unitario de la BD a número entero
    const precio = Math.round(parseFloat(prod.precio_unitario));
    const sinStock = prod.stock_actual <= 0;
    
    const card = document.createElement('div');
    card.className = `card ${sinStock ? 'card-out' : ''}`;
    
    card.innerHTML = `
      <div style="font-size: 12px; color: #8D6E63; font-weight: bold; text-transform: uppercase; margin-bottom: 4px;">
        ${prod.categoria}
      </div>
      <h3 class="card-title">${prod.nombre}</h3>
      <p style="font-size: 14px; color: #5D4037; margin-bottom: 8px;">${prod.descripcion || ''}</p>
      <p class="card-price">$${precio.toLocaleString('es-CL')} CLP</p>
      
      <p style="margin-bottom: 12px; font-size: 13px; color: ${prod.en_alerta_critica ? '#D84315' : '#3E2723'}; font-weight: ${prod.en_alerta_critica ? 'bold' : 'normal'};">
        ${sinStock ? '❌ Agotado' : `Stock actual: ${prod.stock_actual} un.`}
        ${prod.en_alerta_critica && !sinStock ? ' ⚠️ (Stock Bajo)' : ''}
      </p>
      
      <button class="btn-add" ${sinStock ? 'disabled style="background:#B0BEC5; cursor:not-allowed;"' : ''}>
        ${sinStock ? 'Sin Stock' : 'Agregar al Carrito'}
      </button>
    `;
    contenedor.appendChild(card);
  });
}