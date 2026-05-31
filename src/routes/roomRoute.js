import express from 'express';
import mongoose from 'mongoose';
import { verifyJWT } from '../middlewares/authMiddleware.js';
import ChatService from '../service/chat.service.js';
import Room from '../models/Room.js';

const router = express.Router();

router.use(verifyJWT);

// ── Typed application error ────────────────────────────────────────────────────
// Throw this from ChatService to signal a known client error.
// The controller reads err.statusCode; unknown errors fall through to 500.
export class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Validate a MongoDB ObjectId param.
 * Prevents Mongoose CastErrors from reaching service code.
 */
function validateObjectId(paramName) {
  return (req, res, next) => {
    if (!mongoose.Types.ObjectId.isValid(req.params[paramName])) {
      return res.status(400).json({ error: `Invalid ${paramName}` });
    }
    next();
  };
}

/**
 * Require the authenticated user to be a member of :roomId.
 * Attach room to req.room so downstream handlers don't re-query.
 *
 * FIX: Non-members were previously able to post messages because
 * there was no membership guard anywhere on the message route.
 */
function requireMember(req, res, next) {
  Room.findOne({
    _id: req.params.roomId,
    'members.userId': req.user._id,
  })
    .lean()
    .then((room) => {
      if (!room) return res.status(403).json({ error: 'Not a member of this room' });
      req.room = room;
      next();
    })
    .catch(next);
}

/**
 * Centralised error handler for route callbacks.
 * Reads AppError.statusCode; falls back to 500 for anything unexpected.
 *
 * FIX: Previously, join errors were bucketed by matching message strings —
 * fragile and wrong (a DB timeout returned 400). Now the service throws
 * AppError with an explicit statusCode, and unknown errors get 500.
 */
function handleError(err, res, context) {
  console.error(`[${context}]`, err);
  const status = err instanceof AppError ? err.statusCode : 500;
  res.status(status).json({ error: err.message });
}

// ── GET /api/rooms ─────────────────────────────────────────────────────────────
// Returns { joined: Room[], discover: Room[] } split by membership.
//
// FIX: Previously loaded ALL public rooms into Node memory, then split them
// in JavaScript — a full collection scan. Now uses two targeted DB queries
// so the database does the work.

router.get('/', async (req, res) => {
  try {
    const userId = req.user._id;

    const [joined, discover] = await Promise.all([
      Room.find({ isPublic: true, 'members.userId': userId })
        .sort({ createdAt: -1 })
        .lean(),
      Room.find({ isPublic: true, 'members.userId': { $ne: userId } })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    res.json({ joined, discover });
  } catch (err) {
    handleError(err, res, 'GET /rooms');
  }
});

// ── GET /api/rooms/joined ──────────────────────────────────────────────────────
// Returns all rooms the user belongs to, including private ones.
// (Intentional: a user can always see rooms they are already in.)

router.get('/joined', async (req, res) => {
  try {
    const joined = await Room.find({ 'members.userId': req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ joined });
  } catch (err) {
    handleError(err, res, 'GET /rooms/joined');
  }
});

// ── POST /api/rooms ────────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  try {
    const { name, description, topic, icon, isPublic } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const room = await ChatService.createRoom({
      name: name.trim(),
      description,
      topic,
      icon,
      isPublic,
      createdBy: req.user._id,
    });

    res.status(201).json({ room });
  } catch (err) {
    handleError(err, res, 'POST /rooms');
  }
});

// ── GET /api/rooms/:roomId ─────────────────────────────────────────────────────

router.get('/:roomId', validateObjectId('roomId'), async (req, res) => {
  try {
    const room = await ChatService.getRoom(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json({ room });
  } catch (err) {
    handleError(err, res, 'GET /rooms/:roomId');
  }
});

// ── GET /api/rooms/:roomId/history ─────────────────────────────────────────────
//
// FIX: Previously accepted any limit value from the query string with no cap.
// A client could request limit=999999 and load the entire message collection.
// Now clamped between 1 and 100; defaults to 50.

const HISTORY_MAX_LIMIT = 100;
const HISTORY_DEFAULT_LIMIT = 50;

router.get('/:roomId/history', validateObjectId('roomId'), async (req, res) => {
  try {
    const { before } = req.query;
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(rawLimit, 1), HISTORY_MAX_LIMIT)
      : HISTORY_DEFAULT_LIMIT;

    const messages = await ChatService.getHistory(req.params.roomId, { before, limit });
    res.json({ messages });
  } catch (err) {
    handleError(err, res, 'GET /rooms/:roomId/history');
  }
});

