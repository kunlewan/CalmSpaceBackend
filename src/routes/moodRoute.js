import express from 'express';
import { logMood, getMoodHistory, getMoodLogById, getMoodStatus } from '../controllers/moodController.js';
import { verifyJWT } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(verifyJWT);

router.get('/status', getMoodStatus);
router.post('/', logMood);
router.get('/', getMoodHistory);
router.get('/:id', getMoodLogById);

export default router;