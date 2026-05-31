import express from 'express';
import { verifyJWT } from '../middlewares/authMiddleware.js';
import {
  getRecommendations,
  getQuickTip,
  saveRecommendation,
  unsaveRecommendation,
  getSavedRecommendations,
  getRecommendationHistory,
} from '../controllers/recommendationController.js';

const router = express.Router();

router.use(verifyJWT);

// Core
router.get('/',           getRecommendations);       // GET  /api/recommendations        — AI personalised list
router.get('/quick-tip',  getQuickTip);              // GET  /api/recommendations/quick-tip — post-mood micro tip

// Saved
router.get('/saved',      getSavedRecommendations);  // GET  /api/recommendations/saved
router.post('/:id/save',  saveRecommendation);       // POST /api/recommendations/:id/save
router.delete('/:id/save', unsaveRecommendation);    // DELETE /api/recommendations/:id/save

// History
router.get('/history',    getRecommendationHistory); // GET  /api/recommendations/history

export default router;