const Banner = require('../../models/Banner');

// Create a new banner
const createBanner = async (req, res) => {
  try {
    const { images } = req.body;
    if (!images || !Array.isArray(images)) {
      return res.status(400).json({ error: 'Invalid data format. Expected an array of {url, publicId} objects.' });
    }
    // Validate at least one image is provided
    if (images.length === 0) {
      const error = new Error('Provide at least one image.');
      error.statusCode = 422;
      throw error;
    }
    const normalizeMedia = (media) => {
      if (!media || !media.url) return { url: '', publicId: '' }; // Default to empty object
      return {
        url: media.url.replace(/\\/g, '/'), // Replace backslashes with forward slashes
        publicId: media.publicId || '', // Ensure publicId is included
      };
    };
    
    const normalizedImages = images.map((image) => normalizeMedia(image));
    const banner = await Banner.findOneAndUpdate(
      {},
      { images: normalizedImages },
      { new: true, upsert: true }
    );
    
    await banner.save();
    res.status(201).json(banner);
  } catch (error) {
    console.error('Error creating banner:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get all banners

module.exports = {
  createBanner,
};
