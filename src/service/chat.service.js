import Message from '../models/Message.js';
import Room from '../models/Room.js';
import User from '../models/User.js';
import ModerationService from './moderation.service.js';

const PAGE_SIZE = 30;

function formatMessage(msg, userMap = {}) {
  // FIX BUG 3: username might be missing on older messages that were saved
  // before the field was added, or if the save raced. Fall back to the userMap
  // (keyed by senderId string) populated in getHistory, then to 'Unknown'.
  const username =
    msg.username ||
    userMap[msg.senderId?.toString()] ||
    'Unknown';

  return {
    _id:              msg._id.toString(),
    roomId:           msg.roomId?.toString() ?? null,
    userId:           msg.senderId?.toString() ?? null,
    username,
    content:          msg.moderationStatus === 'blocked'
                        ? '[Message removed]'
                        : msg.content,
    moderationStatus: msg.moderationStatus,
    isSystem:         msg.isSystem ?? false,
    reactions:        msg.reactions ?? [],
    createdAt:        msg.createdAt,
  };
}

const toStr = (id) => id?.toString?.() ?? null;

const ChatService = {

  async createRoom({ name, description, topic, createdBy, icon = '💬', isPublic = true }) {
    const creator  = await User.findById(createdBy).lean();
    const username = creator?.username || creator?.name || 'Unknown';
    const room     = await Room.create({
      name, description, topic, icon, createdBy,
      adminId: createdBy, isPublic,
      members: [{ userId: createdBy, username, joinedAt: new Date() }],
      memberCount: 1,
    });
    return room;
  },

  async listRooms({ page = 1, search = '' } = {}) {
    const query = { isPublic: true };
    if (search) query.$text = { $search: search };
    return Room.find(query)
      .sort({ memberCount: -1, createdAt: -1 })
      .skip((page - 1) * 10)
      .limit(10)
      .lean();
  },

  async getRoom(roomId) {
    return Room.findById(roomId).lean();
  },

  // ── History ────────────────────────────────────────────────────────────────
  // FIX BUG 3: after fetching messages, collect any that have no username,
  // batch-fetch the missing usernames in one query, then pass the map into
  // formatMessage so every message always has a display name.
  async getHistory(roomId, { before, limit = PAGE_SIZE } = {}) {
    const query = {
      roomId,
      isSystem:         false,
      deletedAt:        null,
      moderationStatus: { $ne: 'blocked' },
    };
    if (before) query.createdAt = { $lt: new Date(before) };

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Collect senderIds whose username is missing/empty
    const missingIds = [
      ...new Set(
        messages
          .filter(m => !m.username && m.senderId)
          .map(m => m.senderId.toString())
      ),
    ];

    // One DB round-trip for all missing usernames
    let userMap = {};
    if (missingIds.length) {
      const users = await User.find({ _id: { $in: missingIds } })
        .select('_id username name')
        .lean();
      for (const u of users) {
        userMap[u._id.toString()] = u.username || u.name || 'Unknown';
      }
    }

    return messages.reverse().map(m => formatMessage(m, userMap));
  },

  // ── Send message ───────────────────────────────────────────────────────────
  async sendMessage({ userId, roomId, content }) {
    if (!content?.trim()) throw new Error('Message content cannot be empty');
    if (content.length > 2000) throw new Error('Message too long (max 2000 characters)');

    const user = await User.findById(userId).lean();
    if (!user) throw new Error('User not found');

    const username = user.username || user.name || 'Unknown';

    const { status: moderationStatus, reason: flagReason } =
      ModerationService.evaluate(content);

    const message = await Message.create({
      roomId,
      senderId: userId,
      username,           // always stored at send time
      content:  content.trim(),
      moderationStatus,
      flagReason,
    });

    if (moderationStatus !== 'clean') {
      ModerationService.enqueueReview({
        messageId: message._id, roomId, username, content, reason: flagReason,
      }).catch(console.error);
    }

    return { message: formatMessage(message), moderationStatus };
  },

  // ── Join room ──────────────────────────────────────────────────────────────
  async joinRoom({ userId, roomId }) {
    const [room, user] = await Promise.all([
      Room.findById(roomId),
      User.findById(userId).lean(),
    ]);
    if (!room) throw new Error('Room not found');
    if (!user) throw new Error('User not found');

    const username  = user.username || user.name || 'Unknown';
    const userIdStr = toStr(userId);

    room.members = room.members.filter(m => m?.userId != null);
    const alreadyMember = room.members.some(m => toStr(m.userId) === userIdStr);
    if (!alreadyMember) {
      room.members.push({ userId: user._id, username, joinedAt: new Date() });
    }
    room.memberCount = room.members.length;
    await room.save();

    const members = room.members
      .map(m => ({
        userId:  toStr(m.userId),
        username: m.username || 'Unknown',
        isAdmin: toStr(room.adminId) === toStr(m.userId),
      }))
      .filter(m => m.userId !== null);

    return {
      room: {
        _id:         room._id.toString(),
        name:        room.name,
        icon:        room.icon,
        description: room.description,
        memberCount: room.memberCount,
      },
      members,
      adminId: toStr(room.adminId),
    };
  },

  // ── Leave room ─────────────────────────────────────────────────────────────
  // Only called on explicit user action — NOT on socket disconnect.
  async leaveRoom({ userId, roomId }) {
    const room = await Room.findById(roomId);
    if (!room) return;
    const userIdStr = toStr(userId);
    room.members    = room.members.filter(m => toStr(m.userId) !== userIdStr);
    room.memberCount = room.members.length;
    await room.save();
  },

  // ── Remove member (admin action) ──────────────────────────────────────────
  async removeMember({ userId, roomId }) {
    const room = await Room.findById(roomId);
    if (!room) throw new Error('Room not found');
    const userIdStr  = toStr(userId);
    room.members     = room.members.filter(m => toStr(m.userId) !== userIdStr);
    room.memberCount = room.members.length;
    await room.save();
  },
};

export default ChatService;