const express = require('express');
const router = express.Router();
const isAuth = require('../middlewares/isAuth');
const { updateOrderStatus, login } = require('../controllers/Operator');
const multerGlobal = require('../middlewares/multerGlobal');

router.post('/login', multerGlobal, login);

router.put('/order/:orderId', multerGlobal, isAuth, updateOrderStatus);
module.exports = router;
