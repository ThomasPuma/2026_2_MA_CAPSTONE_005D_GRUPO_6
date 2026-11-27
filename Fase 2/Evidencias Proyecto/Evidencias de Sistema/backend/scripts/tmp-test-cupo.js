/* Prueba temporal: verifica que el cupo no se sobrevenda con solicitudes concurrentes. */
const crypto = require('crypto');
const pool = require('../src/config/database');

const BASE = 'http://localhost:3000/api';

async function json(ruta, opciones) {
  const respuesta = await fetch(`${BASE}${ruta}`, opciones);
  const datos = await respuesta.json().catch(() => ({}));
  return { status: respuesta.status, datos };
}

(async () => {
  const catalogo = await json('/productos');
  const primera = catalogo.datos.datos
    .flatMap((producto) => producto.presentaciones || [])
    .find(Boolean);

  if (!primera) throw new Error('No hay presentaciones en el catálogo.');

  const disponibilidad = await json('/pedidos/disponibilidad');
  const dia = disponibilidad.datos.dias.find((d) => d.disponible);
  if (!dia) throw new Error('No hay días con cupo para probar.');

  const capacidad = disponibilidad.datos.config.capacidadPedidosPorDia;
  const intentos = capacidad + 4;

  const carga = {
    nombre_cliente: 'TEST CUPO',
    telefono: '+56 9 1111 2222',
    tipo_entrega: 'retiro',
    metodo_pago: 'efectivo',
    fecha_entrega: dia.fecha,
    items: [{ id_presentacion: primera.id_presentacion, cantidad: 1 }],
  };

  const resultados = await Promise.all(
    Array.from({ length: intentos }, () =>
      json('/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...carga,
          clave_solicitud: `test-cupo-${crypto.randomUUID()}`,
        }),
      })
    )
  );

  const creados = resultados.filter((r) => r.status === 201).length;
  const rechazados = resultados.filter((r) => r.status === 409).length;
  const otros = resultados.filter((r) => r.status !== 201 && r.status !== 409);

  console.log(
    [
      `Fecha probada: ${dia.fecha}`,
      `Capacidad: ${capacidad}`,
      `Intentos simultáneos: ${intentos}`,
      `Creados: ${creados}`,
      `Rechazados por cupo (409): ${rechazados}`,
      `Otros errores: ${otros.length}`,
    ].join('\n')
  );

  if (otros.length) console.log(otros.map((r) => `${r.status}: ${r.datos.mensaje}`).join('\n'));

  const conteo = await pool.query(
    `SELECT COUNT(*)::int AS total FROM PEDIDO
     WHERE fecha_entrega = $1::date AND estado <> 'cancelado'`,
    [dia.fecha]
  );

  console.log(`Pedidos activos en la base para esa fecha: ${conteo.rows[0].total}`);
  console.log(conteo.rows[0].total <= capacidad ? 'OK: no se sobrevendió el cupo.' : 'FALLO: cupo sobrevendido.');

  const limpieza = await pool.query(
    `DELETE FROM DETALLE_PEDIDO WHERE id_pedido IN
       (SELECT id_pedido FROM PEDIDO WHERE nombre_cliente = 'TEST CUPO')
     RETURNING id_detalle`
  );
  const borrados = await pool.query(
    `DELETE FROM PEDIDO WHERE nombre_cliente = 'TEST CUPO' RETURNING id_pedido`
  );

  console.log(`Limpieza: ${borrados.rowCount} pedidos y ${limpieza.rowCount} detalles eliminados.`);

  await pool.end();
})().catch(async (error) => {
  console.error('Error en la prueba:', error);
  await pool.end().catch(() => {});
  process.exit(1);
});
