const express = require('express');
const router = express.Router();
const isAuth = require('../middlewares/isAuth');
const {
  updateOrderStatus,
  login,
  getOrders,
  getOneOrder,
} = require('../controllers/Operator/Operator');
const multerGlobal = require('../middlewares/multerGlobal');
const {
  requestPasswordReset,
  resetPassword,
} = require('../controllers/Operator/ResetPassword');

router.post('/login', multerGlobal, login);

router.post('/requestPasswordReset', multerGlobal, requestPasswordReset);

router.post('/resetPassword', multerGlobal, resetPassword);

router.get('/orders', multerGlobal, isAuth, getOrders);

router.get('/orders/:orderId', multerGlobal, isAuth, getOneOrder);

router.put('/order/:orderId', multerGlobal, isAuth, updateOrderStatus);
module.exports = router;
