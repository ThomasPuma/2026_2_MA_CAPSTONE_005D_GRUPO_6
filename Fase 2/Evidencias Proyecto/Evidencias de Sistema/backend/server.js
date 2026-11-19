const express = require('express');
const path = require('path'); // Importamos path
require('dotenv').config();

const productosRoutes = require('./src/routes/productosRoutes');
const pedidosRoutes = require('./src/routes/pedidosRoutes');
const pagosRoutes = require('./src/routes/pagosRoutes');
const { obtenerConfiguracionWebpay } = require('./src/services/webpay');

const app = express();
const PORT = process.env.PORT || 3000;

// Necesario para construir la URL de retorno cuando el sitio está detrás
// de un proxy (por ejemplo, un hosting con HTTPS).
// Solo se confía en X-Forwarded-For cuando hay un proxy delante (TRUST_PROXY=1).
// Si no, cualquier cliente podría falsear su IP y evadir los límites por IP.
const TRUST_PROXY = process.env.TRUST_PROXY;
app.set('trust proxy', TRUST_PROXY ? Number(TRUST_PROXY) : false);

// Middlewares. La API solo la usa el propio sitio (mismo origen), por eso no
// se habilita CORS para otros dominios.
app.use(express.json({ limit: '100kb' }));
// Transbank envía el retorno de Webpay como formulario HTML.
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// Servir los archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Endpoints API REST
app.use('/api/productos', productosRoutes);
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/pagos', pagosRoutes);

// Ruta principal abre el index.html del frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Panel interno de pedidos
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor de Matteo Masas escuchando en http://localhost:${PORT}`);

  if (!process.env.ADMIN_KEY) {
    console.warn('⚠️  ADMIN_KEY no está definida: el panel /admin quedará bloqueado.');
  }

  const webpay = obtenerConfiguracionWebpay();
  if (webpay.habilitado) {
    console.log(
      `Webpay Plus habilitado en ambiente: ${webpay.ambiente}` +
        (webpay.produccion ? '' : ' (pagos de prueba)')
    );
  } else {
    console.warn(
      '⚠️  Webpay Plus deshabilitado: faltan WEBPAY_COMMERCE_CODE y WEBPAY_API_KEY para producción.'
    );
  }
});