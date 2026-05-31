import { Worker } from 'bullmq';
import { createBullMQClient } from '../config/redis.js';   // ← Changed

let _io;

export default function createNotifyWorker(io) {
  _io = io;

  const worker = new Worker(
    'notify-queue',
    async (job) => {
      try {
        if (job.name === 'new_message') {
          const { roomId, roomName, messageId, alias, preview, offlineUserIds } = job.data;

          for (const userId of offlineUserIds || []) {
            if (_io) {
              _io.of('/notify').to(userId).emit('new_message_notification', {
                roomId,
                roomName,
                alias,
                preview,
              });
            }
            console.log(`[NotifyWorker] in-app → user ${userId}: new message in ${roomName}`);
          }
        }

        if (job.name === 'mention') {
          const { roomId, mentionedUserId, alias, preview } = job.data;

          if (_io) {
            _io.of('/notify').to(mentionedUserId).emit('mention_notification', {
              roomId,
              alias,
              preview,
            });
          }
          console.log(`[NotifyWorker] mention → user ${mentionedUserId} by ${alias}`);
        }

        return { success: true };
      } catch (error) {
        console.error(`[NotifyWorker] Error processing job ${job.id}:`, error);
        throw error; // BullMQ will handle retries/failure
      }
    },
    {
      connection: createBullMQClient(),   // ← Must be BullMQ client
      concurrency: 10,
    }
  );

  // Event listeners
  worker.on('completed', (job) => {
    console.log(`[NotifyWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[NotifyWorker] Job ${job.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[NotifyWorker] Worker critical error:', err.message);
  });

  return worker;
}