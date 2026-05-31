import { getGeminiModel } from '../config/gemini.js';

/* ─────────────────────────────────────────────────────────────────────────────
   SPIN Assessment Analysis
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Generates an empathetic analysis of a user's SPIN (Social Phobia Inventory) answers.
 * @param {number[]} answers - Array of 17 numbers (0-4)
 * @returns {Promise<string>}
 */
export const classifyAnxiety = async (answers) => {
  const model = getGeminiModel();
  const total = answers.reduce((a, b) => a + b, 0);

  const prompt = `
A user completed the Social Phobia Inventory (SPIN) with these 17 answers (0-4 each):
${JSON.stringify(answers)}
Total score: ${total}

Provide a short, empathetic analysis (3-4 sentences) of the user's social anxiety pattern based on which items scored highest. Do not diagnose. Be warm and supportive.
  `.trim();

  const result = await model.generateContent(prompt);
  return result.response.text();
};

/* ─────────────────────────────────────────────────────────────────────────────
   Basic Recommendations (legacy — kept for backwards compat)
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Generates 3 coping strategies based on severity + recent moods.
 * @param {string} severity - e.g. 'mild' | 'moderate' | 'severe'
 * @param {object[]} recentMoods - MoodLog documents
 * @returns {Promise<string>}
 */
export const getRecommendations = async (severity, recentMoods) => {
  const model = getGeminiModel();
  const moodSummary = recentMoods
    .slice(0, 7)
    .map(m => `anxiety=${m.anxietyLevel ?? 'N/A'}/10, avoided=${m.avoidedSocial}`)
    .join(', ');

  const prompt = `
A user managing social anxiety has:
- SPIN severity level: ${severity}
- Recent mood check-ins (last 7 days): ${moodSummary || 'No recent logs'}

Provide 3 specific, actionable coping strategies tailored to their current state.
Keep each strategy to 2-3 sentences. Be warm and practical. Number them 1, 2, 3.
  `.trim();

  const result = await model.generateContent(prompt);
  return result.response.text();
};

/* ─────────────────────────────────────────────────────────────────────────────
   AI Recommendation Intelligence Engine  ← NEW
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Builds a rich, structured user context object for the AI prompt.
 */
export function buildUserContext({ user, wellbeing, spin, recentMoods, platformActivity }) {
  const moodTrend = recentMoods.length
    ? recentMoods.slice(0, 7).map(m => ({
        date: new Date(m.createdAt).toDateString(),
        score: m.score,
        label: ['', 'Rough', 'Low', 'Okay', 'Good', 'Great'][m.score] ?? m.score,
        energy: m.energy ?? null,
        productivity: m.productivity ?? null,
        anxietyLevel: m.anxietyLevel ?? null,
        avoidedSocial: m.avoidedSocial ?? false,
        tags: m.tags ?? [],
        note: m.note ?? '',
      }))
    : [];

  const avgMoodScore =
    moodTrend.length
      ? (moodTrend.reduce((s, m) => s + m.score, 0) / moodTrend.length).toFixed(2)
      : null;

  const socialAvoidanceDays = moodTrend.filter(m => m.avoidedSocial).length;

  return {
    profile: {
      name: user.fullname || 'User',
      goals: user.goals || [],
      interests: user.interests || [],
      streak: user.streak || 0,
      onboardingCompleted: user.onboardingCompleted || false,
    },
    assessments: {
      wellbeingTier: wellbeing?.tier || null,
      wellbeingScore: wellbeing?.score || null,
      wellbeingDescription: wellbeing?.description || null,
      wellbeingDate: wellbeing?.date || null,
      spinSeverity: spin?.severity || null,
      spinScore: spin?.score || null,
      spinDate: spin?.createdAt || null,
    },
    moodTrend,
    moodInsights: {
      avgMoodScore,
      socialAvoidanceDays,
      totalLogsAnalysed: moodTrend.length,
      recentLowDays: moodTrend.filter(m => m.score <= 2).length,
      recentHighDays: moodTrend.filter(m => m.score >= 4).length,
    },
    platformActivity: platformActivity || {},
  };
}

/**
 * Calls Gemini Flash to generate deeply personalised recommendations.
 *
 * @param {object} userContext - Output of buildUserContext()
 * @returns {Promise<{
 *   narrative: string,
 *   recommendations: Array<{
 *     id: string,
 *     category: string,
 *     icon: string,
 *     title: string,
 *     summary: string,
 *     whyForYou: string,
 *     steps: string[],
 *     estimatedTime: string,
 *     difficulty: 'Easy'|'Moderate'|'Challenging',
 *     matchScore: number,
 *     tags: string[]
 *   }>,
 *   insight: string,
 *   nextCheckIn: string
 * }>}
 */
