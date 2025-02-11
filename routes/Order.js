const express = require('express');
const router = express.Router();
const orderController = require('../controllers/Payment');
const isAuth = require('../middlewares/isAuth');
const multerGlobal = require('../middlewares/multerGlobal');

// Add authentication middleware to protect routes
router.use(isAuth);

// Checkout route
router.get('/checkout', multerGlobal, orderController.checkout);

// Payment verification route
// router.post('/verify-payment', multerGlobal, orderController.verifyPayment);

// Temporary test endpoints (remove in production)
router.get('/payment-callback', multerGlobal, (req, res) => {
  res.status(200).json({
    success: true,
    data: req.query,
  });
});

router.get('/payment-error', multerGlobal, (req, res) => {
  res.status(400).json({
    success: false,
    error: req.query,
  });
});

module.exports = router;
