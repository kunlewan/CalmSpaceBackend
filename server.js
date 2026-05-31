// server.js
import 'dotenv/config';
import { createServer } from 'http';
import app from './app.js';
import connectDB from './src/config/db.js';
import { redisClient } from './src/config/redis.js';
import initSocket from './src/sockets/index.js';           // ← Your socket file
import createNotifyWorker from './src/worker/notify.worker.js';
import moderationWorker from './src/worker/moderation.worker.js';

const PORT = process.env.PORT || 5000;

async function start() {
  // ── Database Connection ─────────────────────────────────────────────
  try {
    await connectDB();
    console.log('[DB] Connected successfully');
  } catch (err) {
    console.error('[DB] Connection fatal error:', err.message);
    process.exit(1);
  }

  // ── Redis Connection ────────────────────────────────────────────────
  try {
    await redisClient.connect();
    console.log('[Redis] Connected');
  } catch (err) {
    console.warn('[Redis] Connection failed — running without Redis:', err.message);
  }

  // ── HTTP Server + Socket.IO ─────────────────────────────────────────
  const httpServer = createServer(app);
  
  // Initialize Socket.IO (This starts your WebSocket server)
  const io = initSocket(httpServer);
  console.log('[Socket.IO] Initialized on /chat namespace');

  // ── Workers ─────────────────────────────────────────────────────────
  try {
    await moderationWorker.close(); // Optional: close if already running
  } catch (err) {
    // Ignore if not running
  }

  createNotifyWorker(io); // Pass io instance to notify worker if needed
  console.log('[Workers] Notify worker started');

  // ── Start Listening ─────────────────────────────────────────────────
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 CalmSpace server running on port ${PORT}`);
    console.log(`📡 Socket.IO ready for connections\n`);
  });

  // ── Graceful Shutdown ───────────────────────────────────────────────
  const shutdown = async (signal) => {
    console.log(`\n[${signal}] Shutting down gracefully...`);

    try {
      await moderationWorker.close();
      console.log('[Worker] Moderation worker closed');
    } catch (err) {}

    try {
      await redisClient.quit();
      console.log('[Redis] Connection closed');
    } catch (err) {}

    httpServer.close(() => {
      console.log('[HTTP] Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('❌ Fatal startup error:', err);
  process.exit(1);
});