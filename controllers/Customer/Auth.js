const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { StatusCodes } = require('http-status-codes');

const Customer = require('../../models/Customer');

exports.signup = async (req, res, next) => {
  try {
    // const result = validationResult(req);
    // if (!result.isEmpty()) {
    //   throw result.array().map((i) => {
    //     return { ...i, statusCode: 422 };
    //   });
    // }
    const { name, email, password, phone } = req.body;
    const emailExists = await Customer.exists({ email });
    if (emailExists) {
      const error = new Error('Email already exists!');
      error.statusCode = StatusCodes.BAD_REQUEST;
      throw error;
    }

    const existingCustomer = await Customer.findOne({ phone });
    if (existingCustomer?.email) {
      const error = new Error('Phone already exists!');
      error.statusCode = StatusCodes.BAD_REQUEST;
      throw error;
    }
    // => No user with same phone having en email

    const hashedPassword = await bcrypt.hash(password, 12);
    if (existingCustomer) {
      existingCustomer.name = name;
      existingCustomer.email = email;
      existingCustomer.password = hashedPassword;
      await existingCustomer.save();
    } else {
      const customer = new Customer({
        name,
        email,
        phone,
        password: hashedPassword,
      });
      await customer.save();
    }
    res.status(201).json({ message: 'Customer added successfully.' });
  } catch (err) {
    if (!err.statusCode && !err[0]) err.statusCode = 500;
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    // const result = validationResult(req);
    // if (!result.isEmpty()) {
    //   console.log(result.array());
    //   throw result.array().map((i) => {
    //     return { ...i, statusCode: 422 };
    //   });
    // }
    const { email, password } = req.body;
    const loadedCustomer = await Customer.findOne({ email });

    if (!loadedCustomer) {
      const error = new Error('Email or password is incorrect!');
      error.statusCode = 401;
      throw error;
    }
    const isEqual = await bcrypt.compare(password, loadedCustomer.password);
    if (!isEqual) {
      const error = new Error('Email or password is incorrect!');
      error.statusCode = 401;
      throw error;
    }
    const token = jwt.sign(
      {
        email: loadedCustomer.email,
        userId: loadedCustomer._id,
      },
      'thisismysecretkey',
      { expiresIn: '30d' }
    );
    res
      .status(200)
      .json({ message: 'signed in successfully.', JWT: `Bearer ${token}` });
  } catch (error) {
    if (!error.statusCode && !error[0]) error.statusCode = 500;
    next(error);
  }
};
