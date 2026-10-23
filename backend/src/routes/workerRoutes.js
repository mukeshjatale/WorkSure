const router = require('express').Router();
const c = require('../controllers/workerController');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { uploadPhoto } = require('../middleware/upload');
const v = require('../validators/workerValidator');

// Every route here: logged in AND role = worker
router.use(requireAuth, requireRole('worker'));

router.get('/profile', c.getProfile);
router.put('/profile', validate(v.validateWorkerProfile), c.updateProfile);
router.post('/profile/photo', uploadPhoto, c.uploadPhoto);

router.get('/services', c.listServices);
router.post('/services', validate(v.validateWorkerService), c.addService);
router.put('/services/:serviceId', validate(v.validateWorkerPrice), c.updateService);
router.delete('/services/:serviceId', c.removeService);

router.get('/availability', c.getAvailability);
router.put('/availability', validate(v.validateAvailability), c.setAvailability);

router.get('/earnings', c.earnings);
router.get('/reviews', c.myReviews);

module.exports = router;
