const express = require('express');
const path = require('path'); // Importamos path

// Carga backend/.env sin depender del directorio desde donde se inicia el
// proceso (en Render el comando de arranque puede ejecutarse desde la raíz).
require('dotenv').config({ path: path.join(__dirname, '.env') });

const productosRoutes = require('./src/routes/productosRoutes');
const pedidosRoutes = require('./src/routes/pedidosRoutes');
const pagosRoutes = require('./src/routes/pagosRoutes');
const { obtenerConfiguracionWebpay } = require('./src/services/webpay');

const app = express();
const PORT = process.env.PORT || 3000;

// No revelar el framework en las respuestas HTTP.
app.disable('x-powered-by');

// Necesario para construir la URL de retorno cuando el sitio está detrás
// de un proxy (por ejemplo, un hosting con HTTPS).
// Solo se confía en X-Forwarded-For cuando hay un proxy delante (TRUST_PROXY=1).
// Si no, cualquier cliente podría falsear su IP y evadir los límites por IP.
function leerTrustProxy(valor) {
  const texto = typeof valor === 'string' ? valor.trim() : '';
  if (!texto) return false;

  const numero = Number(texto);
  if (Number.isInteger(numero) && numero > 0) return numero;

  return ['true', 'yes', 'si', 'sí'].includes(texto.toLowerCase()) ? 1 : false;
}

app.set('trust proxy', leerTrustProxy(process.env.TRUST_PROXY));

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

// Seguimiento público de un pedido por código.
app.get('/seguimiento', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/seguimiento.html'));
});

app.get('/seguimiento/:codigo', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/seguimiento.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor de Matteo Masas escuchando en http://localhost:${PORT}`);

  if (!process.env.ADMIN_KEY) {
    console.warn('⚠️  ADMIN_KEY no está definida: el panel /admin quedará bloqueado.');
  }

  const proveedorCorreo = process.env.RESEND_API_KEY
    ? 'Resend'
    : process.env.BREVO_API_KEY
      ? 'Brevo'
      : process.env.SENDGRID_API_KEY
        ? 'SendGrid'
        : process.env.SMTP_HOST
          ? 'SMTP'
          : null;

  if (proveedorCorreo) {
    console.log(`Correo transaccional habilitado con ${proveedorCorreo}.`);

    if (proveedorCorreo === 'SMTP' && process.env.RENDER) {
      console.warn(
        'Aviso: Render Free bloquea los puertos SMTP (25, 465 y 587). Usa una API HTTP (Brevo, SendGrid o Resend) o un plan pagado.'
      );
    }
  } else {
    console.warn(
      'Aviso: sin proveedor de correo los avisos de pedido se omiten. Configura BREVO_API_KEY, SENDGRID_API_KEY, RESEND_API_KEY o SMTP_HOST.'
    );
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