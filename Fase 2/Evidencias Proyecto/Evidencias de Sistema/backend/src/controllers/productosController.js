const pool = require('../config/database');

exports.obtenerProductos = async (req, res) => {
  try {
    const query = `
      SELECT 
        p.id_producto,
        p.nombre,
        p.descripcion,
        p.precio_unitario,
        p.imagen_url,
        c.nombre AS categoria,
        i.stock_actual,
        i.stock_critico,
        (i.stock_actual <= i.stock_critico) AS en_alerta_critica
      FROM PRODUCTO p
      INNER JOIN CATEGORIA c ON p.id_categoria = c.id_categoria
      INNER JOIN INVENTARIO i ON p.id_producto = i.id_producto
      WHERE p.activo = true
      ORDER BY p.id_producto ASC;
    `;
    const resultado = await pool.query(query);
    
    return res.status(200).json({
      exito: true,
      datos: resultado.rows
    });
  } catch (error) {
    console.error('Error al consultar catálogo en la BD:', error);
    return res.status(500).json({
      exito: false,
      mensaje: 'Error en el servidor al consultar la base de datos.'
    });
  }
};