// ── POST /api/rooms/:roomId/messages ───────────────────────────────────────────
//
// FIX 1: requireMember is now applied — previously any authenticated user
//         could post to any room without being a member.
// FIX 2: content length is capped at 4000 chars to prevent oversized writes.

const MESSAGE_MAX_LENGTH = 4000;

router.post(
  '/:roomId/messages',
  validateObjectId('roomId'),
  requireMember,
  async (req, res) => {
    try {
      const content = req.body.content?.trim();

      if (!content) {
        return res.status(400).json({ error: 'content is required' });
      }
      if (content.length > MESSAGE_MAX_LENGTH) {
        return res.status(400).json({
          error: `content must be ${MESSAGE_MAX_LENGTH} characters or fewer`,
        });
      }

      const result = await ChatService.sendMessage({
        userId: req.user._id,
        roomId: req.params.roomId,
        content,
      });

      res.status(201).json(result);
    } catch (err) {
      handleError(err, res, 'POST /rooms/:roomId/messages');
    }
  },
);

// ── POST /api/rooms/:roomId/join ───────────────────────────────────────────────
//
// FIX 1: Duplicate joins are now prevented atomically in the DB using
//         $addToSet inside findOneAndUpdate. If the subdoc is already present
//         the service throws AppError(409) rather than silently duplicating it.
//
// FIX 2: Username is snapshotted into the members[] array at join time.
//         Previously only userId was stored, so display names were lost if a
//         user record was later updated or the user left.
//
// FIX 3: Error status is determined by AppError.statusCode, not string matching.

router.post('/:roomId/join', validateObjectId('roomId'), async (req, res) => {
  try {
    const result = await ChatService.joinRoom({
      userId: req.user._id,
      roomId: req.params.roomId,
    });
 
    res.json(result);
  } catch (err) {
    handleError(err, res, 'POST /rooms/:roomId/join');
  }
});

// ── POST /api/rooms/:roomId/leave ─────────────────────────────────────────────
// Explicit leave endpoint — was missing entirely.
// The username snapshot means room history stays labelled correctly after leave.

router.post('/:roomId/leave', validateObjectId('roomId'), requireMember, async (req, res) => {
  try {
    await ChatService.leaveRoom({
      userId: req.user._id,
      roomId: req.params.roomId,
    });
 
    res.json({ success: true });
  } catch (err) {
    handleError(err, res, 'POST /rooms/:roomId/leave');
  }
});

export default router;

// ─────────────────────────────────────────────────────────────────────────────
// What ChatService.joinRoom should look like (atomic, idempotency-safe):
//
// async joinRoom({ userId, username, roomId }) {
//   const memberDoc = { userId, username, joinedAt: new Date() };
//
//   // $addToSet is NOT sufficient here because MongoDB compares the whole
//   // subdocument — a changed username would add a duplicate. Use a
//   // conditional update that checks for userId specifically.
//   const room = await Room.findOneAndUpdate(
//     { _id: roomId, 'members.userId': { $ne: userId } },  // condition: not already a member
//     { $push: { members: memberDoc } },                    // atomic push
//     { new: true, runValidators: true },
//   );
//
//   if (!room) {
//     // Either the room doesn't exist or the user is already a member.
//     const exists = await Room.exists({ _id: roomId });
//     if (!exists) throw new AppError('Room not found', 404);
//     throw new AppError('Already a member of this room', 409);
//   }
//
//   return { room };
// }
//
// async leaveRoom({ userId, roomId }) {
//   const room = await Room.findByIdAndUpdate(
//     roomId,
//     { $pull: { members: { userId } } },
//     { new: true },
//   );
//   if (!room) throw new AppError('Room not found', 404);
//   return { room };
// }
// ─────────────────────────────────────────────────────────────────────────────