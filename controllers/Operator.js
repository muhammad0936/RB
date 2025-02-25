const mongoose = require('mongoose');
const Order = require('../models/Order');
const Operator = require('../models/Operator');
const { OrderStatus } = require('../util/types');

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      const error = new Error('Email and password are required');
      error.statusCode = 400;
      throw error;
    }

    // Find the operator by email
    const operator = await Operator.findOne({ email });
    if (!operator) {
      const error = new Error('Operator not found');
      error.statusCode = 404;
      throw error;
    }

    // Compare the provided password with the hashed password in the database
    const isPasswordValid = await bcrypt.compare(password, operator.password);
    if (!isPasswordValid) {
      const error = new Error('Invalid password');
      error.statusCode = 401;
      throw error;
    }

    // Generate a JWT token
    const token = jwt.sign(
      {
        email: operator.email,
        userId: operator._id,
      },
      'thisismysecretkey',
      { expiresIn: '30d' }
    );

    // Return the token and operator details (excluding sensitive data like password)
    res.status(200).json({
      message: 'Login successful',
      JWT: `Bearer ${token}`,
      operator: {
        _id: operator._id,
        name: operator.name,
        email: operator.email,
        phone: operator.phone,
        createdAt: operator.createdAt,
      },
    });
  } catch (err) {
    // Handle errors
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
};

// Controller to update the status of an order
exports.updateOrderStatus = async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;

  // Validate the order ID
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return res.status(400).json({ message: 'Invalid order ID' });
  }

  // Validate the new status
  if (!Object.values(OrderStatus).includes(status)) {
    return res.status(400).json({ message: 'Invalid status value' });
  }
  // Validate the new status
  if (!Object.values(OrderStatus).includes(status)) {
    return res.status(400).json({
      message: 'Invalid status value',
      validStatuses: Object.values(OrderStatus), // Provide valid statuses for reference
    });
  }

  try {
    const operator = await Operator.exists({ _id: req.userId });
    if (!operator) {
      const error = new Error('Unauthorized!');
      error.statusCode = 401;
      throw error;
    }
    // Find the order by ID and update its status
    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      { status },
      { new: true } // Return the updated document
    );

    // If the order is not found
    if (!updatedOrder) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Return the updated order
    res.status(200).json({
      message: 'Order status updated successfully',
      order: {
        id: updatedOrder._id,
        status: updatedOrder.status,
        totalAmount: updatedOrder.totalAmount,
      },
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res
      .status(error.statusCode || 500)
      .json({ message: error?.message || 'Internal Server Error' });
  }
};
