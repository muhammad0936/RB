const express = require('express');
const router = express.Router();
const multerGlobal = require('../middlewares/multerGlobal');
const isAuth = require('../middlewares/isAuth');
const { signup, login } = require('../controllers/Customer/Auth');
const {
  addToCart,
  removeFromCart,
  getCart,
  changeCartItemQuantityartItemQuantity,
  changeCartItemQuantity,
} = require('../controllers/Customer/Cart');
const {
  getOrders,
  getOneOrder,
  checkout,
  createOrder,
} = require('../controllers/Customer/Order');
const {
  requestPasswordReset,
  resetPassword,
} = require('../controllers/Customer/ResetPassword');

router.post('/signup', multerGlobal, signup);

router.post('/login', multerGlobal, login);

router.post('/requestPasswordReset', multerGlobal, requestPasswordReset);

router.post('/resetPassword', multerGlobal, resetPassword);

router.post('/cart', multerGlobal, isAuth, addToCart);

router.delete('/cart', multerGlobal, isAuth, removeFromCart);

router.delete(
  '/changeItemQuantity',
  multerGlobal,
  isAuth,
  changeCartItemQuantity
);

router.get('/cart', isAuth, getCart);

router.get('/checkout', multerGlobal, isAuth, checkout);

router.post('/order', multerGlobal, isAuth, createOrder);

router.get('/orders', isAuth, multerGlobal, getOrders);

router.get('/orders/:orderId', isAuth, multerGlobal, getOneOrder);

module.exports = router;
