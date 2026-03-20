const express = require('express');
const axios = require('axios');
const { pool } = require('../database');
const { verifyToken } = require('./auth');


const router = express.Router();

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_HEADERS = {
  Authorization: `Bearer ${process.env.TMDB_API_KEY}`,
  'Content-Type': 'application/json'
};

// Función para guardar película en BD si no existe
const saveMovieToDB = async (tmdbMovie) => {
  try {
    const exists = await pool.query('SELECT id FROM movies WHERE tmdb_id = $1', [tmdbMovie.id]);
    if (exists.rows.length > 0) return exists.rows[0];

    // Obtener detalles completos incluyendo actores
    const details = await axios.get(`${TMDB_BASE}/movie/${tmdbMovie.id}`, {
      headers: TMDB_HEADERS,
      params: { language: 'es-ES', append_to_response: 'credits' }
    });

    const movie = details.data;
    const cast = movie.credits?.cast?.slice(0, 10).map(a => a.name) || [];
    const director = movie.credits?.crew?.find(c => c.job === 'Director')?.name || '';
    const genres = movie.genres?.map(g => g.name) || [];

    const result = await pool.query(
      `INSERT INTO movies 
        (tmdb_id, title, overview, poster_path, backdrop_path, release_date, genres, cast_members, director, runtime, original_language, tmdb_rating)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (tmdb_id) DO UPDATE SET title=EXCLUDED.title
       RETURNING *`,
      [
        movie.id, movie.title, movie.overview,
        movie.poster_path, movie.backdrop_path,
        movie.release_date || null,
        genres, cast, director,
        movie.runtime, movie.original_language,
        movie.vote_average
      ]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error guardando película:', error.message);
    return null;
  }
};

// Buscar películas en TMDB
router.get('/search', async (req, res) => {
  const { query, page = 1 } = req.query;
  try {
    const response = await axios.get(`${TMDB_BASE}/search/movie`, {
      headers: TMDB_HEADERS,
      params: { query, language: 'es-ES', page }
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Películas populares
router.get('/popular', async (req, res) => {
  const { page = 1 } = req.query;
  try {
    const response = await axios.get(`${TMDB_BASE}/movie/popular`, {
      headers: TMDB_HEADERS,
      params: { language: 'es-ES', page }
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener detalle de película y guardarla en BD
router.get('/:tmdbId', async (req, res) => {
  const { tmdbId } = req.params;
  try {
    // Buscar en BD local primero
    let dbMovie = await pool.query('SELECT * FROM movies WHERE tmdb_id = $1', [tmdbId]);

    if (dbMovie.rows.length === 0) {
      // No está en BD, traer de TMDB y guardar
      const tmdbData = await axios.get(`${TMDB_BASE}/movie/${tmdbId}`, {
        headers: TMDB_HEADERS,
        params: { language: 'es-ES', append_to_response: 'credits' }
      });
      await saveMovieToDB(tmdbData.data);
      dbMovie = await pool.query('SELECT * FROM movies WHERE tmdb_id = $1', [tmdbId]);
    }

    const movie = dbMovie.rows[0];

    // Calcular rating de usuarios normales
    const userRating = await pool.query(`
      SELECT AVG(r.rating) as avg_rating, COUNT(r.id) as total
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.movie_id = $1 AND u.role = 'user'
    `, [movie.id]);

    // Calcular rating de críticos
    const criticRating = await pool.query(`
      SELECT AVG(r.rating) as avg_rating, COUNT(r.id) as total
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.movie_id = $1 AND u.role = 'critic'
    `, [movie.id]);

    res.json({
      ...movie,
      user_rating: {
        average: parseFloat(userRating.rows[0].avg_rating) || 0,
        total: parseInt(userRating.rows[0].total)
      },
      critic_rating: {
        average: parseFloat(criticRating.rows[0].avg_rating) || 0,
        total: parseInt(criticRating.rows[0].total)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Filtrar y ordenar películas de la BD
router.get('/', async (req, res) => {
  const { search, genre, year, sort_by = 'created_at', order = 'DESC', page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    let conditions = [];
    let params = [];
    let paramCount = 1;

    if (search) {
      conditions.push(`title ILIKE $${paramCount}`);
      params.push(`%${search}%`);
      paramCount++;
    }

    if (genre) {
      conditions.push(`$${paramCount} = ANY(genres)`);
      params.push(genre);
      paramCount++;
    }

    if (year) {
      conditions.push(`EXTRACT(YEAR FROM release_date) = $${paramCount}`);
      params.push(year);
      paramCount++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const validSorts = ['title', 'release_date', 'tmdb_rating', 'created_at'];
    const sortColumn = validSorts.includes(sort_by) ? sort_by : 'created_at';
    const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';

    params.push(limit, offset);

    const result = await pool.query(
      `SELECT * FROM movies ${whereClause} 
       ORDER BY ${sortColumn} ${sortOrder}
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      params
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM movies ${whereClause}`,
      params.slice(0, -2)
    );

    res.json({
      results: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      total_pages: Math.ceil(countResult.rows[0].count / limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = { router, saveMovieToDB };