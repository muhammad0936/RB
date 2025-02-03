const axios = require('axios');
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;
const { StatusCodes } = require('http-status-codes');
const Order = require('../models/order');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const State = require('../models/State');
const Governorate = require('../models/Governorate');
const City = require('../models/City');
const Coupon = require('../models/Coupon');

exports.checkout = async (req, res) => {
  try {
    const customerId = req.userId;
    const { deliveryAddress, couponCode, isUrgent } = req.body;

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
      totalProductPrice += item.product.price * item.quantity;
      totalWeight += item.product.weight * item.quantity;
      return {
        product: item.product._id,
        price: item.product.price,
        size: item.size,
        quantity: item.quantity,
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
      coupon = await Coupon.findOne({ code: couponCode }).populate('validFor');

      if (!coupon || coupon.expirationDate < new Date()) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: 'Invalid or expired coupon',
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
          ? totalProductPrice * (coupon.discountValue / 100)
          : coupon.discountValue;

      discount = Math.min(discount, coupon.maxDiscount || Infinity);
    }

    // 6. Create Order
    const order = new Order({
      products: cartItems,
      customer: customerId,
      deliveryAddress,
      deliveryCost,
      totalAmount: totalProductPrice + deliveryCost - discount,
      coupon: coupon
        ? {
            code: coupon.code,
            discount,
            couponRef: coupon._id,
          }
        : undefined,
      isUrgent,
      status: 'pending',
    });

    // // In your checkout controller
    // const isTestEnv = process.env.NODE_ENV === 'test';
    // // 7. Prepare MyFatoorah Payment
    // const payload = {
    //   PaymentMethodId: process.env.NODE_ENV === 'test' ? '2' : null,
    //   CustomerName: customer.name,
    //   InvoiceAmount: order.totalAmount,
    //   CurrencyIso: 'KWD',
    //   CustomerEmail: customer.email || 'no-email@example.com',
    //   CustomerMobile: customer.phone,
    //   CallBackUrl: isTestEnv
    //     ? `${process.env.BACKEND_URL}/payment-callback`
    //     : `${process.env.FRONTEND_URL}/payment-callback`,
    //   ErrorUrl: isTestEnv
    //     ? `${process.env.BACKEND_URL}/payment-error`
    //     : `${process.env.FRONTEND_URL}/payment-error`,
    //   Language: 'en',
    //   CustomerReference: order._id.toString(),
    //   InvoiceItems: customer.cart.map((item) => ({
    //     ItemName: item.product.title,
    //     Quantity: item.quantity,
    //     UnitPrice: item.product.price,
    //   })),
    // };

    // const response = await axios.post(
    //   `${process.env.MYFATOORAH_BASE_URL}/v2/ExecutePayment`,
    //   payload,
    //   {
    //     headers: {
    //       Authorization: `Bearer ${process.env.MYFATOORAH_API_KEY}`,
    //       'Content-Type': 'application/json',
    //       accept: 'application/json',
    //     },
    //   }
    // );
    var response = null;
    var request = require('request');
    var token = 'Bearer ' + process.env.MYFATOORAH_API_KEY; //token value to be placed here;
    var baseURL = 'https://apitest.myfatoorah.com';
    var options = {
      method: 'POST',
      url: baseURL + '/v2/InitiatePayment',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: { InvoiceAmount: 100, CurrencyIso: 'KWD' },
      json: true,
    };

    request(options, function (error, response, body) {
      if (error) throw new Error(error);
      response = body;
      console.log('body ', body);
    });
    console.log('response ', response);

    // 8. Finalize Order
    order.paymentId = response.data.Data.PaymentId;
    await order.save();

    // Update coupon usage
    if (coupon) {
      await Coupon.findByIdAndUpdate(coupon._id, {
        $inc: { usedCount: 1 },
      });
    }

    res.status(StatusCodes.OK).json({
      success: true,
      paymentUrl: response.data.Data.PaymentURL,
      orderId: order._id,
    });
  } catch (error) {
    console.error(`Checkout Error: ${error}`);

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

exports.verifyPayment = async (req, res) => {
  try {
    const { paymentId } = req.body;
    const customerId = req.userId;

    // 1. Verify payment with MyFatoorah
    const response = await axios.post(
      `${process.env.MYFATOORAH_BASE_URL}/v2/getPaymentStatus`,
      { PaymentId: paymentId },
      {
        headers: {
          Authorization: `Bearer ${process.env.MYFATOORAH_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // 2. Find related order
    const order = await Order.findOne({
      paymentId,
      customer: customerId,
    });

    if (!order) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Order not found',
      });
    }

    // 3. Update order status if payment successful
    if (response.data.Data.InvoiceStatus === 'Paid') {
      order.isPaid = true;
      order.status = 'processing';
      await order.save();

      // 4. Clear customer's cart
      await Customer.findByIdAndUpdate(customerId, { $set: { cart: [] } });

      return res.status(StatusCodes.OK).json({
        success: true,
        message: 'Payment verified successfully',
      });
    }

    // 5. Handle failed payment
    order.status = 'failed';
    await order.save();

    res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: 'Payment verification failed',
    });
  } catch (error) {
    console.error(`Payment Verification Error: ${error.message}`);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Payment verification failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
