const express = require('express');
const router = express.Router();
const CustomerOrderController = require('../controllers/AdminOrder');
const isAuth = require('../middlewares/isAuth');
const multerGlobal = require('../middlewares/multerGlobal');

router.get('/orders', isAuth, multerGlobal, CustomerOrderController.getOrders);
router.get(
  '/orders/:orderId',
  isAuth,
  multerGlobal,
  CustomerOrderController.getOneOrder
);

module.exports = router;
