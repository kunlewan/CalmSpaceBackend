import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 300,
      default: '',
    },
    topic: {
      type: String,
      trim: true,
      default: '',
    },
    icon: {
      type: String,
      default: '💬',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isPublic: {
      type: Boolean,
      default: true,
    },
    maxMembers: {
      type: Number,
      default: 50,
    },
    memberCount: {
      type: Number,
      default: 0,
    },

    // ── Members Array ─────────────────────────────────────
    members: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        username: {
          type: String,
          required: true,
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

roomSchema.index({ name: 'text', topic: 'text' });

roomSchema.index({ _id: 1, 'members.userId': 1 });

export default mongoose.model('Room', roomSchema);