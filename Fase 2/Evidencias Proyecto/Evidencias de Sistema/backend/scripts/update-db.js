const { Pool } = require('pg');

async function executeSQL() {
  const pool = new Pool({ host: 'localhost', user: 'postgres', password: 'admin', database: 'matteo_masas_db', port: 5432 });
  
  try {
    console.log('=== Ejecutando actualizaciones de base de datos ===\n');
    
    const queries = [
      "INSERT INTO CATEGORIA (nombre) VALUES ('Empanadas') ON CONFLICT DO NOTHING",
      "UPDATE PRODUCTO SET activo = true WHERE nombre IN ('Pan de Completo', 'Marraqueta Tradicional', 'Empanada de Pino Horno')",
      "DELETE FROM INVENTARIO WHERE id_producto IN (1,2,3)",
      "INSERT INTO INVENTARIO (id_producto, stock_actual, stock_critico) VALUES (1, 15, 20) ON CONFLICT DO NOTHING, (2, 85, 20) ON CONFLICT DO NOTHING, (3, 10, 10) ON CONFLICT DO NOTHING"
    ];
    
    for (const sql of queries) {
      console.log(`Ejecutando: ${sql.substring(0, 60)}...`);
      await pool.query(sql);
      console.log('✅ Ejecutado exitosamente\n');
    }
    
    // Verificación final
    const categories = await pool.query('SELECT * FROM CATEGORIA ORDER BY id_categoria');
    console.log('📊 Categorías en BD:');
    console.table(categories.rows);
    
    const products = await pool.query('SELECT p.id_producto, p.nombre, c.nombre as categoria FROM PRODUCTO p INNER JOIN CATEGORIA c ON p.id_categoria = c.id_categoria WHERE p.activo=true ORDER BY p.id_producto');
    console.log('\n📊 Productos activos en BD:');
    console.table(products.rows);
    
    const inventario = await pool.query('SELECT * FROM INVENTARIO WHERE id_producto IN (1,2,3) ORDER BY id_inventario');
    console.log('\n📊 Inventario:');
    console.table(inventario.rows);
    
  } catch (err) {
    console.error('❌ Error:', err.message.split('\n')[0]);
  } finally {
    pool.end();
  }
}

executeSQL();
