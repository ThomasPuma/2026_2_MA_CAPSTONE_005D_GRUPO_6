const pool = require('../config/database');

/* ------------------------------------------------------------------ */
/* Utilidades                                                         */
/* ------------------------------------------------------------------ */

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function textoOpcional(valor) {
  const limpio = texto(valor);
  return limpio === '' ? null : limpio;
}

function redondear(numero) {
  return Math.round((Number(numero) + Number.EPSILON) * 100) / 100;
}

function responderErrorBaseDatos(res, error) {
  if (error && error.code === '42P01') {
    return res.status(503).json({
      exito: false,
      mensaje:
        'La base de datos aún no tiene el catálogo. Ejecuta "npm run migrate" en la carpeta backend.',
    });
  }

  if (error && error.code === '23503') {
    return res.status(400).json({
      exito: false,
      mensaje: 'La categoría indicada no existe.',
    });
  }

  if (error && error.code === '23505') {
    return res.status(400).json({
      exito: false,
      mensaje: 'Ya existe un formato con ese nombre para este producto.',
    });
  }

  console.error('Error de base de datos en productos:', error);
  return res.status(500).json({
    exito: false,
    mensaje: 'Ocurrió un error al procesar la solicitud.',
  });
}

/**
 * Devuelve la lista de productos con sus presentaciones. Si `soloActivos` es
 * true se usa para la tienda pública; el panel interno ve también los inactivos.
 */
async function consultarProductos(soloActivos) {
  const resultado = await pool.query(
    `
    SELECT
      p.id_producto,
      p.id_categoria,
      p.nombre,
      p.descripcion,
      p.imagen_url,
      p.activo,
      p.grupo,
      p.variante,
      c.nombre AS categoria,
      COALESCE(
        json_agg(
          json_build_object(
            'id_presentacion', pr.id_presentacion,
            'etiqueta', pr.etiqueta,
            'cantidad', pr.cantidad::float8,
            'unidad', pr.unidad,
            'precio', pr.precio::float8,
            'orden', pr.orden
          )
          ORDER BY pr.orden, pr.id_presentacion
        ) FILTER (WHERE pr.id_presentacion IS NOT NULL),
        '[]'::json
      ) AS presentaciones
    FROM PRODUCTO p
    INNER JOIN CATEGORIA c ON p.id_categoria = c.id_categoria
    LEFT JOIN PRESENTACION pr ON pr.id_producto = p.id_producto
    ${soloActivos ? 'WHERE p.activo = true' : ''}
    GROUP BY p.id_producto, c.nombre
    ORDER BY c.nombre ASC, p.grupo ASC NULLS LAST, p.nombre ASC
    `
  );

  return resultado.rows;
}

async function consultarProductoPorId(idProducto) {
  const resultado = await pool.query(
    `
    SELECT
      p.id_producto,
      p.id_categoria,
      p.nombre,
      p.descripcion,
      p.imagen_url,
      p.activo,
      p.grupo,
      p.variante,
      c.nombre AS categoria,
      COALESCE(
        json_agg(
          json_build_object(
            'id_presentacion', pr.id_presentacion,
            'etiqueta', pr.etiqueta,
            'cantidad', pr.cantidad::float8,
            'unidad', pr.unidad,
            'precio', pr.precio::float8,
            'orden', pr.orden
          )
          ORDER BY pr.orden, pr.id_presentacion
        ) FILTER (WHERE pr.id_presentacion IS NOT NULL),
        '[]'::json
      ) AS presentaciones
    FROM PRODUCTO p
    INNER JOIN CATEGORIA c ON p.id_categoria = c.id_categoria
    LEFT JOIN PRESENTACION pr ON pr.id_producto = p.id_producto
    WHERE p.id_producto = $1
    GROUP BY p.id_producto, c.nombre
    `,
    [idProducto]
  );

  return resultado.rows[0] || null;
}

