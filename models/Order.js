// models/Order.js
const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

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
        selectedAttributes: {
          type: Map,
          of: Schema.Types.Mixed,
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
    invoiceId: {
      type: String,
      required: true,
      index: true,
      default: () => `temp-${Date.now()}`,
    },
    paymentUrl: {
      type: String,
      required: true,
      default: 'pending',
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
      },
      subStreet: String,
      building: {
        number: String,
        floor: String,
        apartment: String,
      },
      notes: String,
    },
    coupon: {
      code: String,
      discount: {
        type: Number,
        min: 0,
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
    paymentDetails: {
      type: Schema.Types.Mixed,
      default: null,
    },
    trackingNumber: String,
    estimatedDelivery: Date,
    notes: String,
    adminNotes: String,
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

orderSchema.plugin(mongoosePaginate);
module.exports = mongoose.model('Order', orderSchema);
