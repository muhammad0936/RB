const express = require('express');
const router = express.Router();
const orderController = require('../controllers/Payment');

// Checkout route
router.get('/payment-success', orderController.paymentSuccess);
router.get('/payment-error', orderController.paymentError);
module.exports = router;
