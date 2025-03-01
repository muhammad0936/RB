const mongoose = require('mongoose');
const { StatusCodes } = require('http-status-codes');
const Customer = require('../../models/Customer');
const { ensureIsAdmin } = require('../../util/ensureIsAdmin');
const Admin = require('../../models/Admin');
const TempOrder = require('../../models/TempOrder');

exports.createTempOrder = async (req, res) => {
  try {
    const adminId = req.userId;
    await ensureIsAdmin(adminId);
    const { adminNotes, customerPhone, isUrgent } = req.body;

    // Get customer with populated cart
    const customer = await Customer.exists({ phone: customerPhone });
    if (!customer) {
      const error = new Error('No customer for the phone number!');
      error.statusCode = 400;
      throw error;
    }
    const admin = await Admin.findById(adminId).populate({
      path: 'cart.product',
      select: 'title images productType',
      populate: {
        path: 'productType',
        select: 'name parentProductType',
        populate: {
          path: 'parentProductType',
          select: 'name',
        },
      }, // Include necessary product fields
    });
    if (!admin?.cart?.length) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Invalid admin or empty cart',
      });
    }

    // Calculate totals
    let totalProductPrice = 0;
    const cartItems = admin.cart.map((item) => {
      totalProductPrice += item.price * item?.quantity;
      return {
        product: item?.product?._id,
        price: item.price,
        size: item?.size,
        quantity: item?.quantity,
        notes: item?.notes || '',
      };
    });
    const tempOrder = new TempOrder({
      products: cartItems,
      customerPhone,
      adminNotes,
      creator: admin._id,
      isUrgent: isUrgent == true,
    });
    const customerUrl = `<completeOrderProcess_frontend_URL>?tempOrderId=${tempOrder._id}`;
    tempOrder.customerUrl = customerUrl;
    admin.cart = [];
    await admin.save();
    await tempOrder.save();
    res.status(StatusCodes.OK).json({
      success: true,
      tempOrder,
    });
  } catch (error) {
    console.error('Order Creation Error:', {
      message: error.message,
      validationErrors: error.response?.data?.ValidationErrors,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });

    const statusCode =
      error.response?.status || StatusCodes.INTERNAL_SERVER_ERROR;
    const errorMessage =
      error.response?.data?.Message ||
      error.message ||
      'TempOrder creation failed';

    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      ...(process.env.NODE_ENV === 'development' && {
        errorDetails: error.response?.data,
      }),
    });
  }
};
// Get all temporary orders with summarized data
exports.getTempOrders = async (req, res) => {
  try {
    const tempOrders = await TempOrder.find()
      .select(
        'customerPhone customerUrl isUrgent products adminNotes creator createdAt'
      )
      .populate('creator', 'name')
      .lean();

    const summarizedOrders = tempOrders.map((order) => ({
      _id: order._id,
      customerPhone: order.customerPhone,
      customerUrl: order.customerUrl,
      isUrgent: order.isUrgent,
      totalPrice: order.products.reduce(
        (acc, item) => acc + item.price * item.quantity,
        0
      ),
      itemCount: order.products.length,
      adminNotes: order.adminNotes,
      creator: order.creator,
      createdAt: order.createdAt,
    }));

    res.status(StatusCodes.OK).json({
      success: true,
      count: summarizedOrders.length,
      orders: summarizedOrders,
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to fetch temporary orders',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Get single temporary order with full details
exports.getOneTempOrder = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Invalid order ID format',
      });
    }

    const order = await TempOrder.findById(id)
      .populate({
        path: 'products.product',
        select: 'title images productType',
        populate: {
          path: 'productType',
          select: 'name parentProductType',
          populate: {
            path: 'parentProductType',
            select: 'name',
          },
        },
      })
      .populate('creator', 'name email phone');

    if (!order) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Temporary order not found',
      });
    }

    // Calculate total price
    const totalPrice = order.products.reduce(
      (acc, item) => acc + item.price * item.quantity,
      0
    );

    const response = {
      ...order.toObject(),
      totalPrice,
      itemCount: order.products.length,
    };

    res.status(StatusCodes.OK).json({
      success: true,
      order: response,
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || 'Failed to fetch order details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
