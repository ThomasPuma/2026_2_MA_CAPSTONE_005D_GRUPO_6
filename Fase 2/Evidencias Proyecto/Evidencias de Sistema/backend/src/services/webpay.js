/**
 * Integración con Webpay Plus de Transbank.
 *
 * Ambientes:
 *  - integration: usa las credenciales públicas del SDK. Es gratuito y sirve
 *    para probar todo el flujo con tarjetas de prueba.
 *  - production: requiere el código de comercio y la API key entregados por
 *    Transbank al afiliar el comercio.
 *
 * Documentación: https://www.transbankdevelopers.cl/producto/webpay
 */
const crypto = require('crypto');
const {
  WebpayPlus,
  Options,
  Environment,
  IntegrationCommerceCodes,
  IntegrationApiKeys,
} = require('transbank-sdk');

const AMBIENTES_PRODUCCION = new Set(['production', 'produccion', 'prod']);

function limpiar(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

/**
 * Lee la configuración desde el entorno. En integración, si no se definen
 * credenciales, se usan las públicas del SDK.
 */
function obtenerConfiguracionWebpay() {
  const ambienteCrudo =
    limpiar(process.env.WEBPAY_ENVIRONMENT).toLowerCase() || 'integration';
  const produccion = AMBIENTES_PRODUCCION.has(ambienteCrudo);
  const commerceCode = limpiar(process.env.WEBPAY_COMMERCE_CODE);
  const apiKey = limpiar(process.env.WEBPAY_API_KEY);

  if (produccion) {
    return {
      ambiente: 'production',
      produccion: true,
      commerceCode,
      apiKey,
      habilitado: Boolean(commerceCode && apiKey),
    };
  }

  return {
    ambiente: 'integration',
    produccion: false,
    commerceCode: commerceCode || IntegrationCommerceCodes.WEBPAY_PLUS,
    apiKey: apiKey || IntegrationApiKeys.WEBPAY,
    habilitado: true,
  };
}

function crearTransaccion() {
  const config = obtenerConfiguracionWebpay();

  if (!config.habilitado) {
    const error = new Error(
      'Webpay no está configurado. Define WEBPAY_COMMERCE_CODE y WEBPAY_API_KEY para producción.'
    );
    error.code = 'WEBPAY_NO_CONFIGURADO';
    throw error;
  }

  const environment = config.produccion
    ? Environment.Production
    : Environment.Integration;

  return new WebpayPlus.Transaction(
    new Options(
      config.commerceCode,
      config.apiKey,
      environment,
      30000
    )
  );
}

/**
 * URL pública a la que Transbank devolverá al cliente después de pagar.
 * En producción conviene definir PUBLIC_BASE_URL con HTTPS.
 */
function construirUrlRetorno(req) {
  const base = limpiar(process.env.PUBLIC_BASE_URL).replace(/\/+$/, '');

  if (base) return `${base}/api/pagos/webpay/retorno`;

  const protocolo = req.protocol || 'http';
  const host = req.get('host');
  return `${protocolo}://${host}/api/pagos/webpay/retorno`;
}

function construirOrdenCompra(codigo) {
  // Webpay acepta hasta 26 caracteres alfanuméricos.
  return String(codigo || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 26);
}

function construirSesion() {
  return `MM${crypto.randomBytes(10).toString('hex')}`.slice(0, 61).toUpperCase();
}

/**
 * Crea la transacción en Webpay y devuelve los datos necesarios para
 * redirigir al cliente al formulario de pago.
 */
async function crearPagoWebpay({ req, codigo, total }) {
  const transaccion = crearTransaccion();
  const ordenCompra = construirOrdenCompra(codigo);
  const sesion = construirSesion();
  const monto = Math.round(Number(total));

  if (!ordenCompra) {
    throw new Error('No se pudo generar la orden de compra para Webpay.');
  }

  if (!Number.isInteger(monto) || monto <= 0) {
    throw new Error('El monto del pedido no es válido para Webpay.');
  }

  const respuesta = await transaccion.create(
    ordenCompra,
    sesion,
    monto,
    construirUrlRetorno(req)
  );

  return {
    token: respuesta.token,
    url: respuesta.url,
    ordenCompra,
    sesion,
    monto,
  };
}

async function confirmarPagoWebpay(token) {
  const transaccion = crearTransaccion();
  return transaccion.commit(token);
}

async function reembolsarPagoWebpay(token, monto) {
  const transaccion = crearTransaccion();
  return transaccion.refund(token, Math.round(Number(monto)));
}

/**
 * Resume la respuesta de Webpay en un objeto seguro para guardar en JSONB.
 * No se guardan datos completos de la tarjeta, solo los últimos dígitos.
 */
function normalizarRespuestaWebpay(respuesta) {
  return {
    vci: respuesta?.vci ?? null,
    monto: Number(respuesta?.amount) || 0,
    estado: respuesta?.status ?? null,
    orden_compra: respuesta?.buy_order ?? null,
    sesion: respuesta?.session_id ?? null,
    tarjeta: respuesta?.card_detail?.card_number ?? null,
    fecha_contable: respuesta?.accounting_date ?? null,
    fecha_transaccion: respuesta?.transaction_date ?? null,
    codigo_autorizacion: respuesta?.authorization_code ?? null,
    tipo_pago: respuesta?.payment_type_code ?? null,
    codigo_respuesta: Number(respuesta?.response_code),
    cuotas: Number(respuesta?.installments_number) || 0,
  };
}

function pagoAprobado(respuesta) {
  return Number(respuesta?.response_code) === 0;
}

module.exports = {
  obtenerConfiguracionWebpay,
  crearPagoWebpay,
  confirmarPagoWebpay,
  reembolsarPagoWebpay,
  normalizarRespuestaWebpay,
  pagoAprobado,
  construirUrlRetorno,
};
