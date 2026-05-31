import MoodLog from '../models/MoodLogs.js';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/mood  — Log a new mood entry (once per day)
// ─────────────────────────────────────────────────────────────────────────────
export const logMood = async (req, res) => {
  try {
    const userId = req.user._id;
    const { score, note, energy, productivity, anxietyLevel, avoidedSocial, tags, gratitude, intentions } = req.body;

    // Enforce once-per-day rule
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const existingToday = await MoodLog.findOne({
      userId,
      createdAt: { $gte: startOfDay, $lte: endOfDay },
    });

    if (existingToday) {
      return res.status(400).json({
        success: false,
        message: 'You have already logged your mood today. Come back tomorrow!',
        alreadyLogged: true,
        existingLog: {
          id: existingToday._id,
          score: existingToday.score,
          createdAt: existingToday.createdAt,
        },
      });
    }

    const moodLog = await MoodLog.create({
      userId,
      score: Number(score),
      note: note || '',
      energy: energy ? Number(energy) : undefined,
      productivity: productivity ? Number(productivity) : undefined,
      anxietyLevel: anxietyLevel ? Number(anxietyLevel) : undefined,
      avoidedSocial: avoidedSocial || false,
      tags: tags || [],
      gratitude: gratitude || '',
      intentions: intentions || '',
    });

    res.status(201).json({
      success: true,
      message: 'Mood logged successfully',
      log: moodLog,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/mood  — Get mood history
// ─────────────────────────────────────────────────────────────────────────────
export const getMoodHistory = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    const logs = await MoodLog.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await MoodLog.countDocuments({ userId: req.user._id });

    // Check if logged today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const loggedToday = await MoodLog.findOne({
      userId: req.user._id,
      createdAt: { $gte: startOfDay },
    });

    res.json({
      success: true,
      loggedToday: !!loggedToday,
      todayLog: loggedToday ? {
        id: loggedToday._id,
        score: loggedToday.score,
        createdAt: loggedToday.createdAt,
      } : null,
      moodHistory: logs.map(log => ({
        id: log._id,
        date: log.createdAt,
        score: log.score,
        mood: log.score,
        note: log.note,
        productivity: log.productivity,
        energy: log.energy,
        tags: log.tags || [],
        gratitude: log.gratitude || '',
        intentions: log.intentions || '',
      })),
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get mood history error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch mood history' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/mood/:id  — Get single mood log
// ─────────────────────────────────────────────────────────────────────────────
export const getMoodLogById = async (req, res) => {
  try {
    const log = await MoodLog.findOne({ _id: req.params.id, userId: req.user._id });
    if (!log) return res.status(404).json({ success: false, message: 'Mood log not found' });
    res.json({ success: true, log });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch mood log' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/mood/status  — Check if user can log today
// ─────────────────────────────────────────────────────────────────────────────
export const getMoodStatus = async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todayLog = await MoodLog.findOne({
      userId: req.user._id,
      createdAt: { $gte: startOfDay },
    });

    // Calculate next available time (midnight tonight)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    res.json({
      success: true,
      canLogToday: !todayLog,
      loggedToday: !!todayLog,
      nextAvailableAt: todayLog ? tomorrow.toISOString() : null,
      todayLog: todayLog ? {
        id: todayLog._id,
        score: todayLog.score,
        createdAt: todayLog.createdAt,
      } : null,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};