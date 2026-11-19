const { Pool } = require('pg');

async function updatePrecios() {
  const pool = new Pool({ host: 'localhost', user: 'postgres', password: '', database: 'matteo_masas_db', port: 5432 });
  
  try {
    console.log('=== Actualizando precios del catálogo MATTEO MASAS ===\n');
    
    // --- PANES ---
    const panes = [
      { id: 13, nombre: 'Pan de Completo Normal', precio: 200.00, unidad: 'u' },
      { id: 14, nombre: 'Pan de Completo Cóctel', precio: 120.00, unidad: 'u' },
      { id: 15, nombre: 'Pan de Completo Choripán', precio: 140.00, unidad: 'u' },
      { id: 16, nombre: 'Pan de Frica Normal', precio: 200.00, unidad: 'u' },
      { id: 17, nombre: 'Pan de Frica Cóctel', precio: 120.00, unidad: 'u' },
      { id: 18, nombre: 'Pan de Canapé y Tapadito', precio: 2500.00, unidad: 'kg' },
      { id: 19, nombre: 'Pan Mini Completo / Fría', precio: 150.00, unidad: 'u' }
    ];
    
    // --- MASAS ---
    const masas = [
      { id: 20, nombre: 'Masa Frita 12 cms', precio: 220.00, unidad: 'unidad/paquete (20 un.)' },
      { id: 21, nombre: 'Masa Frita 15 cms', precio: 300.00, unidad: 'unidad/paquete (20 un.)' },
      { id: 22, nombre: 'Masa Frita 18 cms', precio: 340.00, unidad: 'unidad/paquete (20 un.)' },
      { id: 23, nombre: 'Masa Horno 12 cms', precio: 240.00, unidad: 'unidad/paquete (20 un.)' },
      { id: 24, nombre: 'Masa Horno 15 cms', precio: 340.00, unidad: 'unidad/paquete (20 un.)' },
      { id: 25, nombre: 'Masa Horno 18 cms', precio: 380.00, unidad: 'unidad/paquete (20 un.)' },
      { id: 26, nombre: 'Masa Horno 20 cms', precio: 400.00, unidad: 'unidad/paquete (20 un.)' },
      { id: 27, nombre: 'Masa Horno 22 cms', precio: 500.00, unidad: 'unidad/paquete (20 un.)' },
      { id: 28, nombre: 'Masa Sopaipilla Cóctel', precio: 400.00, unidad: 'unidad/paquete (50 un.)' },
      { id: 29, nombre: 'Masa Sopaipilla Normal', precio: 200.00, unidad: 'unidad/paquete (20 un.)' },
      { id: 30, nombre: 'Calzón Roto (24 un.)', precio: 200.00, unidad: 'unidad/paquete (24 un.) o 12 unidades por $2000' },
      { id: 31, nombre: 'Calzón Roto (12 un.)', precio: 200.00, unidad: 'unidad/paquete (12 un.)' }
    ];
    
    // --- EMPANADAS ---
    const empanadas = [
      { id: 32, nombre: 'Empanada Queso para Freír 12 cms', precio: 350.00, unidad: 'unidad/paquete (12 un.)' },
      { id: 33, nombre: 'Empanada Queso para Freír 18 cms', precio: 600.00, unidad: 'unidad/paquete (10 un.)' },
      { id: 34, nombre: 'Empanada Cóctel Horno', precio: 2400.00, unidad: 'unidad/paquete (50 un.)' }
    ];
    
    // --- DULCES Y REPOSTERÍA ---
    const dulces = [
      { id: 35, nombre: 'Mini Cupcake', precio: 4.50, unidad: 'unidad/precio por 50 unidades ($20000)' },
      { id: 36, nombre: 'Algodón de Azúcar', precio: 3.50, unidad: 'unidad/precio por 25 un. ($8500) o 50 un. ($16000)' },
      { id: 37, nombre: 'Cabritas en Pote', precio: 3.50, unidad: 'unidad/precio por 25 un. ($8500) o 50 un. ($16000)' },
      { id: 38, nombre: 'Mini-Dona', precio: 24.00, unidad: 'unidad/paquete (50 un.): $12000 o (100 un.): $20000' },
      { id: 39, nombre: 'Berlin Mediano Horneado', precio: 3.80, unidad: 'unidad/paquete (1 un.): $400 / 50 un.: $19000 / 100 un.: $36000' },
      { id: 40, nombre: 'Mini Berlin Horneado', precio: 2.50, unidad: 'unidad/paquete (1 un.): $300 / 50 un.: $12500' },
      { id: 41, nombre: 'Cake-Pop', precio: 3.40, unidad: 'unidad/precio por 50 un. ($17000) o 100 un. ($32000)' }
    ];
    
    // --- PIZZETAS ---
    const pizzetas = [
      { id: 42, nombre: 'Mini Pizzeta 8 cms', precio: 3.25, unidad: 'unidad/bandeja (8 un.): $2600' }
    ];
    
    // Actualizar precios de PANES
    console.log('🔹 Actualizando PANES...');
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Pan de Completo Normal'`, [200.00]);
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Pan de Completo Cóctel'`, [120.00]);
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Pan de Completo Choripán'`, [140.00]);
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Pan de Frica Normal'`, [200.00]);
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Pan de Frica Cóctel'`, [120.00]);
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Pan de Canapé y Tapadito'`, [2500.00]);
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Pan Mini Completo / Fría'`, [150.00]);
    
    // Actualizar precios de MASAS
    console.log('🔹 Actualizando MASAS...');
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Masa Frita 12 cms'`, [220.00]);
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Masa Frita 15 cms'`, [300.00]);
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Masa Frita 18 cms'`, [340.00]);
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Masa Horno 12 cms'`, [240.00]);
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Masa Horno 15 cms'`, [340.00]);
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Masa Horno 18 cms'`, [380.00]);
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Masa Horno 20 cms'`, [400.00]);
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Masa Horno 22 cms'`, [500.00]);
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Masa Sopaipilla Cóctel'`, [400.00]);
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Masa Sopaipilla Normal'`, [200.00]);
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Calzón Roto (24 un.)'`, [200.00]);
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Calzón Roto (12 un.)'`, [200.00]);
    
    // Actualizar precios de EMPANADAS
    console.log('🔹 Actualizando EMPANADAS...');
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Empanada Queso para Freír 12 cms'`, [350.00]);
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Empanada Queso para Freír 18 cms'`, [600.00]);
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Empanada Cóctel Horno'`, [2400.00]);
    
    // Actualizar precios de DULCES Y REPOSTERÍA
    console.log('🔹 Actualizando DULCES Y REPOSTERÍA...');
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Mini Cupcake'`, [4.50]);
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Algodón de Azúcar'`, [3.50]);
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Cabritas en Pote'`, [3.50]);
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Mini-Dona'`, [24.00]);
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Berlin Mediano Horneado'`, [3.80]);
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Mini Berlin Horneado'`, [2.50]);
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Cake-Pop'`, [3.40]);
    
    // Actualizar precios de PIZZETAS
    console.log('🔹 Actualizando PIZZETAS...');
    await pool.query(`UPDATE producto SET precio_unitario = $1 WHERE nombre = 'Mini Pizzeta 8 cms'`, [3.25]);
    
    // Verificación final
    console.log('\n✅ Actualización completada exitosamente!\n');
    
    const productos = await pool.query(`
      SELECT p.id_producto, p.nombre, c.nombre as categoria, ROUND(p.precio_unitario, 2) as precio
      FROM producto p
      INNER JOIN categoria c ON p.id_categoria = c.id_categoria
      WHERE p.activo = true
      ORDER BY p.id_producto;
    `);
    
    console.log('📊 Precios actualizados en BD:');
    console.table(productos.rows.map(r => {
      return { id: r.id_producto, nombre: r.nombre, categoria: r.categoria, precio: parseFloat(r.precio) };
    }));
    
  } catch (err) {
    console.error('❌ Error:', err.message.split('\n')[0]);
    if (err.code === '42501') {
      console.log('Error de autenticación. Verifique el usuario o contraseña.');
    }
  } finally {
    pool.end();
  }
}

updatePrecios();

