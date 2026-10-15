const { Pool } = require('pg'); // Si usas MySQL, me avisas y lo cambiamos a mysql2

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'matteo_masas_db',
  port: process.env.DB_PORT || 5432,
});

pool.on('connect', () => {
  console.log(' Conexión exitosa a la Base de Datos PostgreSQL');
});

module.exports = pool;