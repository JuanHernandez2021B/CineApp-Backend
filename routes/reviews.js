const express = require('express');
const { pool } = require('../database');
const { verifyToken } = require('./auth');

const router = express.Router();

// Obtener reseñas de una película
router.get('/movie/:movieId', async (req, res) => {
  const { movieId } = req.params;
  try {
    const result = await pool.query(`
      SELECT r.*, u.name as user_name, u.role as user_role
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.movie_id = $1
      ORDER BY r.created_at DESC
    `, [movieId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Crear reseña
router.post('/', verifyToken, async (req, res) => {
  const { movie_id, rating, comment } = req.body;
  try {
    const exists = await pool.query(
      'SELECT id FROM reviews WHERE user_id = $1 AND movie_id = $2',
      [req.user.id, movie_id]
    );
    if (exists.rows.length > 0)
      return res.status(400).json({ error: 'Ya tienes una reseña para esta película' });

    const result = await pool.query(
      `INSERT INTO reviews (user_id, movie_id, rating, comment)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, movie_id, rating, comment]
    );

    const review = await pool.query(`
      SELECT r.*, u.name as user_name, u.role as user_role
      FROM reviews r JOIN users u ON r.user_id = u.id
      WHERE r.id = $1
    `, [result.rows[0].id]);

    res.status(201).json(review.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Actualizar reseña
router.put('/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { rating, comment } = req.body;
  try {
    const review = await pool.query('SELECT * FROM reviews WHERE id = $1', [id]);
    if (review.rows.length === 0)
      return res.status(404).json({ error: 'Reseña no encontrada' });
    if (review.rows[0].user_id !== req.user.id)
      return res.status(403).json({ error: 'No tienes permiso para editar esta reseña' });

    const result = await pool.query(
      `UPDATE reviews SET rating=$1, comment=$2, updated_at=NOW()
       WHERE id=$3 RETURNING *`,
      [rating, comment, id]
    );

    const updated = await pool.query(`
      SELECT r.*, u.name as user_name, u.role as user_role
      FROM reviews r JOIN users u ON r.user_id = u.id
      WHERE r.id = $1
    `, [result.rows[0].id]);

    res.json(updated.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Eliminar reseña
router.delete('/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    const review = await pool.query('SELECT * FROM reviews WHERE id = $1', [id]);
    if (review.rows.length === 0)
      return res.status(404).json({ error: 'Reseña no encontrada' });
    if (review.rows[0].user_id !== req.user.id)
      return res.status(403).json({ error: 'No tienes permiso para eliminar esta reseña' });

    await pool.query('DELETE FROM reviews WHERE id = $1', [id]);
    res.json({ message: 'Reseña eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mis reseñas
router.get('/my-reviews', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, m.title as movie_title, m.poster_path
      FROM reviews r
      JOIN movies m ON r.movie_id = m.id
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;