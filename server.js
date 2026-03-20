const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { initDB } = require('./database');
const { router: authRouter } = require('./routes/auth');
const { router: moviesRouter } = require('./routes/movies');
const reviewsRouter = require('./routes/reviews');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas
app.use('/api/auth', authRouter);
app.use('/api/movies', moviesRouter);
app.use('/api/reviews', reviewsRouter);

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ message: '🎬 CineApp API funcionando correctamente' });
});

// Iniciar servidor
const start = async () => {
  await initDB();
  app.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en puerto ${PORT}`);
  });
};

start();