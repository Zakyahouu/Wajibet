// ✅ BREADCRUMB LOGS HAVE BEEN ADDED TO HELP DEBUG STARTUP
console.log('✅ [1/5] Server script starting up...');

// Load environment variables FIRST
require('dotenv').config();

// Debug environment variables
console.log('🔍 Environment check:');
console.log('  NODE_ENV:', process.env.NODE_ENV);
console.log('  PORT:', process.env.PORT);
console.log('  CORS_ORIGIN:', process.env.CORS_ORIGIN);
console.log('  MONGO_URI:', process.env.MONGO_URI ? 'Set' : 'Not set');

const http = require('http');
const { Server } = require('socket.io');
const app = require('./app'); // Import the configured Express app
const connectDB = require('./config/db');
const { setIO } = require('./realtimeState'); // We'll use this to share the IO instance
const jwt = require('jsonwebtoken');
const User = require('./models/User');

const {
  ensureUserStudentCodePartialIndex,
  ensureAttendanceIndexes,
  ensurePaymentsIdempotencyIndex
} = require('./config/migrations');

// Optional services
if (process.env.ENABLE_SCHOOL_DELETION_CRON === 'true') {
  try { require('./services/schoolDeletionService'); } catch (e) { console.error('Failed to load schoolDeletionService:', e); }
}

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// --- Configure Socket.IO ---
const hostedOrigins = ['https://wajibet.com', 'https://www.wajibet.com', 'http://72.60.133.119'];
const allowedOrigins = Array.from(new Set([
  ...hostedOrigins,
  ...(process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean)
]));
const io = new Server(server, {
  cors: {
    origin: allowedOrigins.length > 0 ? allowedOrigins : "*",
    methods: ["GET", "POST"]
  }
});

io.use(async (socket, next) => {
  try {
    const token = socket.handshake?.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password').lean();
    if (!user) return next(new Error('User not found'));
    socket.user = user;
    return next();
  } catch (error) {
    return next(new Error('Authentication failed'));
  }
});

// Share the 'io' instance with the rest of the application
setIO(io);
console.log('✅ [2/5] Socket.IO initialized and shared.');

// Add engine-level and connect error logging to help diagnose websocket handshake failures
try {
  if (io && io.engine && typeof io.engine.on === 'function') {
    io.engine.on('connection_error', (err) => {
      console.error('[socket] engine connection_error', err);
    });
  }
  io.on('connect_error', (err) => {
    console.error('[socket] connect_error', err);
  });
} catch (e) { console.warn('[socket] Failed to attach connection_error listeners', e); }

// --- Main Socket.IO connection handler ---
// Load the dedicated socket handler that wires app-level liveGames with Socket.IO
try {
  require('./socket/socketHandler')(io);
  console.log('✅ [socket] socketHandler mounted');
} catch (e) {
  console.error('❌ [socket] failed to mount socketHandler', e);
}

// --- Asynchronous Start Function ---
const startServer = async () => {
  try {
    // Connect to DB only if not in a test environment
    if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID) {
      console.log('✅ [3/5] Connecting to database...');
      await connectDB();
      console.log('Database connection successful.');

      // Run migrations and backups
      await ensureUserStudentCodePartialIndex();
      await ensureAttendanceIndexes();
      await ensurePaymentsIdempotencyIndex();
      if (process.env.BACKUP_ON_START === 'true') {
        try { await require('./scripts/autoBackup')(); } catch (e) { console.error('Auto-backup failed:', e); }
      }
    }

    console.log('✅ [4/5] About to start server on port', PORT);
    server.listen(PORT, () => {
      console.log(`🚀 [5/5] Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1); // Exit with failure code
  }
};

// --- Execute Start ---
startServer();

// --- Graceful Shutdown & Error Handling ---
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  server.close(() => process.exit(1));
});
