import express from 'express';
import { verifyJWT } from '../middlewares/authMiddleware.js';
import DmMessage from '../models/DmMessage.js';
import User from '../models/User.js';
import mongoose from 'mongoose';

const router = express.Router();

router.use(verifyJWT);


router.get('/conversations', async (req, res) => {
  try {
    const myId = req.user._id;

    // Find all unique partners this user has exchanged DMs with
    const partnersRaw = await DmMessage.aggregate([
      {
        $match: {
          $or: [
            { fromId: myId },
            { toId:   myId },
          ],
        },
      },
      {
        $project: {
          partner: {
            $cond: [{ $eq: ['$fromId', myId] }, '$toId', '$fromId'],
          },
          content:   1,
          createdAt: 1,
          fromId:    1,
          toId:      1,
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id:       '$partner',
          lastMsg:   { $first: '$$ROOT' },
        },
      },
    ]);

    if (!partnersRaw.length) return res.json({ conversations: [] });

    const partnerIds = partnersRaw.map(p => p._id);

    // Fetch partner user docs in one query
    const partnerUsers = await User.find({ _id: { $in: partnerIds } })
      .select('_id username name')
      .lean();

    const partnerMap = {};
    for (const u of partnerUsers) {
      partnerMap[u._id.toString()] = u;
    }

    // For each partner, load last 30 messages (chronological)
    const conversations = await Promise.all(
      partnersRaw.map(async ({ _id: partnerId }) => {
        const msgs = await DmMessage.find({
          $or: [
            { fromId: myId,     toId:   partnerId },
            { fromId: partnerId, toId:  myId      },
          ],
        })
          .sort({ createdAt: -1 })
          .limit(30)
          .lean();

        const partner = partnerMap[partnerId.toString()];
        const myIdStr = myId.toString();

        return {
          id:       `dm-${partnerId}`,
          userId:   partnerId.toString(),
          name:     partner?.username || partner?.name || 'Unknown',
          status:   'offline',
          dmStatus: 'accepted',          // messages exist ⟹ pair was accepted
          messages: msgs.reverse().map(m => ({
            id:        m._id.toString(),
            from:      m.fromId.toString() === myIdStr ? 'me' : m.fromId.toString(),
            text:      m.content,
            content:   m.content,
            time:      new Date(m.createdAt).toLocaleTimeString([], {
                         hour: '2-digit', minute: '2-digit',
                       }),
            createdAt: m.createdAt,
          })),
        };
      })
    );

    res.json({ conversations });
  } catch (err) {
    console.error('[GET /dm/conversations]', err);
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

export default router;