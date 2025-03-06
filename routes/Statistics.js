const express = require('express');
const router = express.Router();
const isAuth = require('../middlewares/isAuth');
const multerMiddleware = require('../middlewares/multerWithFiles');
const multerGlobal = require('../middlewares/multerGlobal');
const {
  getCouponStatistics,
  getDailyRevenueStatistics,
  getOfferStatistics,
  getSalesStatistics,
  getTopSellingProducts,
  getProductStatistics,
  getCustomerStatistics,
  getInactiveCustomers,
} = require('../controllers/Admin/Satistics');

router.get('/productsSatistics', getProductStatistics);

router.get('/customersSatistics', getCustomerStatistics);

router.get('/inactiveCustomers', getInactiveCustomers);

router.get('/couponSatistics', multerGlobal, isAuth, getCouponStatistics);

router.get(
  '/dailyRevenueSatistics',
  multerGlobal,
  isAuth,
  getDailyRevenueStatistics
);

router.get('/offerSatistics', multerGlobal, isAuth, getOfferStatistics);

router.get('/salesSatistics', multerGlobal, isAuth, getSalesStatistics);

module.exports = router;
