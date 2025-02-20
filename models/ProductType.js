const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const productTypeSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  imageUrl: String,
  parentProductType: {
    type: Schema.Types.ObjectId,
    ref: 'ProductType',
    default: null,
  },
});

module.exports = mongoose.model('ProductType', productTypeSchema);
