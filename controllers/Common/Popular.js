// controllers/popularController.js
const Popular = require('../../models/Popular');
const Product = require('../../models/Product');
exports.getPopulars = async (req, res) => {
  try {
    const populars = await Popular.find()
      .sort({ orderNumber: 1 })
      .populate({path:'product', select:'_id title price images'})
    res.status(200).json(populars);
  } catch (error) {
    console.error('Error fetching populars:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
