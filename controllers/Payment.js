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
          ? totalProductPrice * (coupon.discount / 100)
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

exports.createOrder = async (req, res) => {
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

    // **1. Validate Customer**
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

    // **2. Validate Address Hierarchy**
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

    // **3. Calculate Cart Totals**
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

    // **4. Calculate Delivery Cost**
    const firstKilo = parseFloat(state.firstKiloDeliveryCost);
    const perKilo = parseFloat(state.deliveryCostPerKilo);
    let deliveryCost =
      firstKilo + Math.ceil(Math.max(0, totalWeight - 1)) * perKilo;

    // **5. Handle Coupon**
    let discount = 0;
    let coupon = null;

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
          ? totalProductPrice * (coupon.discount / 100)
          : coupon.discount;

      discount = Math.min(discount, coupon.maxDiscount || Infinity);
    }

    // **6. Calculate Total Amount**
    const totalAmount = totalProductPrice - discount + deliveryCost;

    // **7. Prepare Order Data**
    const orderData = {
      products: cartItems,
      customer: customerId,
      totalAmount,
      deliveryCost,
      deliveryAddress,
      coupon: coupon
        ? {
            code: coupon.code,
            discount: coupon.discount,
            discountType: coupon.discountType,
            couponRef: coupon._id,
          }
        : undefined,
      isUrgent: isUrgent || false,
      isPaid: false,
      status: 'pending',
    };

    // **8. Create Order**
    const order = await Order.create(orderData);

    // **9. Initiate Payment with MyFatoorah**
    const paymentPayload = {
      PaymentMethodId: '2', // Update with the correct payment method ID
      CustomerName: `${customer.firstName} ${customer.lastName}`,
      DisplayCurrencyIso: 'KWD',
      MobileCountryCode: '+965',
      CustomerMobile: customer.mobile || '00000000',
      CustomerEmail: customer.email || 'email@example.com',
      InvoiceValue: totalAmount,
      CallBackUrl: 'https://yourdomain.com/api/payment/callback',
      ErrorUrl: 'https://yourdomain.com/api/payment/error',
      Language: 'en',
      CustomerReference: order._id.toString(),
      UserDefinedField: 'Order Payment',
      CustomerAddress: {
        Block: '',
        Street: deliveryAddress.street,
        HouseBuildingNo: deliveryAddress.building.number || '',
        Address: `${deliveryAddress.city}, ${deliveryAddress.governorate}, ${deliveryAddress.state}`,
        AddressInstructions: deliveryAddress.notes || '',
      },
      InvoiceItems: cartItems.map((item) => ({
        ItemName: item.product.title || 'Product',
        Quantity: item.quantity,
        UnitPrice: item.price,
      })),
    };

    const response = await axios.post(
      `${process.env.MYFATOORAH_BASE_URL}/v2/ExecutePayment`,
      paymentPayload,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${process.env.MYFATOORAH_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const paymentData = response.data;

    // **10. Update Order with Payment ID**
    order.paymentId = paymentData.Data.PaymentId;
    coupon.usedCount = coupon.usedCount + 1;
    await order.save();
    await coupon.save();

    // **11. Clear Customer Cart**
    await Customer.findByIdAndUpdate(customerId, { cart: [] });

    // **12. Respond with Payment URL**
    res.status(StatusCodes.OK).json({
      success: true,
      paymentUrl: paymentData.Data.PaymentURL,
      orderId: order._id,
    });
  } catch (error) {
    console.error(`Order Creation Error: ${error.message}`);

    const statusCode =
      error.response?.status || StatusCodes.INTERNAL_SERVER_ERROR;
    const message = error.response?.data?.message || 'Failed to create order';

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
