const mongoose = require('mongoose');
const Order = require('../../models/Order');
const Operator = require('../../models/Operator');
const { OrderStatus } = require('../../util/types');
const { StatusCodes } = require('http-status-codes');

const Product = require('../../models/Product');
const Customer = require('../../models/Customer');

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
      name,
      phone,
      orderId,
      productTitle,
      startDate,
      endDate,
      page = 1,
      limit = 10,
    } = req.query;

    const filter = {};

    // Customer Name and Phone Filter (combined)
    if (name || phone) {
      const customerFilter = {};

      if (name) {
        customerFilter.name = { $regex: name, $options: 'i' };
      }

      if (phone) {
        customerFilter.phone = phone;
      }

      // Find customers that match BOTH name and phone (if both are provided)
      const customers = await Customer.find(customerFilter).select('_id');
      const customerIds = customers.map((c) => c._id);

      // Set filter for Orders
      if (customerIds.length > 0) {
        filter.customer = { $in: customerIds };
      } else {
        // No matching customers = return no orders
        filter.customer = { $in: [] };
      }
    }

    // Order ID Filter
    if (orderId) {
      if (mongoose.isValidObjectId(orderId)) {
        filter._id = new mongoose.Types.ObjectId(orderId);
      } else {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: 'Invalid order ID format',
        });
      }
    }

    // Product Title Filter
    if (productTitle) {
      const products = await Product.find({
        title: { $regex: productTitle, $options: 'i' },
      }).select('_id');
      const productIds = products.map((p) => p._id);
      if (productIds.length) {
        filter['products.product'] = { $in: productIds };
      }
    }

    // Date Range Filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    // Pagination Options
    const options = {
      select: 'createdAt status totalAmount isUrgent',
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      populate: [
        {
          path: 'customer',
          select: 'name phone',
          match: name || phone ? {} : undefined, // Maintain population even if filtered
        },
        { path: 'deliveryAddress.state', select: 'name' },
        {
          path: 'products.product',
          select: 'title',
          match: productTitle ? {} : undefined,
        },
      ],
      lean: true,
    };
    const orders = await Order.paginate(filter, options);

    // Filter empty results from population
    const filteredDocs = orders.docs.filter(
      (doc) =>
        (!name || doc.customer) &&
        (!productTitle || doc.products.some((p) => p.product))
    );
    const returnedDoce = filteredDocs.map((d) => {
      delete d.products;
      return d;
    });
    res.status(StatusCodes.OK).json({
      success: true,
      orders: returnedDoce,
      pagination: {
        totalOrders: orders.totalDocs,
        currentPage: orders.page,
        totalPages: orders.totalPages,
        hasNextPage: orders.hasNextPage,
      },
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve orders',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
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
      orderNotes: order.notes,
      adminNotes: order.adminNotes,
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
  const validStatuses = Object.values(OrderStatus).filter(
    (s) => s !== 'Pending'
  );
  // Validate the order ID
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return res.status(400).json({ message: 'Invalid order ID' });
  }

  // Validate the new status
  if (!Object.values(validStatuses).includes(status)) {
    return res.status(400).json({
      message: 'Invalid status value',
      validStatuses: Object.values(validStatuses), // Provide valid statuses for reference
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
