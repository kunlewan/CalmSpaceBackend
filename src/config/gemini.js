import { GoogleGenerativeAI } from '@google/generative-ai';

if (!process.env.GEMINI_API_KEY) {
  console.warn('[Gemini] WARNING: GEMINI_API_KEY is not set. AI features will be disabled.');
}

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

/**
 * Returns the configured Gemini Flash model instance.
 * Throws a clear error if the API key is missing.
 */
export function getGeminiModel() {
  if (!genAI) {
    throw new Error('GEMINI_API_KEY is not configured. Add it to your .env file.');
  }
  return genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: {
      temperature: 0.7,
      topP: 0.9,
      maxOutputTokens: 2048,
    },
  });
}

export default genAI;