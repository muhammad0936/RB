const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const popularSchema = new Schema({
  product: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  orderNumber: {
    type: Number,
    required: true,
    unique: true  // default value can be changed or removed if you want to explicitly assign it
  }
});

module.exports = mongoose.model('Popular', popularSchema);
