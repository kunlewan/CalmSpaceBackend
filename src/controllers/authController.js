import jwt from 'jsonwebtoken';
import { z } from 'zod';
import zxcvbn from 'zxcvbn';
import axios from 'axios';
import { createHash } from 'crypto';

import User from '../models/User.js';
import { sendVerificationEmail } from '../utils/email.js';
// import { sendVerificationEmail } from '../utils/sendVerificationEmail.js';
import { generateAccessToken, generateRefreshToken } from '../utils/token.js';
import { redis } from '../middlewares/authMiddleware.js';

import winston from 'winston';
import { success } from 'zod/v4';

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
// Helpers
// ---------------------------------------------------------------------------
function extractRegistrationError(err) {
  if (err instanceof z.ZodError) {
    const first = err.errors[0];
    const field = first.path.join('.');
    return field ? `${field}: ${first.message}` : first.message;
  }
  if (err instanceof Error) return err.message;
  return 'Validation failed';
}

// ---------------------------------------------------------------------------
// Validation Schemas
// ---------------------------------------------------------------------------
const registerSchema = z.object({
  fullname: z.string().min(3, 'Full name must be at least 3 characters').max(50).trim(),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  email:    z.string().email('Invalid email address').trim().toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const loginSchema = z.object({
  email:    z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const verifyEmailSchema = z.object({
  email: z.string().email('Invalid email address'),
  code:  z.string().length(6, 'Verification code must be 6 digits'),
});

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------
export const registerUser = async (req, res) => {
  try {
    logger.info('Registration attempt', { email: req.body?.email, ip: req.ip });

    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.errors[0].message,
      });
    }

    const { fullname, username, email, password } = parsed.data;

    // Password strength check
    const strength = zxcvbn(password);
    if (strength.score < 3) {
      const hint = strength.feedback?.warning || 
                   strength.feedback?.suggestions?.[0] || 
                   'Try a longer password with mixed characters, numbers, and symbols';
      return res.status(400).json({ success: false, message: `Password is too weak — ${hint}` });
    }

    // HaveIBeenPwned check (keep as is - it's fine)
    try {
      const hash = createHash('sha1').update(password).digest('hex').toUpperCase();
      const prefix = hash.slice(0, 5);
      const suffix = hash.slice(5);
      const pwned = await axios.get(`https://api.pwnedpasswords.com/range/${prefix}`, { timeout: 5000 });
      if (pwned.data.includes(suffix)) {
        return res.status(400).json({
          success: false,
          message: 'This password has appeared in a known data breach — please choose a different one',
        });
      }
    } catch (e) {
      // Non-fatal
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with that email or username already exists',
      });
    }

    const user = new User({ 
      fullname, 
      username, 
      email, 
      password, 
      onboardingCompleted: false, 
      isEmailVerified: false 
    });

    const verificationCode = user.generateVerificationCode();
    await user.save();

    // ── CRITICAL CHANGE ─────────────────────────────────────
    // Don't await email - send in background
    sendVerificationEmail(email, verificationCode)
      .then(() => logger.info(`Verification email sent to ${email}`))
      .catch(err => logger.error('Verification email failed', { email, error: err.message }));

    // Generate tokens
    const accessToken = generateAccessToken({ id: user._id, role: user.role });
    const refreshToken = generateRefreshToken({ id: user._id });

    logger.info('User registered successfully', { 
      userId: user._id, 
      email, 
      ip: req.ip 
    });

    // Respond immediately
    res.status(201).json({
      success: true,
      message: 'Registration successful. Please check your email for the verification code.',
      accessToken,
      refreshToken,
      user: { 
        _id: user._id, 
        name: user.fullname, 
        username: user.username, 
        email: user.email, 
        onboardingCompleted: user.onboardingCompleted 
      },
    });

  } catch (err) {
    logger.error('Registration failed', { reason: err.message, ip: req.ip });
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
};

