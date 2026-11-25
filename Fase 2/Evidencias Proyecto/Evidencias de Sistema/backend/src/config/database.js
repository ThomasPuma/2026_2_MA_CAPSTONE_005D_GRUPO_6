const { Pool } = require('pg');

/**
 * Conexión a PostgreSQL.
 *
 * En local se usan las variables DB_* de backend/.env. En un hosting (Render,
 * Neon, Railway, etc.) se define DATABASE_URL, que es el formato estándar de
 * los proveedores administrados. Si DATABASE_URL existe, tiene prioridad.
 *
 * Los proveedores administrados exigen TLS y usan certificados que Node no
 * reconoce por defecto; por eso se desactiva rejectUnauthorized cuando la
 * conexión es remota. Para desactivar TLS explícitamente: DB_SSL=false.
 */

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function sslDeshabilitado() {
  return ['0', 'false', 'disable', 'no'].includes(
    texto(process.env.DB_SSL).toLowerCase()
  );
}

function construirConfiguracion() {
  const poolMax = Number(process.env.DB_POOL_MAX) || 10;
  const url = texto(process.env.DATABASE_URL);

  if (url) {
    return {
      connectionString: url,
      ssl: sslDeshabilitado() ? false : { rejectUnauthorized: false },
      max: poolMax,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };
  }

  return {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'matteo_masas_db',
    port: process.env.DB_PORT || 5432,
    max: poolMax,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };
}

const pool = new Pool(construirConfiguracion());

pool.on('connect', () => {
  console.log(' Conexión exitosa a la Base de Datos PostgreSQL');
});

/**
 * Sin este listener, un error en una conexión inactiva (por ejemplo cuando el
 * proveedor reinicia la base o cierra conexiones ociosas) derriba el proceso.
 */
pool.on('error', (error) => {
  console.error('Error en una conexión inactiva de PostgreSQL:', error.message);
});

module.exports = pool;
