const express = require('express');
const router = express.Router();
const CommonControllers = require('../controllers/Common');
const multerGlobal = require('../middlewares/multerGlobal');

router.get('/parentProductTypes', CommonControllers.getParentProductTypes);

router.get(
  '/childrenProductTypes/:parentProductTypeId',
  CommonControllers.getChildProductTypes
);

router.get('/products', CommonControllers.getProducts);

router.get('/product/:productId', CommonControllers.getOneProduct);

router.get('/states', CommonControllers.getAllStates);

router.get('/state', CommonControllers.getStateByName);

router.get('/governorates/:stateId', CommonControllers.getGovernoratesByState);

// router.get('/governorate/:id', CommonControllers.getGovernorateById);

router.get('/cities/:governorateId', CommonControllers.getCitiesByGovernorate);

router.get('/orderStatuses', CommonControllers.getOrderStatuses);

module.exports = router;
