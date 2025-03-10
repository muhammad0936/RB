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
    logo: {
      url: String, // Cloudinary URL
      publicId: String, // Cloudinary public_id
    },
    images: [
      {
        url: String, // Cloudinary URL
        publicId: String, // Cloudinary public_id
      },
    ],
    videos: [
      {
        url: String, // Cloudinary URL
        publicId: String, // Cloudinary public_id
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
    attributes: [
      {
        name: {
          type: String,
          required: true,
        },
        options: {
          type: [String],
          required: true,
        },
        required: {
          type: Boolean,
          default: false,
        },
      },
    ],
    notes: {
      type: String,
      default : 'إذا كان القياس XL فأكثر الرجاء الكتابة في الملاحظات'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);
