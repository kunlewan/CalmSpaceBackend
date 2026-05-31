import mongoose from 'mongoose';

const WellbeingAssessmentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  answers: {
    type: [Number],
    required: true,
    validate: {
      validator: (arr) => arr.length === 8 && arr.every(v => v >= 0 && v <= 3),
      message: 'Must have exactly 8 answers between 0 and 3'
    }
  },
  score:       { type: Number, required: true },
  tier:        { type: String, enum: ['Minimal', 'Mild', 'Moderate', 'High'], required: true },
  description: { type: String, required: true },
  date:        { type: Date,   required: true },
  maxScore:    { type: Number, default: 24 },
}, { timestamps: true });

export default mongoose.model('WellbeingAssessment', WellbeingAssessmentSchema);