export const resendVerification = async (req, res) => {
  try {
    const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'Invalid email address' });
    }

    const { email } = parsed.data;
    const user = await User.findOne({ email }).select('+verificationCode +verificationCodeExpires');

    if (!user || user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Cannot resend verification email at this time.',
      });
    }

    // Rate-limit: 5 minutes between resends
    if (user.verificationCodeExpires && user.verificationCodeExpires > Date.now() + 10 * 60 * 1000) {
      return res.status(429).json({
        success: false,
        message: 'Please wait 5 minutes before requesting a new code.',
      });
    }

    const code = user.generateVerificationCode();
    await user.save();
    await sendVerificationEmail(email, code);

    res.json({ success: true, message: 'Verification email resent. Please check your inbox.' });
  } catch (err) {
    logger.error('Resend verification error', { reason: err.message, ip: req.ip });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const verifyEmail = async (req, res) => {
  try {
    const parsed = verifyEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: parsed.error.errors[0].message });
    }

    const { email, code } = parsed.data;
    const user = await User.findOne({ email }).select('+verificationCode +verificationCodeExpires');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (user.isEmailVerified) {
      return res.status(400).json({ success: false, message: 'Email is already verified. You can log in.' });
    }
    if (!user.verificationCode || user.verificationCode !== code) {
      return res.status(400).json({ success: false, message: 'Invalid verification code' });
    }
    if (new Date(user.verificationCodeExpires) < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Verification code has expired — please request a new one',
      });
    }

    user.isEmailVerified         = true;
    user.verificationCode        = undefined;
    user.verificationCodeExpires = undefined;
    await user.save();

    logger.info('Email verified', { email, ip: req.ip });
    res.json({ success: true, message: 'Email verified successfully. You can now log in.' });
  } catch (err) {
    logger.error('Email verification error', { reason: err.message, ip: req.ip });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const loginUser = async (req, res) => {
  try {
    logger.info('Login attempt', { email: req.body?.email, ip: req.ip });

    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: parsed.error.errors[0].message });
    }

    const { email, password } = parsed.data;
    const user = await User.findOne({ email }).select('+password +refreshToken');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (!user.isEmailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email before logging in',
        needsVerification: true,
      });
    }

    const isValid = await user.matchPassword(password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const accessToken  = generateAccessToken({ id: user._id, role: user.role });
    const refreshToken = generateRefreshToken({ id: user._id });
    user.refreshToken  = refreshToken;
    await user.save();

    logger.info('Login successful', { userId: user._id, ip: req.ip });

    res.json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        _id:     user._id,
        name:    user.fullname,
        username: user.username,
        email:    user.email,
        role:     user.role,
        onboardingCompleted: user.onboardingCompleted
      },
    });
  } catch (err) {
    logger.error('Login error', { reason: err.message, ip: req.ip });
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
};

export const refreshTokens = async (req, res) => {
  try {
    res.json({
      success:      true,
      accessToken:  req.newToken.accessToken,
      refreshToken: req.newToken.refreshToken,
    });
  } catch (err) {
    logger.error('Token refresh error', { reason: err.message });
    res.status(500).json({ success: false, message: 'Token refresh failed' });
  }
};

export const logoutUser = async (req, res) => {
  try {
    const userId = req.user?._id;

    // 1. Blacklist the access token JTI
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      if (token) {
        const decoded = jwt.decode(token);
        if (decoded?.jti) {
          await redis.set(`blacklist:${decoded.jti}`, '1', 'EX', 900);
        }
      }
    }

    // 2. Blacklist refresh token JTI
    const refreshToken = req.body?.refreshToken || req.cookies?.refreshToken;
    if (refreshToken) {
      const decoded = jwt.decode(refreshToken);
      if (decoded?.jti) {
        await redis.set(`blacklist:${decoded.jti}`, '1', 'EX', 7 * 24 * 60 * 60);
      }
    }

    // 3. Remove refresh token from DB
    if (userId) {
      await User.findByIdAndUpdate(userId, { $unset: { refreshToken: 1 } });
    }

    // 4. Clear cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    logger.info('User logged out', { userId: userId || 'unknown', ip: req.ip });
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    logger.error('Logout error', { reason: err.message });
    res.status(500).json({ success: false, message: 'Logout failed' });
  }
};

// Update User Profile (Bio, Theme, etc.)
export const updateProfile = async (req, res) => {
  try {
    const { bio, theme, displayName, timezone } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Update allowed fields
    if (bio !== undefined) user.bio = bio.trim().substring(0, 300); // limit length
    if (theme !== undefined) user.theme = theme; // 'light', 'dark', 'auto'
    if (displayName !== undefined) user.fullname = displayName.trim();
    if (timezone !== undefined) user.timezone = timezone;

    await user.save();

    logger.info('Profile updated', { userId: user._id, ip: req.ip });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        fullname: user.fullname,
        email: user.email,
        bio: user.bio,
        theme: user.theme,
        timezone: user.timezone,
      }
    });
  } catch (err) {
    logger.error('Profile update error', { reason: err.message, ip: req.ip });
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
};

export const updateInterestsAndGoals = async (req, res) => {
  try {
    const { interests, goals } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Validate arrays
    if (interests && !Array.isArray(interests)) {
      return res.status(400).json({ message: "Interests must be an array" });
    }
    if (goals && !Array.isArray(goals)) {
      return res.status(400).json({ message: "Goals must be an array" });
    }

    if (interests) user.interests = interests;
    if (goals) user.goals = goals;

    // Mark onboarding as complete
    user.onboardingCompleted = true;

    await user.save();

    res.status(200).json({
      success: true,
      user: {
        _id: user._id,
        name: user.fullname,
        email: user.email,
        username: user.username,
        onboardingCompleted: true,
        interests: user.interests,
        goals: user.goals,
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('fullname username email isEmailVerified onboardingCompleted interests goals role bio theme timezone');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        _id: user._id,
        name: user.fullname,
        username: user.username,
        email: user.email,
        isEmailVerified: user.isEmailVerified,
        onboardingCompleted: user.onboardingCompleted,
        interests: user.interests || [],
        goals: user.goals || [],
        role: user.role,
        bio: user.bio,
        theme: user.theme,
        timezone: user.timezone,
      },
      // Optional: send fresh access token
      accessToken: req.newToken?.accessToken || null,
    });
  } catch (err) {
    logger.error('Get current user error', { reason: err.message, userId: req.user?._id });
    res.status(500).json({ success: false, message: 'Failed to fetch user data' });
  }
};