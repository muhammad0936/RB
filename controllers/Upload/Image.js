exports.uploadImage = (req, res, next) => {
  try {
    const imageUrl = req.files?.image?.[0]?.path || '';
    if (imageUrl === '') {
      const error = new Error('Provide at least one image.');
      error.statusCode = 422;
      throw error;
    }
    res.status(201).json({ message: 'Image uploaded.', imageUrl });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;

    // Clean up uploaded files if there's an error
    if (req.files) {
      if (req.files?.image?.[0]?.path) unlink(req.files.image[0].path);
    }

    // Pass the error to the next middleware
    next(err);
  }
};
