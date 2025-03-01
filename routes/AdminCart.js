const express = require('express');
const router = express.Router();
const isAuth = require('../middlewares/isAuth');
const multerGlobal = require('../middlewares/multerGlobal');
const {
  addToCart,
  removeFromCart,
  getCart,
  changeCartItemQuantity,
} = require('../controllers/Admin/Cart');
const {
  createTempOrder,
  getTempOrders,
  getOneTempOrder,
} = require('../controllers/Admin/TempOrder');

router.post('/cart', multerGlobal, isAuth, addToCart);

router.delete('/cart', multerGlobal, isAuth, removeFromCart);

router.delete(
  '/changeItemQuantity',
  multerGlobal,
  isAuth,
  changeCartItemQuantity
);

router.get('/cart', isAuth, getCart);

router.post('/tempOrder', multerGlobal, isAuth, createTempOrder);

router.get('/tempOrders', getTempOrders);

router.get('/tempOrder/:id', getOneTempOrder);

module.exports = router;