export async function generateAIRecommendations(userContext) {
  const model = getGeminiModel();

  const systemInstruction = `
You are the Recommendation Intelligence Engine for CalmSpace — a social wellness, productivity, habit-building, and personal growth platform.

Your role is to produce HIGHLY PERSONALISED, actionable recommendations for the user.
NEVER produce generic advice. Every recommendation must directly reference:
- The user's goals and interests
- Their assessment scores and severity tiers
- Their recent mood trends, energy, productivity, and social patterns
- Their platform engagement and streak

You MUST respond with ONLY valid JSON — no markdown, no explanation outside the JSON.
`.trim();

  const userPrompt = `
USER CONTEXT:
${JSON.stringify(userContext, null, 2)}

Generate a personalised recommendation package. Return ONLY this JSON structure (no markdown fences):

{
  "narrative": "A 2-3 sentence personalised opening that addresses the user by their mood trend and goals. Be warm, specific, not generic.",
  "recommendations": [
    {
      "id": "unique-kebab-case-id",
      "category": "Wellness | CBT | Mindfulness | Productivity | Social | Habit | Movement | Sleep | Gratitude | Breathing",
      "icon": "single relevant emoji",
      "title": "Short action-oriented title",
      "summary": "2-3 sentences. Reference the user's specific situation. Why this, why now.",
      "whyForYou": "1 sentence: direct personalisation — tie to their goals/mood/score.",
      "steps": ["Step 1", "Step 2", "Step 3", "Step 4"],
      "estimatedTime": "e.g. 5 mins | 10-15 mins | Daily",
      "difficulty": "Easy | Moderate | Challenging",
      "matchScore": 85,
      "tags": ["tag1", "tag2"]
    }
  ],
  "insight": "A 2-3 sentence analytical insight about the user's overall pattern (mood trend, social avoidance, energy vs productivity correlation). Be honest and supportive.",
  "nextCheckIn": "Specific suggestion for what the user should do in the next 24 hours, personalised."
}

Rules:
- Return EXACTLY 5 to 8 recommendations
- matchScore must be 60-99 based on how closely the recommendation fits this user's actual data
- Recommendations must span at least 3 different categories
- If wellbeingTier is High or spinSeverity is severe/very_severe, prioritise grounding and professional-care recommendations
- If avgMoodScore > 3.5 and streak > 5, add at least 1 growth/challenge recommendation
- If socialAvoidanceDays >= 3, include a gentle social reconnection recommendation
- Do not mention competitor apps or platforms
- Every step must be concrete and actionable, not vague
`.trim();

  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [{ text: systemInstruction + '\n\n' + userPrompt }],
      },
    ],
  });

  const raw = result.response.text().trim();

  // Strip any accidental markdown fences
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`Gemini returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }
}

/**
 * Generates a concise "Quick Tip" for the user's current mood.
 * Lightweight — single recommendation for micro-interactions.
 *
 * @param {{ score: number, note?: string, anxietyLevel?: number }} latestMood
 * @param {string[]} userGoals
 * @returns {Promise<{ tip: string, action: string, emoji: string }>}
 */
export async function generateQuickTip(latestMood, userGoals) {
  const model = getGeminiModel();

  const label = ['', 'Rough', 'Low', 'Okay', 'Good', 'Great'][latestMood.score] ?? 'Unknown';

  const prompt = `
A user just logged their mood as "${label}" (score: ${latestMood.score}/5).
${latestMood.note ? `Their note: "${latestMood.note}"` : ''}
${latestMood.anxietyLevel != null ? `Anxiety level: ${latestMood.anxietyLevel}/10` : ''}
Their goals: ${userGoals.join(', ') || 'not set'}

Generate a single, warm, in-the-moment tip. Return ONLY this JSON (no markdown):
{
  "emoji": "single emoji",
  "tip": "1-2 sentences of warm, specific encouragement or guidance",
  "action": "One concrete micro-action they can take in the next 5 minutes"
}
  `.trim();

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim()
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return JSON.parse(raw);
  } catch {
    return { emoji: '💙', tip: 'You checked in — that already takes courage.', action: 'Take 3 slow, deep breaths right now.' };
  }
}