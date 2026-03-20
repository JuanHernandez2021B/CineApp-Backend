const { Pool } = require('pg');
require('dotenv').config();

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const pgHost = process.env.PGHOST;

const baseConfig = {
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 3
};

const getPoolConfigs = () => {
  if (databaseUrl) {
    const noSsl = { ...baseConfig, connectionString: databaseUrl, ssl: false };
    const ssl = {
      ...baseConfig,
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false }
    };
    return [noSsl, ssl];
  }

  if (!pgHost || !process.env.PGUSER || !process.env.PGPASSWORD || !process.env.PGDATABASE || !process.env.PGPORT) {
    throw new Error('Faltan variables de DB. Configura DATABASE_URL o PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGPORT.');
  }

  const isInternal = pgHost.includes('railway.internal');
  return [{
    ...baseConfig,
    host: pgHost,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    port: parseInt(process.env.PGPORT, 10),
    ssl: isInternal ? false : { rejectUnauthorized: false }
  }];
};

let activePool = null;
const pool = {
  query: (...args) => activePool.query(...args),
  connect: (...args) => activePool.connect(...args),
  end: (...args) => activePool.end(...args)
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const connectWithRetry = async (attempts = 10, delayMs = 4000) => {
  const configs = getPoolConfigs();
  let lastError;

  for (let i = 1; i <= attempts; i++) {
    for (const config of configs) {
      try {
        const testPool = new Pool(config);
        await testPool.query('SELECT 1');
        console.log('Conexión DB activa');
        return testPool;
      } catch (error) {
        lastError = error;
      }
    }
    console.error(`DB intento ${i}/${attempts} falló: ${lastError?.message || lastError}`);
    if (i < attempts) await wait(delayMs);
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