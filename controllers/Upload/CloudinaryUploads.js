const stream = require('stream');
const cloudinary = require('../../util/cloudinaryConfig');
const multer = require('multer');
const { ensureIsAdmin } = require('../../util/ensureIsAdmin');

// Configure Multer for memory storage

// Upload handler
exports.uploadImages = async (req, res, next) => {
  try {
    const admin = await ensureIsAdmin(req.userId);
    const files = req.files;

    if (!files || files.length === 0) {
      const error = new Error('Please provide at least one image');
      error.statusCode = 422;
      throw error;
    }

    // Upload all images to Cloudinary
    const uploadResults = await Promise.all(
      files.map(
        (file) =>
          new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                folder: 'images',
                resource_type: 'image',
                allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
              },
              (error, result) => (error ? reject(error) : resolve(result))
            );

            const bufferStream = new stream.PassThrough();
            bufferStream.end(file.buffer);
            bufferStream.pipe(uploadStream);
          })
      )
    );

    res.status(201).json({
      message: `${files.length} image(s) uploaded successfully`,
      images: uploadResults.map((result) => ({
        url: result.secure_url,
        publicId: result.public_id,
      })),
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;

    if (err.error_code === 'EICAR_TEST_FILE') {
      err.message = 'Malicious file content detected';
      err.statusCode = 422;
    }

    // Cleanup any uploaded files if error occurred mid-process
    if (err.name === 'UploadError') {
      await Promise.all(
        uploadResults
          .filter((r) => r)
          .map((result) => cloudinary.uploader.destroy(result.public_id))
      );
    }

    next(err);
  }
};

//sssssssssssssssssssssssssssssssss

// Add to your Multer configuration

// Video upload controller
exports.uploadVideos = async (req, res, next) => {
  try {
    const admin = await ensureIsAdmin(req.userId);
    const files = req.files;

    if (!files || files.length === 0) {
      const error = new Error('Please provide at least one video');
      error.statusCode = 422;
      throw error;
    }

    const uploadResults = await Promise.all(
      files.map(
        (file) =>
          new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                folder: 'videos',
                resource_type: 'video',
                allowed_formats: ['mp4', 'mov', 'avi', 'mkv'],
                chunk_size: 6000000, // 6MB chunks for large videos
              },
              (error, result) => (error ? reject(error) : resolve(result))
            );

            const bufferStream = new stream.PassThrough();
            bufferStream.end(file.buffer);
            bufferStream.pipe(uploadStream);
          })
      )
    );

    res.status(201).json({
      message: `${files.length} video(s) uploaded successfully`,
      videos: uploadResults.map((result) => ({
        url: result.secure_url,
        publicId: result.public_id,
        duration: result.duration,
        format: result.format,
      })),
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;

    // Cleanup any uploaded videos if error occurred mid-process
    if (err.name === 'UploadError' && uploadResults) {
      await Promise.all(
        uploadResults
          .filter((r) => r)
          .map((result) =>
            cloudinary.uploader.destroy(result.public_id, {
              resource_type: 'video',
            })
          )
      );
    }

    next(err);
  }
};
