const unlinkAsync = require('../../util/unlinkAsync');
const { StatusCodes } = require('http-status-codes');
const mongoose = require('mongoose');

// Models
const Admin = require('../../models/Admin');
const Product = require('../../models/Product');
const ProductType = require('../../models/ProductType');
const { ensureIsAdmin } = require('../../util/ensureIsAdmin');

exports.addProduct = async (req, res, next) => {
  try {
    const admin = await ensureIsAdmin(req.userId);

    // Destructure required fields from the request body
    const {
      title,
      description,
      price,
      weight,
      availableSizes,
      productTypeId,
      logoUrl = '',
      imagesUrls = [],
      videosUrls = [],
    } = req.body;
    // Validate 'productTypeId'
    if (!mongoose.Types.ObjectId.isValid(productTypeId)) {
      const error = new Error('Invalid product type ID');
      error.statusCode = 422;
      throw error;
    }

    // Find the product type
    const productType = await ProductType.findById(productTypeId);
    if (!productType) {
      const error = new Error('Product type not found');
      error.statusCode = 404;
      throw error;
    }

    if (imagesUrls.length === 0) {
      const error = new Error('Provide at least one image.');
      error.statusCode = 422;
      throw error;
    }
    const normalizeUrl = (url) => {
      if (!url) return ''; // Return empty string if URL is falsy
      return url.replace(/\\/g, '/'); // Replace backslashes with forward slashes
    };

    // Normalize logo URL (handle undefined or empty string)
    const normalizedLogoUrl = normalizeUrl(logoUrl);

    // Normalize images URLs (handle single string or array)
    const normalizedImagesUrls = Array.isArray(imagesUrls)
      ? imagesUrls.map(normalizeUrl) // If it's an array, map over it
      : imagesUrls // If it's a single string
      ? [normalizeUrl(imagesUrls)] // Convert it to an array with one normalized URL
      : []; // If it's undefined or empty, default to an empty array

    // Normalize videos URLs (handle single string or array)
    const normalizedVideosUrls = Array.isArray(videosUrls)
      ? videosUrls.map(normalizeUrl) // If it's an array, map over it
      : videosUrls // If it's a single string
      ? [normalizeUrl(videosUrls)] // Convert it to an array with one normalized URL
      : []; // If it's undefined or empty, default to an empty array

    // Create a new product
    const product = new Product({
      title,
      description,
      availableSizes,
      price: parseFloat(price),
      weight: parseFloat(weight),
      creator: admin._id,
      lastEditor: admin._id,
      logoUrl: normalizedLogoUrl,
      imagesUrls: normalizedImagesUrls,
      videosUrls: normalizedVideosUrls,
      productType: productType._id, // Store only the ID
    });

    // Save the product to the database
    await product.save();

    // Respond with success
    res.status(201).json({
      message: 'Product created successfully.',
      productId: product._id,
    });
  } catch (err) {
    // Set default error status code
    if (!err.statusCode) err.statusCode = 500;
    // Pass the error to the next middleware
    next(err);
  }
};
const fs = require('fs').promises; // For unlinking files asynchronously

