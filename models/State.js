const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const stateSchema = new Schema(
  {
    name: {
      type: String,
      unique: true,
      required: true,
    },
    firstKiloDeliveryCost: {
      type: String,
      required: true,
    },
    deliveryCostPerKilo: {
      type: String,
      required: true,
    },
    governorates: [
      {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'Governorate',
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('State', stateSchema);
