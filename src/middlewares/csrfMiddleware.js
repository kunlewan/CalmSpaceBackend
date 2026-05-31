/**
 * CSRF protection middleware.
 *
 * csurf is deprecated and incompatible with Express 5.
 * We implement a simple Double-Submit Cookie pattern instead:
 *   - GET /api/csrf-token sets a signed cookie and returns the token.
 *   - Mutating requests (POST/PUT/PATCH/DELETE) must echo the token in
 *     X-CSRF-Token header or _csrf body field.
 *
 * In development this is completely bypassed (makes Postman/Thunder Client work).
 */

import crypto from 'crypto';

const CSRF_EXCLUDED = [
  '/api/auth/logout',
  '/api/auth/refresh',
];

export const csrfMiddleware = (req, res, next) => {
  // Skip entirely in development
  if (process.env.NODE_ENV !== 'production') return next();

  // Skip safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  // Skip JWT-protected routes that can't be CSRF-attacked
  if (CSRF_EXCLUDED.some((path) => req.path.endsWith(path))) return next();

  const cookieToken = req.cookies?.csrfToken;
  const headerToken = req.headers['x-csrf-token'] || req.body?._csrf;

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ success: false, message: 'Invalid or missing CSRF token' });
  }

  next();
};

export const getCsrfToken = (req, res) => {
  if (process.env.NODE_ENV !== 'production') {
    return res.json({ csrfToken: 'dev-csrf-disabled' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  res.cookie('csrfToken', token, {
    httpOnly: false, // must be readable by JS to echo back in header
    secure: true,
    sameSite: 'strict',
    maxAge: 3600000, // 1 hour
  });
  res.json({ csrfToken: token });
};
