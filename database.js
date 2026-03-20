const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  port: parseInt(process.env.PGPORT),
  ssl: false
});

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
    console.error('❌ Error inicializando base de datos:', error.message);
  }
};

module.exp