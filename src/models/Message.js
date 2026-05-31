import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      index: true,
    },
    senderId: {
      // Real userId — never exposed to other clients
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // The alias shown in the room (e.g. "AnonymousOwl42")
    // alias: {
    //   type: String,
    //   required: true,
    // },
    content: {
      type: String,
      required: true,
      maxlength: 2000,
    },
    // After moderation pass: "clean" | "flagged" | "blocked"
    moderationStatus: {
      type: String,
      enum: ['clean', 'flagged', 'blocked'],
      default: 'clean',
    },
    flagReason: { type: String, default: null },
    isSystem:   { type: Boolean, default: false },
    deletedAt:  { type: Date,    default: null },
    reactions: [{
      emoji: { type: String, required: true },
      users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
    }],
  },
  { timestamps: true }
);

// Efficient room history queries (newest first)
messageSchema.index({ roomId: 1, createdAt: -1 });

export default mongoose.model('Message', messageSchema);
