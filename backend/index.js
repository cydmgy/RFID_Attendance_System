require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// ── Route imports ──────────────────────────────────────────────
const scanRoutes       = require('./src/routes/scan');
const studentRoutes    = require('./src/routes/students');
const attendanceRoutes = require('./src/routes/attendance');
const overrideRoutes   = require('./src/routes/override');
const leaveRoutes      = require('./src/routes/leave');
const roomsRoutes      = require('./src/routes/rooms');
const subjectsRoutes   = require('./src/routes/subjects');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security & Static Assets ────────────────────────────────────
// Disable restrictive CSP in local dev so CDNs (icons, fonts, charts) load smoothly
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: '*', // In production, restrict to your Vercel domain
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// ── Rate limiter for the IoT scan endpoint ────────────────────
const scanLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 60,                  // max 60 scans per minute per IP
  message: { error: 'Too many requests — slow down' },
});

// ── Routes ─────────────────────────────────────────────────────
app.use('/api/scan',       scanLimiter, scanRoutes);
app.use('/api/students',   studentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/override',   overrideRoutes);
app.use('/api/leave',      leaveRoutes);
app.use('/api/rooms',      roomsRoutes);
app.use('/api/subjects',   subjectsRoutes);

// ── Health check (also used by ESP32 to verify connectivity) ───
app.get('/api/ping', (req, res) => {
  res.json({
    status: 'online',
    server: 'Attendance System API',
    timestamp: new Date().toISOString(),
  });
});

// Expose public config needed by frontend (Supabase URL, Anon key, default IoT key)
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    defaultIotKey: process.env.IOT_API_KEY || 'your-secret-esp32-api-key-here',
  });
});

// Fallback to frontend index.html for non-API routes
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    return res.sendFile(path.join(__dirname, '../frontend/index.html'));
  }
  next();
});

// ── 404 handler for API routes ─────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ── Global error handler ───────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[UNHANDLED ERROR]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start server ───────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Attendance API running at http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/ping`);
  console.log(`   IoT scan:     POST http://localhost:${PORT}/api/scan`);
  console.log(`   Frontend UI:  http://localhost:${PORT}/\n`);
});
