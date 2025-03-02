const mongoose = require('mongoose');
const { StatusCodes } = require('http-status-codes');
const Order = require('../../models/Order');

const axios = require('axios');
const Customer = require('../../models/Customer');
const State = require('../../models/State');
const Governorate = require('../../models/Governorate');
const City = require('../../models/City');
const Coupon = require('../../models/Coupon');
const { OrderStatus } = require('../../util/types');

exports.checkout = async (req, res) => {
  try {
    const customerId = req.userId;
    const { deliveryAddress, couponCode } = req.body;

    // Validate required fields
    if (
      !deliveryAddress ||
      !deliveryAddress.state ||
      !deliveryAddress.governorate ||
      !deliveryAddress.city
    ) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Delivery address details are required',
      });
    }

    // 1. Validate Customer
    const customer = await Customer.findById(customerId)
      .populate({
        path: 'cart.product',
        select: 'title price weight',
      })
      .lean();

    if (!customer || customer.cart.length === 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Invalid customer or empty cart',
      });
    }

    // 2. Validate Address Hierarchy
    const [state, governorate, city] = await Promise.all([
      State.findById(deliveryAddress.state).lean(),
      Governorate.findById(deliveryAddress.governorate).lean(),
      City.findById(deliveryAddress.city).lean(),
    ]);

    if (!state || !governorate || !city) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Invalid location details',
      });
    }

    if (
      !state.governorates.some((id) =>
        id.equals(deliveryAddress.governorate)
      ) ||
      !governorate.cities.some((id) => id.equals(deliveryAddress.city))
    ) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Location hierarchy mismatch',
      });
    }

    // 3. Calculate Cart Totals
    let totalProductPrice = 0;
    let totalWeight = 0;
    const cartItems = customer.cart.map((item) => {
      totalProductPrice += item.price * item?.quantity;
      totalWeight += item?.product?.weight * item?.quantity;
      return {
        product: item?.product?._id,
        price: item.price,
        size: item?.size,
        quantity: item?.quantity,
      };
    });

    // 4. Calculate Delivery Cost
    const firstKilo = parseFloat(state.firstKiloDeliveryCost);
    const perKilo = parseFloat(state.deliveryCostPerKilo);
    let deliveryCost =
      firstKilo + Math.ceil(Math.max(0, totalWeight - 1)) * perKilo;

    // 5. Handle Coupon
    let coupon = null;
    let discount = 0;

    if (couponCode) {
      coupon = await Coupon.findOne({ code: couponCode }).lean();

      if (!coupon) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: 'Invalid coupon code',
        });
      }

      if (new Date(coupon.expirationDate) < new Date()) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: 'Expired coupon',
        });
      }

      // Validate minimum order amount
      if (totalProductPrice < coupon.minOrderAmount) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: `Coupon requires minimum order of ${coupon.minOrderAmount}`,
        });
      }

      // Calculate discount
      discount =
        coupon.discountType === 'percentage'
          ? (totalProductPrice * coupon.discount) / 100
          : coupon.discount;

      discount = Math.min(discount, coupon.maxDiscount || Infinity);
    }
    let totalAmount = 0;
    totalAmount = totalProductPrice - discount + deliveryCost;
    const payload = { InvoiceAmount: 100, CurrencyIso: 'KWD' };
    const response = await axios.post(
      `${process.env.MYFATOORAH_BASE_URL}/v2/InitiatePayment`,
      payload,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${process.env.MYFATOORAH_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    res.status(StatusCodes.OK).json({
      success: true,
      // paymentUrl: response.data.Data.PaymentURL,
      totalProductPrice,
      productsDisount: 0,
      discount,
      discountType: coupon.discountType,
      deliveryCost,
      totalAmount,
      paymentDetails: response.data,
    });
  } catch (error) {
    console.error(`Checkout Error: ${error.message}`);

    const statusCode =
      error.response?.status || StatusCodes.INTERNAL_SERVER_ERROR;
    const message = error.response?.data?.message || 'Checkout process failed';

    res.status(statusCode).json({
      success: false,
      message,
      error:
        process.env.NODE_ENV === 'development'
          ? {
              stack: error.stack,
              details: error.response?.data,
            }
          : undefined,
    });
  }
};
// controllers/orderController.js

