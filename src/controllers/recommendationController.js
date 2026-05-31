import User from '../models/User.js';
import WellbeingAssessment from '../models/WellbeingAssessment.js';
import Assessment from '../models/Assessment.js';
import MoodLog from '../models/MoodLogs.js';
import Recommendation from '../models/Recommendation.js';
import {
  buildUserContext,
  generateAIRecommendations,
  generateQuickTip,
} from '../service/geminiService.js';

// ─────────────────────────────────────────────────────────────────────────────
// Interest-based media catalogue (movies & music keyed by interest)
// ─────────────────────────────────────────────────────────────────────────────
const MEDIA_BY_INTEREST = {
  Mindfulness: {
    movies: [
      { title: 'Kung Fu Panda', year: 2008, rating: 7.6, why: 'Teaches living in the present moment' },
      { title: 'The Secret Life of Walter Mitty', year: 2013, rating: 7.3, why: 'Journey of self-discovery and mindful living' },
      { title: 'Peaceful Warrior', year: 2006, rating: 7.2, why: 'Direct exploration of mindfulness and the present' },
    ],
    music: [
      { artist: 'Brian Eno', album: 'Ambient 1: Music for Airports', genre: 'Ambient', why: 'Perfect for mindful focus sessions' },
      { artist: 'Moby', album: 'Long Ambients 1', genre: 'Ambient', why: 'Designed specifically for meditation' },
    ],
  },
  Reading: {
    movies: [
      { title: 'The Perks of Being a Wallflower', year: 2012, rating: 7.9, why: 'Deeply literary, introspective storytelling' },
      { title: 'Arrival', year: 2016, rating: 7.9, why: 'Language, time, and meaning — for curious minds' },
    ],
    music: [
      { artist: 'Nils Frahm', album: 'All Melody', genre: 'Neoclassical', why: 'Ideal reading companion, non-distracting' },
      { artist: 'Explosions in the Sky', album: 'The Earth Is Not a Cold Dead Place', genre: 'Post-Rock', why: 'Cinematic backdrop for deep reading sessions' },
    ],
  },
  'Creative Arts': {
    movies: [
      { title: 'Big Eyes', year: 2014, rating: 7.0, why: 'Inspiring story of artistic authenticity' },
      { title: 'Pollock', year: 2000, rating: 7.1, why: 'Immersive portrait of creative obsession' },
    ],
    music: [
      { artist: 'Bon Iver', album: 'For Emma, Forever Ago', genre: 'Indie Folk', why: 'Deeply creative, introspective soundscape' },
      { artist: 'Gorillaz', album: 'Demon Days', genre: 'Alternative', why: 'Imaginative, art-forward music experience' },
    ],
  },
  Fitness: {
    movies: [
      { title: 'Rocky', year: 1976, rating: 8.1, why: 'The definitive discipline and perseverance story' },
      { title: 'Brittany Runs a Marathon', year: 2019, rating: 7.1, why: 'Real, motivating running transformation journey' },
    ],
    music: [
      { artist: 'Kendrick Lamar', album: 'good kid, m.A.A.d city', genre: 'Hip-Hop', why: 'High-energy, push-through-anything album' },
      { artist: 'Daft Punk', album: 'Random Access Memories', genre: 'Electronic', why: 'Perfect workout tempo and energy' },
    ],
  },
  Music: {
    movies: [
      { title: 'Whiplash', year: 2014, rating: 8.5, why: 'Gripping story of musical obsession and mastery' },
      { title: 'Soul', year: 2020, rating: 8.0, why: 'Beautiful exploration of passion and purpose through jazz' },
    ],
    music: [
      { artist: 'Miles Davis', album: 'Kind of Blue', genre: 'Jazz', why: 'The best-selling jazz album ever — a masterclass' },
      { artist: 'Radiohead', album: 'OK Computer', genre: 'Art Rock', why: 'Critically acclaimed — expands what music can be' },
    ],
  },
  Nature: {
    movies: [
      { title: 'Into the Wild', year: 2007, rating: 8.1, why: 'Raw exploration of wilderness and self-discovery' },
      { title: 'Annihilation', year: 2018, rating: 6.8, why: 'Nature as mystery and transformation' },
    ],
    music: [
      { artist: 'Sigur Rós', album: 'Ágætis byrjun', genre: 'Post-Rock', why: 'Evokes wide open natural spaces perfectly' },
      { artist: 'Fleet Foxes', album: 'Fleet Foxes', genre: 'Indie Folk', why: 'Pastoral harmonies inspired by the natural world' },
    ],
  },
  Technology: {
    movies: [
      { title: 'The Social Network', year: 2010, rating: 7.8, why: 'Gripping portrayal of tech ambition and cost' },
      { title: 'Ex Machina', year: 2014, rating: 7.7, why: 'Thought-provoking AI and consciousness exploration' },
    ],
    music: [
      { artist: 'Aphex Twin', album: 'Selected Ambient Works 85–92', genre: 'Electronic', why: 'Pioneer of algorithmic, technical electronic music' },
      { artist: 'Nine Inch Nails', album: 'The Downward Spiral', genre: 'Industrial', why: 'Industrial production at its most innovative' },
    ],
  },
  Writing: {
    movies: [
      { title: 'Adaptation', year: 2002, rating: 7.7, why: 'Brilliant meta-exploration of the writing process' },
      { title: 'Finding Forrester', year: 2000, rating: 7.3, why: 'Mentorship and literary craft beautifully portrayed' },
    ],
    music: [
      { artist: 'Nick Cave & the Bad Seeds', album: 'Murder Ballads', genre: 'Alternative', why: 'Deeply literary storytelling in musical form' },
      { artist: 'Leonard Cohen', album: 'Songs of Leonard Cohen', genre: 'Folk', why: 'Poetry set to music — perfect writer\'s companion' },
    ],
  },
  Gaming: {
    movies: [
      { title: 'Free Guy', year: 2021, rating: 7.1, why: 'Fun gaming universe exploration with heart' },
      { title: 'The Game', year: 1997, rating: 7.7, why: 'Psychological thriller with game-like escalation' },
    ],
    music: [
      { artist: 'Nobuo Uematsu', album: 'Final Fantasy VII OST', genre: 'Orchestral', why: 'Legendary game composer — emotional and epic' },
      { artist: 'C418', album: 'Minecraft Volume Alpha', genre: 'Ambient', why: 'Iconic ambient game soundtrack for focus' },
    ],
  },
  Cooking: {
    movies: [
      { title: 'Ratatouille', year: 2007, rating: 8.1, why: 'Celebrates creativity and passion in the kitchen' },
      { title: 'Chef', year: 2014, rating: 7.3, why: 'Food, passion, and rediscovering joy in craft' },
    ],
    music: [
      { artist: 'Antonio Carlos Jobim', album: 'Wave', genre: 'Bossa Nova', why: 'Perfect cooking atmosphere — relaxed and warm' },
      { artist: 'Buena Vista Social Club', album: 'Buena Vista Social Club', genre: 'Latin', why: 'Joyful, rhythmic backdrop for cooking sessions' },
    ],
  },
  'Strength Training': {
    movies: [
      { title: 'Pumping Iron', year: 1977, rating: 7.4, why: 'The original bodybuilding documentary — iconic' },
      { title: 'Creed', year: 2015, rating: 7.6, why: 'Gritty training montages and incredible motivation' },
    ],
    music: [
      { artist: 'Eminem', album: 'Relapse', genre: 'Hip-Hop', why: 'Intense, high-BPM for lifting sessions' },
      { artist: 'Slipknot', album: 'Iowa', genre: 'Metal', why: 'Raw energy for pushing through heavy sets' },
    ],
  },
  Photography: {
    movies: [
      { title: 'The Bang Bang Club', year: 2010, rating: 6.8, why: 'Raw look at photojournalism under pressure' },
      { title: 'Pina', year: 2011, rating: 7.8, why: 'Visual masterpiece — a feast for the visual mind' },
    ],
    music: [
      { artist: 'Tycho', album: 'Dive', genre: 'Chillwave', why: 'Visual, atmospheric music great for editing sessions' },
      { artist: 'Com Truise', album: 'Galactic Melt', genre: 'Synthwave', why: 'Aesthetic electronic for darkroom vibes' },
    ],
  },
};

