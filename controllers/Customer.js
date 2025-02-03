const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const unlink = require('../util/deleteFile');
const unlinkAsync = require('../util/unlinkAsync');
const { StatusCodes } = require('http-status-codes');
const mongoose = require('mongoose');

const Customer = require('../models/Customer');
const Product = require('../models/Product');
const ProductType = require('../models/ProductType');
const State = require('../models/State');
const Governorate = require('../models/Governorate');
const City = require('../models/City');
const Coupon = require('../models/Coupon');
const { populate } = require('../models/Admin');

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
    res.header('Authorization', `Bearer ${token}`);
    res.status(200).json({ message: 'signed in successfully.' });
  } catch (error) {
    if (!error.statusCode && !error[0]) error.statusCode = 500;
    next(error);
  }
};

exports.addToCart = async (req, res, next) => {
  try {
    const { productId, size, quantity } = req.body;
    const customerId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      const error = new Error('Invalid product ID.');
      error.statusCode = StatusCodes.BAD_REQUEST;
      throw error;
    }

    if (!size || !quantity || quantity <= 0) {
      const error = new Error(
        'Size and quantity are required, and quantity must be greater than 0.'
      );
      error.statusCode = StatusCodes.BAD_REQUEST;
      throw error;
    }

    // Fetch the product
    const product = await Product.findById(productId).lean();
    if (!product) {
      const error = new Error('Product not found.');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Check if the selected size is available
    if (!product.availableSizes.includes(+size)) {
      const error = new Error(
        'Selected size is not available for this product.'
      );
      error.statusCode = StatusCodes.BAD_REQUEST;
      throw error;
    }

    // Fetch the customer
    const customer = await Customer.findById(customerId);
    if (!customer) {
      const error = new Error('Customer not found.');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Check if the product is already in the cart
    const existingCartItem = customer.cart.find(
      (item) => item.product.toString() === productId && +item.size === +size
    );

    if (existingCartItem) {
      // Update the quantity if the product is already in the cart
      existingCartItem.quantity += +quantity;
    } else {
      // Add the product to the cart
      customer.cart.push({
        product: productId,
        size,
        quantity,
      });
    }

    // Save the updated customer document
    await customer.save();

    // Send success response
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Product added to cart successfully.',
      cart: customer.cart,
    });
  } catch (error) {
    // Error handling
    if (!error.statusCode) {
      error.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
    }

    console.error(`Add to Cart Error: ${error.message}`, {
      productId: req.body.productId,
      customerId: req.userId,
      timestamp: new Date().toISOString(),
    });

    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      errorDetails:
        process.env.NODE_ENV === 'development'
          ? {
              stack: error.stack,
              code: error.code,
            }
          : undefined,
    });
  }
};

exports.removeFromCart = async (req, res, next) => {
  try {
    const { productId, size } = req.body;
    const customerId = req.userId; // Assuming the customer ID is stored in req.userId after authentication

    // Validate input
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      const error = new Error('Invalid product ID.');
      error.statusCode = StatusCodes.BAD_REQUEST;
      throw error;
    }

    if (!size) {
      const error = new Error('Size is required.');
      error.statusCode = StatusCodes.BAD_REQUEST;
      throw error;
    }

    // Fetch the customer
    const customer = await Customer.findById(customerId);
    if (!customer) {
      const error = new Error('Customer not found.');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Find the index of the item in the cart
    const itemIndex = customer.cart.findIndex(
      (item) => item.product.toString() === productId && item.size === +size
    );

    // Check if the item exists in the cart
    if (itemIndex === -1) {
      const error = new Error('Item not found in the cart.');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Remove the item from the cart
    customer.cart.splice(itemIndex, 1);

    // Save the updated customer document
    await customer.save();

    // Send success response
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Item removed from cart successfully.',
      cart: customer.cart,
    });
  } catch (error) {
    // Error handling
    if (!error.statusCode) {
      error.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
    }

    console.error(`Remove from Cart Error: ${error.message}`, {
      productId: req.body.productId,
      customerId: req.userId,
      timestamp: new Date().toISOString(),
    });

    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      errorDetails:
        process.env.NODE_ENV === 'development'
          ? {
              stack: error.stack,
              code: error.code,
            }
          : undefined,
    });
  }
};

exports.getCart = async (req, res, next) => {
  try {
    const customerId = req.userId; // Assuming the customer ID is stored in req.userId after authentication

    // Fetch the customer and populate the cart items with product details
    const customer = await Customer.findById(customerId)
      .populate({
        path: 'cart.product',
        select: 'title price imagesUrls productType',
        populate: {
          path: 'productType',
          select: 'name parentProductType',
          populate: {
            path: 'parentProductType',
            select: 'name',
          },
        }, // Include necessary product fields
      })
      .lean();

    if (!customer) {
      const error = new Error('Customer not found.');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Calculate the total price of the cart
    const totalPrice = customer.cart.reduce((total, item) => {
      total + item.product.price * item.quantity;
    }, 0);

    // Send success response
    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        cart: customer.cart,
        totalPrice,
      },
    });
  } catch (error) {
    // Error handling
    if (!error.statusCode) {
      error.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
    }

    console.error(`Get Cart Error: ${error.message}`, {
      customerId: req.userId,
      timestamp: new Date().toISOString(),
    });

    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      errorDetails:
        process.env.NODE_ENV === 'development'
          ? {
              stack: error.stack,
              code: error.code,
            }
          : undefined,
    });
  }
};
