exports.uploadVideo = (req, res, next) => {
  try {
    const videoUrl = req.files?.video?.[0]?.path || '';
    if (videoUrl === '') {
      const error = new Error('Provide at least one video.');
      error.statusCode = 422;
      throw error;
    }
    res.status(201).json({ message: 'Video uploaded.', videoUrl });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;

    // Clean up uploaded files if there's an error
    if (req.files) {
      if (req.files?.video?.[0]?.path) unlink(req.files.video[0].path);
    }

    // Pass the error to the next middleware
    next(err);
  }
};
