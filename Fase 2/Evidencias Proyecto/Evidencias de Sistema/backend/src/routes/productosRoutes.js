const express = require('express');
const router = express.Router();
const productosController = require('../controllers/productosController');
const requireAdmin = require('../middleware/requireAdmin');

/* Catálogo público */
router.get('/', productosController.obtenerProductos);

/* Panel interno */
router.get('/admin', requireAdmin, productosController.listarProductosAdmin);
router.get('/categorias', requireAdmin, productosController.listarCategorias);
router.post('/', requireAdmin, productosController.crearProducto);
router.put('/:id', requireAdmin, productosController.actualizarProducto);
router.patch('/:id/estado', requireAdmin, productosController.actualizarEstadoProducto);

module.exports = router;
