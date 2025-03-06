// controllers/statisticsController.js

const mongoose = require('mongoose');
const Customer = require('../../models/Customer');
const Order = require('../../models/Order');
const Offer = require('../../models/Offer');
const Product = require('../../models/Product');
const Coupon = require('../../models/Coupon');

/**
 * GET /api/statistics/sales
 * Returns overall sales statistics such as total orders, revenue,
 * average order value, and a breakdown of orders by status.
 */

exports.getProductStatistics = async (req, res) => {
  try {
    const [totalProducts, topSelling] = await Promise.all([
      Product.countDocuments(),
      Order.aggregate([
        { $match: { isPaid: true } },
        { $unwind: '$products' },
        {
          $group: {
            _id: '$products.product',
            quantity: { $sum: '$products.quantity' },
            orders: { $addToSet: '$_id' },
          },
        },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'product',
          },
        },
        { $unwind: '$product' },
        {
          $project: {
            title: '$product.title',
            quantity: 1,
            orderCount: { $size: '$orders' },
          },
        },
        { $sort: { quantity: -1 } },
        { $limit: 10 },
      ]),
    ]);

    res.json({
      totalProducts,
      topSellingProducts: topSelling,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSalesStatistics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query; // Assuming dates are passed as query parameters

    // Construct the date filter only if startDate or endDate is provided
    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter = { createdAt: {} };
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    // Total orders in the system within the date range
    const totalOrders = await Order.countDocuments(dateFilter);

    // For sales calculations, consider only paid orders within the date range
    const paidOrdersAgg = await Order.aggregate([
      { $match: { ...dateFilter, isPaid: true } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalAmount' },
          paidOrders: { $sum: 1 },
        },
      },
    ]);

    const paidOrders =
      paidOrdersAgg.length > 0 ? paidOrdersAgg[0].paidOrders : 0;
    const totalRevenue =
      paidOrdersAgg.length > 0 ? paidOrdersAgg[0].totalRevenue : 0;
    const averageOrderValue = paidOrders > 0 ? totalRevenue / paidOrders : 0;

    // Group orders by their status (e.g., pending, delivered, etc.) within the date range
    const ordersByStatusAgg = await Order.aggregate([
      { $match: dateFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    let ordersByStatus = {};
    ordersByStatusAgg.forEach((item) => {
      ordersByStatus[item._id] = item.count;
    });

    return res.status(200).json({
      totalOrders,
      paidOrders,
      totalRevenue,
      averageOrderValue,
      ordersByStatus,
    });
  } catch (err) {
    console.error('Error in getSalesStatistics:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

/**
 * GET /api/statistics/daily-revenue
 * Returns revenue statistics grouped by day (using order creation date).
 */
exports.getDailyRevenueStatistics = async (req, res) => {
  try {
    const dailyRevenue = await Order.aggregate([
      { $match: { isPaid: true } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          total: { $sum: '$totalAmount' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          date: '$_id',
          total: 1,
          orders: 1,
          _id: 0,
        },
      },
    ]);

    return res.status(200).json(dailyRevenue);
  } catch (err) {
    console.error('Error in getDailyRevenueStatistics:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

/**
 * GET /api/statistics/offers
 * Returns the number of active and expired offers.
 */
exports.getOfferStatistics = async (req, res) => {
  try {
    const now = new Date();
    const activeOffersCount = await Offer.countDocuments({
      expirationDate: { $gt: now },
    });
    const expiredOffersCount = await Offer.countDocuments({
      expirationDate: { $lte: now },
    });

    return res.status(200).json({
      activeOffers: activeOffersCount,
      expiredOffers: expiredOffersCount,
    });
  } catch (err) {
    console.error('Error in getOfferStatistics:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

/**
 * GET /api/statistics/coupons
 * Returns overall coupon statistics including total coupons and coupon usage.
 */
exports.getCouponStatistics = async (req, res) => {
  try {
    const totalCoupons = await Coupon.countDocuments();

    // Group orders that used a coupon (i.e. coupon.code exists) and count usage per coupon code.
    const couponUsage = await Order.aggregate([
      { $match: { 'coupon.code': { $exists: true, $ne: null } } },
      {
        $lookup: {
          from: 'coupons', // Name of the Coupon collection
          localField: 'coupon.code',
          foreignField: 'code',
          as: 'couponDetails',
        },
      },
      { $unwind: '$couponDetails' },
      {
        $group: {
          _id: '$couponDetails._id',
          code: { $first: '$couponDetails.code' },
          discount: { $first: '$couponDetails.discount' },
          maxDiscount: { $first: '$couponDetails.maxDiscount' },
          expirationDate: { $first: '$couponDetails.expirationDate' },
          minOrderAmount: { $first: '$couponDetails.minOrderAmount' },
          discountType: { $first: '$couponDetails.discountType' },
          usageLimit: { $first: '$couponDetails.usageLimit' },
          usageCount: { $sum: 1 },
        },
      },
      {
        $project: {
          couponId: '$_id',
          code: 1,
          discount: 1,
          maxDiscount: 1,
          expirationDate: 1,
          minOrderAmount: 1,
          discountType: 1,
          usageLimit: 1,
          usageCount: 1,
          _id: 0,
        },
      },
    ]);

    return res.status(200).json({
      totalCoupons,
      couponUsage,
    });
  } catch (err) {
    console.error('Error in getCouponStatistics:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
exports.getCustomerStatistics = async (req, res) => {
  try {
    const { numberOfCustomers = 10 } = req.query;
    console.log(numberOfCustomers);

    // Total number of customers
    const totalCustomers = await Customer.countDocuments();

    // Most active customers based on order count
    const mostActiveCustomersByCount = await Order.aggregate([
      {
        $group: {
          _id: '$customer',
          ordersCount: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'customers',
          localField: '_id',
          foreignField: '_id',
          as: 'customerDetails',
        },
      },
      { $unwind: '$customerDetails' },
      {
        $project: {
          _id: 0,
          customerId: '$_id',
          name: '$customerDetails.name',
          phone: '$customerDetails.phone',
          ordersCount: 1,
        },
      },
      { $sort: { ordersCount: -1 } },
      { $limit: +numberOfCustomers },
    ]);

    // Most active customers based on order value
    const mostActiveCustomersByValue = await Order.aggregate([
      {
        $group: {
          _id: '$customer',
          totalOrderValue: { $sum: '$totalAmount' },
        },
      },
      {
        $lookup: {
          from: 'customers',
          localField: '_id',
          foreignField: '_id',
          as: 'customerDetails',
        },
      },
      { $unwind: '$customerDetails' },
      {
        $project: {
          _id: 0,
          customerId: '$_id',
          name: '$customerDetails.name',
          phone: '$customerDetails.phone',
          totalOrderValue: 1,
        },
      },
      { $sort: { totalOrderValue: -1 } },
      { $limit: +numberOfCustomers },
    ]);

    return res.status(200).json({
      totalCustomers,
      mostActiveCustomersByCount,
      mostActiveCustomersByValue,
    });
  } catch (err) {
    console.error('Error in getCustomerStatistics:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
exports.getInactiveCustomers = async (req, res) => {
  try {
    const { sinceDate } = req.query;
    if (!sinceDate) {
      return res
        .status(400)
        .json({ error: 'sinceDate query parameter is required' });
    }

    const since = new Date(sinceDate);

    // Find customers who have placed orders since the specified date
    const activeCustomerIds = await Order.distinct('customer', {
      createdAt: { $gte: since },
    });

    // Find customers who have not placed orders since the specified date
    const inactiveCustomers = await Customer.find({
      _id: { $nin: activeCustomerIds },
    }).select('name email phone');

    return res.status(200).json(inactiveCustomers);
  } catch (err) {
    console.error('Error in getInactiveCustomers:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
