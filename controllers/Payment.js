const axios = require('axios');
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;
const { StatusCodes } = require('http-status-codes');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const State = require('../models/State');
const Governorate = require('../models/Governorate');
const City = require('../models/City');
const Coupon = require('../models/Coupon');
const { OrderStatus } = require('../util/types');

exports.checkout = async (req, res) => {
  try {
    const customerId = req.userId;
    const { deliveryAddress, couponCode, isUrgent } = req.body;

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
    const { deliveryAddress, notes, couponCode, isUrgent, paymentMethodId } =
      req.body;
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
      totalProductPrice += item.product.price * item.quantity;
      totalWeight += item.product.weight * item.quantity;
      return {
        product: item.product._id,
        price: item.product.price,
        size: item.size,
        quantity: item.quantity,
        notes: item.notes || '',
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
      isUrgent,
      notes,
      status: OrderStatus.pending,
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
      CallBackUrl: `${process.env.BACKEND_URL}/payment-callback`,
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
        status: OrderStatus.pending,
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

// controllers/paymentController.js

// 1. Payment Success Callback
exports.paymentSuccess = async (req, res) => {
  try {
    console.log('Payment suceess hit.');
    const { paymentId } = req.query;

    // Verify payment
    const verification = await axios.post(
      `${process.env.MYFATOORAH_BASE_URL}/v2/GetPaymentStatus`,
      { Key: paymentId, KeyType: 'PaymentId' },
      { headers: { Authorization: `Bearer ${process.env.MYFATOORAH_API_KEY}` } }
    );

    // Update order
    console.log(verification.data.Data);
    await Order.findOneAndUpdate(
      { invoiceId: verification.data.Data.InvoiceId },
      {
        isPaid: true,
        status: OrderStatus.processing,
        paymentDetails: verification.data.Data,
      }
    );

    // Redirect to frontend success page
    // res.redirect(`${process.env.FRONTEND_URL}/order-success`);
    res.redirect(`https://www.google.com`);
  } catch (error) {
    console.error('Payment Success Error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/payment-error`);
  }
};

exports.paymentError = async (req, res) => {
  try {
    console.log('--- Payment Error Endpoint Hit ---');
    console.log('Request Query:', req.query);
    console.log('Request Params:', req.params);
    console.log('Request Body:', req.body);

    // Capture all possible error parameters
    const errorData = {
      queryParams: req.query,
      paymentId: req.query.paymentId,
      invoiceId: req.query.invoiceId || req.query.InvoiceId,
      error: req.query.error || req.query.Error,
      errorCode: req.query.errorCode || req.query.ErrorCode,
    };

    console.error('Payment Failed with Details:', errorData);

    // Attempt to verify payment status using available ID
    let verification = null;
    const key = errorData.invoiceId || errorData.paymentId;
    const keyType = errorData.invoiceId ? 'InvoiceId' : 'PaymentId';

    if (key) {
      verification = await axios.post(
        `${process.env.MYFATOORAH_BASE_URL}/v2/GetPaymentStatus`,
        { Key: key, KeyType: keyType },
        {
          headers: {
            Authorization: `Bearer ${process.env.MYFATOORAH_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.error('Payment Verification Error Details:', verification?.data);
    } else {
      console.error(
        'No valid key (invoiceId or paymentId) found for verification.'
      );
    }

    console.log('Verification Data:', verification?.data?.Data);

    // Update order with error details
    // Update order with error details
    if (verification && verification.data.IsSuccess) {
      const invoiceId = verification.data.Data.InvoiceId;

      await Order.findOneAndUpdate(
        { invoiceId: invoiceId },
        {
          status: OrderStatus.failed,
          paymentDetails: {
            error:
              errorData.error ||
              verification.data.Data.InvoiceTransactions[0]?.Error,
            errorCode:
              errorData.errorCode ||
              verification.data.Data.InvoiceTransactions[0]?.ErrorCode,
            fullError: errorData,
            verificationResponse: verification.data,
          },
        }
      );
    } else {
      console.error('Verification failed or verification data is missing.');
    }

    // Optionally redirect or render an error page
    // res.redirect(`${process.env.FRONTEND_URL}/payment-error`);
    res.redirect(`https://www.keybr.com`);
  } catch (error) {
    console.error('Error Handling Failed:', error);
    res.redirect(`${process.env.FRONTEND_URL}/error`);
  }
};
