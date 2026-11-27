/**
 * Envío de correos transaccionales.
 *
 * El proveedor se elige por configuración, en este orden:
 *   1. Resend (RESEND_API_KEY) por HTTPS.
 *   2. SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS) con nodemailer.
 *   3. Sin proveedor: el correo se omite y solo se registra en el log.
 *
 * El remitente se define en EMAIL_FROM. Si no está configurado, se usa un
 * valor genérico para que el resto del sistema siga funcionando.
 */
const nodemailer = require('nodemailer');

let transporteSmtp = null;

function variable(nombre) {
  const valor = process.env[nombre];
  return typeof valor === 'string' ? valor.trim() : '';
}

function proveedorConfigurado() {
  return Boolean(variable('RESEND_API_KEY') || variable('SMTP_HOST'));
}

function remitente() {
  return (
    variable('EMAIL_FROM') ||
    variable('SMTP_FROM') ||
    'Matteo Masas <no-reply@matteomasas.cl>'
  );
}

function crearTransporteSmtp() {
  if (transporteSmtp) return transporteSmtp;

  const puerto = Number(variable('SMTP_PORT')) || 587;
  const seguro = variable('SMTP_SECURE') === 'true' || puerto === 465;
  const usuario = variable('SMTP_USER');

  transporteSmtp = nodemailer.createTransport({
    host: variable('SMTP_HOST'),
    port: puerto,
    secure: seguro,
    auth: usuario
      ? { user: usuario, pass: variable('SMTP_PASS') }
      : undefined,
    // Los proveedores gratuitos a veces demoran unos segundos.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  return transporteSmtp;
}

async function enviarConResend({ to, subject, html, text }) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), 12000);

  try {
    const respuesta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${variable('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: remitente(),
        to: [to],
        subject,
        html,
        text,
      }),
      signal: controlador.signal,
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      throw new Error(
        `Resend respondió ${respuesta.status}: ${detalle.slice(0, 300)}`
      );
    }

    const datos = await respuesta.json().catch(() => ({}));
    return { estado: 'enviado', proveedor: 'resend', id: datos.id || null };
  } finally {
    clearTimeout(temporizador);
  }
}

async function enviarConSmtp({ to, subject, html, text }) {
  const transporte = crearTransporteSmtp();
  const informacion = await transporte.sendMail({
    from: remitente(),
    to,
    subject,
    html,
    text,
  });

  // En cuentas de prueba de Nodemailer (Ethereal) entrega una URL para ver
  // el correo enviado; en un proveedor real devuelve null.
  const vistaPrevia = nodemailer.getTestMessageUrl(informacion);

  return {
    estado: 'enviado',
    proveedor: 'smtp',
    id: informacion.messageId || null,
    preview: vistaPrevia || null,
  };
}

/**
 * Envía un correo y nunca lanza una excepción: devuelve el resultado para que
 * quien lo invoque pueda registrarlo. Así un problema del proveedor no rompe
 * la creación de un pedido ni el cambio de estado.
 */
async function enviarCorreo({ to, subject, html, text }) {
  const destinatario = typeof to === 'string' ? to.trim() : '';

  if (!destinatario) {
    return { estado: 'omitido', detalle: 'El pedido no tiene correo.' };
  }

  if (!proveedorConfigurado()) {
    console.log(
      `[correo omitido] "${subject}" para ${destinatario}: falta configurar RESEND_API_KEY o SMTP_HOST.`
    );
    return {
      estado: 'omitido',
      detalle: 'Sin proveedor de correo configurado.',
    };
  }

  try {
    if (variable('RESEND_API_KEY')) {
      return await enviarConResend({ to: destinatario, subject, html, text });
    }

    return await enviarConSmtp({ to: destinatario, subject, html, text });
  } catch (error) {
    console.error(`Error al enviar correo a ${destinatario}:`, error.message);
    return { estado: 'error', detalle: error.message };
  }
}

module.exports = {
  enviarCorreo,
  proveedorConfigurado,
  remitente,
};
