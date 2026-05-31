// registerChatHandlers.js
import ChatService from '../service/chat.service.js';
import AnonymiserService from '../service/anonymiser.service.js';
import Room from '../models/Room.js';

const RATE_LIMIT = { maxMessages: 10, windowMs: 10_000 };

export default function registerChatHandlers(socket, io) {
  const chatNs = io.of('/chat');

  // Rate limiter
  const rateState = { count: 0, resetAt: Date.now() + RATE_LIMIT.windowMs };

  function checkRateLimit() {
    const now = Date.now();
    if (now > rateState.resetAt) {
      rateState.count = 0;
      rateState.resetAt = now + RATE_LIMIT.windowMs;
    }
    rateState.count++;
    return rateState.count <= RATE_LIMIT.maxMessages;
  }

  function emitError(event, message) {
    socket.emit('error', { event, message });
  }

  // ── join_room ─────────────────────────────────────────────────────────
  socket.on('join_room', async ({ roomId } = {}) => {
    if (!roomId) return emitError('join_room', 'roomId required');

    try {
      const { room, alias, systemMessage } = await ChatService.joinRoom(
        socket.user._id,
        roomId
      );

      socket.join(roomId);
      socket.activeRooms = socket.activeRooms || new Set();
      socket.activeRooms.add(roomId);

      socket.emit('room_joined', { room, alias });

      const history = await ChatService.getHistory(roomId, { limit: 30 });
      socket.emit('room_history', { roomId, messages: history });

      socket.to(roomId).emit('system_message', systemMessage);
    } catch (err) {
      console.error('[join_room]', err);
      emitError('join_room', err.message);
    }
  });

  // ── send_message ──────────────────────────────────────────────────────
  socket.on('send_message', async ({ roomId, content } = {}) => {
    if (!roomId || !content) return emitError('send_message', 'roomId and content required');
    if (!checkRateLimit()) return emitError('send_message', 'Rate limit exceeded. Slow down.');
    if (!socket.rooms.has(roomId)) return emitError('send_message', 'You must join the room first');

    try {
      const { message, moderationStatus } = await ChatService.sendMessage({
        userId: socket.user._id,
        roomId,
        content,
      });

      if (moderationStatus === 'blocked') {
        return socket.emit('error', {
          event: 'send_message',
          message: 'Your message was blocked by moderation.',
        });
      }

      chatNs.to(roomId).emit('new_message', message);
    } catch (err) {
      console.error('[send_message]', err);
      emitError('send_message', err.message);
    }
  });

  // ── typing ────────────────────────────────────────────────────────────
  socket.on('typing', async ({ roomId, isTyping } = {}) => {
    if (!roomId || !socket.rooms.has(roomId)) return;

    try {
      const alias = await AnonymiserService.getOrCreateAlias(socket.user._id, roomId);
      socket.to(roomId).emit('user_typing', { alias, isTyping });
    } catch {}
  });

  // ── leave_room ────────────────────────────────────────────────────────
  socket.on('leave_room', async ({ roomId } = {}) => {
    if (!roomId) return;

    try {
      const { systemMessage } = await ChatService.leaveRoom(socket.user._id, roomId);
      socket.leave(roomId);
      socket.activeRooms?.delete(roomId);

      socket.emit('room_left', { roomId });
      socket.to(roomId).emit('system_message', systemMessage);
    } catch (err) {
      console.error('[leave_room]', err);
      emitError('leave_room', err.message);
    }
  });

  // ── get_history ───────────────────────────────────────────────────────
  socket.on('get_history', async ({ roomId, before } = {}) => {
    if (!roomId) return emitError('get_history', 'roomId required');

    try {
      const messages = await ChatService.getHistory(roomId, { before });
      socket.emit('room_history', { roomId, messages, isPaginated: true });
    } catch (err) {
      console.error('[get_history]', err);
      emitError('get_history', err.message);
    }
  });

  // ── list_rooms ────────────────────────────────────────────────────────
  socket.on('list_rooms', async ({ page = 1, search = '' } = {}) => {
    try {
      const rooms = await ChatService.listRooms({ page, search });
      socket.emit('room_list', { rooms, page });
    } catch (err) {
      console.error('[list_rooms]', err);
      emitError('list_rooms', err.message);
    }
  });

  // ── remove_member ─────────────────────────────────────────────────────
  socket.on('remove_member', async ({ roomId, userId } = {}) => {
    if (!roomId || !userId) return emitError('remove_member', 'roomId and userId required');
    try {
      const room = await Room.findById(roomId);
      if (!room) return emitError('remove_member', 'Room not found');
      if (room.adminId?.toString() !== socket.user._id.toString())
        return emitError('remove_member', 'Admin only');

      await AnonymiserService.removeMember(userId, roomId);

      chatNs.to(roomId).emit('member_removed', { userId, roomId });

      const sockets = await chatNs.in(roomId).fetchSockets();
      for (const s of sockets) {
        if (s.user?._id?.toString() === userId.toString()) {
          s.leave(roomId);
        }
      }
    } catch (err) {
      emitError('remove_member', err.message);
    }
  });

  // ── transfer_admin ────────────────────────────────────────────────────
  socket.on('transfer_admin', async ({ roomId, userId } = {}) => {
    if (!roomId || !userId) return emitError('transfer_admin', 'Missing fields');
    try {
      const room = await Room.findById(roomId);
      if (!room) return emitError('transfer_admin', 'Room not found');
      if (room.adminId?.toString() !== socket.user._id.toString())
        return emitError('transfer_admin', 'Admin only');

      await Room.findByIdAndUpdate(roomId, { adminId: userId });
      chatNs.to(roomId).emit('admin_transferred', { roomId, newAdminId: userId });
    } catch (err) {
      emitError('transfer_admin', err.message);
    }
  });

  // ── DM Requests ───────────────────────────────────────────────────────
  const dmRequests = new Map();

  socket.on('dm_request', async ({ toId } = {}) => {
    if (!toId) return emitError('dm_request', 'toId required');
    if (toId.toString() === socket.user._id.toString())
      return emitError('dm_request', 'Cannot DM yourself');

    const requestId = `dmr_${Date.now()}_${socket.user._id}`;
    dmRequests.set(requestId, { fromId: socket.user._id, toId });

    const sockets = await chatNs.fetchSockets();
    for (const s of sockets) {
      if (s.user?._id?.toString() === toId.toString()) {
        s.emit('dm_request', {
          id: requestId,
          fromId: socket.user._id,
          fromName: socket.user.name || 'Someone',
        });
      }
    }
  });

  socket.on('dm_request_accept', async ({ requestId } = {}) => {
    if (!requestId) return;
    const req = dmRequests.get(requestId);
    if (!req) return emitError('dm_request_accept', 'Request not found or expired');
    if (req.toId.toString() !== socket.user._id.toString())
      return emitError('dm_request_accept', 'Not your request');

    dmRequests.delete(requestId);

    const sockets = await chatNs.fetchSockets();
    for (const s of sockets) {
      if (s.user?._id?.toString() === req.fromId.toString()) {
        s.emit('dm_request_accepted', {
          requestId,
          partnerId: socket.user._id,
          partnerName: socket.user.name,
        });
      }
    }

    // Also confirm to acceptor
    socket.emit('dm_request_accepted', {
      requestId,
      partnerId: req.fromId,
      partnerName: 'You', // or fetch name if needed
    });
  });

  socket.on('dm_request_decline', ({ requestId } = {}) => {
    dmRequests.delete(requestId);
  });

  // ── disconnect cleanup ─────────────────────────────────────────────────
  socket.on('disconnect', async () => {
    if (!socket.activeRooms?.size) return;

    for (const roomId of socket.activeRooms) {
      try {
        const { systemMessage } = await ChatService.leaveRoom(socket.user._id, roomId);
        socket.to(roomId).emit('system_message', systemMessage);
      } catch {}
    }
    socket.activeRooms.clear();
  });
}