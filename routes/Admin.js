const express = require('express');
const router = express.Router();
const adminControllers = require('../controllers/Admin');
const isAuth = require('../middlewares/isAuth');
const multerMiddleware = require('../middlewares/multerWithFiles');
const multerGlobal = require('../middlewares/multerGlobal');

router.post(
  '/upload/image',
  multerMiddleware([
    { name: 'image', maxCount: 1 }, // Single image
  ]),
  isAuth,
  (req, res, next) => {
    try {
      const imageUrl = req.files?.image?.[0]?.path || '';
      if (imageUrl === '') {
        const error = new Error('Provide at least one image.');
        error.statusCode = 422;
        throw error;
      }
      res.status(201).json({ message: 'Image uploaded.', imageUrl });
    } catch (err) {
      if (!err.statusCode) err.statusCode = 500;

      // Clean up uploaded files if there's an error
      if (req.files) {
        if (req.files?.image?.[0]?.path) unlink(req.files.image[0].path);
      }

      // Pass the error to the next middleware
      next(err);
    }
  }
);

router.post(
  '/upload/video',
  multerMiddleware([
    { name: 'video', maxCount: 1 }, // Single image
  ]),
  isAuth,
  (req, res, next) => {
    try {
      const videoUrl = req.files?.video?.[0]?.path || '';
      if (videoUrl === '') {
        const error = new Error('Provide at least one video.');
        error.statusCode = 422;
        throw error;
      }
      res.status(201).json({ message: 'Video uploaded.', videoUrl });
    } catch (err) {
      if (!err.statusCode) err.statusCode = 500;

      // Clean up uploaded files if there's an error
      if (req.files) {
        if (req.files?.video?.[0]?.path) unlink(req.files.video[0].path);
      }

      // Pass the error to the next middleware
      next(err);
    }
  }
);

router.post('/admin', multerGlobal, adminControllers.createAdmin);
router.post('/login', multerGlobal, adminControllers.login);

router.post(
  '/productType',
  multerGlobal,
  isAuth,
  adminControllers.addProductType
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

router.get('/customers', multerGlobal, isAuth, adminControllers.getCustomers);

module.exports = router;