function validarProducto(datos) {
  const errores = [];
  const nombre = texto(datos.nombre);
  const descripcion = textoOpcional(datos.descripcion);
  const imagenUrl = textoOpcional(datos.imagen_url || datos.imagenUrl);
  const grupo = textoOpcional(datos.grupo);
  const variante = textoOpcional(datos.variante);
  const idCategoria = Number(datos.id_categoria || datos.idCategoria);
  const activo =
    datos.activo === undefined ? true : Boolean(datos.activo);
  const presentacionesBrutas = Array.isArray(datos.presentaciones)
    ? datos.presentaciones
    : [];

  if (nombre.length < 2 || nombre.length > 150) {
    errores.push('El nombre del producto debe tener entre 2 y 150 caracteres.');
  }

  if (!Number.isInteger(idCategoria) || idCategoria <= 0) {
    errores.push('Selecciona una categoría válida.');
  }

  if (descripcion && descripcion.length > 1000) {
    errores.push('La descripción no puede superar los 1000 caracteres.');
  }

  if (imagenUrl && imagenUrl.length > 255) {
    errores.push('La ruta de la imagen no puede superar los 255 caracteres.');
  }

  if (grupo && grupo.length > 150) {
    errores.push('El grupo no puede superar los 150 caracteres.');
  }

  if (variante && variante.length > 100) {
    errores.push('La variante no puede superar los 100 caracteres.');
  }

  if (presentacionesBrutas.length === 0) {
    errores.push('Agrega al menos un formato con su precio.');
  }

  if (presentacionesBrutas.length > 20) {
    errores.push('Un producto no puede tener más de 20 formatos.');
  }

  const presentaciones = [];

  presentacionesBrutas.forEach((presentacion, indice) => {
    const posicion = indice + 1;
    const idPresentacion = presentacion?.id_presentacion
      ? Number(presentacion.id_presentacion)
      : null;
    const etiqueta = texto(presentacion?.etiqueta);
    const cantidad = Number(presentacion?.cantidad);
    const unidad = texto(presentacion?.unidad) || 'unidad';
    const precio = Number(presentacion?.precio);
    const orden =
      presentacion?.orden === undefined || presentacion?.orden === null
        ? posicion
        : Number(presentacion.orden);

    if (!etiqueta || etiqueta.length > 100) {
      errores.push(
        `Formato ${posicion}: indica un nombre de hasta 100 caracteres.`
      );
    }

    if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 100000) {
      errores.push(
        `Formato ${posicion}: la cantidad debe ser mayor que 0.`
      );
    }

    if (unidad.length > 20) {
      errores.push(`Formato ${posicion}: la unidad es demasiado larga.`);
    }

    if (!Number.isFinite(precio) || precio <= 0 || precio > 9999999) {
      errores.push(
        `Formato ${posicion}: el precio debe ser mayor que 0.`
      );
    }

    if (!Number.isInteger(orden) || orden < 1) {
      errores.push(`Formato ${posicion}: el orden no es válido.`);
    }

    presentaciones.push({
      idPresentacion:
        Number.isInteger(idPresentacion) && idPresentacion > 0
          ? idPresentacion
          : null,
      etiqueta,
      cantidad: redondear(cantidad),
      unidad,
      precio: redondear(precio),
      orden: Number.isInteger(orden) && orden > 0 ? orden : posicion,
    });
  });

  const etiquetas = presentaciones.map((presentacion) =>
    presentacion.etiqueta.toLowerCase()
  );

  if (new Set(etiquetas).size !== etiquetas.length) {
    errores.push('No repitas el mismo nombre de formato en un producto.');
  }

  return {
    errores,
    datos: {
      idCategoria,
      nombre,
      descripcion,
      imagenUrl,
      grupo,
      variante,
      activo,
      presentaciones,
    },
  };
}

