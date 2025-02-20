const mongoose = require('mongoose');
const { StatusCodes } = require('http-status-codes');
const Order = require('../models/Order');
const { OrderStatus } = require('../util/types');

// Get all orders for a customer
exports.getOrders = async (req, res) => {
  try {
    const customerId = req.userId;
    const {
      page = 1,
      limit = 10,
      status,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      isUrgent,
      isPaid,
    } = req.query;

    // Build filter object
    const filter = { customer: customerId };

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
      select: '_id totalAmount createdAt estimatedDelivery status',
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
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
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve orders',
    });
  }
};
exports.getOneOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const customerId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Invalid order ID',
      });
    }

    const order = await Order.findOne({
      _id: orderId,
      customer: customerId,
    })
      .select('-paymentDetails')
      .populate({
        path: 'products.product',
        select: 'title _id', // Only essential product info
      })
      .populate('deliveryAddress.state', 'name')
      .populate('deliveryAddress.governorate', 'name')
      .populate('deliveryAddress.city', 'name')
      .populate('coupon.couponRef', 'code discountType')
      .lean();

    if (!order) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Order not found',
      });
    }

    // Format essential information
    const simplifiedOrder = {
      orderId: order._id,
      status: order.status,
      isPaid: order.isPaid,
      isUrgent: order.isUrgent,
      orderDate: order.createdAt,
      finalCost: order.totalAmount,
      deliveryCost: order.deliveryCost,
      paymentUrl: order.paymentUrl,
      coupon: order.coupon
        ? {
            code: order.coupon.code,
            discount: order.coupon.discount,
            discountType: order.coupon.discountType,
          }
        : null,
      orderNotes: order.notes,
      deliveryAddress: {
        area: `${order.deliveryAddress.city?.name}, ${order.deliveryAddress.governorate?.name}`,
        street: order.deliveryAddress.street,
        building: order.deliveryAddress.building,
        notes: order.deliveryAddress.notes || '',
      },
      products: order.products.map((item) => ({
        title: item.product.title,
        quantity: item.quantity,
        price: item.price,
        size: item.size,
        notes: item.notes,
      })),
    };

    res.status(StatusCodes.OK).json({
      success: true,
      order: simplifiedOrder,
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve order details',
    });
  }
};
