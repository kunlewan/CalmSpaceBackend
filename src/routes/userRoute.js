import express from 'express';
import { verifyJWT } from '../middlewares/authMiddleware.js';
import User from '../models/User.js';

const router = express.Router();

router.use(verifyJWT);

// ── GET /api/users/search?q=... ───────────────────────────────────────────────
// Search users by username or name (case-insensitive, partial match).
// Excludes the requesting user from results.
// Returns: { users: [{ _id, username, name, email }] }

router.get('/search', async (req, res) => {
  try {
    const q = req.query.q?.trim();
    if (!q || q.length < 1) {
      return res.status(400).json({ error: 'Query parameter q is required' });
    }

    // Escape regex special chars to prevent ReDoS
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex   = new RegExp(escaped, 'i');

    const users = await User.find({
      _id:      { $ne: req.user._id },         // exclude self
      $or: [
        { username: regex },
        { name:     regex },
        { email:    regex },
      ],
    })
      .select('_id username name email')        // never return passwordHash etc.
      .limit(20)
      .lean();

    res.json({ users });
  } catch (err) {
    console.error('[GET /users/search]', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ── GET /api/users/:userId ────────────────────────────────────────────────────
// Fetch a single user's public profile.

router.get('/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('_id username name email')
      .lean();

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    console.error('[GET /users/:userId]', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

export default router;