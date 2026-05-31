import { Queue } from 'bullmq';
import { createRedisClient } from '../config/redis.js';

const BLOCKED_PATTERNS = [
  /\bfuck\b/i,
  /\bshit\b/i,
  /\basshole\b/i,
  /\bbitch\b/i,
  /\bcunt\b/i,
  /\bdick\b/i,
  /\bn[i1]gg[ae]r\b/i,
  /\bk[i1]ke\b/i,
  /\bspic\b/i,
  /\bfaggot\b/i,
];

const FLAG_PATTERNS = [
  /\bkill\s*(my|your)?self\b/i,
  /\bsuicid/i,
  /\bself.?harm\b/i,
];

let moderationQueue;

function getModerationQueue() {
  if (!moderationQueue) {
    moderationQueue = new Queue('moderation-queue', {
      connection: createRedisClient(),
    });
  }
  return moderationQueue;
}

const ModerationService = {
  evaluate(content) {
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(content)) {
        return { status: 'blocked', reason: 'profanity', content };
      }
    }
    for (const pattern of FLAG_PATTERNS) {
      if (pattern.test(content)) {
        return { status: 'flagged', reason: 'sensitive_topic', content };
      }
    }
    return { status: 'clean', reason: null, content };
  },

  async enqueueReview({ messageId, roomId, alias, content, reason }) {
    try {
      const queue = getModerationQueue();
      await queue.add(
        'review',
        { messageId: messageId.toString(), roomId: roomId.toString(), alias, content, reason },
        { attempts: 3, backoff: { type: 'exponential', delay: 1000 } }
      );
    } catch (err) {
      console.error('[ModerationService] enqueueReview failed:', err.message);
    }
  },
};

export default ModerationService;
