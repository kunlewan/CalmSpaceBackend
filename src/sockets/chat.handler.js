import ChatService from '../service/chat.service.js';
import Room from '../models/Room.js';
import Message from '../models/Message.js';
import DmMessage from '../models/DmMessage.js';
import User from '../models/User.js';

const RATE_LIMIT = { maxMessages: 10, windowMs: 10_000 };

// Shared across all sockets — see previous fix
const dmRequests = new Map();

export default function registerChatHandlers(socket, io) {
  const chatNs = io.of('/chat');

  const rateState = { count: 0, resetAt: Date.now() + RATE_LIMIT.windowMs };
  function checkRateLimit() {
    const now = Date.now();
    if (now > rateState.resetAt) { rateState.count = 0; rateState.resetAt = now + RATE_LIMIT.windowMs; }
    return ++rateState.count <= RATE_LIMIT.maxMessages;
  }
  function emitError(event, message) { socket.emit('error', { event, message }); }

  // ── join_room ─────────────────────────────────────────────────────────────
  socket.on('join_room', async ({ roomId } = {}) => {
    if (!roomId) return emitError('join_room', 'roomId required');
    try {
      const { room, members, adminId } = await ChatService.joinRoom({
        userId: socket.user._id, roomId,
      });
      await socket.join(roomId);
      socket.activeRooms = socket.activeRooms || new Set();
      socket.activeRooms.add(roomId);
      socket.emit('room_joined', {
        room, members, adminId,
        isAdmin: adminId === socket.user._id.toString(),
      });
      const history = await ChatService.getHistory(roomId, { limit: 30 });
      socket.emit('room_history', { roomId, messages: history });
      await broadcastActiveCount(roomId);
    } catch (err) {
      console.error('[join_room]', err);
      emitError('join_room', err.message);
    }
  });

  // ── send_message ──────────────────────────────────────────────────────────
  socket.on('send_message', async ({ roomId, content, tempId } = {}) => {
    if (!roomId || !content?.trim()) return emitError('send_message', 'roomId and content required');
    if (!checkRateLimit()) return emitError('send_message', 'Rate limit exceeded. Slow down.');
    if (!socket.rooms.has(roomId)) return emitError('send_message', 'Join the room before sending messages');
    try {
      const { message, moderationStatus } = await ChatService.sendMessage({
        userId: socket.user._id, roomId, content: content.trim(),
      });
      if (moderationStatus === 'blocked')
        return socket.emit('error', { event: 'send_message', message: 'Your message was blocked by moderation.' });
      chatNs.to(roomId).emit('new_message', {
        ...message,
        userId:   socket.user._id.toString(),
        username: socket.user.username || socket.user.name || 'Unknown',
        tempId:   tempId ?? null,
      });
    } catch (err) {
      console.error('[send_message]', err);
      emitError('send_message', err.message);
    }
  });

  // ── typing ────────────────────────────────────────────────────────────────
  socket.on('typing', ({ roomId, isTyping } = {}) => {
    if (!roomId || !socket.rooms.has(roomId)) return;
    socket.to(roomId).emit('user_typing', {
      userId:   socket.user._id.toString(),
      username: socket.user.username || socket.user.name || 'Someone',
      isTyping: !!isTyping,
    });
  });

  // ── get_active_count ──────────────────────────────────────────────────────
  socket.on('get_active_count', async ({ roomId } = {}) => {
    if (!roomId) return;
    try {
      const count = await getActiveCount(roomId);
      socket.emit('room_active_count', { roomId, count });
    } catch (err) { console.error('[get_active_count]', err); }
  });

  // ── leave_room ────────────────────────────────────────────────────────────
  // Only called when the user explicitly clicks "Leave" — NOT on disconnect.
  socket.on('leave_room', async ({ roomId } = {}) => {
    if (!roomId) return;
    try {
      await ChatService.leaveRoom({ userId: socket.user._id, roomId });
      socket.leave(roomId);
      socket.activeRooms?.delete(roomId);
      socket.emit('room_left', { roomId });
      await broadcastActiveCount(roomId);
    } catch (err) {
      console.error('[leave_room]', err);
      emitError('leave_room', err.message);
    }
  });

  // ── get_history ───────────────────────────────────────────────────────────
  socket.on('get_history', async ({ roomId, before } = {}) => {
    if (!roomId) return emitError('get_history', 'roomId required');
    try {
      const messages = await ChatService.getHistory(roomId, { before, limit: 30 });
      socket.emit('room_history', { roomId, messages, isPaginated: !!before });
    } catch (err) {
      console.error('[get_history]', err);
      emitError('get_history', err.message);
    }
  });

  // ── list_rooms ────────────────────────────────────────────────────────────
  socket.on('list_rooms', async ({ page = 1, search = '' } = {}) => {
    try {
      const rooms = await ChatService.listRooms({ page, search });
      socket.emit('room_list', { rooms, page });
    } catch (err) {
      console.error('[list_rooms]', err);
      emitError('list_rooms', err.message);
    }
  });

  // ── remove_member (admin) ─────────────────────────────────────────────────
  socket.on('remove_member', async ({ roomId, userId } = {}) => {
    if (!roomId || !userId) return emitError('remove_member', 'roomId and userId required');
    try {
      const room = await Room.findById(roomId).lean();
      if (!room) return emitError('remove_member', 'Room not found');
      if (room.adminId?.toString() !== socket.user._id.toString())
        return emitError('remove_member', 'Admin only');
      await ChatService.removeMember({ userId, roomId });
      chatNs.to(roomId).emit('member_removed', { userId, roomId });
      const sockets = await chatNs.in(roomId).fetchSockets();
      for (const s of sockets) {
        if (s.user?._id?.toString() === userId.toString()) s.leave(roomId);
      }
      await broadcastActiveCount(roomId);
    } catch (err) {
      console.error('[remove_member]', err);
      emitError('remove_member', err.message);
    }
  });

  // ── transfer_admin ────────────────────────────────────────────────────────
  socket.on('transfer_admin', async ({ roomId, userId } = {}) => {
    if (!roomId || !userId) return emitError('transfer_admin', 'Missing fields');
    try {
      const room = await Room.findById(roomId).lean();
      if (!room) return emitError('transfer_admin', 'Room not found');
      if (room.adminId?.toString() !== socket.user._id.toString())
        return emitError('transfer_admin', 'Admin only');
      await Room.findByIdAndUpdate(roomId, { adminId: userId });
      chatNs.to(roomId).emit('admin_transferred', { roomId, newAdminId: userId });
    } catch (err) {
      console.error('[transfer_admin]', err);
      emitError('transfer_admin', err.message);
    }
  });

  // ── send_dm ───────────────────────────────────────────────────────────────
  socket.on('send_dm', async ({ toId, content, tempId } = {}) => {
    if (!toId || !content?.trim()) return emitError('send_dm', 'toId and content required');
    try {
      const fromIdStr  = socket.user._id.toString();
      const toIdStr    = toId.toString();
      const hasHistory = await DmMessage.exists({
        $or: [
          { fromId: socket.user._id, toId },
          { fromId: toId, toId: socket.user._id },
        ],
      });
      const acceptedKey = [fromIdStr, toIdStr].sort().join(':');
      const isAccepted  = hasHistory || socket.acceptedDmPeers?.has(acceptedKey);
      if (!isAccepted)
        return socket.emit('error', { event: 'send_dm', message: 'No accepted DM connection' });

      const dm = await DmMessage.create({
        fromId: socket.user._id, toId, content: content.trim(),
      });

      // FIX BUG 1 (partial — server side): always include fromUsername so the
      // client never has to fall back to a raw ID for naming the conversation.
      const payload = {
        _id:          dm._id.toString(),
        fromId:       fromIdStr,
        fromUsername: socket.user.username || socket.user.name || 'Unknown',
        toId:         toIdStr,
        content:      dm.content,
        tempId:       tempId ?? null,
        createdAt:    dm.createdAt,
      };

      socket.emit('new_dm', payload);
      const sockets = await chatNs.fetchSockets();
      for (const s of sockets) {
        if (s.user?._id?.toString() === toIdStr) s.emit('new_dm', payload);
      }
    } catch (err) {
      console.error('[send_dm]', err);
      emitError('send_dm', err.message);
    }
  });

  // ── get_dm_history ────────────────────────────────────────────────────────
  // FIX BUG 1 (partial — server side): include partnerUsername in the response.
  socket.on('get_dm_history', async ({ partnerId } = {}) => {
    if (!partnerId) return emitError('get_dm_history', 'partnerId required');
    try {
      const myId = socket.user._id;
      const [msgs, partnerUser] = await Promise.all([
        DmMessage.find({
          $or: [
            { fromId: myId,      toId: partnerId },
            { fromId: partnerId, toId: myId      },
          ],
        }).sort({ createdAt: -1 }).limit(50).lean(),
        User.findById(partnerId).select('username name').lean(),
      ]);
      socket.emit('dm_history', {
        partnerId:       partnerId.toString(),
        partnerUsername: partnerUser?.username || partnerUser?.name || 'Unknown',
        messages: msgs.reverse().map(m => ({
          _id:       m._id.toString(),
          senderId:  m.fromId.toString(),
          content:   m.content,
          createdAt: m.createdAt,
        })),
      });
    } catch (err) {
      console.error('[get_dm_history]', err);
      emitError('get_dm_history', err.message);
    }
  });

  // ── react_message ─────────────────────────────────────────────────────────
  socket.on('react_message', async ({ roomId, messageId, emoji } = {}) => {
    if (!roomId || !messageId || !emoji)
      return emitError('react_message', 'roomId, messageId and emoji required');
    if (!socket.rooms.has(roomId))
      return emitError('react_message', 'You must be in the room to react');
    try {
      const message = await Message.findOne({ _id: messageId, roomId });
      if (!message) return emitError('react_message', 'Message not found');
      const userId   = socket.user._id.toString();
      const existing = message.reactions.find(r => r.emoji === emoji);
      if (existing) {
        const already = existing.users.map(u => u.toString()).includes(userId);
        if (already) {
          existing.users = existing.users.filter(u => u.toString() !== userId);
          if (existing.users.length === 0)
            message.reactions = message.reactions.filter(r => r.emoji !== emoji);
        } else {
          existing.users.push(socket.user._id);
        }
      } else {
        message.reactions.push({ emoji, users: [socket.user._id] });
      }
      await message.save();
      chatNs.to(roomId).emit('message_reaction', {
        messageId: messageId.toString(), roomId,
        reactions: message.reactions.map(r => ({
          emoji: r.emoji, count: r.users.length,
          users: r.users.map(u => u.toString()),
        })),
      });
    } catch (err) {
      console.error('[react_message]', err);
      emitError('react_message', err.message);
    }
  });

  // ── dm_request ────────────────────────────────────────────────────────────
  socket.on('dm_request', async ({ toId } = {}) => {
    if (!toId) return emitError('dm_request', 'toId required');
    const requestId = `dmr_${Date.now()}_${socket.user._id}`;
    dmRequests.set(requestId, { fromId: socket.user._id.toString(), toId: toId.toString() });
    const sockets = await chatNs.fetchSockets();
    for (const s of sockets) {
      if (s.user?._id?.toString() === toId.toString()) {
        s.emit('dm_request', {
          id: requestId,
          fromId: socket.user._id.toString(),
          fromUsername: socket.user.username || socket.user.name || 'Someone',
        });
      }
    }
  });

  // ── dm_request_accept ─────────────────────────────────────────────────────
  socket.on('dm_request_accept', async ({ requestId } = {}) => {
    if (!requestId) return;
    const req = dmRequests.get(requestId);
    if (!req) return emitError('dm_request_accept', 'Request not found or expired');
    if (req.toId !== socket.user._id.toString())
      return emitError('dm_request_accept', 'Not your request');
    dmRequests.delete(requestId);
    const acceptedKey = [req.fromId, req.toId].sort().join(':');
    socket.acceptedDmPeers = socket.acceptedDmPeers || new Set();
    socket.acceptedDmPeers.add(acceptedKey);
    const acceptorUsername  = socket.user.username || socket.user.name || 'Unknown';
    const requesterUserDoc  = await User.findById(req.fromId).select('username name').lean();
    const requesterUsername = requesterUserDoc?.username || requesterUserDoc?.name || 'Unknown';
    const sockets = await chatNs.fetchSockets();
    for (const s of sockets) {
      if (s.user?._id?.toString() === req.fromId) {
        s.acceptedDmPeers = s.acceptedDmPeers || new Set();
        s.acceptedDmPeers.add(acceptedKey);
        s.emit('dm_request_accepted', {
          requestId,
          partnerId:       socket.user._id.toString(),
          partnerUsername: acceptorUsername,
        });
      }
    }
    socket.emit('dm_request_accepted', {
      requestId,
      partnerId:       req.fromId,
      partnerUsername: requesterUsername,
    });
  });

  // ── dm_request_decline ────────────────────────────────────────────────────
  socket.on('dm_request_decline', async ({ requestId } = {}) => {
    if (!requestId) return;
    const req = dmRequests.get(requestId);
    if (!req) return;
    dmRequests.delete(requestId);
    const sockets = await chatNs.fetchSockets();
    for (const s of sockets) {
      if (s.user?._id?.toString() === req.fromId) {
        s.emit('dm_request_declined', { requestId, partnerId: socket.user._id.toString() });
      }
    }
  });

  // ── Disconnect cleanup ────────────────────────────────────────────────────
  // FIX BUG 2: on disconnect, only leave the socket rooms (transient presence).
  // Do NOT call ChatService.leaveRoom — that permanently removes the user from
  // the room's members[] in the DB, so they lose all their rooms on every
  // page refresh/reconnect. Membership is only removed when the user explicitly
  // clicks "Leave room", which calls the leave_room socket event above.
  socket.on('disconnect', async () => {
    if (!socket.activeRooms?.size) return;
    const roomIds = [...socket.activeRooms];
    socket.activeRooms.clear();
    await Promise.allSettled(
      roomIds.map(roomId => broadcastActiveCount(roomId))
    );
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  async function getActiveCount(roomId) {
    const sockets = await chatNs.in(roomId).fetchSockets();
    return new Set(sockets.map(s => s.user?._id?.toString()).filter(Boolean)).size;
  }
  async function broadcastActiveCount(roomId) {
    try {
      const count = await getActiveCount(roomId);
      chatNs.to(roomId).emit('room_active_count', { roomId, count });
    } catch (err) { console.error('[broadcastActiveCount]', err); }
  }
}