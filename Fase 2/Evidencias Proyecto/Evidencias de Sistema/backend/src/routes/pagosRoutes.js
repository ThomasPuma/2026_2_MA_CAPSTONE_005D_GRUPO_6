const express = require('express');
const router = express.Router();
const pagosController = require('../controllers/pagosController');

/* Retorno de Transbank (Webpay POST con token_ws o TBK_ORDEN_COMPRA) */
router.post('/webpay/retorno', pagosController.retornoWebpay);
router.get('/webpay/retorno', pagosController.retornoWebpay);

module.exports = router;
