/**
 * Limitador de solicitudes en memoria por IP. Suficiente para una tienda de
 * un solo servidor; si se escala, conviene usar un almacén compartido.
 */
function limitador({ ventanaMs, max, mensaje }) {
  const registros = new Map();

  function limpiar(ahora) {
    for (const [ip, registro] of registros) {
      if (registro.inicio + ventanaMs < ahora) registros.delete(ip);
    }
  }

  function obtener(req) {
    const ahora = Date.now();
    if (registros.size > 5000) limpiar(ahora);

    const ip = req.ip || 'desconocida';
    let registro = registros.get(ip);

    if (!registro || registro.inicio + ventanaMs < ahora) {
      registro = { inicio: ahora, cuenta: 0 };
      registros.set(ip, registro);
    }

    return registro;
  }

  return {
    bloqueado(req) {
      return obtener(req).cuenta >= max;
    },
    registrar(req) {
      obtener(req).cuenta += 1;
    },
    responder(res) {
      return res.status(429).json({ exito: false, mensaje });
    },
    middleware(req, res, next) {
      const registro = obtener(req);
      if (registro.cuenta >= max) return res.status(429).json({ exito: false, mensaje });
      registro.cuenta += 1;
      return next();
    },
  };
}

module.exports = { limitador };
