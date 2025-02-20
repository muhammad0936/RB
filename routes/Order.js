const express = require('express');
const router = express.Router();
const orderController = require('../controllers/Payment');
const isAuth = require('../middlewares/isAuth');
const multerGlobal = require('../middlewares/multerGlobal');

// Checkout route
router.get('/checkout', multerGlobal, isAuth, orderController.checkout);

router.post('/order', multerGlobal, isAuth, orderController.createOrder);

router.get('/payment-success', orderController.paymentSuccess);
router.get('/payment-error', orderController.paymentError);
module.exports = router;
