import mongoose from 'mongoose';

// ── DmMessage ─────────────────────────────────────────────────────────────────
// Persists one-to-one direct messages between two users.
// Both fromId and toId reference User._id.

const dmMessageSchema = new mongoose.Schema(
  {
    fromId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },
    toId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },
    content: {
      type:      String,
      required:  true,
      maxlength: 4000,
      trim:      true,
    },
    deletedAt: {
      type:    Date,
      default: null,
    },
  },
  {
    timestamps: true,         // adds createdAt and updatedAt
    collection: 'dmmessages',
  }
);

// Compound index so conversation queries are fast in both directions
dmMessageSchema.index({ fromId: 1, toId: 1, createdAt: -1 });
dmMessageSchema.index({ toId:   1, fromId: 1, createdAt: -1 });

const DmMessage = mongoose.model('DmMessage', dmMessageSchema);

export default DmMessage;