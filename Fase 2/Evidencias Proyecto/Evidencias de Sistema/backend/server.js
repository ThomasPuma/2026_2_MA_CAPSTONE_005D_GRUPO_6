const express = require('express');
const cors = require('cors');
const path = require('path'); // Importamos path
require('dotenv').config();

const productosRoutes = require('./src/routes/productosRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Servir los archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Endpoints API REST
app.use('/api/productos', productosRoutes);

// Ruta principal abre el index.html del frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor de Matteo Masas escuchando en http://localhost:${PORT}`);
});