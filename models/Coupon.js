const mongoose = require('mongoose');
const Schema = mongoose.Schema;

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
