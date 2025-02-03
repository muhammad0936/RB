const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const productSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    availableSizes: [
      {
        type: Number,
        required: true,
      },
    ],
    logoUrl: {
      type: String,
    },
    imagesUrls: [
      {
        type: String,
        required: true,
      },
    ],
    videosUrls: [
      {
        type: String,
      },
    ],
    productType: {
      type: Schema.Types.ObjectId,
      ref: 'ProductType',
      required: true,
    },
    weight: {
      type: Number,
      required: true,
    },
    creator: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },
    lastEditor: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);
