import express from 'express';
import { getDashboard } from '../controllers/dashboardController.js';
import { verifyJWT } from '../middlewares/authMiddleware.js';

const router = express.Router();

// GET /api/dashboard
router.get('/', verifyJWT, getDashboard);

export default router;
