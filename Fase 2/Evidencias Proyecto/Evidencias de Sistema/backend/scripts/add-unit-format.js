const { Pool } = require('pg');

async function addUnitFormat() {
  const pool = new Pool({ host: 'localhost', user: 'postgres', password: '', database: 'matteo_masas_db', port: 5432 });
  
  try {
    console.log('=== Agregando formato de pedidos por paquetes ===\n');
    
    // Actualizar descripciones para PANES
    await pool.query(`UPDATE producto SET descripcion = 'Precio por unidad. También disponible en paquetes: 10 unidades por $2000 (Panes normales/fricas), Pan cóctel $1200-1400, Canapé/Tapadito $2500/kg, Mini pan $1500 (10 un.)' WHERE nombre IN ('Pan de Completo Normal', 'Pan de Completo Cóctel', 'Pan de Completo Choripán', 'Pan de Frica Normal', 'Pan de Frica Cóctel', 'Pan Canapé y Tapadito', 'Pan Mini Completo / Fría')`);
    
    // Actualizar descripciones para MASAS
    await pool.query(`UPDATE producto SET descripcion = 'Precio por unidad. También disponible en paquetes de 20 unidades: Fritas $2200-3400, Horno $2400-5000, Sopaipilla $2000-4000, Calzón Roto $2000 (24 un.) o $2000 (12 un.)' WHERE nombre IN ('Masa Frita 12 cms', 'Masa Frita 15 cms', 'Masa Frita 18 cms', 'Masa Horno 12 cms', 'Masa Horno 15 cms', 'Masa Horno 18 cms', 'Masa Horno 20 cms', 'Masa Horno 22 cms', 'Masa Sopaipilla Cóctel', 'Masa Sopaipilla Normal', 'Calzón Roto (24 un.)', 'Calzón Roto (12 un.)')`);
    
    // Actualizar descripciones para EMPANADAS
    await pool.query(`UPDATE producto SET descripcion = 'Precio por unidad. También disponible en paquetes: Empanadas queso $3500-6000 (12-10 un.), Cóctel horno $24000 (50 un.)' WHERE nombre IN ('Empanada Queso para Freír 12 cms', 'Empanada Queso para Freír 18 cms', 'Empanada Cóctel Horno')`);
    
    // Actualizar descripciones para DULCES Y REPOSTERÍA
    await pool.query(`UPDATE producto SET descripcion = 'Precio por unidad. También disponible en paquetes: Cupcake $20000 (50 un.), Algodón/Cabritas $8500 (25 un.)/$16000 (50 un.), Donas $12000-20000 (50-100 un.), Berlins $3.80/$400/$19000-$36000, Mini-berlines $2.50/$300/$12500, Cake-pops $17000-$32000 (50-100 un.)' WHERE nombre IN ('Mini Cupcake', 'Algodón de Azúcar', 'Cabritas en Pote', 'Mini-Dona', 'Berlin Mediano Horneado', 'Mini Berlin Horneado', 'Cake-Pop')`);
    
    // Actualizar descripciones para PIZZETAS
    await pool.query(`UPDATE producto SET descripcion = 'Precio por unidad. También disponible en bandeja de 8 unidades: $2600' WHERE nombre = 'Mini Pizzeta 8 cms'`);
    
    // Verificación final
    const productos = await pool.query(`SELECT p.nombre, c.nombre as categoria, ROUND(p.precio_unitario, 2) as precio FROM producto p INNER JOIN categoria c ON p.id_categoria = c.id_categoria WHERE p.activo = true ORDER BY p.id_producto`);
    
    console.log('\n✅ Agregado formato de pedidos exitosamente!\n');
    console.log('📊 Verificación de precios:');
    productos.rows.forEach(r => console.log(`${r.nombre} (${r.categoria}): $${r.precio}`));
    
  } catch (err) {
    console.error('❌ Error:', err.message.split('\n')[0]);
  } finally {
    pool.end();
  }
}

addUnitFormat();
