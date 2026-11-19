/**
 * Sincroniza el catálogo de Matteo Masas con los precios por paquete
 * que entrega la dueña. Es idempotente: se puede ejecutar varias veces.
 *
 * Uso:  npm run seed
 */
require('dotenv').config();
const pool = require('../src/config/database');

const p = (etiqueta, cantidad, unidad, precio, orden = 1) => ({
  etiqueta,
  cantidad,
  unidad,
  precio,
  orden,
});

/* ------------------------------------------------------------------ */
/* Imagen de cada producto (archivos reales en frontend/images)        */
/* ------------------------------------------------------------------ */
const IMAGENES = {
  13: 'images/PanCompletos.jpg',
  14: 'images/PanCompletos.jpg',
  15: 'images/PanCompletos.jpg',
  16: 'images/PanFrica.jpg',
  17: 'images/PanFrica.jpg',
  18: 'images/PanCanapeyTapadito.jpg',
  19: 'images/PandeColores.jpg',
  20: 'images/MasasFritas.jpg',
  21: 'images/MasasFritas.jpg',
  22: 'images/MasasFritas.jpg',
  23: 'images/MasasHorno.jpg',
  24: 'images/MasasHorno.jpg',
  25: 'images/MasasHorno.jpg',
  26: 'images/MasasHorno.jpg',
  27: 'images/MasasHorno.jpg',
  28: 'images/MasasSopaipillaCoctel.jpg',
  29: 'images/MasasSopaipillaNormal.jpg',
  30: 'images/CalzonRoto.jpg',
  32: 'images/EmpanadasQueso.jpg',
  33: 'images/EmpanadasQueso.jpg',
  34: 'images/EmpanadasCoctelHorno.jpg',
  35: 'images/MiniCupcakes.jpg',
  36: 'images/AlgodonAzucar.jpg',
  37: 'images/Cabritas.jpg',
  38: 'images/MiniDonas.jpg',
  39: 'images/BerlinesMedianos.jpg',
  40: 'images/MiniBerlines.jpg',
  41: 'images/CakePop.jpg',
  42: 'images/MiniPizzeta.jpg',
};

