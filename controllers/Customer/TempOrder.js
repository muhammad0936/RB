const mongoose = require('mongoose');
const { StatusCodes } = require('http-status-codes');
const Order = require('../../models/Order');
const TempOrder = require('../../models/TempOrder');
const Product = require('../../models/Product');

const axios = require('axios');
const Customer = require('../../models/Customer');
const State = require('../../models/State');
const Governorate = require('../../models/Governorate');
const City = require('../../models/City');
const Coupon = require('../../models/Coupon');

exports.createOrderFromTempOrder = async (req, res) => {
  let newOrder = null;
  try {
    const { tempOrderId, deliveryAddress, notes, couponCode, paymentMethodId } =
      req.body;

    // Validate temp order ID
    if (!mongoose.isValidObjectId(tempOrderId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Invalid temporary order ID format',
      });
    }

    // Get and validate temp order
    const tempOrder = await TempOrder.findById(tempOrderId);
    if (!tempOrder) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Temporary order not found',
      });
    }

    // Get customer by phone from temp order
    const customer = await Customer.findById(req.userId);
    if (!customer) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Customer not found',
      });
    }
    if (customer.phone != tempOrder.customerPhone) {
      const error = new Error('This order is not for this customer!');
      error.statusCode = 400;
      throw error;
    }

    // Validate delivery address
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

    // Calculate product totals from temp order
    let totalProductPrice = 0;
    let totalWeight = 0;

    const populatedProducts = await Promise.all(
      tempOrder.products.map(async (item) => {
        const product = await Product.findById(item.product).select('weight');
        return {
          ...item.toObject(),
          product: { weight: product?.weight || 1 },
        };
      })
    );

    populatedProducts.forEach((item) => {
      totalProductPrice += item.price * item.quantity;
      totalWeight += item.product.weight * item.quantity;
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

    // Create the order
    newOrder = await Order.create({
      // products: tempOrder.products.map((item) => ({
      //   product: item.product,
      //   price: item.price,
      //   size: item.size,
      //   quantity: item.quantity,
      //   notes: item.notes,
      // })),
      products: tempOrder.products,
      customer: customer._id,
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
      isUrgent: tempOrder.isUrgent,
      notes: notes,
      adminNotes: tempOrder.adminNotes,
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
      CustomerReference: newOrder._id.toString(),
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
      newOrder._id,
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

    // Delete temporary order
    await TempOrder.findByIdAndDelete(tempOrderId);

    res.status(StatusCodes.OK).json({
      success: true,
      paymentUrl: updatedOrder.paymentUrl,
      orderId: updatedOrder._id,
    });
  } catch (error) {
    // Cleanup created order on error
    if (newOrder) await Order.findByIdAndDelete(newOrder._id);

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
