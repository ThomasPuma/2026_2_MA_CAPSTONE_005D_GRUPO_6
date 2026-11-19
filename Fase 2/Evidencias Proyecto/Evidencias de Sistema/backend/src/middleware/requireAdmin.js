const crypto = require('crypto');
const { limitador } = require('./limitador');

const limiteFallos = limitador({
  ventanaMs: 15 * 60 * 1000,
  max: 10,
  mensaje: 'Demasiados intentos fallidos. Espera 15 minutos e intenta nuevamente.',
});

function claveCoincide(recibida, esperada) {
  const a = Buffer.from(String(recibida));
  const b = Buffer.from(String(esperada));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Protege las rutas del panel interno. La clave viaja solo en el header
 * x-admin-key. Si ADMIN_KEY no está configurada, las rutas privadas se
 * bloquean (nunca quedan abiertas).
 */
function requireAdmin(req, res, next) {
  const ADMIN_KEY = process.env.ADMIN_KEY;

  if (!ADMIN_KEY) {
    return res.status(503).json({
      exito: false,
      mensaje:
        'El panel no está configurado. Define ADMIN_KEY en backend/.env y reinicia el servidor.',
    });
  }

  if (limiteFallos.bloqueado(req)) {
    return limiteFallos.responder(res);
  }

  const clave = req.get('x-admin-key') || '';

  if (claveCoincide(clave, ADMIN_KEY)) return next();

  limiteFallos.registrar(req);

  return res.status(401).json({
    exito: false,
    mensaje: 'Clave de administración incorrecta o faltante.',
  });
}

module.exports = requireAdmin;
