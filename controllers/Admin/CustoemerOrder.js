const mongoose = require('mongoose');
const { StatusCodes } = require('http-status-codes');
const Order = require('../../models/Order');
const { ensureIsAdmin } = require('../../util/ensureIsAdmin');

const axios = require('axios');
const Customer = require('../../models/Customer');
const Product = require('../../models/Product');
const State = require('../../models/State');
const Governorate = require('../../models/Governorate');
const City = require('../../models/City');
const Coupon = require('../../models/Coupon');
const { OrderStatus } = require('../../util/types');

exports.addToCartByAdmin = async (req, res, next) => {
  try {
    const admin = await ensureIsAdmin(req.userId);
    const { productId, size, quantity, notes = '', phone, email } = req.body;

    // Validate required fields
    if (!productId || !size || !quantity || quantity <= 0) {
      const error = new Error(
        'Product ID, size, and quantity are required, and quantity must be greater than 0.'
      );
      error.statusCode = StatusCodes.BAD_REQUEST;
      throw error;
    }

    if (!phone && !email) {
      const error = new Error('Customer phone or email is required.');
      error.statusCode = StatusCodes.BAD_REQUEST;
      throw error;
    }

    // Validate product ID
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      const error = new Error('Invalid product ID.');
      error.statusCode = StatusCodes.BAD_REQUEST;
      throw error;
    }

    // Fetch the product
    const product = await Product.findById(productId).lean();
    if (!product) {
      const error = new Error('Product not found.');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Check if the selected size is available
    if (!product.availableSizes.includes(+size)) {
      const error = new Error(
        'Selected size is not available for this product.'
      );
      error.statusCode = StatusCodes.BAD_REQUEST;
      throw error;
    }

    // Find the customer by phone or email
    const customerQuery = {};
    if (phone) customerQuery.phone = phone;
    if (email) customerQuery.email = email;

    const customer = await Customer.findOne(customerQuery);
    if (!customer) {
      const error = new Error('Customer not found.');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Check if the product is already in the cart
    const existingCartItem = customer.cart.find(
      (item) =>
        item.product?.toString() === productId &&
        +item.size === +size &&
        item.notes === notes
    );

    if (existingCartItem) {
      // Update the quantity if the product is already in the cart
      existingCartItem.quantity += +quantity;
    } else {
      // Add the product to the cart
      customer.cart.push({
        product: productId,
        size,
        quantity,
        notes,
      });
    }

    // Save the updated customer document
    await customer.save();

    // Send success response
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Product added to customer cart successfully.',
      cart: customer.cart,
    });
  } catch (error) {
    // Error handling
    if (!error.statusCode) {
      error.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
    }

    console.error(`Add to Cart by Admin Error: ${error.message}`, {
      productId: req.body.productId,
      phone: req.body.phone,
      email: req.body.email,
      timestamp: new Date().toISOString(),
    });

    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      errorDetails:
        process.env.NODE_ENV === 'development'
          ? {
              stack: error.stack,
              code: error.code,
            }
          : undefined,
    });
  }
};

exports.removeFromCustomerCart = async (req, res, next) => {
  try {
    const { itemId, phone, email } = req.body;

    if (!phone && !email) {
      const error = new Error('Customer phone or email is required.');
      error.statusCode = StatusCodes.BAD_REQUEST;
      throw error;
    }

    // Find the customer by phone or email
    const customerQuery = {};
    if (phone) customerQuery.phone = phone;
    if (email) customerQuery.email = email;

    const customer = await Customer.findOne(customerQuery);
    if (!customer) {
      const error = new Error('Customer not found.');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Find the index of the item in the cart
    const itemIndex = customer.cart.findIndex(
      (item) => item._id?.toString() === itemId
    );

    // Check if the item exists in the cart
    if (itemIndex === -1) {
      const error = new Error('Item not found in the cart.');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Remove the item from the cart
    customer.cart.splice(itemIndex, 1);

    // Save the updated customer document
    await customer.save();

    // Send success response
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Item removed from cart successfully.',
      cart: customer.cart,
    });
  } catch (error) {
    // Error handling
    if (!error.statusCode) {
      error.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
    }

    console.error(`Remove from Cart Error: ${error.message}`, {
      phone: req.body.phone,
      email: req.body.email,
      timestamp: new Date().toISOString(),
    });

    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      errorDetails:
        process.env.NODE_ENV === 'development'
          ? {
              stack: error.stack,
              code: error.code,
            }
          : undefined,
    });
  }
};

