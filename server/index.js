const express = require('express');
const { initDb } = require('./lib/database');
const adminRoutes = require('./routes/admin');
const nameRoutes = require('./routes/names');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Rate Limiter
const apiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 heure
    max: 400, // max 400 requêtes par heure
    message: { error: 'Too many requests, please try again later.' }
});

app.use('/api/', apiLimiter);

// Routes
app.use('/api/admin', adminRoutes);
app.use('/api', nameRoutes);

// Servir le frontend statique
app.use(express.static('../'));

// Start
initDb();
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
