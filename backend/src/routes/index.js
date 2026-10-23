const router = require('express').Router();

router.use('/auth', require('./authRoutes'));
router.use('/worker', require('./workerRoutes'));
router.use('/bookings', require('./bookingRoutes'));
router.use('/reviews', require('./reviewRoutes'));
router.use('/admin', require('./adminRoutes'));
router.use('/', require('./publicRoutes'));

module.exports = router;
