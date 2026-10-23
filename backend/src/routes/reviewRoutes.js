const router = require('express').Router();
const c = require('../controllers/reviewController');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const v = require('../validators/bookingValidator');

router.use(requireAuth, requireRole('customer'));
router.post('/', validate(v.validateReview), c.create); // POST /api/reviews
router.get('/mine', c.mine);                            // GET  /api/reviews/mine

module.exports = router;
