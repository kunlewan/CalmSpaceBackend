import { rateLimit } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import winston from 'winston';

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'auth.log' }),
    ...(process.env.NODE_ENV !== 'production'
      ? [new winston.transports.Console({ format: winston.format.simple() })]
      : []),
  ],
});

// ---------------------------------------------------------------------------
// In-memory blacklist store (swap for real Redis in production)
// ---------------------------------------------------------------------------
class MemoryStore {
  constructor() {
    this._store = new Map();
    setInterval(() => this._sweep(), 5 * 60 * 1000);
  }

  _sweep() {
    const now = Date.now();
    for (const [key, entry] of this._store) {
      if (entry.expiresAt && entry.expiresAt <= now) this._store.delete(key);
    }
  }

  async set(key, value, exMode, exSeconds) {
    const expiresAt =
      exMode === 'EX' && typeof exSeconds === 'number'
        ? Date.now() + exSeconds * 1000
        : null;
    this._store.set(key, { value: String(value), expiresAt });
    return 'OK';
  }

  async get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this._store.delete(key);
      return null;
    }
    return entry.value;
  }

  async del(key) {
    this._store.delete(key);
    return 1;
  }
}

export const redis = new MemoryStore();

// ---------------------------------------------------------------------------
// Rate Limiters
// ---------------------------------------------------------------------------
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: 'Too many login attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const verificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: 'Too many verification attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const protectedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: 'Too many requests' },
  keyGenerator: (req) => `${req.ip}-${req.user?._id || 'anon'}`,
});

// ---------------------------------------------------------------------------
// JWT Verification Middleware
// FIX: was calling jwt.decode() BEFORE jwt.verify() and using the decoded
//      result as if it were verified — that's a security hole. Now we call
//      jwt.verify() first (throws on invalid/expired), then use its result.
// FIX: was checking header.typ via jwt.decode() which can be spoofed.
// FIX: JWT_ACCESS_SECRET (was ACCESS_TOKEN_SECRET in verify but
//      JWT_ACCESS_SECRET in generate — env name mismatch).
// ---------------------------------------------------------------------------
export const verifyJWT = async (req, res, next) => {
  try {
    const token =
      req.headers.authorization?.replace('Bearer ', '') ||
      req.cookies?.accessToken;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Verify signature + expiry first — throws if invalid
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
    });

    // Check blacklist
    if (payload.jti && (await redis.get(`blacklist:${payload.jti}`))) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const user = await User.findById(payload.id).select('-password');
    if (!user || !user.isEmailVerified) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    req.user   = user;
    req.userId = user._id;
    next();
  } catch (error) {
    logger.warn(`JWT verification failed: ${error.name} from ${req.ip}`);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired', expired: true });
    }
    res.status(401).json({ success: false, message: 'Unauthorized' });
  }
};

// ---------------------------------------------------------------------------
// Refresh Token Middleware
// FIX: JWT_REFRESH_SECRET (was JWT_REFRESH_SECRE — missing T)
// ---------------------------------------------------------------------------
export const verifyRefreshToken = async (req, res, next) => {
  try {
    const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ message: 'No refresh token provided' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const user = await User.findOne({ _id: decoded.id }).select('+refreshToken');
    if (!user || user.refreshToken !== refreshToken) {
      // Possible token reuse attack — blacklist
      if (decoded.jti) {
        await redis.set(`blacklist:${decoded.jti}`, '1', 'EX', 7 * 24 * 60 * 60);
      }
      return res.status(403).json({ message: 'Invalid refresh token' });
    }

    // Rotate refresh token
    const { generateAccessToken, generateRefreshToken } = await import('../utils/token.js');
    const newRefreshToken = generateRefreshToken({ id: user._id });
    user.refreshToken = newRefreshToken;
    await user.save();

    req.user     = user;
    req.newToken = {
      accessToken:  generateAccessToken({ id: user._id }),
      refreshToken: newRefreshToken,
    };

    next();
  } catch (err) {
    logger.warn(`Refresh token failed: ${err.message}`);
    res.status(403).json({ message: 'Invalid refresh token' });
  }
};
