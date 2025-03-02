const mongoose = require('mongoose');
const { StatusCodes } = require('http-status-codes');
const Order = require('../../models/Order');
const Product = require('../../models/Product');
const { OrderStatus } = require('../../util/types');
const Customer = require('../../models/Customer');
const { ensureIsAdmin } = require('../../util/ensureIsAdmin');

// Get all orders (admin)
exports.getOrders = async (req, res) => {
  try {
    const admin = await ensureIsAdmin(req.userId);
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

    // Execute paginated query
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
// Get single order details (admin)
exports.getOneOrder = async (req, res) => {
  try {
    const admin = await ensureIsAdmin(req.userId);
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

    // Format order information with admin-specific details
    const adminOrderDetails = {
      orderId: order._id,
      customer: {
        name: order.customer?.name,
        email: order.customer?.email,
        phone: order.customer?.phone,
      },
      adminNotes: order.adminNotes,
      orderNotes: order.notes,
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
      order: adminOrderDetails,
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || 'Failed to retrieve order details',
    });
  }
};
