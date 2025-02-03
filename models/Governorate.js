const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const governorateSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  cities: [
    {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'City',
    },
  ],
});

module.exports = mongoose.model('Governorate', governorateSchema);