exports.editProduct = async (req, res, next) => {
  let oldFiles = {
    logo: null,
    images: [],
    videos: [],
  };

  let sizeChanges = {
    added: [],
    removed: [],
    hadChanges: false,
  };

  try {
    // **Authentication & Authorization**

    const admin = await ensureIsAdmin(req.userId);

    // **Validate product ID**
    const productId = req.params.productId;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      const error = new Error('Invalid product ID');
      error.statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
      throw error;
    }

    // **Validate product existence**
    const product = await Product.findById(productId);
    if (!product) {
      const error = new Error('Product not found');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // **Store original state**
    const originalSizes = [...product.availableSizes];
    oldFiles = {
      logo: product.logoUrl,
      images: [...product.imagesUrls],
      videos: [...product.videosUrls],
    };

    // **Destructure and process updates**
    const {
      title = '',
      description = '',
      addSizes = [],
      removeSizes = [],
      price,
      weight,
      productTypeId = '',
      removeImages = [],
      removeVideos = [],
    } = req.body;

    // **Validate size parameters**
    if (!Array.isArray(addSizes) || !Array.isArray(removeSizes)) {
      const error = new Error('addSizes and removeSizes must be arrays');
      error.statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
      throw error;
    }

    // **Process size removals**
    const numericRemoveSizes = removeSizes.map((size) => {
      const parsed = Number(size);
      if (isNaN(parsed)) {
        const error = new Error(`Invalid size value in removeSizes: ${size}`);
        error.statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
        throw error;
      }
      return parsed;
    });

    // **Remove specified sizes**
    let updatedSizes = originalSizes.filter(
      (s) => !numericRemoveSizes.includes(s)
    );

    // **Process size additions**
    const numericAddSizes = addSizes.map((size) => {
      const parsed = Number(size);
      if (isNaN(parsed)) {
        const error = new Error(`Invalid size value in addSizes: ${size}`);
        error.statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
        throw error;
      }
      return parsed;
    });

    // **Add new unique sizes**
    const uniqueAddSizes = [...new Set(numericAddSizes)];
    uniqueAddSizes.forEach((size) => {
      if (!updatedSizes.includes(size)) {
        updatedSizes.push(size);
      }
    });

    // **Update product sizes**
    product.availableSizes = updatedSizes.sort((a, b) => a - b);

    // **Track changes**
    sizeChanges.added = uniqueAddSizes.filter(
      (s) => !originalSizes.includes(s)
    );
    sizeChanges.removed = numericRemoveSizes.filter((s) =>
      originalSizes.includes(s)
    );
    sizeChanges.hadChanges =
      sizeChanges.added.length > 0 || sizeChanges.removed.length > 0;

    // **Validate product type**
    if (productTypeId) {
      if (!mongoose.Types.ObjectId.isValid(productTypeId)) {
        const error = new Error('Invalid product type ID');
        error.statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
        throw error;
      }

      const productType = await ProductType.findById(productTypeId);
      if (!productType) {
        const error = new Error('Product type not found');
        error.statusCode = StatusCodes.NOT_FOUND;
        throw error;
      }

      product.productType = productType._id; // Store only the ID
    }

    // **Handle file updates**
    if (req.files?.logo?.[0]?.path) {
      product.logoUrl = req.files.logo[0].path;
    }

    // **Process image updates**
    const newImages = req.files?.productImages?.map((f) => f.path) || [];
    product.imagesUrls = [
      ...product.imagesUrls.filter((img) => !removeImages.includes(img)),
      ...newImages,
    ];

    // **Process video updates**
    const newVideos = req.files?.productVideos?.map((f) => f.path) || [];
    product.videosUrls = [
      ...product.videosUrls.filter((vid) => !removeVideos.includes(vid)),
      ...newVideos,
    ];

    // **Update core fields**
    if (title) product.title = title;
    if (description) product.description = description;
    if (price !== undefined) {
      const parsedPrice = parseFloat(price);
      if (isNaN(parsedPrice)) {
        const error = new Error('Invalid price value');
        error.statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
        throw error;
      }
      product.price = parsedPrice;
    }
    if (weight !== undefined) {
      const parsedWeight = parseFloat(weight);
      if (isNaN(parsedWeight)) {
        const error = new Error('Invalid weight value');
        error.statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
        throw error;
      }
      product.weight = parsedWeight;
    }
    product.lastEditor = admin._id;
    product.updatedAt = Date.now();

    // **Validate minimum images**
    if (product.imagesUrls.length === 0) {
      const error = new Error('Product must have at least one image');
      error.statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
      throw error;
    }

    // **Save updates**
    const updatedProduct = await product.save();

    // **Cleanup old files**
    await Promise.all([
      oldFiles.logo && product.logoUrl !== oldFiles.logo
        ? fs.unlink(oldFiles.logo).catch(() => {})
        : null,
      ...oldFiles.images
        .filter((img) => !product.imagesUrls.includes(img))
        .map((img) => fs.unlink(img).catch(() => {})),
      ...oldFiles.videos
        .filter((vid) => !product.videosUrls.includes(vid))
        .map((vid) => fs.unlink(vid).catch(() => {})),
    ]);

    // **Success response**
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Product updated successfully',
      productId: updatedProduct._id,
      changes: {
        logoUpdated: !!req.files?.logo,
        images: {
          added: newImages.length,
          removed: removeImages.length,
        },
        videos: {
          added: newVideos.length,
          removed: removeVideos.length,
        },
        sizes: {
          updated: sizeChanges.hadChanges,
          added: sizeChanges.added,
          removed: sizeChanges.removed,
        },
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    // **Cleanup new files on error**
    if (req.files) {
      await Promise.all(
        [
          ...(req.files.logo || []).map((f) => fs.unlink(f.path)),
          ...(req.files.productImages || []).map((f) => fs.unlink(f.path)),
          ...(req.files.productVideos || []).map((f) => fs.unlink(f.path)),
        ].map((p) => p.catch(() => {}))
      );
    }

    // **Error handling**
    if (!error.statusCode) {
      error.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
    }

    console.error(`Product Update Error: ${error.message}`, {
      productId: req.params.productId,
      userId: req.userId,
      timestamp: new Date().toISOString(),
      stack: error.stack,
    });

    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
};

exports.deleteProduct = async (req, res, next) => {
  try {
    // Authentication

    const admin = await ensureIsAdmin(req.userId);
    // Validate product existence
    const productId = req.params.productId;
    const product = await Product.findById(productId);
    if (!product) {
      const error = new Error('Product not found');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Collect all file paths for cleanup
    const filesToDelete = [
      product.logoUrl,
      ...product.imagesUrls,
      ...product.videosUrls,
    ].filter((path) => path && path !== '');

    // Delete associated files
    await Promise.all(
      filesToDelete.map((path) =>
        unlinkAsync(path).catch((error) => {
          console.error(`File cleanup error for ${path}:`, error.message);
        })
      )
    );
    // Delete from database
    await Product.deleteOne({ _id: productId });

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Product and associated files deleted successfully',
      deletedProductId: productId,
      deletedFilesCount: filesToDelete.length,
    });
  } catch (err) {
    // Error handling
    if (!err.statusCode) {
      err.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
    }

    console.error(`Product Deletion Error: ${err.message}`, {
      productId: req.params.productId,
      userId: req.userId,
      timestamp: new Date().toISOString(),
    });

    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errorDetails:
        process.env.NODE_ENV === 'development'
          ? {
              stack: err.stack,
              code: err.code,
            }
          : undefined,
    });
  }
};
