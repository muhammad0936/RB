const express = require('express');
const router = express.Router();
const commonControllers = require('../controllers/Common');
const multerGlobal = require('../middlewares/multerGlobal');

router.get('/parentProductTypes', commonControllers.getParentProductTypes);

router.get(
  '/childrenProductTypes/:parentProductTypeId',
  commonControllers.getChildProductTypes
);

router.get('/products', commonControllers.getProducts);

router.get('/product/:productId', commonControllers.getOneProduct);

router.get('/states', commonControllers.getAllStates);

router.get('/state', commonControllers.getStateByName);

router.get('/governorates/:stateId', commonControllers.getGovernoratesByState);

// router.get('/governorate/:id', commonControllers.getGovernorateById);

router.get('/cities/:governorateId', commonControllers.getCitiesByGovernorate);

module.exports = router;
