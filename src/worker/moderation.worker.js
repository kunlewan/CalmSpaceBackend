import { Worker } from 'bullmq';
import { createBullMQClient } from '../config/redis.js';   // ← Changed
import Message from '../models/Message.js';

const moderationWorker = new Worker(
  'moderation-queue',
  async (job) => {
    const { messageId, roomId, alias, content, reason } = job.data;

    console.log(
      `[ModerationWorker] Reviewing message ${messageId} from ${alias} in room ${roomId} (reason: ${reason})`
    );

    try {
      // TODO: integrate external moderation API
      // const result = await callModerationAPI(content);
      // await Message.findByIdAndUpdate(messageId, { 
      //   moderationStatus: result.status,
      //   moderationReason: result.reason 
      // });

      // For now, just mark as completed
      return { success: true, messageId };
    } catch (error) {
      console.error(`[ModerationWorker] Error processing job ${job.id}:`, error);
      throw error; // Let BullMQ handle the retry/failure
    }
  },
  {
    connection: createBullMQClient(),   // ← Must use BullMQ config
    concurrency: 5,
  }
);

// Event listeners
moderationWorker.on('completed', (job) => {
  console.log(`[ModerationWorker] Job ${job.id} completed successfully`);
});

moderationWorker.on('failed', (job, err) => {
  console.error(`[ModerationWorker] Job ${job.id} failed:`, err.message);
});

moderationWorker.on('error', (err) => {
  console.error('[ModerationWorker] Worker error:', err.message);
});

export default moderationWorker;