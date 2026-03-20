const { Pool } = require('pg');
require('dotenv').config();

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const usingInternalRailway =
  process.env.PGHOST === 'postgres.railway.internal' ||
  (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway.internal'));

console.log('Usando conexión:', usingInternalRailway ? 'interna' : 'externa');
console.log('DATABASE_URL presente:', hasDatabaseUrl ? 'sí' : 'no');
console.log('PGHOST:', process.env.PGHOST ? process.env.PGHOST : '(no definido)');

const poolConfig = {
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 1
};

if (usingInternalRailway) {
  // Para conexión interna Railway, usar parámetros PG* explícitos y sin SSL.
  // Esto evita conflictos por query params en DATABASE_URL (ej. sslmode=require).
  poolConfig.host = process.env.PGHOST;
  poolConfig.user = process.env.PGUSER;
  poolConfig.password = process.env.PGPASSWORD;
  poolConfig.database = process.env.PGDATABASE;
  poolConfig.port = process.env.PGPORT ? parseInt(process.env.PGPORT) : undefined;
  poolConfig.ssl = false;
} else if (hasDatabaseUrl) {
  poolConfig.connectionString = process.env.DATABASE_URL;

  // Inferir requerimiento de SSL desde sslmode.
  try {
    const u = new URL(process.env.DATABASE_URL);
    const sslmode = u.searchParams.get('sslmode');
    const host = u.hostname;
    const port = u.port || '(default)';
    console.log('DATABASE_URL host/port:', host, port, 'sslmode:', sslmode || '(none)');

    if (sslmode && sslmode.toLowerCase() === 'disable') {
      poolConfig.ssl = false;
    } else {
      poolConfig.ssl = { rejectUnauthorized: false };
    }
  } catch {
    poolConfig.ssl = { rejectUnauthorized: false };
  }
} else {
  poolConfig.host = process.env.PGHOST;
  poolConfig.user = process.env.PGUSER;
  poolConfig.password = process.env.PGPASSWORD;
  poolConfig.database = process.env.PGDATABASE;
  poolConfig.port = process.env.PGPORT ? parseInt(process.env.PGPORT) : undefined;

  poolConfig.ssl = usingInternalRailway ? false : { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS movies (
        id SERIAL PRIMARY KEY,
        tmdb_id INTEGER UNIQUE,
        title VARCHAR(255) NOT NULL,
        overview TEXT,
        poster_path VARCHAR(255),
        backdrop_path VARCHAR(255),
        release_date DATE,
        genres TEXT[],
        cast_members TEXT[],
        director VARCHAR(100),
        runtime INTEGER,
        original_language VARCHAR(10),
        tmdb_rating DECIMAL(3,1),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        movie_id INTEGER REFERENCES movies(id) ON DELETE CASCADE,
        rating DECIMAL(3,1) NOT NULL CHECK (rating >= 0 AND rating <= 10),
        comment TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, movie_id)
      )
    `);

    console.log('✅ Base de datos inicializada correctamente');
  } catch (error) {
    console.error('❌ Error inicializando base de datos:', error?.message);
    // Imprimir el error completo para ver causa real (TLS handshake, etc.)
    console.error(error);
    throw error; // que el servidor no arranque con un Pool inválido
  }
};

module.exports = { pool, initDB };