// src/sockets/index.js
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createRedisClient } from '../config/redis.js';
import socketAuthMiddleware from '../middlewares/socketAuth.js';
import registerChatHandlers from './chat.handler.js';
import registerPresenceHandlers from './presence.handler.js';

/**
 * Creates and configures the Socket.IO server with multiple namespaces.
 *
 * Namespaces:
 *   /chat      — Main chat functionality (rooms, messages, typing, etc.)
 *   /presence  — Online status & heartbeat
 *   /notify    — Server-to-client push notifications
 *
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server}
 */
export default function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'https://calm-space-eight.vercel.app/',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingInterval: 25000,
    pingTimeout: 60000,
  });

  // ── Redis Adapter for Horizontal Scaling ─────────────────────────────
  const pubClient = createRedisClient();
  const subClient = pubClient.duplicate();

  Promise.all([pubClient.connect(), subClient.connect()])
    .then(() => {
      io.adapter(createAdapter(pubClient, subClient));
      console.log('[Socket.IO] Redis adapter successfully connected');
    })
    .catch((err) => {
      console.warn('[Socket.IO] Failed to connect Redis adapter — running in single instance mode:', err.message);
    });

  // ── /chat namespace ──────────────────────────────────────────────────
  const chatNs = io.of('/chat');
  chatNs.use(socketAuthMiddleware);

  chatNs.on('connection', (socket) => {
    console.log(`[/chat] User connected → ${socket.user._id} | socketId: ${socket.id}`);
    
    registerChatHandlers(socket, io);   // ← All chat logic lives here

    socket.on('disconnect', (reason) => {
      console.log(`[/chat] User disconnected → ${socket.user._id} | reason: ${reason}`);
    });
  });

  // ── /presence namespace ──────────────────────────────────────────────
  const presenceNs = io.of('/presence');
  presenceNs.use(socketAuthMiddleware);

  presenceNs.on('connection', (socket) => {
    console.log(`[/presence] User connected → ${socket.user._id}`);
    
    registerPresenceHandlers(socket);

    socket.on('disconnect', () => {
      console.log(`[/presence] User disconnected → ${socket.user._id}`);
    });
  });

  // ── /notify namespace ────────────────────────────────────────────────
  const notifyNs = io.of('/notify');
  notifyNs.use(socketAuthMiddleware);

  notifyNs.on('connection', (socket) => {
    // Each user joins their own private room for targeted notifications
    socket.join(socket.user._id.toString());
    
    console.log(`[/notify] User connected → ${socket.user._id} (joined private room)`);
  });

  console.log('[Socket.IO] All namespaces initialized successfully');

  return io;
}