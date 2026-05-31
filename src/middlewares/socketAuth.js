import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * Socket.IO authentication middleware.
 *
 * Clients must pass the access token in ONE of:
 *   socket.handshake.auth.token        (preferred)
 *   socket.handshake.headers.authorization  "Bearer <token>"
 *   socket.handshake.query.token       (fallback for older clients)
 *
 * FIX: original used JWT_SECRET which doesn't exist — tokens are signed
 *      with JWT_ACCESS_SECRET. Now consistent with authMiddleware and token.js.
 * FIX: original only decoded payload into a plain object — now we fetch
 *      the real User document so socket.user is a full Mongoose doc,
 *      matching what REST middleware provides.
 */
export default async function socketAuthMiddleware(socket, next) {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
      socket.handshake.query?.token;

    if (!token) {
      return next(new Error('AUTH_MISSING_TOKEN'));
    }

    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
    });

    const user = await User.findById(payload.id).select('-password -refreshToken');
    if (!user || !user.isEmailVerified) {
      return next(new Error('AUTH_INVALID_TOKEN'));
    }

    // Attach full user document to socket
    socket.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new Error('AUTH_TOKEN_EXPIRED'));
    }
    next(new Error('AUTH_INVALID_TOKEN'));
  }
}
