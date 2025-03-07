const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const bannerSchema = new Schema({
  images: [
    {
      url: String, // Cloudinary URL
      publicId: String, // Cloudinary public_id
    },
  ],
});

module.exports = mongoose.model('Banner', bannerSchema);
