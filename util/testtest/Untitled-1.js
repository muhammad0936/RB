const couponSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
    },
    discount: {
      type: Number,
      required: true,
    },
    maxDiscount: Number,
    expirationDate: {
      type: Date,
      required: true,
    },
    minOrderAmount: {
      type: Number,
      default: 0,
    },
    discountType: {
      type: String,
      enum: ['percentage', 'value'],
      default: 'percentage',
    },
    usageLimit: {
      type: Number,
      default: null,
    },
    usedCount: {
      type: Number,
      default: 0,
    },
    validFor: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Product',
      },
    ],
    creator: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Coupon', couponSchema);

const stateSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    firstKiloDeliveryCost: {
      type: String,
      required: true,
    },
    deliveryCostPerKilo: {
      type: String,
      required: true,
    },
    governorates: [
      {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'Governorate',
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('State', stateSchema);

const orderSchema = new Schema(
  {
    products: [
      {
        product: {
          type: Schema.Types.ObjectId,
          ref: 'Product',
          required: true,
        },
        price: {
          type: Number,
          required: true,
        },
        size: {
          type: Number,
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
        },
        notes: String,
      },
    ],
    customer: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Customer',
    },
    paymentId: {
      type: String,
      required: true,
      index: true, // For faster querying
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    deliveryCost: {
      type: Number,
      required: true,
    },
    deliveryAddress: {
      state: {
        type: Schema.Types.ObjectId,
        ref: 'State',
        required: true,
      },
      governorate: {
        type: Schema.Types.ObjectId,
        ref: 'Governorate',
        required: true,
      },
      city: {
        type: Schema.Types.ObjectId,
        ref: 'City',
        required: true,
      },
      street: {
        type: String,
        required: true,
      },
      subStreet: String,
      building: {
        number: String,
        floor: String,
        apartment: String,
      },
    },
    coupon: {
      code: String, // Store denormalized coupon data
      discount: {
        type: Number,
        min: 0,
        max: 100,
      },
      couponRef: {
        type: Schema.Types.ObjectId,
        ref: 'Coupon',
      },
    },
    isUrgent: {
      type: Boolean,
      default: false,
    },
    isPaid: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: OrderStatus,
      default: OrderStatus.pending,
    },
    // Add these new fields
    trackingNumber: String,
    estimatedDelivery: Date,
    notes: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);

const customerSchema = new Schema(
  {
    email: {
      type: String,
      unique: true,
      sparse: true,
    },
    password: {
      type: String,
    },
    name: {
      type: String,
      required: true,
    },
    phone: {
      type: Number,
      unique: true,
      required: true,
    },
    cart: [
      {
        product: {
          type: Schema.Types.ObjectId,
          ref: 'Product',
          required: true,
        },
        size: {
          type: Number,
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
        },
      },
    ],
    resetToken: String,
    resetTokenExpiration: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Customer', customerSchema);

exports.addToCart = async (req, res, next) => {
  try {
    const { productId, size, quantity } = req.body;
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
    const customer = await Customer.findById(customerId);
    if (!customer) {
      const error = new Error('Customer not found.');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Check if the product is already in the cart
    const existingCartItem = customer.cart.find(
      (item) => item.product.toString() === productId && +item.size === +size
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
