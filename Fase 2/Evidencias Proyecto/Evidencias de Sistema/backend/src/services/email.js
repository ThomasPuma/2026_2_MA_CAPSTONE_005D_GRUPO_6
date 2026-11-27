/**
 * Envío de correos transaccionales.
 *
 * El proveedor se elige por configuración, en este orden:
 *   1. Resend (RESEND_API_KEY) por HTTPS.
 *   2. Brevo (BREVO_API_KEY) por HTTPS.
 *   3. SendGrid (SENDGRID_API_KEY) por HTTPS.
 *   4. SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS) con nodemailer.
 *   5. Sin proveedor: el correo se omite y solo se registra en el log.
 *
 * Las APIs HTTP son la opción recomendada en Render Free, que bloquea los
 * puertos SMTP 25, 465 y 587.
 */
const nodemailer = require('nodemailer');

let transporteSmtp = null;

function variable(nombre) {
  const valor = process.env[nombre];
  return typeof valor === 'string' ? valor.trim() : '';
}

function proveedorConfigurado() {
  return Boolean(
    variable('RESEND_API_KEY') ||
      variable('BREVO_API_KEY') ||
      variable('SENDGRID_API_KEY') ||
      variable('SMTP_HOST')
  );
}

function remitente() {
  return (
    variable('EMAIL_FROM') ||
    variable('SMTP_FROM') ||
    'Matteo Masas <no-reply@matteomasas.cl>'
  );
}

function partesRemitente() {
  const valor = remitente();
  const coincidencia = valor.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);

  if (coincidencia) {
    const nombre = coincidencia[1].replace(/^"|"$/g, '').trim();
    return {
      nombre: nombre || 'Matteo Masas',
      email: coincidencia[2].trim(),
    };
  }

  return { nombre: 'Matteo Masas', email: valor };
}

async function solicitudJson(url, opciones, etiqueta) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), 12000);

  try {
    const respuesta = await fetch(url, { ...opciones, signal: controlador.signal });

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      throw new Error(
        `${etiqueta} respondió ${respuesta.status}: ${detalle.slice(0, 300)}`
      );
    }

    return await respuesta.json().catch(() => ({}));
  } finally {
    clearTimeout(temporizador);
  }
}

async function enviarConResend({ to, subject, html, text }) {
  const datos = await solicitudJson(
    'https://api.resend.com/emails',
    {
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
    },
    'Resend'
  );

  return { estado: 'enviado', proveedor: 'resend', id: datos.id || null };
}

async function enviarConBrevo({ to, subject, html, text }) {
  const remitenteCorreo = partesRemitente();

  const datos = await solicitudJson(
    'https://api.brevo.com/v3/smtp/email',
    {
      method: 'POST',
      headers: {
        'api-key': variable('BREVO_API_KEY'),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: remitenteCorreo.nombre,
          email: remitenteCorreo.email,
        },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
    },
    'Brevo'
  );

  return {
    estado: 'enviado',
    proveedor: 'brevo',
    id: datos.messageId || null,
  };
}

async function enviarConSendgrid({ to, subject, html, text }) {
  const remitenteCorreo = partesRemitente();
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), 12000);

  try {
    const respuesta = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${variable('SENDGRID_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: {
          email: remitenteCorreo.email,
          name: remitenteCorreo.nombre,
        },
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html },
        ],
      }),
      signal: controlador.signal,
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      throw new Error(
        `SendGrid respondió ${respuesta.status}: ${detalle.slice(0, 300)}`
      );
    }

    // SendGrid responde 202 sin cuerpo.
    return {
      estado: 'enviado',
      proveedor: 'sendgrid',
      id: respuesta.headers.get('x-message-id') || null,
    };
  } finally {
    clearTimeout(temporizador);
  }
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
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  return transporteSmtp;
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
      `[correo omitido] "${subject}" para ${destinatario}: falta configurar un proveedor (RESEND_API_KEY, BREVO_API_KEY, SENDGRID_API_KEY o SMTP_HOST).`
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

    if (variable('BREVO_API_KEY')) {
      return await enviarConBrevo({ to: destinatario, subject, html, text });
    }

    if (variable('SENDGRID_API_KEY')) {
      return await enviarConSendgrid({ to: destinatario, subject, html, text });
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
