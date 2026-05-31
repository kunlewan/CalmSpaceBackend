import express from 'express';
import {
  submitSpinAssessment,
  getLatestSpinAssessment,
  submitWellbeingAssessment,
  getWellbeingStatus,
} from '../controllers/assessmnetController.js';
import { verifyJWT } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(verifyJWT);

// SPIN
router.post('/spin', submitSpinAssessment);
router.get('/spin/latest', getLatestSpinAssessment);

// Wellbeing
router.get('/wellbeing/status', getWellbeingStatus);
router.post('/wellbeing', submitWellbeingAssessment);

export default router;