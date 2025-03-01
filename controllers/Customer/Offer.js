const mongoose = require('mongoose');
const Offer = require('../../models/Offer');
const Product = require('../../models/Product');
const Customer = require('../../models/Customer');
const { StatusCodes } = require('http-status-codes');

exports.addOfferToCart = async (req, res) => {
  try {
    const { offerId, products } = req.body;
    const customerId = req.userId;

    // Validate offer ID format
    if (!mongoose.Types.ObjectId.isValid(offerId)) {
      const error = new Error('Invalid offer ID format');
      error.statusCode = StatusCodes.BAD_REQUEST;
      throw error;
    }

    // Fetch and validate offer
    const offer = await Offer.findById(offerId)
      .populate('products.product')
      .lean();

    if (!offer) {
      const error = new Error('Offer not found');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Check offer validity
    if (new Date(offer.expirationDate) < new Date()) {
      const error = new Error('This offer has expired');
      error.statusCode = StatusCodes.BAD_REQUEST;
      throw error;
    }

    // Validate product count matches offer requirements
    if (products.length !== offer.numberOfProductsHaveToBuy) {
      const error = new Error(
        `This offer requires exactly ${offer.numberOfProductsHaveToBuy} products`
      );
      error.statusCode = StatusCodes.BAD_REQUEST;
      throw error;
    }

    // Validate each product in the request
    const productMap = new Map();
    for (const item of products) {
      // Validate product ID format
      if (!mongoose.Types.ObjectId.isValid(item.productId)) {
        const error = new Error('Invalid product ID format');
        error.statusCode = StatusCodes.BAD_REQUEST;
        throw error;
      }

      // Find offer product entry
      const offerProduct = offer.products.find(
        (op) => op.product?._id.toString() === item.productId && op.product
      );

      if (!offerProduct) {
        const error = new Error(`Product ${item.productId} not found in offer`);
        error.statusCode = StatusCodes.BAD_REQUEST;
        throw error;
      }

      // Check for duplicate products in request
      if (productMap.has(item.productId)) {
        const error = new Error('Duplicate products in request');
        error.statusCode = StatusCodes.BAD_REQUEST;
        throw error;
      }
      productMap.set(item.productId, true);

      // Validate size
      if (!offerProduct.product.availableSizes.includes(+item.size)) {
        const error = new Error(
          `Invalid size ${item.size} for product ${offerProduct.product.name}`
        );
        error.statusCode = StatusCodes.BAD_REQUEST;
        throw error;
      }

      // Validate quantity
      if (!item.quantity || item.quantity <= 0) {
        const error = new Error(
          `Invalid quantity for product ${offerProduct.product.name}`
        );
        error.statusCode = StatusCodes.BAD_REQUEST;
        throw error;
      }
    }

    // Get customer document
    const customer = await Customer.findById(customerId);
    if (!customer) {
      const error = new Error('Customer not found');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Add products to cart with offer pricing
    for (const item of products) {
      const offerProduct = offer.products.find(
        (op) => op.product._id.toString() === item.productId
      );
      console.log(item.productId, item.size, offerProduct.newPrice, item.notes);
      const existingItem = customer.cart.find(
        (cartItem) =>
          cartItem.product.toString() === item.productId &&
          cartItem.size === +item.size &&
          cartItem.price === +offerProduct.newPrice &&
          cartItem.notes === item.notes
      );

      if (existingItem) {
        existingItem.quantity += +item.quantity;
      } else {
        customer.cart.push({
          product: item.productId,
          size: +item.size,
          price: offerProduct.newPrice,
          quantity: +item.quantity,
          notes: item.notes || '',
        });
      }
    }

    await customer.save();
    const updatedCustomer = await Customer.findById(customer._id).populate({
      path: 'cart.product',
      select: 'price',
    });
    const cartItemsPrices = updatedCustomer.cart.map((p) => {
      return {
        price: p.product?.price,
        newPrice: p.price,
        quantity: p.quantity,
      };
    });
    const savedAmount = _calculateSavings(cartItemsPrices);

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Offer products added to cart successfully',
      data: {
        cart: customer.cart,
        offer: {
          id: offer._id,
          description: offer.description,
          savedAmount,
        },
      },
    });
  } catch (error) {
    if (!error.statusCode) {
      error.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
    }

    console.error(
      `[${new Date().toISOString()}] Offer Cart Error: ${error.message}`,
      {
        customerId: req.userId,
      }
    );

    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    });
  }
};

// Helper method to calculate savings
const _calculateSavings = (cartItems) => {
  return cartItems.reduce((total, item) => {
    return total + (item.price - item.newPrice) * item.quantity;
  }, 0);
};
