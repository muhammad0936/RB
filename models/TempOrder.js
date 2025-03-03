// models/Order.js
const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const Schema = mongoose.Schema;
const tempOrderSchema = new Schema(
  {
    customerPhone: {
      type: String,
      required: true,
    },
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
    adminNotes: String,
    creator: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },
    isUrgent: {
      type: Boolean,
      default: false,
    },
    customerUrl: String,
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

tempOrderSchema.plugin(mongoosePaginate);
module.exports = mongoose.model('TempOrder', tempOrderSchema);
