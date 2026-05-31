import Assessment from '../models/Assessment.js';
import MoodLog from '../models/MoodLogs.js';

export const getDashboard = async (req, res) => {
  try {
    const userId = req.user._id;

    const [latestAssessment, allAssessments, recentMoodLogs] = await Promise.all([
      Assessment.findOne({ userId }).sort({ createdAt: -1 }),
      Assessment.find({ userId }).sort({ createdAt: -1 }).limit(10),
      MoodLog.find({ 
        userId,
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      }).sort({ createdAt: -1 })
    ]);

    let currentStreak = 1;
    const sortedLogs = [...recentMoodLogs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    for (let i = 0; i < sortedLogs.length; i++) {
      const logDate = new Date(sortedLogs[i].createdAt);
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() - i);

      if (logDate.toDateString() === expectedDate.toDateString()) {
        currentStreak++;
      } else {
        break;
      }
    }

    // Average mood score
    const avgMood = recentMoodLogs.length
      ? (recentMoodLogs.reduce((sum, log) => sum + (log.moodScore || log.score || 3), 0) / recentMoodLogs.length).toFixed(1)
      : null;

    res.json({
      success: true,
      user: {
        name: req.user.fullname || req.user.username,
      },
      assessmentResult: latestAssessment ? {
        score: latestAssessment.score,
        tier: latestAssessment.severity || latestAssessment.tier,
        description: latestAssessment.description,
        date: latestAssessment.createdAt,
        maxScore: latestAssessment.maxScore || 68, // SPIN max is usually 68
      } : null,

      moodHistory: recentMoodLogs.map(log => ({
        id: log._id,
        date: log.createdAt,
        score: log.moodScore || log.score || 3,
        mood: log.mood,
        note: log.note,
        productivity: log.productivity,
        energy: log.energy,
      })),

      streak: currentStreak,
      stats: {
        avgMood: avgMood,
        totalLogs: recentMoodLogs.length,
        lastLogDate: recentMoodLogs.length ? recentMoodLogs[0].createdAt : null,
      },

      assessmentHistory: allAssessments.map(a => ({
        score: a.score,
        tier: a.severity || a.tier,
        date: a.createdAt,
      }))
    });

  } catch (error) {
    console.error('Dashboard fetch error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to load dashboard data' 
    });
  }
};