// socket.js
'use strict';

import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

import ChatService from './service/chat.service.js';
import AnonymiserService from './service/anonymiser.service.js';
import Room from './models/Room.js';

// ─── Import the new handler registrar ─────────────────────────────────────
import registerChatHandlers from './sockets/registerChatHandlers.js';   // ← Adjust path if needed

// ─── Auth middleware ───────────────────────────────────────────────────────
function authMiddleware(socket, next) {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token;

    if (!token) return next(new Error('AUTH_MISSING'));

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = payload;
    next();
  } catch {
    next(new Error('AUTH_INVALID'));
  }
}

// ─── initSocket ────────────────────────────────────────────────────────────
function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'https://calm-space-eight.vercel.app',
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingInterval: 25_000,
    pingTimeout: 60_000,
  });

  const chatNs = io.of('/chat');
  chatNs.use(authMiddleware);

  chatNs.on('connection', (socket) => {
    console.log(`[socket] connected   uid=${socket.user._id}  sid=${socket.id}`);

    // Register all chat handlers using the new clean function
    registerChatHandlers(socket, io);

    socket.on('disconnect', (reason) => {
      console.log(`[socket] disconnected uid=${socket.user._id}  reason=${reason}`);
    });
  });

  chatNs.on('connect_error', (err) => {
    console.warn('[socket] connect_error', err.message);
  });

  return io;
}

export default initSocket;