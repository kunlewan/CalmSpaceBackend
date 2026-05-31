 import mongoose from 'mongoose';

const AssessmentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  answers: {
    type: [Number], // exactly 17 numbers 0-4
    required: true,
    validate: {
      validator: (arr) => arr.length === 17 && arr.every(v => v >= 0 && v <= 4),
      message: 'Must have exactly 17 answers between 0 and 4'
    }
  },
  score: { type: Number, required: true },
  severity: {
    type: String,
    enum: ['none', 'mild', 'moderate', 'severe', 'very_severe'],
    required: true
  },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Assessment', AssessmentSchema);