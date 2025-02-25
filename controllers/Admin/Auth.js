const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { StatusCodes } = require('http-status-codes');

// Models
const Admin = require('../../models/Admin');

exports.createAdmin = async (req, res, next) => {
  try {
    // const result = validationResult(req);
    // if (!result.isEmpty()) {
    //   throw result.array().map((i) => {
    //     return { ...i, statusCode: 422 };
    //   });
    // }
    const { name, email, password, phone } = req.body;
    const query = {};
    if (email) query.$or = [{ email }];
    if (phone) {
      query.$or = query.$or || [];
      query.$or.push({ phone });
    }

    const existingAdmin = await Admin.findOne(query);

    if (existingAdmin) {
      const error = new Error(
        existingAdmin.email || -1 === email
          ? 'Email already exists!'
          : 'Phone already exists!'
      );
      error.statusCode = StatusCodes.BAD_REQUEST;
      throw error;
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    const admin = new Admin({
      name,
      email,
      phone,
      password: hashedPassword,
    });
    await admin.save();
    res.status(201).json({ message: 'Admin added successfully.' });
  } catch (err) {
    if (!err.statusCode && !err[0]) err.statusCode = 500;
    next(err);
  }
};

// Login Admin
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
    const loadedAdmin = await Admin.findOne({ email });

    if (!loadedAdmin) {
      const error = new Error('Email or password is incorrect!');
      error.statusCode = 401;
      throw error;
    }
    const isEqual = await bcrypt.compare(password, loadedAdmin.password);
    if (!isEqual) {
      const error = new Error('Email or password is incorrect!');
      error.statusCode = 401;
      throw error;
    }
    const token = jwt.sign(
      {
        email: loadedAdmin.email,
        userId: loadedAdmin._id,
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
