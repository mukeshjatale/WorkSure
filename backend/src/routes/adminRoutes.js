const router = require('express').Router();
const c = require('../controllers/adminController');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const v = require('../validators/adminValidator');

// Server-side guard for EVERY admin route. Hiding buttons in the browser is not security.
router.use(requireAuth, requireRole('admin'));

router.get('/stats', c.stats);
router.get('/reports', c.reports);
router.get('/logs', c.logs);

router.get('/users', c.listUsers);
router.patch('/users/:id/status', validate(v.validateActiveFlag), c.setUserActive);

router.get('/workers', c.listWorkers);
router.patch('/workers/:id/verification', validate(v.validateVerification), c.setVerification);

router.get('/categories', c.listCategories);
router.post('/categories', validate(v.validateCategory), c.createCategory);
router.put('/categories/:id', validate(v.validateCategory), c.updateCategory);
router.patch('/categories/:id/status', validate(v.validateActiveFlag), c.setCategoryActive);

router.get('/services', c.listServices);
router.post('/services', validate(v.validateService), c.createService);
router.put('/services/:id', validate(v.validateService), c.updateService);
router.patch('/services/:id/status', validate(v.validateActiveFlag), c.setServiceActive);

router.get('/bookings', c.listBookings);

router.get('/reviews', c.listReviews);
router.patch('/reviews/:id/moderation', validate(v.validateReviewModeration), c.moderateReview);

module.exports = router;
