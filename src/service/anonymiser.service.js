import { redisClient } from '../config/redis.js';

const ADJECTIVES = [
  'Calm', 'Brave', 'Kind', 'Wise', 'Swift', 'Bold', 'Gentle', 'Quiet',
  'Bright', 'Warm', 'Cool', 'Clear', 'Free', 'Deep', 'Still', 'Open',
  'Soft', 'Pure', 'Wild', 'True', 'Safe', 'Glad', 'Keen', 'Lively',
];

const ANIMALS = [
  'Owl', 'Fox', 'Bear', 'Deer', 'Wolf', 'Hare', 'Lynx', 'Hawk',
  'Dove', 'Swan', 'Crow', 'Wren', 'Finch', 'Robin', 'Crane', 'Raven',
  'Otter', 'Badger', 'Panda', 'Koala', 'Seal', 'Whale', 'Tiger', 'Eagle',
];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateAlias() {
  return `${randomFrom(ADJECTIVES)}${randomFrom(ANIMALS)}${Math.floor(Math.random() * 100)}`;
}

/**
 * Redis key schema:
 *   alias:{userId}:{roomId}  → alias string   (TTL = ALIAS_TTL seconds)
 *   room:{roomId}:members    → SET of userIds
 *   room:{roomId}:aliases    → SET of alias strings (collision detection)
 */
const ALIAS_TTL = parseInt(process.env.ALIAS_TTL) || 86400; // 24h

const AnonymiserService = {
  async getOrCreateAlias(userId, roomId) {
    const key = `alias:${userId}:${roomId}`;

    try {
      const existing = await redisClient.get(key);
      if (existing) {
        await redisClient.expire(key, ALIAS_TTL);
        return existing;
      }

      const roomAliasesKey = `room:${roomId}:aliases`;
      let alias;
      let attempts = 0;

      do {
        alias = generateAlias();
        attempts++;
        if (attempts > 20) break; // safety valve — accept collision
      } while (await redisClient.sismember(roomAliasesKey, alias));

      await redisClient.setex(key, ALIAS_TTL, alias);
      await redisClient.sadd(roomAliasesKey, alias);
      await redisClient.expire(roomAliasesKey, ALIAS_TTL);

      return alias;
    } catch {
      // Redis unavailable — generate a temporary alias
      return generateAlias();
    }
  },

  async addMember(userId, roomId) {
    await redisClient.sadd(`room:${roomId}:members`, userId.toString()).catch(() => {});
  },

  async removeMember(userId, roomId) {
    await redisClient.srem(`room:${roomId}:members`, userId.toString()).catch(() => {});
  },

  async getMemberCount(roomId) {
    try {
      return await redisClient.scard(`room:${roomId}:members`);
    } catch {
      return 0;
    }
  },

  async isMember(userId, roomId) {
    try {
      const result = await redisClient.sismember(
        `room:${roomId}:members`,
        userId.toString()
      );
      return result === 1;
    } catch {
      return false;
    }
  },

  async clearSession(userId, roomId) {
    await Promise.all([
      redisClient.del(`alias:${userId}:${roomId}`).catch(() => {}),
      redisClient.srem(`room:${roomId}:members`, userId.toString()).catch(() => {}),
    ]);
  },
};

export default AnonymiserService;
