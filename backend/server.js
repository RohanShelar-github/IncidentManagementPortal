const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const incidentRoutes = require('./routes/incidentRoutes');
const { startUiServer } = require('../server-ui');
const pool = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:8000',
  credentials: true
}));

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/incidents', incidentRoutes);

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const [db] = await pool.query('SELECT DATABASE() AS database_name, NOW() AS database_time');
    res.json({
      status: 'OK',
      database: 'connected',
      databaseName: db[0].database_name,
      databaseTime: db[0].database_time,
      timestamp: new Date().toISOString(),
      message: 'Incident Management Backend is running'
    });
  } catch (error) {
    console.error('Health check database error:', error);
    res.status(500).json({
      status: 'ERROR',
      database: 'disconnected',
      message: error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║   Incident Management Portal - Backend Server Started     ║
╠═══════════════════════════════════════════════════════════╣
║   🚀 Server running at: http://localhost:${PORT}            ║
║   📝 API Base URL: http://localhost:${PORT}/api              ║
║   🔐 Environment: ${process.env.NODE_ENV || 'development'}                        ║
╠═══════════════════════════════════════════════════════════╣
║   Available Endpoints:                                    ║
║   POST   /api/auth/login                                  ║
║   GET    /api/auth/users                                  ║
║   GET    /api/auth/me                                     ║
║   POST   /api/incidents                                   ║
║   GET    /api/incidents                                   ║
║   GET    /api/incidents/:id                               ║
║   PUT    /api/incidents/:id                               ║
║   DELETE /api/incidents/:id                               ║
║   POST   /api/incidents/:id/comments                      ║
║   GET    /api/incidents/stats/dashboard                   ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

startUiServer({ ignorePortInUse: true });