exports.createOrder = async (req, res) => {
  let tempOrder = null;
  try {
    const customerId = req.userId;
    const { deliveryAddress, notes, couponCode, paymentMethodId } = req.body;
    // Validation
    if (
      !deliveryAddress?.state ||
      !deliveryAddress?.governorate ||
      !deliveryAddress?.city
    ) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'State, governorate, and city are required',
      });
    }

    // Get customer with populated cart
    const customer = await Customer.findById(customerId)
      .populate({
        path: 'cart.product',
        select: 'title price weight',
      })
      .lean();

    if (!customer?.cart?.length) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Invalid customer or empty cart',
      });
    }

    // Validate address hierarchy
    const [state, governorate, city] = await Promise.all([
      State.findById(deliveryAddress.state),
      Governorate.findById(deliveryAddress.governorate),
      City.findById(deliveryAddress.city),
    ]);

    const isValidAddress =
      state?.governorates.some((g) => g.equals(deliveryAddress.governorate)) &&
      governorate?.cities.some((c) => c.equals(deliveryAddress.city));

    if (!isValidAddress) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Invalid address hierarchy',
      });
    }

    // Calculate totals
    let totalProductPrice = 0;
    let totalWeight = 0;
    const cartItems = customer.cart.map((item) => {
      totalProductPrice += item.price * item?.quantity;
      totalWeight += item?.product?.weight * item?.quantity;
      return {
        product: item?.product?._id,
        price: item.price,
        size: item?.size,
        quantity: item?.quantity,
        notes: item?.notes || '',
      };
    });

    // Calculate delivery cost
    const deliveryCost =
      parseFloat(state.firstKiloDeliveryCost) +
      Math.ceil(Math.max(0, totalWeight - 1)) *
        parseFloat(state.deliveryCostPerKilo);

    // Handle coupon
    let coupon = null;
    let discount = 0;
    if (couponCode) {
      coupon = await Coupon.findOne({ code: couponCode });
      if (!coupon || new Date(coupon.expirationDate) < new Date()) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: 'Invalid or expired coupon',
        });
      }
      if (totalProductPrice < coupon.minOrderAmount) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: `Minimum order amount ${coupon.minOrderAmount} required`,
        });
      }
      discount =
        coupon.discountType === 'percentage'
          ? Math.min(
              totalProductPrice * (coupon.discount / 100),
              coupon.maxDiscount || Infinity
            )
          : coupon.discount;
    }
    const totalAmount = parseFloat(
      (totalProductPrice - discount + deliveryCost).toFixed(3)
    );

    // Create temporary order
    tempOrder = await Order.create({
      products: cartItems,
      customer: customerId,
      totalAmount,
      deliveryCost,
      deliveryAddress,
      coupon: coupon
        ? {
            code: coupon.code,
            discount,
            discountType: coupon.discountType,
            couponRef: coupon._id,
          }
        : undefined,
      notes,
    });
    // Prepare payment payload
    const paymentPayload = {
      PaymentMethodId: paymentMethodId.toString(),
      InvoiceValue: totalAmount,
      CustomerName: customer.name,
      DisplayCurrencyIso: 'KWD',
      MobileCountryCode: '+965',
      CustomerMobile: customer.phone,
      CustomerEmail: customer.email || 'no-email@example.com',
      CallBackUrl: `${process.env.BACKEND_URL}/payment-success`,
      Language: 'en',
      CustomerReference: tempOrder._id.toString(),
      CustomerAddress: {
        Block: deliveryAddress.block || '',
        Street: deliveryAddress.street,
        HouseBuildingNo: deliveryAddress.building?.number || '',
        Address: `${city.name}, ${governorate.name}, ${state.name}`,
        AddressInstructions: deliveryAddress.notes || '',
      },
    };

    // Execute payment
    const paymentResponse = await axios.post(
      `${process.env.MYFATOORAH_BASE_URL}/v2/ExecutePayment`,
      // {
      //   InvoiceValue: totalAmount,
      //   PaymentMethodId: paymentMethodId,
      //   CallBackUrl: 'https://google.com',
      //   ErrorUrl: 'https://www.keybr.com/',
      // },
      paymentPayload,
      {
        headers: {
          Authorization: `Bearer ${process.env.MYFATOORAH_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    // Update order with payment details
    const updatedOrder = await Order.findByIdAndUpdate(
      tempOrder._id,
      {
        invoiceId: paymentResponse.data.Data.InvoiceId,
        paymentUrl: paymentResponse.data.Data.PaymentURL,
      },
      { new: true }
    );
    // Update coupon usage
    if (coupon) {
      await Coupon.findByIdAndUpdate(coupon._id, {
        $inc: { usedCount: 1 },
      });
    }

    // Clear cart
    // await Customer.findByIdAndUpdate(customerId, { cart: [] });

    res.status(StatusCodes.OK).json({
      success: true,
      paymentUrl: updatedOrder.paymentUrl,
      orderId: updatedOrder._id,
    });
  } catch (error) {
    // Cleanup temporary order on error
    if (tempOrder) await Order.findByIdAndDelete(tempOrder._id);

    console.error('Order Creation Error:', {
      message: error.message,
      validationErrors: error.response?.data?.ValidationErrors,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });

    const statusCode =
      error.response?.status || StatusCodes.INTERNAL_SERVER_ERROR;
    const errorMessage =
      error.response?.data?.Message || 'Order creation failed';

    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      ...(process.env.NODE_ENV === 'development' && {
        errorDetails: error.response?.data,
      }),
    });
  }
};

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
        title: item.product?.title,
        quantity: item.quantity,
        price: item.price,
        size: item.size,
        notes: order.adminNotes ? '' : item.notes,
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
