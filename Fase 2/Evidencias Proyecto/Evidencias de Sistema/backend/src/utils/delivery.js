/**
 * Reglas de despacho de Matteo Masas.
 *
 * - Dentro de la comuna de Padre Hurtado, las compras superiores al monto
 *   configurado tienen despacho gratis.
 * - Fuera de la comuna (o dentro, pero sin alcanzar el monto de la promo) se
 *   cobra una tarifa base que cubre los primeros kilómetros y luego un valor
 *   por cada kilómetro adicional.
 *
 * La distancia se calcula en línea recta desde la ubicación del local. Para
 * entregas de barrio es una aproximación suficiente y no depende de servicios
 * externos de ruteo.
 */

// Comuna de Padre Hurtado (polígono simplificado de OpenStreetMap).
const POLIGONO_PADRE_HURTADO = [
  [-33.56521, -70.94921],
  [-33.57236, -70.94365],
  [-33.5775, -70.93663],
  [-33.58214, -70.93753],
  [-33.58453, -70.93559],
  [-33.58814, -70.93547],
  [-33.5886, -70.93034],
  [-33.58553, -70.91827],
  [-33.58726, -70.91318],
  [-33.58611, -70.91025],
  [-33.58769, -70.89877],
  [-33.58997, -70.89351],
  [-33.58574, -70.89252],
  [-33.58502, -70.8905],
  [-33.58191, -70.88939],
  [-33.5813, -70.88769],
  [-33.58304, -70.88631],
  [-33.58068, -70.88139],
  [-33.5836, -70.87859],
  [-33.5755, -70.86836],
  [-33.57573, -70.85608],
  [-33.57716, -70.84934],
  [-33.5808, -70.84781],
  [-33.58243, -70.83339],
  [-33.58364, -70.83204],
  [-33.58561, -70.83461],
  [-33.59802, -70.81899],
  [-33.5936, -70.8136],
  [-33.59627, -70.81048],
  [-33.57304, -70.79763],
  [-33.5778, -70.7882],
  [-33.56909, -70.77842],
  [-33.56772, -70.78361],
  [-33.55568, -70.79782],
  [-33.5436, -70.81583],
  [-33.53595, -70.80532],
  [-33.53157, -70.80416],
  [-33.52837, -70.80795],
  [-33.53152, -70.81356],
  [-33.53782, -70.81831],
  [-33.53359, -70.84195],
  [-33.53732, -70.85148],
  [-33.53078, -70.85791],
  [-33.5305, -70.8652],
  [-33.53243, -70.87206],
  [-33.52792, -70.88644],
  [-33.52006, -70.89221],
  [-33.51777, -70.89794],
  [-33.51186, -70.9026],
  [-33.50911, -70.91057],
  [-33.5119, -70.92052],
  [-33.54672, -70.92959],
  [-33.5515, -70.93593],
  [-33.55529, -70.93819],
  [-33.55991, -70.94808],
  [-33.56521, -70.94921],
];

// Centro de la comuna. El local exacto se configura desde /admin.
const UBICACION_TIENDA_POR_DEFECTO = {
  lat: -33.5704813,
  lng: -70.8156668,
};

const RADIO_TIERRA_KM = 6371.0088;

function redondear(numero) {
  return Math.round((Number(numero) + Number.EPSILON) * 100) / 100;
}

function numero(valor, alternativo = 0) {
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : alternativo;
}

/**
 * Distancia en kilómetros entre dos coordenadas (fórmula de Haversine).
 */
function distanciaKm(origen, destino) {
  const lat1 = (numero(origen.lat) * Math.PI) / 180;
  const lat2 = (numero(destino.lat) * Math.PI) / 180;
  const diferenciaLat = lat2 - lat1;
  const diferenciaLng =
    ((numero(destino.lng) - numero(origen.lng)) * Math.PI) / 180;

  const a =
    Math.sin(diferenciaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(diferenciaLng / 2) ** 2;

  return 2 * RADIO_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Verifica si un punto está dentro de un polígono usando ray casting.
 * El polígono se expresa como [[lat, lng], ...].
 */
function puntoEnPoligono(lat, lng, poligono = POLIGONO_PADRE_HURTADO) {
  let dentro = false;

  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [latI, lngI] = poligono[i];
    const [latJ, lngJ] = poligono[j];

    const cruza =
      lngI > lng !== lngJ > lng &&
      lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI;

    if (cruza) dentro = !dentro;
  }

  return dentro;
}

function ubicacionTienda(config = {}) {
  return {
    lat: numero(config.latTienda, UBICACION_TIENDA_POR_DEFECTO.lat),
    lng: numero(config.lngTienda, UBICACION_TIENDA_POR_DEFECTO.lng),
  };
}

/**
 * Calcula el costo de despacho para un pedido.
 *
 * @param {object} opciones
 * @param {number} opciones.subtotal Subtotal de productos.
 * @param {number} opciones.lat Latitud de entrega.
 * @param {number} opciones.lng Longitud de entrega.
 * @param {object} opciones.config Configuración normalizada del negocio.
 */
function calcularDespacho({ subtotal, lat, lng, config = {} }) {
  const tienda = ubicacionTienda(config);
  const distancia = redondear(distanciaKm(tienda, { lat, lng }));
  const dentroComuna = puntoEnPoligono(lat, lng);

  const montoGratis = Math.max(0, numero(config.montoDespachoGratis));
  const tarifaBase = Math.max(0, numero(config.tarifaBaseDespacho));
  const kmBase = Math.max(0, numero(config.kmBaseDespacho));
  const tarifaKm = Math.max(0, numero(config.tarifaKmAdicional));

  const gratis = montoGratis > 0 && dentroComuna && subtotal > montoGratis;

  let costoDespacho = 0;
  let kmAdicionales = 0;

  if (!gratis) {
    kmAdicionales = Math.max(0, Math.ceil(distancia - kmBase - 1e-9));
    costoDespacho = tarifaBase + kmAdicionales * tarifaKm;
  }

  return {
    distanciaKm: distancia,
    dentroComuna,
    fueraComuna: !dentroComuna,
    gratis,
    kmAdicionales,
    costoDespacho: redondear(costoDespacho),
    montoDespachoGratis: montoGratis,
    tarifaBaseDespacho: tarifaBase,
    kmBaseDespacho: kmBase,
    tarifaKmAdicional: tarifaKm,
  };
}

module.exports = {
  POLIGONO_PADRE_HURTADO,
  UBICACION_TIENDA_POR_DEFECTO,
  distanciaKm,
  puntoEnPoligono,
  ubicacionTienda,
  calcularDespacho,
  redondear,
};