// Goal-achievement action plans
const GOAL_ACTION_PLANS = {
  'Reduce anxiety': {
    icon: '🧘',
    quickWins: ['4-7-8 breathing (5 min daily)', 'Box breathing before meetings', 'Morning sunlight exposure (10 min)'],
    weeklyGoals: ['Complete SPIN assessment check-in', '3 journal entries about anxiety triggers', 'One CBT thought record per week'],
    resources: ['Try the Insight Timer app for guided meditations', 'Read "The Anxiety and Worry Workbook" by Clark & Beck'],
    milestone: '30-day anxiety log reduction by 20%',
  },
  'Better sleep': {
    icon: '😴',
    quickWins: ['Set a consistent bedtime alarm', 'No screens 1hr before bed tonight', 'Keep bedroom below 20°C'],
    weeklyGoals: ['Log sleep quality in your mood journal', 'Establish a 15-min wind-down routine', 'Track caffeine intake cutoff time'],
    resources: ['"Why We Sleep" by Matthew Walker (book)', 'Sleep Cycle app for smart wake-up timing'],
    milestone: 'Average 7+ hours quality sleep for 21 days',
  },
  'Increase productivity': {
    icon: '⚡',
    quickWins: ['Time-block tomorrow morning right now', 'Pick ONE top-priority task for today', 'Close all unused browser tabs'],
    weeklyGoals: ['Weekly Sunday review & planning session', 'Track productivity score in mood journal daily', 'Implement one new system per week'],
    resources: ['"Getting Things Done" by David Allen', 'Notion or Todoist for task management'],
    milestone: 'Complete your top 3 priorities 5 days in a row',
  },
  'Build connections': {
    icon: '🤝',
    quickWins: ['Text one friend you haven\'t spoken to in a month', 'Leave a genuine comment on someone\'s work today', 'Join one online community in your interest area'],
    weeklyGoals: ['One meaningful conversation (30+ min) per week', 'Attend one social event or group activity monthly', 'Practice active listening in every conversation'],
    resources: ['Read "How to Win Friends and Influence People" by Carnegie', 'Join CalmSpace community rooms for practice'],
    milestone: 'Maintain 5 regular meaningful connections',
  },
  'Build healthy habits': {
    icon: '📋',
    quickWins: ['Write down ONE habit you\'ll start tomorrow', 'Habit-stack: attach new habit to existing routine', 'Set a specific trigger-time for your habit'],
    weeklyGoals: ['Track habit streak in your journal', 'Review habit performance every Sunday', 'Start a 2-minute version of hard habits'],
    resources: ['"Atomic Habits" by James Clear', 'Streaks app for iOS or Habitica for gamification'],
    milestone: 'Maintain any new habit for 66 consecutive days',
  },
  'Mental clarity': {
    icon: '🧠',
    quickWins: ['Brain dump: write down everything on your mind (5 min)', 'One-minute meditation between tasks', 'Drink a glass of water right now'],
    weeklyGoals: ['Weekly brain dump and organisation session', 'Daily 5-min morning journaling', 'Limit decision fatigue: plan meals/outfits in advance'],
    resources: ['"The Brain That Changes Itself" by Norman Doidge', 'Headspace or Calm for daily meditation'],
    milestone: 'Maintain daily journaling streak for 30 days',
  },
  'Career growth': {
    icon: '🚀',
    quickWins: ['Update your LinkedIn profile today (one improvement)', 'Learn one new skill concept (30 min on YouTube)', 'Reach out to one mentor or industry contact'],
    weeklyGoals: ['Dedicate 2hrs/week to learning a new skill', 'Track career milestones in a growth journal', 'One networking interaction per week'],
    resources: ['"So Good They Can\'t Ignore You" by Cal Newport', 'Coursera or LinkedIn Learning for structured upskilling'],
    milestone: 'Complete one professional certification or project in 90 days',
  },
  'Self-confidence': {
    icon: '💪',
    quickWins: ['Write 3 things you\'re genuinely good at right now', 'Take one small risk today (speak up, share an idea)', 'Stand tall — body language affects brain chemistry'],
    weeklyGoals: ['Weekly wins journal: record 5 wins every Sunday', 'Challenge one negative self-belief per week', 'Do one thing that scares you (mildly) each week'],
    resources: ['"The Six Pillars of Self-Esteem" by Nathaniel Branden', 'TED Talk: Amy Cuddy "Your Body Language May Shape Who You Are"'],
    milestone: 'Complete 30 days of daily wins journaling',
  },
  'Work-life balance': {
    icon: '⚖️',
    quickWins: ['Set a hard stop time for work today', 'Block personal time on your calendar this week', 'Turn off work notifications after 7pm tonight'],
    weeklyGoals: ['Evaluate workload vs capacity every Friday', 'Schedule one non-negotiable enjoyment activity per week', 'Communicate boundaries to one person this week'],
    resources: ['"Deep Work" by Cal Newport', '"Essentialism" by Greg McKeown'],
    milestone: 'Maintain boundaries for 4 consecutive weeks',
  },
  'Improve relationships': {
    icon: '❤️',
    quickWins: ['Express genuine appreciation to someone close today', 'Listen fully in your next conversation (no phone)', 'Send a thoughtful message to a family member'],
    weeklyGoals: ['One quality time activity with someone important weekly', 'Practice "I feel" statements instead of accusations', 'Repair one lingering tension or misunderstanding'],
    resources: ['"The 5 Love Languages" by Gary Chapman', '"Nonviolent Communication" by Marshall Rosenberg'],
    milestone: 'Consistently apply one relationship skill for 30 days',
  },
};