exports.getCustomerCart = async (req, res, next) => {
  try {
    const { phone, email } = req.query;

    // Validate input
    if (!phone && !email) {
      const error = new Error('Customer phone or email is required.');
      error.statusCode = StatusCodes.BAD_REQUEST;
      throw error;
    }

    // Find the customer by phone or email
    const customerQuery = {};
    if (phone) customerQuery.phone = phone;
    if (email) customerQuery.email = email;

    // Fetch the customer and populate the cart items with product details
    const customer = await Customer.findOne(customerQuery)
      .populate({
        path: 'cart.product',
        select: 'title price images productType',
        populate: {
          path: 'productType',
          select: 'name parentProductType',
          populate: {
            path: 'parentProductType',
            select: 'name',
          },
        },
      })
      .lean();

    if (!customer) {
      const error = new Error('Customer not found.');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Calculate the total price of the cart
    const totalPrice = customer.cart.reduce((total, item) => {
      return total + item.product?.price * item.quantity;
    }, 0);

    // Send success response
    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        cart: customer.cart,
        totalPrice,
      },
    });
  } catch (error) {
    // Error handling
    if (!error.statusCode) {
      error.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
    }

    console.error(`Get Cart Error: ${error.message}`, {
      phone: req.query.phone,
      email: req.query.email,
      timestamp: new Date().toISOString(),
    });

    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      errorDetails:
        process.env.NODE_ENV === 'development'
          ? {
              stack: error.stack,
              code: error.code,
            }
          : undefined,
    });
  }
};

exports.createOrder = async (req, res) => {
  let tempOrder = null;
  try {
    const admin = await ensureIsAdmin(req.userId);
    const {
      deliveryAddress,
      notes,
      couponCode,
      isUrgent,
      paymentMethodId,
      customerId,
      phone,
      email,
    } = req.body;

    // Validate required fields
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

    // Validate customer identification
    if (!customerId && !phone && !email) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Customer ID, phone, or email is required',
      });
    }

    // Find the customer by ID, phone, or email
    let customer;
    if (customerId) {
      customer = await Customer.findById(customerId);
    } else if (phone || email) {
      const query = {};
      if (phone) query.phone = phone;
      if (email) query.email = email;
      customer = await Customer.findOne(query);
    }

    if (!customer) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Customer not found',
      });
    }

    // Get customer with populated cart
    const customerWithCart = await Customer.findById(customer._id)
      .populate({
        path: 'cart.product',
        select: 'title price weight',
      })
      .lean();

    if (!customerWithCart?.cart?.length) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Customer cart is empty',
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
    const cartItems = customerWithCart.cart.map((item) => {
      totalProductPrice += item?.product?.price * item?.quantity;
      totalWeight += item?.product?.weight * item?.quantity;
      return {
        product: item?.product?._id,
        price: item?.product?.price,
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

    // Clear cart (optional)
    // await Customer.findByIdAndUpdate(customer._id, { cart: [] });

    // Send payment URL to the customer (e.g., via SMS or email)
    // Example: Send SMS or email with the payment URL
    // sendSms(customer.phone, `Please complete your payment: ${updatedOrder.paymentUrl}`);
    // sendEmail(customer.email, 'Payment Link', `Please complete your payment: ${updatedOrder.paymentUrl}`);

    res.status(StatusCodes.OK).json({
      success: true,
      paymentUrl: updatedOrder.paymentUrl,
      orderId: updatedOrder._id,
      message: 'Order created successfully. Payment URL sent to the customer.',
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
