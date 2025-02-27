const mongoose = require('mongoose');
const Order = require('../../models/Order');
const Operator = require('../../models/Operator');
const { OrderStatus } = require('../../util/types');
const { StatusCodes } = require('http-status-codes');

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { ensureIsOperator } = require('../../util/ensureIsOperator');

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

exports.getOrders = async (req, res) => {
  try {
    const operator = await ensureIsOperator(req.userId);
    const {
      page = 1,
      limit = 10,
      status,
      customer,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      isUrgent,
      isPaid,
    } = req.query;

    // Build filter object
    const filter = {};

    // Customer filter
    if (customer) {
      filter.customer = customer;
    }

    // Status filter
    if (status) {
      filter.status = { $regex: new RegExp(status, 'i') };
    }

    // Date range filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        if (!isNaN(start)) filter.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        if (!isNaN(end)) filter.createdAt.$lte = end;
      }
    }

    // Amount range filter
    if (minAmount || maxAmount) {
      filter.totalAmount = {};
      if (minAmount) filter.totalAmount.$gte = Number(minAmount);
      if (maxAmount) filter.totalAmount.$lte = Number(maxAmount);
    }

    // Boolean filters
    if (isUrgent) filter.isUrgent = isUrgent === 'true';
    if (isPaid) filter.isPaid = isPaid === 'true';
    const options = {
      select: 'createdAt status totalAmount isUrgent',
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      populate: [
        { path: 'customer', select: 'name' },
        { path: 'deliveryAddress.state', select: 'name' },
      ],
      lean: true,
    };
    const orders = await Order.paginate(filter, options);

    res.status(StatusCodes.OK).json({
      success: true,
      orders: orders.docs,
      pagination: {
        totalOrders: orders.totalDocs,
        currentPage: orders.page,
        totalPages: orders.totalPages,
        hasNextPage: orders.hasNextPage,
      },
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || 'Failed to retrieve orders',
    });
  }
};

// Get single order details (Operator)
exports.getOneOrder = async (req, res) => {
  try {
    const operator = await ensureIsOperator(req.userId);
    const { orderId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Invalid order ID',
      });
    }

    const order = await Order.findOne({ _id: orderId })
      // .select(
      //   'products invoiceId paymentUrl totalAmount deliveryCost deliveryAdress coupon isUrgent isPaid status estimatedDelivery notes createdAt'
      // )
      .populate({
        path: 'products.product',
        select: 'title _id price sizes',
      })
      .populate('deliveryAddress.state', 'name')
      .populate('deliveryAddress.governorate', 'name')
      .populate('deliveryAddress.city', 'name')
      .populate('coupon.couponRef', 'code discountType')
      .populate('customer', 'name email phone')
      .lean();

    if (!order) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Order not found',
      });
    }

    // Format order information with Operator-specific details
    const operatorOrderDetails = {
      orderId: order._id,
      customer: {
        name: order.customer?.name,
        email: order.customer?.email,
        phone: order.customer?.phone,
      },
      status: order.status,
      orderDate: order.createdAt,
      FinalCost: order.totalAmount,
      deliveryCost: order.deliveryCost,
      isPaid: order.isPaid,
      // paymentUrl: order.paymentUrl,
      coupon: order.coupon
        ? {
            code: order.coupon.code,
            discount: order.coupon.discount,
            discountType: order.coupon.discountType,
          }
        : null,
      isUrgent: order.isUrgent,
      orderNotes: order.notes,
      deliveryAddress: {
        area: `${order.deliveryAddress.city?.name}, ${order.deliveryAddress.governorate?.name}`,
        street: order.deliveryAddress.street,
        building: order.deliveryAddress.building,
        notes: order.deliveryAddress.notes || '',
      },
      products: order.products.map((item) => ({
        title: item?.product?.title,
        quantity: item.quantity,
        price: item.price,
        size: item.size,
        notes: item.notes,
      })),
    };

    res.status(StatusCodes.OK).json({
      success: true,
      order: operatorOrderDetails,
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || 'Failed to retrieve orders',
    });
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
