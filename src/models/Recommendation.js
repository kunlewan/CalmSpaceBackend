import mongoose from 'mongoose';

const RecommendationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  content: { type: String, required: true },
  basedOn: { type: String, required: true },
  source: { type: String, enum: ['ai', 'static'], default: 'ai' },
  narrative: { type: String, default: '' },
  insight: { type: String, default: '' },
  nextCheckIn: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('Recommendation', RecommendationSchema);