function mapSpinTier(severity) {
  const map = { none: 'Minimal', mild: 'Mild', moderate: 'Moderate', severe: 'High', very_severe: 'High' };
  return map[severity] || 'Minimal';
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/recommendations
// ─────────────────────────────────────────────────────────────────────────────
export const getRecommendations = async (req, res) => {
  try {
    const userId = req.user._id;

    const [user, wellbeing, spin, recentMoods] = await Promise.all([
      User.findById(userId).lean(),
      WellbeingAssessment.findOne({ userId }).sort({ createdAt: -1 }).lean(),
      Assessment.findOne({ userId }).sort({ createdAt: -1 }).lean(),
      MoodLog.find({ userId }).sort({ createdAt: -1 }).limit(14).lean(),
    ]);

    const tier = wellbeing?.tier || (spin ? mapSpinTier(spin.severity) : 'Minimal');
    const userGoals = user?.goals || [];
    const userInterests = user?.interests || [];

    // Build media recommendations from interests
    const mediaRecs = buildMediaRecommendations(userInterests);

    // Build goal action plans
    const goalPlans = buildGoalActionPlans(userGoals);

    // Try AI for wellness recommendations
    if (process.env.GEMINI_API_KEY) {
      try {
        const userContext = buildUserContext({ user, wellbeing, spin, recentMoods, platformActivity: { streak: user?.streak || 0, savedCount: user?.savedRecommendations?.length || 0 } });
        const aiResult = await generateAIRecommendations(userContext);

        await Recommendation.create({
          userId,
          content: JSON.stringify(aiResult.recommendations),
          basedOn: `wellbeing:${tier}|spin:${spin?.severity || 'none'}|mood:${recentMoods.length}logs`,
        });

        return res.json({
          success: true,
          source: 'ai',
          narrative: aiResult.narrative,
          recommendations: aiResult.recommendations,
          insight: aiResult.insight,
          nextCheckIn: aiResult.nextCheckIn,
          mediaRecommendations: mediaRecs,
          goalActionPlans: goalPlans,
          meta: { tier, moodLogsAnalysed: recentMoods.length, generatedAt: new Date().toISOString() },
        });
      } catch (aiError) {
        console.error('[AI Recommendations] Gemini error, falling back:', aiError.message);
      }
    }

    // Static fallback wellness recs
    const staticWellnessRecs = buildStaticWellnessRecs(tier, userGoals, userInterests);

    return res.json({
      success: true,
      source: 'static',
      narrative: `Here are personalised recommendations based on your ${tier.toLowerCase()} wellbeing tier and ${userInterests.length} interests.`,
      recommendations: staticWellnessRecs,
      insight: null,
      nextCheckIn: 'Log your mood today to get more personalised recommendations.',
      mediaRecommendations: mediaRecs,
      goalActionPlans: goalPlans,
      meta: { tier, moodLogsAnalysed: recentMoods.length, generatedAt: new Date().toISOString() },
    });
  } catch (error) {
    console.error('[getRecommendations] error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

function buildMediaRecommendations(userInterests) {
  if (!userInterests || userInterests.length === 0) return { movies: [], music: [] };

  const movies = [];
  const music = [];
  const seenMovies = new Set();
  const seenMusic = new Set();

  for (const interest of userInterests) {
    const trimmed = interest.trim();
    const catalogue = MEDIA_BY_INTEREST[trimmed];
    if (!catalogue) continue;

    for (const movie of catalogue.movies) {
      if (!seenMovies.has(movie.title)) {
        seenMovies.add(movie.title);
        movies.push({ ...movie, basedOn: trimmed });
      }
    }
    for (const track of catalogue.music) {
      const key = `${track.artist}-${track.album}`;
      if (!seenMusic.has(key)) {
        seenMusic.add(key);
        music.push({ ...track, basedOn: trimmed });
      }
    }
  }

  // Sort movies by rating desc, music is already in order
  movies.sort((a, b) => b.rating - a.rating);

  return { movies: movies.slice(0, 8), music: music.slice(0, 8) };
}

function buildGoalActionPlans(userGoals) {
  if (!userGoals || userGoals.length === 0) return [];
  return userGoals
    .map(goal => {
      const trimmed = goal.trim();
      const plan = GOAL_ACTION_PLANS[trimmed];
      if (!plan) return null;
      return { goal: trimmed, ...plan };
    })
    .filter(Boolean);
}

function buildStaticWellnessRecs(tier, userGoals, userInterests) {
  const STATIC_POOL = [
    { id: 'breathing-4-7-8', category: 'Breathing', icon: '🌬️', title: '4-7-8 Breathing', summary: 'A calming breath technique that activates the parasympathetic nervous system.', whyForYou: 'Effective for anxiety and stress relief at any severity level.', steps: ['Inhale for 4 counts', 'Hold for 7 counts', 'Exhale slowly for 8 counts', 'Repeat 4 times'], estimatedTime: '5 mins', difficulty: 'Easy', matchScore: 70, tags: ['anxiety', 'breathing'], tiers: ['Minimal', 'Mild', 'Moderate', 'High'], goals: ['reduce anxiety', 'stress', 'sleep'] },
    { id: 'cbt-thought-record', category: 'CBT', icon: '🧠', title: 'Thought Record', summary: 'Identify and challenge negative automatic thoughts using a structured diary.', whyForYou: 'Helps break anxiety-thought loops linked to your assessment results.', steps: ['Write down the situation', 'Note your automatic thought', 'Rate your emotion (0-100)', 'Find evidence for and against', 'Create a balanced thought'], estimatedTime: '10-15 mins', difficulty: 'Moderate', matchScore: 75, tags: ['cbt', 'anxiety'], tiers: ['Mild', 'Moderate', 'High'], goals: ['reduce anxiety', 'mental clarity', 'self-confidence'] },
    { id: 'wellness-body-scan', category: 'Mindfulness', icon: '🧘', title: 'Body Scan Meditation', summary: 'A mindfulness practice to release tension stored in the body.', whyForYou: 'Helps with stress and improves sleep quality.', steps: ['Lie down comfortably', 'Close your eyes and breathe deeply', 'Slowly scan from feet to head', 'Notice and release tension', 'Stay for 10–20 minutes'], estimatedTime: '15-20 mins', difficulty: 'Easy', matchScore: 65, tags: ['mindfulness', 'sleep'], tiers: ['Minimal', 'Mild', 'Moderate'], goals: ['better sleep', 'mental clarity', 'reduce anxiety'] },
    { id: 'habit-gratitude-journal', category: 'Habit', icon: '📓', title: 'Gratitude Journal', summary: 'Write three things you are grateful for each morning to shift your mindset.', whyForYou: 'Daily gratitude is a proven mood elevator tied to your journaling interests.', steps: ['Get a notebook or open your journal app', 'Write 3 specific things you are grateful for', 'Include why each one matters', 'Do this every morning for 21 days'], estimatedTime: '5 mins', difficulty: 'Easy', matchScore: 72, tags: ['habit', 'gratitude'], tiers: ['Minimal', 'Mild', 'Moderate', 'High'], goals: ['mental clarity', 'build healthy habits', 'self-confidence'] },
    { id: 'social-reach-out', category: 'Social', icon: '🤝', title: 'Reach Out to Someone', summary: 'Social connection is a strong protective factor for mental wellbeing.', whyForYou: 'Reconnecting with one trusted person can reduce social avoidance patterns.', steps: ['Think of someone you trust', 'Send a message or call them today', 'Share how you are feeling', 'Plan a regular check-in'], estimatedTime: '10 mins', difficulty: 'Moderate', matchScore: 68, tags: ['social', 'connection'], tiers: ['Mild', 'Moderate', 'High'], goals: ['build connections', 'improve relationships'] },
    { id: 'productivity-time-blocking', category: 'Productivity', icon: '📅', title: 'Time Blocking', summary: 'Organise your day into focused blocks to reduce overwhelm and boost output.', whyForYou: 'Structure reduces decision fatigue and improves your productivity score.', steps: ['List your top 3 tasks for the day', 'Assign each a time block', 'Use a timer (Pomodoro method)', 'Take a 5-min break between blocks'], estimatedTime: '5 mins setup', difficulty: 'Easy', matchScore: 60, tags: ['productivity', 'focus'], tiers: ['Minimal', 'Mild'], goals: ['increase productivity', 'career growth', 'work-life balance'] },
    { id: 'sleep-hygiene', category: 'Sleep', icon: '😴', title: 'Sleep Hygiene Routine', summary: 'A consistent sleep routine dramatically improves mood, energy and focus.', whyForYou: 'Poor sleep amplifies anxiety — a structured bedtime routine can break this cycle.', steps: ['Set a fixed bedtime and wake time', 'Avoid screens 1hr before bed', 'Keep your room cool and dark', 'Wind down with reading or light stretching'], estimatedTime: 'Daily', difficulty: 'Moderate', matchScore: 65, tags: ['sleep', 'energy'], tiers: ['Minimal', 'Mild', 'Moderate', 'High'], goals: ['better sleep', 'build healthy habits'] },
  ];

  const lowerGoals = userGoals.map(g => g.toLowerCase());
  const lowerInterests = userInterests.map(i => i.toLowerCase());

  return STATIC_POOL.map(rec => {
    let score = rec.tiers.includes(tier) ? rec.matchScore : Math.max(rec.matchScore - 25, 20);
    for (const g of rec.goals) {
      if (lowerGoals.some(ug => ug.includes(g) || g.includes(ug))) { score += 10; break; }
    }
    if (lowerInterests.some(ui => rec.tags.some(t => t.includes(ui) || ui.includes(t)))) { score += 5; }
    return { ...rec, matchScore: Math.min(score, 99) };
  }).sort((a, b) => b.matchScore - a.matchScore);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/recommendations/quick-tip
// ─────────────────────────────────────────────────────────────────────────────
export const getQuickTip = async (req, res) => {
  try {
    const userId = req.user._id;
    const [user, latestMood] = await Promise.all([
      User.findById(userId).lean(),
      MoodLog.findOne({ userId }).sort({ createdAt: -1 }).lean(),
    ]);

    if (!latestMood) {
      return res.json({ success: true, tip: { emoji: '💙', tip: 'Start by logging how you feel today!', action: 'Head to the mood tracker and log your first entry.' } });
    }

    if (!process.env.GEMINI_API_KEY) {
      const staticTips = {
        5: { emoji: '🌟', tip: 'You are feeling great — keep the momentum going.', action: 'Share something positive with a friend today.' },
        4: { emoji: '😊', tip: 'A good day! Use this energy to work on a goal.', action: 'Spend 10 minutes on your top priority task.' },
        3: { emoji: '🌤️', tip: 'An okay day is still a day moving forward.', action: 'Take a 5-minute walk and notice 3 things around you.' },
        2: { emoji: '🌧️', tip: 'It is okay to have a low day. Rest is productive too.', action: 'Do 4-7-8 breathing right now — just 4 cycles.' },
        1: { emoji: '💙', tip: 'Rough days happen. You are not alone in this.', action: 'Reach out to one person today, even just a text.' },
      };
      return res.json({ success: true, tip: staticTips[latestMood.score] || staticTips[3] });
    }

    const tip = await generateQuickTip(latestMood, user?.goals || []);
    return res.json({ success: true, tip });
  } catch (error) {
    console.error('[getQuickTip] error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/recommendations/:id/save
// ─────────────────────────────────────────────────────────────────────────────
export const saveRecommendation = async (req, res) => {
  try {
    const { id } = req.params;
    await User.findByIdAndUpdate(req.user._id, { $addToSet: { savedRecommendations: id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/recommendations/:id/save
// ─────────────────────────────────────────────────────────────────────────────
export const unsaveRecommendation = async (req, res) => {
  try {
    const { id } = req.params;
    await User.findByIdAndUpdate(req.user._id, { $pull: { savedRecommendations: id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/recommendations/saved
// ─────────────────────────────────────────────────────────────────────────────
export const getSavedRecommendations = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).lean();
    const savedIds = user?.savedRecommendations || [];
    res.json({ success: true, savedIds });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/recommendations/history
// ─────────────────────────────────────────────────────────────────────────────
export const getRecommendationHistory = async (req, res) => {
  try {
    const history = await Recommendation.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.json({
      success: true,
      history: history.map(h => ({
        id: h._id,
        basedOn: h.basedOn,
        createdAt: h.createdAt,
        recommendations: (() => { try { return JSON.parse(h.content); } catch { return []; } })(),
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};