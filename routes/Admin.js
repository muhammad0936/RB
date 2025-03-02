const express = require('express');
const router = express.Router();
const isAuth = require('../middlewares/isAuth');
const multerMiddleware = require('../middlewares/multerWithFiles');
const multerGlobal = require('../middlewares/multerGlobal');
const { uploadImage } = require('../controllers/Upload/Image');
const { uploadVideo } = require('../controllers/Upload/Video');
const { createAdmin, login } = require('../controllers/Admin/Auth');
const {
  addProductType,
  deleteProductTypes,
} = require('../controllers/Admin/ProductType');
const {
  addProduct,
  editProduct,
  deleteProduct,
} = require('../controllers/Admin/Product');
const {
  addState,
  editState,
  deleteState,
  addGovernorate,
  deleteGovernorate,
  addCity,
  deleteCity,
} = require('../controllers/Admin/Location');
const { getCustomers } = require('../controllers/Admin/Customer');
const {
  deleteCoupon,
  getCoupons,
  addCoupon,
} = require('../controllers/Admin/Coupon');
const { getOrders, getOneOrder } = require('../controllers/Admin/Order');
const {
  addOperator,
  deleteOperator,
  getOperators,
  editOperator,
} = require('../controllers/Admin/Operator');
const {
  requestPasswordReset,
  resetPassword,
} = require('../controllers/Admin/ResetPassword');
const {
  addToCartByAdmin,
  createOrder,
  removeFromCustomerCart,
  getCustomerCart,
  changeCartItemQuantity,
} = require('../controllers/Admin/CustoemerOrder');
const {
  createOffer,
  updateOffer,
  deleteOffer,
  manageProducts,
} = require('../controllers/Admin/Offer');

// router.post(
//   '/upload/image',
//   multerMiddleware([
//     { name: 'image', maxCount: 1 }, // Single image
//   ]),
//   isAuth,
//   uploadImage
// );

// router.post(
//   '/upload/video',
//   multerMiddleware([
//     { name: 'video', maxCount: 1 }, // Single image
//   ]),
//   isAuth,
//   uploadVideo
// );

router.post('/admin', multerGlobal, createAdmin);

router.post('/login', multerGlobal, login);

router.post('/requestPasswordReset', multerGlobal, requestPasswordReset);

router.post('/resetPassword', multerGlobal, resetPassword);

router.post('/productType', multerGlobal, isAuth, addProductType);

router.delete('/productTypes', multerGlobal, isAuth, deleteProductTypes);

router.post(
  '/product',
  multerMiddleware([
    { name: 'logo', maxCount: 1 }, // Single logo
    { name: 'productImages', maxCount: 10 }, // Up to 10 images
    { name: 'productVideos', maxCount: 3 }, // Up to 3 videos
  ]),
  isAuth,
  addProduct
);

router.put(
  '/product/:productId',
  multerMiddleware([
    { name: 'logo', maxCount: 1 }, // Single logo
    { name: 'productImages', maxCount: 10 }, // Up to 10 images
    { name: 'productVideos', maxCount: 3 }, // Up to 3 videos
  ]),
  isAuth,
  editProduct
);

router.delete('/product/:productId', isAuth, deleteProduct);

router.post('/state', multerGlobal, isAuth, addState);

router.put('/state/:stateId', multerGlobal, isAuth, editState);

router.delete('/state/:id', multerGlobal, isAuth, deleteState);

router.post('/governorate', multerGlobal, isAuth, addGovernorate);

router.delete('/governorate/:id', multerGlobal, isAuth, deleteGovernorate);

router.post('/city', multerGlobal, isAuth, addCity);

router.delete('/city/:id', multerGlobal, isAuth, deleteCity);

router.post('/coupon', multerGlobal, isAuth, addCoupon);

router.delete('/coupon/:id', multerGlobal, isAuth, deleteCoupon);

router.get('/coupons', multerGlobal, isAuth, getCoupons);

router.get('/orders', multerGlobal, isAuth, getOrders);

router.get('/orders/:orderId', isAuth, multerGlobal, getOneOrder);

router.get('/customers', multerGlobal, isAuth, getCustomers);

router.post('/operator', multerGlobal, isAuth, addOperator);

router.put('/operator/:id', multerGlobal, isAuth, editOperator);

router.delete('/operator/:id', isAuth, deleteOperator);

router.get('/operators', multerGlobal, isAuth, getOperators);

router.post('/customerCart', multerGlobal, isAuth, addToCartByAdmin);

router.delete('/customerCart', multerGlobal, isAuth, removeFromCustomerCart);

router.delete(
  '/customerChangeItemQuantity',
  multerGlobal,
  isAuth,
  changeCartItemQuantity
);

router.get('/customerCart', multerGlobal, isAuth, getCustomerCart);

router.post('/customerOrder', multerGlobal, isAuth, createOrder);

router.post('/offer', multerGlobal, isAuth, createOffer);

router.put('/offer/:id', multerGlobal, isAuth, updateOffer);

router.delete('/offer/:id', multerGlobal, isAuth, deleteOffer);

router.put('/manageOfferProducts/:id', multerGlobal, isAuth, manageProducts);

module.exports = router;
