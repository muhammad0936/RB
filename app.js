require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const cron = require('node-cron');
const http = require('http');
const bodyParser = require('body-parser');

const unlink = require('./util/deleteFile');

const AdminRoutes = require('./routes/Admin');
const OperatorRoutes = require('./routes/Operator');
const CustomerRoutes = require('./routes/Customer');
const CommonRoutes = require('./routes/Common');
const PaymentRoutes = require('./routes/Payment');

const connectToDatabase = require('./database/connection');

app.use(bodyParser());
app.use(cors());
app.use(helmet());
app.use(compression());
// const accessLogStream = fs.createWriteStream(
//   path.join(__dirname, 'data', 'access.log'),
//   { flags: 'a' }
// );
// app.use(morgan('tiny', { stream: accessLogStream }));
app.use(
  '/uploads',
  express.static(path.join(__dirname, 'uploads'), {
    setHeaders: (res, path) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  })
);

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'OPTIONS, GET, POST, PUT, PATCH, DELETE'
  );
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use('/admin', AdminRoutes);
app.use('/operator', OperatorRoutes);
app.use('/customer', CustomerRoutes);
app.use(CommonRoutes);
app.use(PaymentRoutes);

app.use((req, res, next) => {
  if (req.files) {
    const files = req.files;
    files.map((file) => {
      unlink(file.path);
    });
  }
  res.status(404).json({ message: 'Page not found!' });
});

app.use((error, req, res, next) => {
  console.log('error : ');
  console.log(error);
  res.status(error?.statusCode || error[0]?.statusCode || 500).json({
    result: error?.message || error?.map((i) => i?.msg) || 'an error occurred!',
  });
});

connectToDatabase(process.env.MONGO_STRING)
  .then((result) => {
    app.listen(process.env.PORT || 3000);
    console.log('connected successfully.');
  })
  .catch((err) => {
    if (err) console.log('Connection to the database failed!, ');
    console.log(err);
  });

module.exports = app;
