const { StatusCodes } = require('http-status-codes');
const mongoose = require('mongoose');

const Admin = require('../../models/Admin');
const Product = require('../../models/Product');
const { ensureIsAdmin } = require('../../util/ensureIsAdmin');

exports.addToCart = async (req, res, next) => {
  try {
    const {
      productId,
      size,
      quantity,
      notes = '',
      selectedAttributes = {},
    } = req.body;
    const adminId = req.userId;
    await ensureIsAdmin(adminId);

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

    // Fetch the admin
    const admin = await Admin.findById(adminId);
    if (!admin) {
      const error = new Error('Admin not found.');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }
    const attributeErrors = [];
    product.attributes.forEach((attr) => {
      const selectedValue = selectedAttributes[attr.name];

      // Check required attributes
      if (attr.required && !selectedValue) {
        attributeErrors.push(`'${attr.name}' is required`);
      }

      // Validate selected option
      if (selectedValue && !attr.options.includes(selectedValue)) {
        attributeErrors.push(`Invalid selection for '${attr.name}'`);
      }
    });
    if (attributeErrors.length > 0) {
      const error = new Error('Attribute validation failed');
      error.details = attributeErrors;
      error.statusCode = StatusCodes.BAD_REQUEST;
      throw error;
    }
    // Check if the product is already in the cart
    const existingCartItem = admin.cart.find(
      (item) =>
        item.product?.toString() === productId &&
        +item.size === +size &&
        +item.price === +product.price &&
        shallowEqual(item.selectedAttributes, selectedAttributes) &&
        item.notes === notes
    );

    if (existingCartItem) {
      // Update the quantity if the product is already in the cart
      existingCartItem.quantity += +quantity;
    } else {
      // Add the product to the cart
      admin.cart.push({
        product: productId,
        selectedAttributes,
        price: product.price,
        size,
        quantity,
        notes,
      });
    }

    // Save the updated admin document
    await admin.save();

    // Send success response
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Product added to cart successfully.',
      cart: admin.cart,
    });
  } catch (error) {
    // Error handling
    if (!error.statusCode) {
      error.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
    }

    console.error(`Add to Cart Error: ${error.message}`, {
      productId: req.body.productId,
      adminId: req.userId,
      timestamp: new Date().toISOString(),
    });

    res.status(error.statusCode).json({
      success: false,
      message: error.message + ' ( ' + error.details + ' ) ',
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
    const adminId = req.userId;
    await ensureIsAdmin(adminId);

    // Fetch the admin
    const admin = await Admin.findById(adminId);
    if (!admin) {
      const error = new Error('Admin not found.');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Find the index of the item in the cart
    const itemIndex = admin.cart.findIndex(
      (item) => item._id.toString() === itemId
    );

    // Check if the item exists in the cart
    if (itemIndex === -1) {
      const error = new Error('Item not found in the cart.');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Remove the item from the cart
    admin.cart.splice(itemIndex, 1);

    // Save the updated admin document
    await admin.save();

    // Send success response
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Item removed from cart successfully.',
      cart: admin.cart,
    });
  } catch (error) {
    // Error handling
    if (!error.statusCode) {
      error.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
    }

    console.error(`Remove from Cart Error: ${error.message}`, {
      // productId: removedProductId,
      adminId: req.userId,
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
    const adminId = req.userId;
    await ensureIsAdmin(adminId);

    // Validate quantityChange
    if (typeof quantityChange !== 'number' || quantityChange === 0) {
      const error = new Error(
        'Invalid quantityChange value. It must be a non-zero number.'
      );
      error.statusCode = StatusCodes.BAD_REQUEST;
      throw error;
    }

    // Fetch the admin
    const admin = await Admin.findById(adminId);
    if (!admin) {
      const error = new Error('Admin not found.');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Find the item in the cart
    const cartItem = admin.cart.find((item) => item._id.toString() === itemId);

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
      admin.cart = admin.cart.filter((item) => item._id.toString() !== itemId);
    } else {
      // Update the quantity
      cartItem.quantity = newQuantity;
    }

    // Save the updated admin document
    await admin.save();

    // Send success response
    res.status(StatusCodes.OK).json({
      success: true,
      message:
        newQuantity >= 1
          ? 'Item quantity updated successfully.'
          : 'Item removed from cart successfully.',
      cart: admin.cart,
    });
  } catch (error) {
    // Error handling
    if (!error.statusCode) {
      error.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
    }

    console.error(`Change Cart Item Quantity Error: ${error.message}`, {
      itemId: req.body.itemId,
      quantityChange: req.body.quantityChange,
      adminId: req.userId,
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
    const adminId = req.userId; // Assuming the admin ID is stored in req.userId after authentication
    await ensureIsAdmin(adminId);
    // Fetch the admin and populate the cart items with product details
    const admin = await Admin.findById(adminId)
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

    if (!admin) {
      const error = new Error('Admin not found.');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Calculate the total price of the cart
    const totalPrice = admin.cart.reduce((total, item) => {
      return total + item.price * item.quantity;
    }, 0);

    // Send success response
    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        cart: admin.cart,
        totalPrice,
      },
    });
  } catch (error) {
    // Error handling
    if (!error.statusCode) {
      error.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
    }

    console.error(`Get Cart Error: ${error.message}`, {
      adminId: req.userId,
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

const shallowEqual = (obj1, obj2) =>
  Object.keys(obj1).length === Object.keys(obj2).length &&
  Object.keys(obj1).every((key) => obj1[key] === obj2[key]);
