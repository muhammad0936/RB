const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const productTypeSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  image: {
    url: String, // Cloudinary URL
    publicId: String, // Cloudinary public_id
  },
  parentProductType: {
    type: Schema.Types.ObjectId,
    ref: 'ProductType',
    default: null,
  },
});

module.exports = mongoose.model('ProductType', productTypeSchema);
