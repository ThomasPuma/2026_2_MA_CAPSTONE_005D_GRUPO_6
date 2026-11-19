const pg = require('pg');

(async () => {
  const pool = new pg.Pool({ user: 'postgres', password: 'admin', database: 'matteo_masas_db', port: 5432, host: 'localhost' });
  
  await runUpdate(pool);
  
  async function runUpdate(pool) {
    console.log('1. Insertando categoría Empanadas...');
    await pool.query('INSERT INTO CATEGORIA (nombre) VALUES ($1) ON CONFLICT DO NOTHING', ['Empanadas']);

    console.log('2. Actualizando productos como activos...');
    await pool.query("UPDATE PRODUCTO SET activo = $1 WHERE nombre IN ($2, $3, $4)", [true, 'Pan de Completo (Bolsa 10 un.)', 'Marraqueta Tradicional (1 Kg)', 'Empanada de Pino Horno']);

    console.log('3. Insertando inventario correcto...');
    const invSQL = "INSERT INTO INVENTARIO (id_producto, stock_actual, stock_critico) VALUES (" + [
      [1, 15, 20], [2, 85, 20], [3, 10, 10]
    ].join(', ') + ") ON CONFLICT DO NOTHING";

    await pool.query(invSQL);

    console.log('\n=== Verificando datos ===');
    
    // Categorias
    const cats = await pool.query('SELECT * FROM CATEGORIA ORDER BY id_categoria');
    console.log('\nCategorías:');
    console.table(cats.rows);

    // Productos
    const prodSQL = "SELECT p.id, p.nombre, c.nombre as cat FROM PRODUCTO p INNER JOIN CATEGORIA c ON p.id_categoria = c.id_categoria WHERE p.activo=true ORDER BY p.id";
    const prods = await pool.query(prodSQL);
    console.log('\nProductos activos:');
    console.table(prods.rows);

    // Inventario
    const invs = await pool.query("SELECT * FROM INVENTARIO WHERE id_producto IN (1,2,3) ORDER BY id_inventario");
    console.log('\nInventario:');
    console.table(invs.rows);
  }
  
  try {
    // Verificar conexión primero
    await pool.query('SELECT 1');
    console.log('✅ Conexión exitosa\n');
  } catch (err) {
    console.error('❌ Error de conexión:', err.message.split('\n')[0]);
  } finally {
    pool.end();
  }
})();
