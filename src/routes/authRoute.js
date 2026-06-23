import express from 'express';
import {
  registerUser,
  loginUser,
  verifyEmail,
  resendVerification,
  refreshTokens,
  logoutUser,
  updateProfile,
  updateInterestsAndGoals,
  getCurrentUser
} from '../controllers/authController.js';

import {
  authLimiter,
  verificationLimiter,
  verifyJWT,
  verifyRefreshToken,
} from '../middlewares/authMiddleware.js';
import {sendVerificationEmail} from '../utils/email.js';

// import {sendReceiptEmail} from '../utils/receipt.js';

const router = express.Router();

// Public routes
router.post('/register',            authLimiter,         registerUser);
router.post('/login',               authLimiter,         loginUser);
router.post('/verify-email',        verificationLimiter, verifyEmail);
router.post('/resend-verification', verificationLimiter, resendVerification);

// FIX: /refresh was calling refreshTokens directly without verifyRefreshToken middleware
router.post('/refresh', verifyRefreshToken, refreshTokens);

// FIX: /logout was unprotected — anyone could call it. Now requires valid JWT.
router.post('/logout', verifyJWT, logoutUser);

router.get('/me', verifyJWT, getCurrentUser);
router.put('/profile', verifyJWT, updateProfile);
router.put('/prefrences', verifyJWT, updateInterestsAndGoals)   // frontend typo spelling
router.put('/preferences', verifyJWT, updateInterestsAndGoals)  // correct spelling

// router.post('/send-receipt',  async (req, res) => {
//   try {
//     const { email } = req.body;
//     await sendReceiptEmail(email);
//     res.status(200).json({ message: 'Receipt email sent successfully' });
//   } catch (error) {
//     console.error('Error sending receipt email:', error);
//     res.status(500).json({ message: 'Failed to send receipt email' });
//   }
// });
// Add to your main router file temporarily
router.get('/test-email', async (req, res) => {
  try {
    console.log('📧 EMAIL_USER:', process.env.EMAIL_USER);
    console.log('📧 APP_PASSWORD exists:', !!process.env.GMAIL_APP_PASSWORD);
    console.log('📧 APP_PASSWORD length:', process.env.GMAIL_APP_PASSWORD?.length);
    
    await sendVerificationEmail(process.env.EMAIL_USER, '123456');
    res.json({ success: true });
  } catch (err) {
    console.error('❌ FULL ERROR:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message,
      code: err.code
    });
  }
});
export default router;
