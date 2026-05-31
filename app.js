import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';

import authRoutes from './src/routes/authRoute.js';
import roomRoutes from './src/routes/roomRoute.js';
import assementRoutes from './src/routes/assessmentRoute.js';
import dashboardRoutes from './src/routes/dashboardRoute.js';
import moodRoutes from './src/routes/moodRoute.js';
import recommendationRoutes from './src/routes/recommendationRoute.js';
import userRoutes from './src/routes/userRoute.js';
import dmRoutes from './src/routes/dmRoute.js';
import { csrfMiddleware, getCsrfToken } from './src/middlewares/csrfMiddleware.js';

const app = express();

// === SECURITY ===
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      scriptSrc:  ["'self'"],
    },
  },
}));

app.use(rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,

  skip: (req, res) => process.env.NODE_ENV === 'development',
}));

app.use(cors({
  origin: 'https://calm-space-eight.vercel.app/',     
  credentials: true,                   
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(morgan('dev'));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

// CSRF: off in development, on in production
app.use(csrfMiddleware);
app.get('/api/csrf-token', getCsrfToken);

// === ROUTES ===
app.use('/api/auth',  authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/assessments', assementRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/mood', moodRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dm', dmRoutes);
// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// === GLOBAL ERROR HANDLER ===
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ success: false, message: 'Invalid or missing CSRF token' });
  }
  console.error('Unhandled server error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

export default app;