/* ------------------------------------------------------------------ */
/* Catálogo oficial (precios por paquete, nunca por unidad suelta)     */
/* ------------------------------------------------------------------ */
const CATALOGO = [
  /* --- PANES --- */
  {
    id: 13,
    nombre: 'Pan de Completo Normal',
    categoria: 'Panes',
    grupo: 'Pan de Completo',
    variante: 'Normal',
    descripcion: 'Pan fresco ideal para completos. Se vende en paquete de 10 unidades.',
    presentaciones: [p('10 unidades', 10, 'unidad', 2000)],
  },
  {
    id: 14,
    nombre: 'Pan de Completo Cóctel',
    categoria: 'Panes',
    grupo: 'Pan de Completo',
    variante: 'Cóctel',
    descripcion: 'Pan cóctel fresco para completos. Se vende en paquete de 10 unidades.',
    presentaciones: [p('10 unidades', 10, 'unidad', 1200)],
  },
  {
    id: 15,
    nombre: 'Pan de Completo Choripán',
    categoria: 'Panes',
    grupo: 'Pan de Completo',
    variante: 'Choripán',
    descripcion: 'Pan fresco para choripán. Se vende en paquete de 10 unidades.',
    presentaciones: [p('10 unidades', 10, 'unidad', 1400)],
  },
  {
    id: 16,
    nombre: 'Pan de Frica Normal',
    categoria: 'Panes',
    grupo: 'Pan de Frica',
    variante: 'Normal',
    descripcion: 'Pan fresco para fricas. Se vende en paquete de 10 unidades.',
    presentaciones: [p('10 unidades', 10, 'unidad', 2000)],
  },
  {
    id: 17,
    nombre: 'Pan de Frica Cóctel',
    categoria: 'Panes',
    grupo: 'Pan de Frica',
    variante: 'Cóctel',
    descripcion: 'Pan cóctel fresco para fricas. Se vende en paquete de 10 unidades.',
    presentaciones: [p('10 unidades', 10, 'unidad', 1200)],
  },
  {
    id: 18,
    nombre: 'Pan de Canapé y Tapadito',
    categoria: 'Panes',
    descripcion: 'Pan de canapé y tapadito listo. Se vende por kilo.',
    presentaciones: [p('1 kilo', 1, 'kg', 2500)],
  },
  {
    id: 19,
    nombre: 'Pan Mini Completo / Mini Frica',
    categoria: 'Panes',
    descripcion:
      'Pan de colores mini para completos o fricas. Se vende en paquete de 10 unidades.',
    presentaciones: [p('10 unidades', 10, 'unidad', 1500)],
  },

  /* --- MASAS --- */
  {
    id: 20,
    nombre: 'Masa Frita 12 cms',
    categoria: 'Masas',
    grupo: 'Masa Frita',
    variante: '12 cms',
    descripcion: 'Masas fritas artesanales de 12 cms. Paquete de 20 unidades.',
    presentaciones: [p('20 unidades', 20, 'unidad', 2200)],
  },
  {
    id: 21,
    nombre: 'Masa Frita 15 cms',
    categoria: 'Masas',
    grupo: 'Masa Frita',
    variante: '15 cms',
    descripcion: 'Masas fritas artesanales de 15 cms. Paquete de 20 unidades.',
    presentaciones: [p('20 unidades', 20, 'unidad', 3000)],
  },
  {
    id: 22,
    nombre: 'Masa Frita 18 cms',
    categoria: 'Masas',
    grupo: 'Masa Frita',
    variante: '18 cms',
    descripcion: 'Masas fritas artesanales de 18 cms. Paquete de 20 unidades.',
    presentaciones: [p('20 unidades', 20, 'unidad', 3400)],
  },
  {
    id: 23,
    nombre: 'Masa Horno 12 cms',
    categoria: 'Masas',
    grupo: 'Masa Horno',
    variante: '12 cms',
    descripcion: 'Masas de horno artesanales de 12 cms. Paquete de 20 unidades.',
    presentaciones: [p('20 unidades', 20, 'unidad', 2400)],
  },
  {
    id: 24,
    nombre: 'Masa Horno 15 cms',
    categoria: 'Masas',
    grupo: 'Masa Horno',
    variante: '15 cms',
    descripcion: 'Masas de horno artesanales de 15 cms. Paquete de 20 unidades.',
    presentaciones: [p('20 unidades', 20, 'unidad', 3400)],
  },
  {
    id: 25,
    nombre: 'Masa Horno 18 cms',
    categoria: 'Masas',
    grupo: 'Masa Horno',
    variante: '18 cms',
    descripcion: 'Masas de horno artesanales de 18 cms. Paquete de 20 unidades.',
    presentaciones: [p('20 unidades', 20, 'unidad', 3800)],
  },
  {
    id: 26,
    nombre: 'Masa Horno 20 cms',
    categoria: 'Masas',
    grupo: 'Masa Horno',
    variante: '20 cms',
    descripcion: 'Masas de horno artesanales de 20 cms. Paquete de 20 unidades.',
    presentaciones: [p('20 unidades', 20, 'unidad', 4000)],
  },
  {
    id: 27,
    nombre: 'Masa Horno 22 cms',
    categoria: 'Masas',
    grupo: 'Masa Horno',
    variante: '22 cms',
    descripcion: 'Masas de horno artesanales de 22 cms. Paquete de 20 unidades.',
    presentaciones: [p('20 unidades', 20, 'unidad', 5000)],
  },
  {
    id: 28,
    nombre: 'Masa Sopaipilla Cóctel',
    categoria: 'Masas',
    grupo: 'Sopaipillas',
    variante: 'Cóctel',
    descripcion: 'Sopaipillas cóctel de elaboración casera. Paquete de 50 unidades.',
    presentaciones: [p('50 unidades', 50, 'unidad', 4000)],
  },
  {
    id: 29,
    nombre: 'Masa Sopaipilla Normal',
    categoria: 'Masas',
    grupo: 'Sopaipillas',
    variante: 'Normal',
    descripcion: 'Sopaipillas de elaboración casera. Paquete de 20 unidades.',
    presentaciones: [p('20 unidades', 20, 'unidad', 2000)],
  },
  {
    id: 30,
    nombre: 'Calzón Roto',
    categoria: 'Masas',
    descripcion:
      'Calzón roto de elaboración casera. Disponible en paquete de 24 o 12 unidades.',
    presentaciones: [
      p('24 unidades', 24, 'unidad', 2000, 1),
      p('12 unidades', 12, 'unidad', 2000, 2),
    ],
  },

  /* --- EMPANADAS --- */
  {
    id: 32,
    nombre: 'Empanada Queso para Freír 12 cms',
    categoria: 'Empanadas',
    grupo: 'Empanada de Queso para Freír',
    variante: '12 cms',
    descripcion:
      'Empanadas de queso para freír de 12 cms. Se venden en paquete de 12 unidades.',
    presentaciones: [p('12 unidades', 12, 'unidad', 3500)],
  },
  {
    id: 33,
    nombre: 'Empanada Queso para Freír 18 cms',
    categoria: 'Empanadas',
    grupo: 'Empanada de Queso para Freír',
    variante: '18 cms',
    descripcion:
      'Empanadas de queso para freír de 18 cms. Se venden en paquete de 10 unidades.',
    presentaciones: [p('10 unidades', 10, 'unidad', 6000)],
  },
  {
    id: 34,
    nombre: 'Empanadas Cóctel de Horno',
    categoria: 'Empanadas',
    descripcion:
      'Mini empanadas de cóctel al horno, sabores pino, pollo-choclo-queso. Paquete de 50 unidades.',
    presentaciones: [p('50 unidades', 50, 'unidad', 24000)],
  },

  /* --- DULCES Y REPOSTERÍA --- */
  {
    id: 35,
    nombre: 'Mini Cupcakes',
    categoria: 'Dulces y Repostería',
    descripcion: 'Mini cupcakes artesanales. Disponibles por unidad o en paquete de 50.',
    presentaciones: [
      p('1 unidad', 1, 'unidad', 450, 1),
      p('50 unidades', 50, 'unidad', 20000, 2),
    ],
  },
  {
    id: 36,
    nombre: 'Algodón de Azúcar',
    categoria: 'Dulces y Repostería',
    descripcion:
      'Algodón de azúcar. Disponible por unidad o en paquetes de 25 y 50 unidades.',
    presentaciones: [
      p('1 unidad', 1, 'unidad', 350, 1),
      p('25 unidades', 25, 'unidad', 8500, 2),
      p('50 unidades', 50, 'unidad', 16000, 3),
    ],
  },
  {
    id: 37,
    nombre: 'Cabritas en Pote',
    categoria: 'Dulces y Repostería',
    descripcion:
      'Cabritas en pote. Disponibles por unidad o en paquetes de 25 y 50 unidades.',
    presentaciones: [
      p('1 unidad', 1, 'unidad', 350, 1),
      p('25 unidades', 25, 'unidad', 8500, 2),
      p('50 unidades', 50, 'unidad', 16000, 3),
    ],
  },
  {
    id: 38,
    nombre: 'Mini-Donas',
    categoria: 'Dulces y Repostería',
    descripcion:
      'Mini-donas con cobertura de chocolate blanco y negro. Paquetes de 50 o 100 unidades.',
    presentaciones: [
      p('50 unidades', 50, 'unidad', 12000, 1),
      p('100 unidades', 100, 'unidad', 20000, 2),
    ],
  },
  {
    id: 39,
    nombre: 'Berlines Medianos Horneados',
    categoria: 'Dulces y Repostería',
    grupo: 'Berlines Horneados',
    variante: 'Medianos',
    descripcion:
      'Berlines medianos horneados, rellenos de manjar y crema. Por unidad o en paquetes de 50 y 100 unidades.',
    presentaciones: [
      p('1 unidad', 1, 'unidad', 400, 1),
      p('50 unidades', 50, 'unidad', 19000, 2),
      p('100 unidades', 100, 'unidad', 36000, 3),
    ],
  },
  {
    id: 40,
    nombre: 'Mini Berlines Horneados',
    categoria: 'Dulces y Repostería',
    grupo: 'Berlines Horneados',
    variante: 'Mini',
    descripcion:
      'Mini berlines horneados, rellenos de manjar y crema. Por unidad o en paquete de 50 unidades.',
    presentaciones: [
      p('1 unidad', 1, 'unidad', 300, 1),
      p('50 unidades', 50, 'unidad', 12500, 2),
    ],
  },
  {
    id: 41,
    nombre: 'Cake-Pops',
    categoria: 'Dulces y Repostería',
    descripcion:
      'Cake-pops con cobertura de chocolate blanco y negro. Por unidad o en paquetes de 50 y 100 unidades.',
    presentaciones: [
      p('1 unidad', 1, 'unidad', 350, 1),
      p('50 unidades', 50, 'unidad', 17000, 2),
      p('100 unidades', 100, 'unidad', 32000, 3),
    ],
  },

  /* --- PIZZETAS --- */
  {
    id: 42,
    nombre: 'Mini Pizzetas (8 cms)',
    categoria: 'Pizzetas',
    descripcion:
      'Mini pizzetas de 8 cms. Variedades: jamón-queso-tomate-aceituna, jamón-queso-chorizo-aceituna y queso-salame-choclo-aceituna. Bandeja de 8 unidades.',
    presentaciones: [p('Bandeja de 8 unidades', 8, 'unidad', 2600)],
  },
];

