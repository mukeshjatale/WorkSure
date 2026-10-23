const router = require('express').Router();
const c = require('../controllers/bookingController');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const v = require('../validators/bookingValidator');

router.use(requireAuth);

// POST  /api/bookings            customer only
router.post('/', requireRole('customer'), validate(v.validateCreateBooking), c.create);
// GET   /api/bookings            customer (own) or worker (assigned to them)
router.get('/', requireRole('customer', 'worker'), c.list);
// GET   /api/bookings/:id        customer (own) or worker (assigned)
router.get('/:id', requireRole('customer', 'worker'), c.getOne);
// PATCH /api/bookings/:id/status customer (cancel) or worker (accept/reject/start/complete/cancel)
router.patch('/:id/status', requireRole('customer', 'worker'), validate(v.validateStatusChange), c.changeStatus);

module.exports = router;
