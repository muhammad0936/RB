const Banner = require('../../models/Banner');
exports.getBanners = async (req, res) => {
  try {
    const banner = await Banner.findOne();
    if (!banner) {
      return res.status(404).json({ error: 'Banner not found' });
    }
    res.status(200).json(banner);
  } catch (error) {
    console.error('Error fetching banners:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
