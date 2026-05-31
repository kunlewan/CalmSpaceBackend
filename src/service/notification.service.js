import { Queue } from 'bullmq';
import { createRedisClient } from '../config/redis.js';

let notifyQueue;

function getNotifyQueue() {
  if (!notifyQueue) {
    notifyQueue = new Queue('notify-queue', {
      connection: createRedisClient(),
    });
  }
  return notifyQueue;
}

const NotificationService = {
  async notifyNewMessage({ roomId, roomName, messageId, alias, preview, offlineUserIds = [] }) {
    if (!offlineUserIds.length) return;
    try {
      const queue = getNotifyQueue();
      await queue.add(
        'new_message',
        { roomId, roomName, messageId, alias, preview, offlineUserIds },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
      );
    } catch (err) {
      console.error('[NotificationService] notifyNewMessage failed:', err.message);
    }
  },

  async notifyMention({ roomId, mentionedUserId, alias, preview }) {
    try {
      const queue = getNotifyQueue();
      await queue.add(
        'mention',
        { roomId, mentionedUserId, alias, preview },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
      );
    } catch (err) {
      console.error('[NotificationService] notifyMention failed:', err.message);
    }
  },
};

export default NotificationService;
