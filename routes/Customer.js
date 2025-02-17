const express = require('express');
const router = express.Router();
const customerControllers = require('../controllers/Customer');
const multerGlobal = require('../middlewares/multerGlobal');
const multerWithFiles = require('../middlewares/multerWithFiles');
const isAuth = require('../middlewares/isAuth');

router.post('/signup', multerGlobal, customerControllers.signup);
router.post('/login', multerGlobal, customerControllers.login);

router.post('/cart', multerGlobal, isAuth, customerControllers.addToCart);

router.delete(
  '/cart',
  multerGlobal,
  isAuth,
  customerControllers.removeFromCart
);

router.get('/cart', isAuth, customerControllers.getCart);

module.exports = router;
