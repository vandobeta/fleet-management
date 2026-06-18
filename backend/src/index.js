require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Socket.IO setup for real-time updates
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Make io available in requests
app.set('io', io);

// Routes
const authRoutes = require('./routes/auth');
const vehicleRoutes = require('./routes/vehicles');
const geofenceRoutes = require('./routes/geofences');
const telemetryRoutes = require('./routes/telemetry');
const commandRoutes = require('./routes/commands');
const analyticsRoutes = require('./routes/analytics');
const alertsRoutes = require('./routes/alerts');
const deviceRoutes = require('./routes/devices');
const subscriptionRoutes = require('./routes/subscriptions');
const paymentRoutes = require('./routes/payments');

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/geofences', geofenceRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/commands', commandRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/payments', paymentRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// flespi webhook endpoint (external)
app.post('/api/webhooks/flespi', require('./controllers/telemetry').handleFlespiWebhook);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Fleet Management Backend running on port ${PORT}`);
  
  // Initialize MQTT connection
  require('./services/mqtt').connect(io);
  
  // Initialize command queue processor
  require('./services/commandQueue').startProcessor();
  
  // Initialize payment scheduler
  require('./services/paymentScheduler').startScheduler();
});

module.exports = { app, io };