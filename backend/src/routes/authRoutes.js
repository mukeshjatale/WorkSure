const router = require('express').Router();
const c = require('../controllers/authController');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiters');
const v = require('../validators/authValidator');

// POST /api/auth/register  (public)  body: fullName,email,phone,password,confirmPassword,role,acceptTerms
router.post('/register', authLimiter, validate(v.validateRegister), c.register);
// POST /api/auth/login     (public)  body: email,password
router.post('/login', authLimiter, validate(v.validateLogin), c.login);
// POST /api/auth/logout    (any logged-in user)
router.post('/logout', c.logout);
// GET  /api/auth/me        (logged in)
router.get('/me', requireAuth, c.me);
// PUT  /api/auth/me        (logged in) body: fullName,phone
router.put('/me', requireAuth, validate(v.validateProfileUpdate), c.updateMe);
// PUT  /api/auth/me/password (logged in) body: currentPassword,newPassword,confirmPassword
router.put('/me/password', requireAuth, authLimiter, validate(v.validatePasswordChange), c.changePassword);

module.exports = router;
