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

    // **Store original state for comparison**
    const originalState = {
      sizes: [...product.availableSizes],
      images: [...product.imagesUrls],
      videos: [...product.videosUrls],
      logo: product.logoUrl,
    };

    // **Process updates**
    // Core fields
    if (req.body.title !== undefined) product.title = req.body.title;
    if (req.body.description !== undefined)
      product.description = req.body.description;

    // Price
    if (req.body.price !== undefined) {
      const parsedPrice = parseFloat(req.body.price);
      if (isNaN(parsedPrice)) {
        const error = new Error('Invalid price value');
        error.statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
        throw error;
      }
      product.price = parsedPrice;
    }

    // Weight
    if (req.body.weight !== undefined) {
      const parsedWeight = parseFloat(req.body.weight);
      if (isNaN(parsedWeight)) {
        const error = new Error('Invalid weight value');
        error.statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
        throw error;
      }
      product.weight = parsedWeight;
    }

    // Product Type
    if (req.body.productTypeId !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(req.body.productTypeId)) {
        const error = new Error('Invalid product type ID');
        error.statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
        throw error;
      }
      const productType = await ProductType.findById(req.body.productTypeId);
      if (!productType) {
        const error = new Error('Product type not found');
        error.statusCode = StatusCodes.NOT_FOUND;
        throw error;
      }
      product.productType = productType._id;
    }

    // **Handle replacements**
    // Sizes
    if (req.body.availableSizes !== undefined) {
      if (!Array.isArray(req.body.availableSizes)) {
        const error = new Error('availableSizes must be an array');
        error.statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
        throw error;
      }

      const numericSizes = req.body.availableSizes.map((size) => {
        const parsed = Number(size);
        if (isNaN(parsed)) {
          const error = new Error(`Invalid size value: ${size}`);
          error.statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
          throw error;
        }
        return parsed;
      });

      product.availableSizes = [...new Set(numericSizes)].sort((a, b) => a - b);
    }

    // Images
    if (req.body.imagesUrls !== undefined) {
      if (!Array.isArray(req.body.imagesUrls)) {
        const error = new Error('imagesUrls must be an array');
        error.statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
        throw error;
      }
      product.imagesUrls = req.body.imagesUrls;
    }

    // Videos
    if (req.body.videosUrls !== undefined) {
      if (!Array.isArray(req.body.videosUrls)) {
        const error = new Error('videosUrls must be an array');
        error.statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
        throw error;
      }
      product.videosUrls = req.body.videosUrls;
    }

    // Logo
    if (req.body.logoUrl !== undefined) product.logoUrl = req.body.logoUrl;

    // **Validate minimum images**
    if (product.imagesUrls.length === 0) {
      const error = new Error('Product must have at least one image');
      error.statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
      throw error;
    }

    // **Update metadata**
    product.lastEditor = admin._id;
    product.updatedAt = Date.now();

    // **Save updates**
    const updatedProduct = await product.save();

    // **Determine changes**
    const changes = {
      sizes:
        JSON.stringify(originalState.sizes) !==
        JSON.stringify(updatedProduct.availableSizes),
      images:
        JSON.stringify(originalState.images) !==
        JSON.stringify(updatedProduct.imagesUrls),
      videos:
        JSON.stringify(originalState.videos) !==
        JSON.stringify(updatedProduct.videosUrls),
      logo: originalState.logo !== updatedProduct.logoUrl,
    };

    // **Success response**
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Product updated successfully',
      productId: updatedProduct._id,
      changes: {
        sizesUpdated: changes.sizes,
        imagesUpdated: changes.images,
        videosUpdated: changes.videos,
        logoUpdated: changes.logo,
        newSizes: updatedProduct.availableSizes,
        imageCount: updatedProduct.imagesUrls.length,
        videoCount: updatedProduct.videosUrls.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
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
