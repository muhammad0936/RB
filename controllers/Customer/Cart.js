const { StatusCodes } = require('http-status-codes');
const mongoose = require('mongoose');

const Customer = require('../../models/Customer');
const Product = require('../../models/Product');

exports.addToCart = async (req, res, next) => {
  try {
    const { productId, size, quantity, notes = '' } = req.body;
    const customerId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      const error = new Error('Invalid product ID.');
      error.statusCode = StatusCodes.BAD_REQUEST;
      throw error;
    }

    if (!size || !quantity || quantity <= 0) {
      const error = new Error(
        'Size and quantity are required, and quantity must be greater than 0.'
      );
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

    // Fetch the customer
    const customer = await Customer.findById(customerId).populate({
      path: 'cart.product',
      select: 'price',
    });
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
        +item.price === +product.price &&
        item.notes === notes
    );

    if (existingCartItem) {
      // Update the quantity if the product is already in the cart
      existingCartItem.quantity += +quantity;
    } else {
      // Add the product to the cart
      customer.cart.push({
        product: productId,
        price: product.price,
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
      message: 'Product added to cart successfully.',
      cart: customer.cart,
    });
  } catch (error) {
    // Error handling
    if (!error.statusCode) {
      error.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
    }

    console.error(`Add to Cart Error: ${error.message}`, {
      productId: req.body.productId,
      customerId: req.userId,
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

exports.removeFromCart = async (req, res, next) => {
  try {
    const { itemId } = req.body;
    const customerId = req.userId;

    // Fetch the customer
    const customer = await Customer.findById(customerId);
    if (!customer) {
      const error = new Error('Customer not found.');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Find the index of the item in the cart
    const itemIndex = customer.cart.findIndex(
      (item) => item._id.toString() === itemId
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
      // productId: removedProductId,
      customerId: req.userId,
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

exports.changeCartItemQuantity = async (req, res, next) => {
  try {
    const { itemId, quantityChange } = req.body;
    const customerId = req.userId;

    // Validate quantityChange
    if (typeof quantityChange !== 'number' || quantityChange === 0) {
      const error = new Error(
        'Invalid quantityChange value. It must be a non-zero number.'
      );
      error.statusCode = StatusCodes.BAD_REQUEST;
      throw error;
    }

    // Fetch the customer
    const customer = await Customer.findById(customerId);
    if (!customer) {
      const error = new Error('Customer not found.');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Find the item in the cart
    const cartItem = customer.cart.find(
      (item) => item._id.toString() === itemId
    );

    // Check if the item exists in the cart
    if (!cartItem) {
      const error = new Error('Item not found in the cart.');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }
    const product = await Product.findById(cartItem.product);
    if (quantityChange > 0 && cartItem.price !== product.price) {
      const error = new Error(
        'Cant increment the quantity, the price of this product has changed, add it to the cart again'
      );
      error.statusCode = 400;
      throw error;
    }
    // Calculate the new quantity
    const newQuantity = cartItem.quantity + quantityChange;

    // Validate the new quantity
    if (newQuantity < 1) {
      // Remove the item if the new quantity is less than 1
      customer.cart = customer.cart.filter(
        (item) => item._id.toString() !== itemId
      );
    } else {
      // Update the quantity
      cartItem.quantity = newQuantity;
    }

    // Save the updated customer document
    await customer.save();

    // Send success response
    res.status(StatusCodes.OK).json({
      success: true,
      message:
        newQuantity >= 1
          ? 'Item quantity updated successfully.'
          : 'Item removed from cart successfully.',
      cart: customer.cart,
    });
  } catch (error) {
    // Error handling
    if (!error.statusCode) {
      error.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
    }

    console.error(`Change Cart Item Quantity Error: ${error.message}`, {
      itemId: req.body.itemId,
      quantityChange: req.body.quantityChange,
      customerId: req.userId,
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

exports.getCart = async (req, res, next) => {
  try {
    const customerId = req.userId; // Assuming the customer ID is stored in req.userId after authentication

    // Fetch the customer and populate the cart items with product details
    const customer = await Customer.findById(customerId)
      .populate({
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
      })
      .lean();

    if (!customer) {
      const error = new Error('Customer not found.');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Calculate the total price of the cart
    const totalPrice = customer.cart.reduce((total, item) => {
      total + item.price * item.quantity;
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
      customerId: req.userId,
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
