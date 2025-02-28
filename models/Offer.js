const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const Schema = mongoose.Schema;
const offerSchema = new Schema(
  {
    description: String,
    products: [
      {
        product: {
          type: Schema.Types.ObjectId,
          ref: 'Product',
          required: true,
        },
        newPrice: {
          type: Number,
          required: true,
        },
        notes: String,
      },
    ],
    expirationDate: {
      type: Date,
      required: true,
    },
    numberOfProductsHaveToBuy: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

offerSchema.plugin(mongoosePaginate);
module.exports = mongoose.model('Offer', offerSchema);
