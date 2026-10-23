const router = require('express').Router();
const c = require('../controllers/catalogController');

router.get('/categories', c.categories);              // GET /api/categories
router.get('/services', c.services);                  // GET /api/services?categoryId=
router.get('/services/:id', c.serviceById);           // GET /api/services/:id   (service + workers who offer it)
router.get('/workers', c.searchWorkers);              // GET /api/workers?q=&location=&categoryId=&serviceId=&minPrice=&maxPrice=&minRating=&available=&date=&sort=&page=&limit=
router.get('/workers/featured', c.featuredWorkers);   // GET /api/workers/featured
router.get('/workers/:id', c.workerById);             // GET /api/workers/:id
router.get('/workers/:id/reviews', c.workerReviews);  // GET /api/workers/:id/reviews?page=
router.get('/testimonials', c.testimonials);          // GET /api/testimonials
router.get('/stats/public', c.publicStats);           // GET /api/stats/public

module.exports = router;
