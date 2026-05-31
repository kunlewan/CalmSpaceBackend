import { redisClient } from '../config/redis.js';

const PRESENCE_TTL = 30; // seconds — clients should heartbeat every ~15s

/**
 * /presence namespace handler.
 *
 * Tracks online status per user in Redis.
 *
 * Events IN:
 *   heartbeat  {} — refresh presence TTL
 *
 * Events OUT:
 *   presence_ack  { online: true }  — confirms connection
 */
export default function registerPresenceHandlers(socket) {
  const userId = socket.user._id.toString();

  async function setOnline() {
    try {
      await redisClient.setex(`presence:${userId}`, PRESENCE_TTL, '1');
    } catch (err) {
      console.error('[presence] setOnline failed:', err.message);
    }
  }

  async function setOffline() {
    try {
      await redisClient.del(`presence:${userId}`);
    } catch (err) {
      console.error('[presence] setOffline failed:', err.message);
    }
  }

  // Mark online immediately on connect
  setOnline();
  socket.emit('presence_ack', { online: true });

  socket.on('heartbeat', () => setOnline());

  socket.on('disconnect', () => setOffline());
}
