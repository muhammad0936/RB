const express = require('express');
const router = express.Router();
const orderController = require('../controllers/Payment');
const isAuth = require('../middlewares/isAuth');
const multerGlobal = require('../middlewares/multerGlobal');

// Checkout route
router.get('/checkout', multerGlobal, isAuth, orderController.checkout);

router.post('/order', multerGlobal, isAuth, orderController.createOrder);

// Payment verification route
// router.post('/verify-payment', multerGlobal, orderController.verifyPayment);

// Temporary test endpoints (remove in production)
<<<<<<< HEAD
// router.get('/payment-callback', multerGlobal, isAuth, (req, res) => {
//   res.status(200).json({
//     success: true,
//     data: req.query,
//   });
// });

// router.get('/payment-error', multerGlobal, isAuth, (req, res) => {
//   res.status(400).json({
//     success: false,
//     error: req.query,
//   });
// });
=======
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
>>>>>>> 55be5c798afd612fe36ad82090e48bbfcc996501

router.get('/payment-success', orderController.paymentSuccess);
router.get('/payment-error', orderController.paymentError);
module.exports = router;
