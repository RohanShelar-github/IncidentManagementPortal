const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();
require('dotenv').config({ path: require('path').join(__dirname, '.env.local'), override: true });

const authRoutes = require('./routes/authRoutes');
const incidentRoutes = require('./routes/incidentRoutes');
const masterDataRoutes = require('./routes/masterDataRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const roleRoutes = require('./routes/roleRoutes');
const aiRoutes = require('./routes/aiRoutes');
const { startUiServer } = require('../server-ui');
const pool = require('./config/database');
const { configured: emailConfigured } = require('./services/emailService');
const { configured: aiConfigured } = require('./services/aiService');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const allowedOrigins = String(process.env.CORS_ORIGIN || 'http://localhost:5500')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Middleware
app.use(cors({
  origin(origin, callback) {
    // Requests without an Origin header are non-browser/server-to-server requests.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  },
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
app.use('/api/master-data', masterDataRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/ai', aiRoutes);

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const [db] = await pool.query('SELECT DATABASE() AS database_name, NOW() AS database_time');
    res.json({
      status: 'OK',
      database: 'connected',
      databaseName: db[0].database_name,
      databaseTime: db[0].database_time,
      emailConfigured: emailConfigured(),
      aiConfigured: aiConfigured(),
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
app.listen(PORT, HOST, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║   Incident Management Portal - Backend Server Started     ║
╠═══════════════════════════════════════════════════════════╣
║   🚀 Server listening on: http://${HOST}:${PORT}             ║
║   📝 Browser API path: /api (proxied through UI port 5500)   ║
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