async function ensureCategoria(client, nombre, nombreAnterior) {
  const existente = await client.query(
    'SELECT id_categoria FROM categoria WHERE nombre = $1',
    [nombre]
  );
  if (existente.rows.length > 0) return existente.rows[0].id_categoria;

  if (nombreAnterior) {
    const renombrada = await client.query(
      'UPDATE categoria SET nombre = $1 WHERE nombre = $2 RETURNING id_categoria',
      [nombre, nombreAnterior]
    );
    if (renombrada.rows.length > 0) return renombrada.rows[0].id_categoria;
  }

  const creada = await client.query(
    'INSERT INTO categoria (nombre) VALUES ($1) RETURNING id_categoria',
    [nombre]
  );
  return creada.rows[0].id_categoria;
}

async function main() {
  const client = await pool.connect();
  try {
    console.log('=== Sincronizando catálogo Matteo Masas ===\n');
    await client.query('BEGIN');

    // Los precios viven en PRESENTACION. Algunas bases antiguas todavía
    // tienen producto.precio_unitario; si existe se deja opcional, pero la
    // aplicación no la usa.
    const columnaPrecio = await client.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'producto'
        AND column_name = 'precio_unitario'
    `);
    const tienePrecioUnitario = columnaPrecio.rows.length > 0;

    await client.query(`
      ALTER TABLE producto ADD COLUMN IF NOT EXISTS grupo VARCHAR(150);
      ALTER TABLE producto ADD COLUMN IF NOT EXISTS variante VARCHAR(100);
    `);

    if (tienePrecioUnitario) {
      await client.query(`
        ALTER TABLE producto ALTER COLUMN precio_unitario DROP NOT NULL;
        COMMENT ON COLUMN producto.precio_unitario IS
          'Obsoleto. Los precios de venta se guardan en presentacion.precio (precio por paquete).';
      `);
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS PRESENTACION (
        id_presentacion SERIAL PRIMARY KEY,
        id_producto INT NOT NULL REFERENCES PRODUCTO(id_producto) ON DELETE CASCADE,
        etiqueta VARCHAR(100) NOT NULL,
        cantidad NUMERIC(10, 2) NOT NULL CHECK (cantidad > 0),
        unidad VARCHAR(20) NOT NULL DEFAULT 'unidad',
        precio NUMERIC(10, 2) NOT NULL CHECK (precio > 0),
        orden INT NOT NULL DEFAULT 1,
        UNIQUE (id_producto, etiqueta)
      );
    `);

    // Categorías del catálogo oficial.
    const categorias = {};
    categorias['Masas'] = await ensureCategoria(client, 'Masas', 'Masa Frita');
    categorias['Panes'] = await ensureCategoria(client, 'Panes', 'Pan Listo');
    categorias['Dulces y Repostería'] = await ensureCategoria(client, 'Dulces y Repostería', 'Dulces y Repostería Listo');
    categorias['Pizzetas'] = await ensureCategoria(client, 'Pizzetas');
    categorias['Empanadas'] = await ensureCategoria(client, 'Empanadas');

    for (const producto of CATALOGO) {
      const idCategoria = categorias[producto.categoria];
      if (!idCategoria) throw new Error(`Categoría desconocida: ${producto.categoria}`);

      const columnas = [
        'id_producto',
        'id_categoria',
        'nombre',
        'descripcion',
        'imagen_url',
      ];
      const valores = [
        producto.id,
        idCategoria,
        producto.nombre,
        producto.descripcion,
        IMAGENES[producto.id] || null,
      ];

      if (tienePrecioUnitario) {
        columnas.push('precio_unitario');
        valores.push(null);
      }

      columnas.push('activo', 'grupo', 'variante');
      valores.push(true, producto.grupo || null, producto.variante || null);

      const actualizaciones = [
        'id_categoria = EXCLUDED.id_categoria',
        'nombre = EXCLUDED.nombre',
        'descripcion = EXCLUDED.descripcion',
        'imagen_url = EXCLUDED.imagen_url',
        'activo = TRUE',
        'grupo = EXCLUDED.grupo',
        'variante = EXCLUDED.variante',
      ];

      if (tienePrecioUnitario) {
        actualizaciones.push('precio_unitario = NULL');
      }

      await client.query(
        `
        INSERT INTO producto (${columnas.join(', ')})
        VALUES (${columnas.map((_, indice) => `$${indice + 1}`).join(', ')})
        ON CONFLICT (id_producto) DO UPDATE SET
          ${actualizaciones.join(',\n          ')}
        `,
        valores
      );

      // Sincroniza las presentaciones sin cambiar sus IDs: los carritos y
      // pedidos existentes guardan referencias a id_presentacion.
      const etiquetas = producto.presentaciones.map((pres) => pres.etiqueta);

      for (const pres of producto.presentaciones) {
        await client.query(
          `
          INSERT INTO presentacion (id_producto, etiqueta, cantidad, unidad, precio, orden)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id_producto, etiqueta) DO UPDATE SET
            cantidad = EXCLUDED.cantidad,
            unidad = EXCLUDED.unidad,
            precio = EXCLUDED.precio,
            orden = EXCLUDED.orden
          `,
          [producto.id, pres.etiqueta, pres.cantidad, pres.unidad, pres.precio, pres.orden]
        );
      }

      await client.query(
        'DELETE FROM presentacion WHERE id_producto = $1 AND etiqueta <> ALL($2::text[])',
        [producto.id, etiquetas]
      );
    }

    const idsCatalogo = CATALOGO.map((producto) => producto.id);

    // Elimina los productos que ya no forman parte del catálogo oficial
    // (por ejemplo, las masas crudas que no están en la lista de la dueña).
    await client.query(
      'DELETE FROM presentacion WHERE id_producto <> ALL($1::int[])',
      [idsCatalogo]
    );

    const tablaPedidos = await client.query(
      "SELECT to_regclass('public.detalle_pedido') AS tabla"
    );

    if (tablaPedidos.rows[0].tabla) {
      await client.query(
        `
        DELETE FROM producto
        WHERE id_producto <> ALL($1::int[])
          AND NOT EXISTS (
            SELECT 1 FROM detalle_pedido dp WHERE dp.id_producto = producto.id_producto
          )
        `,
        [idsCatalogo]
      );
    } else {
      await client.query(
        'DELETE FROM producto WHERE id_producto <> ALL($1::int[])',
        [idsCatalogo]
      );
    }

    // Si algún producto fuera del catálogo tiene pedidos históricos, se oculta.
    await client.query(
      `
      UPDATE producto
      SET activo = FALSE,
          descripcion = 'Producto fuera del catálogo vigente.'
          ${tienePrecioUnitario ? ', precio_unitario = NULL' : ''}
      WHERE id_producto <> ALL($1::int[])
      `,
      [idsCatalogo]
    );

    // Los productos históricos ocultos quedan sin categoría para no dejar
    // secciones vacías en el catálogo.
    await client.query(
      `
      UPDATE producto
      SET id_categoria = NULL
      WHERE id_producto <> ALL($1::int[])
        AND activo = FALSE
      `,
      [idsCatalogo]
    );

    // Elimina categorías que quedaron vacías.
    await client.query(`
      DELETE FROM categoria c
      WHERE NOT EXISTS (
        SELECT 1 FROM producto p WHERE p.id_categoria = c.id_categoria
      )
    `);

    // Ajusta la secuencia por si el catálogo se cargó con IDs explícitos.
    await client.query(`
      SELECT setval(
        pg_get_serial_sequence('producto', 'id_producto'),
        (SELECT COALESCE(MAX(id_producto), 1) FROM producto)
      )
    `);

    await client.query('COMMIT');
    console.log('✅ Catálogo y presentaciones actualizados.\n');

    const resumen = await client.query(`
      SELECT p.id_producto, p.nombre, c.nombre AS categoria,
             json_agg(pr.etiqueta || ' $' || pr.precio ORDER BY pr.orden) AS precios
      FROM producto p
      INNER JOIN categoria c ON c.id_categoria = p.id_categoria
      INNER JOIN presentacion pr ON pr.id_producto = p.id_producto
      WHERE p.activo = TRUE
      GROUP BY p.id_producto, p.nombre, c.nombre
      ORDER BY p.id_producto
    `);
    console.table(
      resumen.rows.map((r) => ({
        id: r.id_producto,
        producto: r.nombre,
        categoria: r.categoria,
        precios: r.precios.join(' | '),
      }))
    );
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error al sincronizar el catálogo:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
