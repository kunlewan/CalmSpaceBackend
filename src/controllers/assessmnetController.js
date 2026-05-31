import Assessment from '../models/Assessment.js';
import WellbeingAssessment from '../models/WellbeingAssessment.js';
import { classifySpin } from '../utils/spinUtils.js';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/assessments/spin
// ─────────────────────────────────────────────────────────────────────────────
export const submitSpinAssessment = async (req, res) => {
  try {
    const { answers } = req.body;

    if (!Array.isArray(answers) || answers.length !== 17) {
      return res.status(400).json({ message: 'Exactly 17 answers are required (0-4 scale)' });
    }
    if (answers.some(a => typeof a !== 'number' || a < 0 || a > 4)) {
      return res.status(400).json({ message: 'All answers must be numbers between 0 and 4' });
    }

    const score = answers.reduce((a, b) => a + b, 0);
    const severity = classifySpin(score);

    const assessment = await Assessment.create({
      userId: req.user._id,
      type: 'SPIN',
      answers,
      score,
      severity,
      completedAt: new Date(),
    });

    res.status(201).json({
      success: true,
      score,
      severity,
      message: 'Social Phobia Assessment completed successfully',
    });
  } catch (error) {
    console.error('SPIN Submit Error:', error);
    res.status(500).json({ message: error.message || 'Failed to save assessment' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/assessments/spin/latest
// ─────────────────────────────────────────────────────────────────────────────
export const getLatestSpinAssessment = async (req, res) => {
  try {
    const assessment = await Assessment.findOne({ userId: req.user._id, type: 'SPIN' }).sort({ createdAt: -1 });

    if (!assessment) {
      return res.status(404).json({ message: 'No SPIN assessment found' });
    }

    res.json({
      score: assessment.score,
      severity: assessment.severity,
      date: assessment.completedAt,
      answers: assessment.answers,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Wellbeing helpers
// ─────────────────────────────────────────────────────────────────────────────
function classifyWellbeing(score) {
  if (score <= 8)  return { tier: 'Minimal',  description: 'You are managing well. Keep up the healthy habits.' };
  if (score <= 16) return { tier: 'Mild',     description: 'You may be experiencing mild stress. Small daily practices can help.' };
  if (score <= 22) return { tier: 'Moderate', description: 'Moderate distress detected. Consider speaking with a counsellor.' };
  return                  { tier: 'High',     description: 'High distress detected. Please reach out to a mental health professional.' };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/assessments/wellbeing/status — check lock
// ─────────────────────────────────────────────────────────────────────────────
export const getWellbeingStatus = async (req, res) => {
  try {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const recent = await WellbeingAssessment.findOne({
      userId: req.user._id,
      createdAt: { $gte: twoWeeksAgo },
    }).sort({ createdAt: -1 });

    const latest = await WellbeingAssessment.findOne({ userId: req.user._id }).sort({ createdAt: -1 });

    let nextAvailableAt = null;
    if (recent) {
      const next = new Date(recent.createdAt);
      next.setDate(next.getDate() + 14);
      nextAvailableAt = next.toISOString();
    }

    res.json({
      success: true,
      canTake: !recent,
      isLocked: !!recent,
      nextAvailableAt,
      lastAssessment: latest ? {
        score: latest.score,
        tier: latest.tier,
        description: latest.description,
        date: latest.createdAt,
      } : null,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/assessments/wellbeing
// ─────────────────────────────────────────────────────────────────────────────
export const submitWellbeingAssessment = async (req, res) => {
  try {
    const { answers } = req.body;

    if (!Array.isArray(answers) || answers.length !== 8) {
      return res.status(400).json({ success: false, message: 'Exactly 8 answers are required' });
    }
    if (answers.some(a => typeof a !== 'number' || a < 0 || a > 3)) {
      return res.status(400).json({ success: false, message: 'Each answer must be a number between 0 and 3' });
    }

    // 2-week cooldown check
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const recent = await WellbeingAssessment.findOne({
      userId: req.user._id,
      createdAt: { $gte: twoWeeksAgo },
    });

    if (recent) {
      const next = new Date(recent.createdAt);
      next.setDate(next.getDate() + 14);
      return res.status(400).json({
        success: false,
        isLocked: true,
        message: 'Assessment locked — retake available in 2 weeks.',
        nextAvailableAt: next.toISOString(),
      });
    }

    const score = answers.reduce((a, b) => a + b, 0);
    const { tier, description } = classifyWellbeing(score);
    const date = new Date();

    await WellbeingAssessment.create({
      userId: req.user._id,
      answers,
      score,
      tier,
      description,
      date,
      maxScore: 24,
    });

    res.status(201).json({
      success: true,
      result: { score, tier, description, date, maxScore: 24 },
    });
  } catch (error) {
    console.error('Wellbeing submit error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to save assessment' });
  }
};
