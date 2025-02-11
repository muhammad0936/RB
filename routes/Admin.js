const express = require('express');
const router = express.Router();
const adminControllers = require('../controllers/Admin');
const isAuth = require('../middlewares/isAuth');
const multerMiddleware = require('../middlewares/multerWithFiles');
const multerGlobal = require('../middlewares/multerGlobal');

router.post('/admin', multerGlobal, adminControllers.createAdmin);
router.get('/login', multerGlobal, adminControllers.login);

router.post(
  '/productTypes',
  multerGlobal,
  isAuth,
  adminControllers.addProductTypes
);
router.delete(
  '/productTypes',
  multerGlobal,
  isAuth,
  adminControllers.deleteProductTypes
);

router.post(
  '/product',
  multerMiddleware([
    { name: 'logo', maxCount: 1 }, // Single logo
    { name: 'productImages', maxCount: 10 }, // Up to 10 images
    { name: 'productVideos', maxCount: 3 }, // Up to 3 videos
  ]),
  isAuth,
  adminControllers.addProduct
);

router.put(
  '/product/:productId',
  multerMiddleware([
    { name: 'logo', maxCount: 1 }, // Single logo
    { name: 'productImages', maxCount: 10 }, // Up to 10 images
    { name: 'productVideos', maxCount: 3 }, // Up to 3 videos
  ]),
  isAuth,
  adminControllers.editProduct
);

router.delete('/product/:productId', isAuth, adminControllers.deleteProduct);

router.post('/state', multerGlobal, isAuth, adminControllers.addState);

router.put('/state/:stateId', multerGlobal, isAuth, adminControllers.editState);

router.delete('/state/:id', multerGlobal, isAuth, adminControllers.deleteState);

router.post(
  '/governorate',
  multerGlobal,
  isAuth,
  adminControllers.addGovernorate
);

router.delete(
  '/governorate/:id',
  multerGlobal,
  isAuth,
  adminControllers.deleteGovernorate
);

router.post('/city', multerGlobal, isAuth, adminControllers.addCity);

router.delete('/city/:id', multerGlobal, isAuth, adminControllers.deleteCity);

router.post('/coupon', multerGlobal, isAuth, adminControllers.addCoupon);

router.delete(
  '/coupon/:id',
  multerGlobal,
  isAuth,
  adminControllers.deleteCoupon
);

router.get('/coupons', multerGlobal, isAuth, adminControllers.getCoupons);

module.exports = router;
