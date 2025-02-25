const express = require('express');
const router = express.Router();
const {
  getParentProductTypes,
  getChildProductTypes,
} = require('../controllers/Common/ProcutTypes');
const {
  getProducts,
  getBestSellers,
  getOneProduct,
} = require('../controllers/Common/Products');
const {
  getAllStates,
  getStateByName,
  getGovernoratesByState,
  getCitiesByGovernorate,
  getOrderStatuses,
} = require('../controllers/Common/Location');

router.get('/parentProductTypes', getParentProductTypes);

router.get('/childrenProductTypes/:parentProductTypeId', getChildProductTypes);

router.get('/products', getProducts);

router.get('/bestsellers', getBestSellers);

router.get('/product/:productId', getOneProduct);

router.get('/states', getAllStates);

router.get('/state', getStateByName);

router.get('/governorates/:stateId', getGovernoratesByState);

router.get('/cities/:governorateId', getCitiesByGovernorate);

router.get('/orderStatuses', getOrderStatuses);

module.exports = router;
