import mongoose from 'mongoose';

const moodLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    score: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    note: { type: String, default: '', maxlength: 2000 },
    energy: { type: Number, min: 1, max: 5 },
    productivity: { type: Number, min: 1, max: 5 },
    anxietyLevel: { type: Number, min: 0, max: 10 },
    avoidedSocial: { type: Boolean, default: false },
    tags: [{ type: String }],
    gratitude: { type: String, default: '', maxlength: 1000 },
    intentions: { type: String, default: '', maxlength: 1000 },
  },
  { timestamps: true }
);

// Ensure one entry per user per day
moodLogSchema.index({ userId: 1, createdAt: 1 });

export default mongoose.model('MoodLog', moodLogSchema);