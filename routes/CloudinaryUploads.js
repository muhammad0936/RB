const express = require('express');
const router = express.Router();
const isAuth = require('../middlewares/isAuth');
const {
  uploadImages,
  uploadVideos,
} = require('../controllers/Upload/CloudinaryUploads');
const multer = require('multer');
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          'Invalid file type. Only JPG, JPEG, PNG, and WEBP are allowed'
        ),
        false
      );
    }
  },
});

const videoUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'video/mp4',
      'video/quicktime',
      'video/x-msvideo',
      'video/x-matroska',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error('Invalid file type. Only MP4, MOV, AVI, and MKV are allowed'),
        false
      );
    }
  },
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit for videos
});

router.post(
  '/upload/images',
  isAuth,
  imageUpload.array('images', 10),
  uploadImages
);
router.post(
  '/upload/video',
  isAuth,
  videoUpload.array('videos', 3),
  uploadVideos
);
module.exports = router;
