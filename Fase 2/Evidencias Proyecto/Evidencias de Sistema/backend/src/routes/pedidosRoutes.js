const express = require('express');
const router = express.Router();
const pedidosController = require('../controllers/pedidosController');
const requireAdmin = require('../middleware/requireAdmin');
const { limitador } = require('../middleware/limitador');

const limiteCodigo = limitador({
  ventanaMs: 60 * 1000,
  max: 30,
  mensaje: 'Demasiadas consultas seguidas. Intenta nuevamente en un minuto.',
});
const limitePedidos = limitador({
  ventanaMs: 60 * 1000,
  max: 20,
  mensaje: 'Demasiados intentos de pedido. Intenta nuevamente en un minuto.',
});

/* Rutas públicas (carrito sin login) */
router.get('/disponibilidad', pedidosController.obtenerDisponibilidad);
router.get('/codigo/:codigo', limiteCodigo.middleware, pedidosController.obtenerPedidoPorCodigo);
router.post('/', limitePedidos.middleware, pedidosController.crearPedido);

/* Rutas del panel interno */
router.get('/configuracion', requireAdmin, pedidosController.obtenerConfiguracionAdmin);
router.put('/configuracion', requireAdmin, pedidosController.actualizarConfiguracion);
router.patch('/:id/pago', requireAdmin, pedidosController.actualizarEstadoPago);
router.patch('/:id/estado', requireAdmin, pedidosController.actualizarEstadoPedido);
router.get('/', requireAdmin, pedidosController.listarPedidos);

module.exports = router;
