const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { OrderStatus } = require('../util/types');

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
      discountType: {
        type: String,
        enum: ['percentage', 'value'],
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