async function sincronizarPresentaciones(client, idProducto, presentaciones) {
  const existentes = await client.query(
    'SELECT id_presentacion FROM PRESENTACION WHERE id_producto = $1',
    [idProducto]
  );

  const idsExistentes = new Set(
    existentes.rows.map((fila) => Number(fila.id_presentacion))
  );
  const idsConservados = presentaciones
    .filter(
      (presentacion) =>
        presentacion.idPresentacion &&
        idsExistentes.has(presentacion.idPresentacion)
    )
    .map((presentacion) => presentacion.idPresentacion);

  // Primero se eliminan los formatos quitados para no chocar con la
  // restricción UNIQUE al renombrar los que se conservan.
  await client.query(
    `
    DELETE FROM PRESENTACION
    WHERE id_producto = $1
      AND id_presentacion <> ALL($2::int[])
    `,
    [idProducto, idsConservados]
  );

  for (const presentacion of presentaciones) {
    const idValido = idsConservados.includes(presentacion.idPresentacion);

    if (idValido) {
      await client.query(
        `
        UPDATE PRESENTACION
        SET etiqueta = $1, cantidad = $2, unidad = $3, precio = $4, orden = $5
        WHERE id_presentacion = $6 AND id_producto = $7
        `,
        [
          presentacion.etiqueta,
          presentacion.cantidad,
          presentacion.unidad,
          presentacion.precio,
          presentacion.orden,
          presentacion.idPresentacion,
          idProducto,
        ]
      );

      idsConservados.push(presentacion.idPresentacion);
    } else {
      const insertado = await client.query(
        `
        INSERT INTO PRESENTACION
          (id_producto, etiqueta, cantidad, unidad, precio, orden)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id_presentacion
        `,
        [
          idProducto,
          presentacion.etiqueta,
          presentacion.cantidad,
          presentacion.unidad,
          presentacion.precio,
          presentacion.orden,
        ]
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* Tienda pública                                                     */
/* ------------------------------------------------------------------ */

exports.obtenerProductos = async (req, res) => {
  try {
    // Modelo por pedidos: no existe stock. La web solo muestra los precios
    // por paquete o formato de venta registrados en PRESENTACION.
    const datos = await consultarProductos(true);

    return res.status(200).json({
      exito: true,
      datos,
    });
  } catch (error) {
    console.error('Error al consultar catálogo en la BD:', error);
    return res.status(500).json({
      exito: false,
      mensaje: 'Error en el servidor al consultar la base de datos.',
    });
  }
};

/* ------------------------------------------------------------------ */
/* Panel interno: catálogo                                            */
/* ------------------------------------------------------------------ */

exports.listarProductosAdmin = async (req, res) => {
  try {
    const productos = await consultarProductos(false);
    const categorias = await pool.query(
      'SELECT id_categoria, nombre FROM CATEGORIA ORDER BY nombre ASC'
    );

    return res.status(200).json({
      exito: true,
      productos,
      categorias: categorias.rows,
    });
  } catch (error) {
    return responderErrorBaseDatos(res, error);
  }
};

exports.listarCategorias = async (req, res) => {
  try {
    const resultado = await pool.query(
      'SELECT id_categoria, nombre FROM CATEGORIA ORDER BY nombre ASC'
    );

    return res.status(200).json({
      exito: true,
      categorias: resultado.rows,
    });
  } catch (error) {
    return responderErrorBaseDatos(res, error);
  }
};

exports.crearProducto = async (req, res) => {
  const { errores, datos } = validarProducto(req.body || {});

  if (errores.length > 0) {
    return res.status(400).json({
      exito: false,
      mensaje: errores[0],
      errores,
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const insertado = await client.query(
      `
      INSERT INTO PRODUCTO
        (id_categoria, nombre, descripcion, imagen_url, activo, grupo, variante)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id_producto
      `,
      [
        datos.idCategoria,
        datos.nombre,
        datos.descripcion,
        datos.imagenUrl,
        datos.activo,
        datos.grupo,
        datos.variante,
      ]
    );

    const idProducto = insertado.rows[0].id_producto;

    await sincronizarPresentaciones(client, idProducto, datos.presentaciones);

    await client.query('COMMIT');

    const producto = await consultarProductoPorId(idProducto);

    return res.status(201).json({
      exito: true,
      mensaje: 'Producto creado correctamente.',
      producto,
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // La transacción pudo haber sido abortada por PostgreSQL.
    }

    return responderErrorBaseDatos(res, error);
  } finally {
    client.release();
  }
};

exports.actualizarProducto = async (req, res) => {
  const idProducto = Number(req.params.id);

  if (!Number.isInteger(idProducto) || idProducto <= 0) {
    return res
      .status(400)
      .json({ exito: false, mensaje: 'El producto indicado no es válido.' });
  }

  const { errores, datos } = validarProducto(req.body || {});

  if (errores.length > 0) {
    return res.status(400).json({
      exito: false,
      mensaje: errores[0],
      errores,
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const actualizado = await client.query(
      `
      UPDATE PRODUCTO
      SET
        id_categoria = $1,
        nombre = $2,
        descripcion = $3,
        imagen_url = $4,
        activo = $5,
        grupo = $6,
        variante = $7
      WHERE id_producto = $8
      RETURNING id_producto
      `,
      [
        datos.idCategoria,
        datos.nombre,
        datos.descripcion,
        datos.imagenUrl,
        datos.activo,
        datos.grupo,
        datos.variante,
        idProducto,
      ]
    );

    if (actualizado.rows.length === 0) {
      throw Object.assign(new Error('No encontramos ese producto.'), {
        status: 404,
      });
    }

    await sincronizarPresentaciones(client, idProducto, datos.presentaciones);

    await client.query('COMMIT');

    const producto = await consultarProductoPorId(idProducto);

    return res.status(200).json({
      exito: true,
      mensaje: 'Producto actualizado correctamente.',
      producto,
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // La transacción pudo haber sido abortada por PostgreSQL.
    }

    if (error && error.status === 404) {
      return res
        .status(404)
        .json({ exito: false, mensaje: 'No encontramos ese producto.' });
    }

    return responderErrorBaseDatos(res, error);
  } finally {
    client.release();
  }
};

exports.actualizarEstadoProducto = async (req, res) => {
  const idProducto = Number(req.params.id);
  const activo = req.body?.activo;

  if (!Number.isInteger(idProducto) || idProducto <= 0) {
    return res
      .status(400)
      .json({ exito: false, mensaje: 'El producto indicado no es válido.' });
  }

  if (typeof activo !== 'boolean') {
    return res.status(400).json({
      exito: false,
      mensaje: 'Indica si el producto debe quedar activo o inactivo.',
    });
  }

  try {
    const resultado = await pool.query(
      `
      UPDATE PRODUCTO
      SET activo = $1
      WHERE id_producto = $2
      RETURNING id_producto, activo
      `,
      [activo, idProducto]
    );

    if (resultado.rows.length === 0) {
      return res
        .status(404)
        .json({ exito: false, mensaje: 'No encontramos ese producto.' });
    }

    return res.status(200).json({
      exito: true,
      mensaje: activo
        ? 'Producto activado en la tienda.'
        : 'Producto desactivado de la tienda.',
      producto: resultado.rows[0],
    });
  } catch (error) {
    return responderErrorBaseDatos(res, error);
  }
};
