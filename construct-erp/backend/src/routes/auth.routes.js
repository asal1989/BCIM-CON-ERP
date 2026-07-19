// src/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { register, login, refreshToken, logout, getMe, getProfile, updateProfile, updateCompany, changePassword, forgotPassword, resetPassword } = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');

const { registerValidation, loginValidation } = require('../middleware/validator');

// Login and password-reset used to share one bucket — testing/retrying one
// flow could exhaust the quota and lock out the other. Separate buckets, and
// a slightly higher login ceiling, since this is an internal company tool
// where many staff can share one office IP (NAT), not a public consumer app.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many login attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many password-reset attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/register', registerValidation, register);
router.post('/login', loginLimiter, loginValidation, login);
router.post('/forgot-password', resetLimiter, forgotPassword);
router.post('/reset-password', resetLimiter, resetPassword);
router.post('/refresh', refreshToken);
router.post('/logout', logout);
router.get('/me', authenticate, getMe);
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);
router.put('/company', authenticate, updateCompany);
router.post('/change-password', authenticate, changePassword);

module.exports = router;
