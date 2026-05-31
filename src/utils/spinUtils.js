export const classifySpin = (score) => {
  if (score <= 20) return 'none';
  if (score <= 30) return 'mild';
  if (score <= 40) return 'moderate';
  if (score <= 50) return 'severe';
  return 'very_severe';
};