const { Pool } = require('pg');
require('dotenv').config();

const privateUrl = process.env.DATABASE_PRIVATE_URL || process.env.POSTGRES_PRIVATE_URL || null;
const publicUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || null;
const hasDatabaseUrl = !!(privateUrl || publicUrl);
const usingInternalRailway =
  process.env.PGHOST === 'postgres.railway.internal' ||
  (privateUrl && privateUrl.includes('railway.internal')) ||
  (publicUrl && publicUrl.includes('railway.internal'));

console.log('Usando conexión:', usingInternalRailway ? 'interna' : 'externa');
console.log('DATABASE_URL presente:', hasDatabaseUrl ? 'sí' : 'no');
console.log('PGHOST:', process.env.PGHOST ? process.env.PGHOST : '(no definido)');

const baseConfig = {
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 3
};

const hasPgVars = !!(
  process.env.PGHOST &&
  process.env.PGUSER &&
  process.env.PGPASSWORD &&
  process.env.PGDATABASE &&
  process.env.PGPORT
);

const internalConfig = {
  ...baseConfig,
  host: process.env.PGHOST,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  port: process.env.PGPORT ? parseInt(process.env.PGPORT) : undefined,
  ssl: false
};

const selectedUrl = privateUrl || publicUrl;

const dbUrlNoSslConfig = {
  ...baseConfig,
  connectionString: selectedUrl,
  ssl: false
};

const dbUrlSslConfig = {
  ...baseConfig,
  connectionString: selectedUrl,
  ssl: { rejectUnauthorized: false }
};

const candidateConfigs = [];
if (hasPgVars) {
  candidateConfigs.push(['pg-vars-no-ssl', internalConfig]);
}

if (usingInternalRailway) {
  candidateConfigs.push(['internal-no-ssl', internalConfig]);
  if (hasDatabaseUrl) {
    candidateConfigs.push(['db-url-no-ssl', dbUrlNoSslConfig]);
    candidateConfigs.push(['db-url-ssl', dbUrlSslConfig]);
  }
} else {
  if (hasDatabaseUrl) {
    candidateConfigs.push(['db-url-ssl', dbUrlSslConfig]);
    candidateConfigs.push(['db-url-no-ssl', dbUrlNoSslConfig]);
  }
  candidateConfigs.push(['pg-vars', internalConfig]);
}

if (!hasDatabaseUrl && (!process.env.PGHOST || !process.env.PGUSER || !process.env.PGPASSWORD || !process.env.PGDATABASE)) {
  throw new Error('Faltan variables de DB en Railway (usa DATABASE_PRIVATE_URL o PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGPORT).');
}

let activePool = null;
const pool = {
  query: (...args) => activePool.query(...args),
  connect: (...args) => activePool.connect(...args),
  end: (...args) => activePool.end(...args)
};

const createWorkingPool = async () => {
  const errors = [];
  for (const [name, cfg] of candidateConfigs) {
    try {
      const testPool = new Pool(cfg);
      await testPool.query('SELECT 1');
      console.log('Conexión DB activa:', name);
      return testPool;
    } catch (error) {
      errors.push(`${name}: ${error?.message || error}`);
    }
  }
  throw new Error(`No se pudo conectar a Postgres. Intentos: ${errors.join(' | ')}`);
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const connectWithRetry = async (attempts = 12, delayMs = 5000) => {
  let lastError;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await createWorkingPool();
    } catch (error) {
      lastError = error;
      console.error(`DB intento ${i}/${attempts} falló: ${error?.message || error}`);
      if (i < attempts) await wait(delayMs);
    }
  }
  throw lastError;
};

const initDB = async () => {
  try {
    activePool = await connectWithRetry();
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
    console.error(error);
    throw error;
  }
};

module.exports = { pool, initDB };