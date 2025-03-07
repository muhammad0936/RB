const unlinkAsync = require('../../util/unlinkAsync');
const { StatusCodes } = require('http-status-codes');
const mongoose = require('mongoose');
const cloudinary = require('../../util/cloudinaryConfig');

// Models
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
      logo = { url: '', publicId: '' }, // Default to empty object
      images = [], // Array of { url, publicId }
      videos = [], // Array of { url, publicId }
      attributes,
      notes
    } = req.body;

    if (attributes) {
      attributes.forEach((attr) => {
        if (!attr.name || !attr.options || attr.options.length === 0) {
          throw new Error('Invalid attribute structure');
        }
      });
    }

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

    // Validate at least one image is provided
    if (images.length === 0) {
      const error = new Error('Provide at least one image.');
      error.statusCode = 422;
      throw error;
    }

    // Normalize URLs and ensure proper structure
    const normalizeMedia = (media) => {
      if (!media || !media.url) return { url: '', publicId: '' }; // Default to empty object
      return {
        url: media.url.replace(/\\/g, '/'), // Replace backslashes with forward slashes
        publicId: media.publicId || '', // Ensure publicId is included
      };
    };

    // Normalize logo
    const normalizedLogo = normalizeMedia(logo);

    // Normalize images (ensure each image has url and publicId)
    const normalizedImages = images.map((image) => normalizeMedia(image));

    // Normalize videos (ensure each video has url and publicId)
    const normalizedVideos = videos.map((video) => normalizeMedia(video));

    // Create a new product
    const product = new Product({
      title,
      description,
      availableSizes,
      price: parseFloat(price),
      weight: parseFloat(weight),
      creator: admin._id,
      lastEditor: admin._id,
      logo: normalizedLogo, // Store logo as { url, publicId }
      images: normalizedImages, // Store images as [{ url, publicId }]
      videos: normalizedVideos, // Store videos as [{ url, publicId }]
      productType: productType._id, // Store only the ID
      attributes: attributes || [],
      notes
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

    // **Store original state for comparison and cleanup**
    const originalState = {
      attributes: [...product.attributes],
      logo: { ...product.logo }, // Store logo object
      images: [...product.images], // Store images array
      videos: [...product.videos], // Store videos array
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

    if (req.body.attributes !== undefined) {
      // Validate attributes structure
      if (!Array.isArray(req.body.attributes)) {
        const error = new Error('Attributes must be an array');
        error.statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
        throw error;
      }

      req.body.attributes.forEach((attr) => {
        if (!attr.name || !attr.options || attr.options.length === 0) {
          const error = new Error(
            'Each attribute must have name and non-empty options array'
          );
          error.statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
          throw error;
        }
      });

      product.attributes = req.body.attributes;
    }

    // Logo
    if (req.body.logo !== undefined) {
      // Validate logo structure
      if (!req.body.logo.url || !req.body.logo.publicId) {
        const error = new Error('Logo must have both url and publicId');
        error.statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
        throw error;
      }

      // Delete old logo from Cloudinary if it exists and is being replaced
      if (
        originalState.logo.publicId &&
        originalState.logo.publicId !== req.body.logo.publicId
      ) {
        await cloudinary.uploader.destroy(originalState.logo.publicId);
      }

      product.logo = req.body.logo;
    }

    // Images
    if (req.body.images !== undefined) {
      if (!Array.isArray(req.body.images)) {
        const error = new Error('images must be an array');
        error.statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
        throw error;
      }

      // Validate each image structure
      for (const img of req.body.images) {
        if (!img.url || !img.publicId) {
          const error = new Error('Each image must have both url and publicId');
          error.statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
          throw error;
        }
      }

      // Delete old images from Cloudinary that are not in the new list
      const newImagePublicIds = req.body.images.map((img) => img.publicId);
      const imagesToDelete = originalState.images.filter(
        (img) => !newImagePublicIds.includes(img.publicId)
      );
      await Promise.all(
        imagesToDelete.map((img) => cloudinary.uploader.destroy(img.publicId))
      );

      product.images = req.body.images;
    }

    // Videos
    if (req.body.videos !== undefined) {
      if (!Array.isArray(req.body.videos)) {
        const error = new Error('videos must be an array');
        error.statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
        throw error;
      }

      // Validate each video structure
      for (const vid of req.body.videos) {
        if (!vid.url || !vid.publicId) {
          const error = new Error('Each video must have both url and publicId');
          error.statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
          throw error;
        }
      }

      // Delete old videos from Cloudinary that are not in the new list
      const newVideoPublicIds = req.body.videos.map((vid) => vid.publicId);
      const videosToDelete = originalState.videos.filter(
        (vid) => !newVideoPublicIds.includes(vid.publicId)
      );

      await Promise.all(
        videosToDelete.map((vid) =>
          cloudinary.uploader.destroy(vid.publicId, { resource_type: 'video' })
        )
      );

      product.videos = req.body.videos;
    }

    // **Validate minimum images**
    if (product.images.length === 0) {
      const error = new Error('Product must have at least one image');
      error.statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
      throw error;
    }

    product.lastEditor = admin._id;
    product.updatedAt = Date.now();

    const updatedProduct = await product.save();

    // **Determine changes**
    const changes = {
      attributes:
        JSON.stringify(originalState.attributes) !==
        JSON.stringify(updatedProduct.attributes),
      sizes:
        JSON.stringify(originalState.sizes) !==
        JSON.stringify(updatedProduct.availableSizes),
      images:
        JSON.stringify(originalState.images) !==
        JSON.stringify(updatedProduct.images),
      videos:
        JSON.stringify(originalState.videos) !==
        JSON.stringify(updatedProduct.videos),
      logo:
        JSON.stringify(originalState.logo) !==
        JSON.stringify(updatedProduct.logo),
    };

    // **Success response**
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Product updated successfully',
      productId: updatedProduct._id,
      changes: {
        attributesUpdated: changes.attributes,
        attributeCount: updatedProduct.attributes.length,
        sizesUpdated: changes.sizes,
        imagesUpdated: changes.images,
        videosUpdated: changes.videos,
        logoUpdated: changes.logo,
        newSizes: updatedProduct.availableSizes,
        imageCount: updatedProduct.images.length,
        videoCount: updatedProduct.videos.length,
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
    if (product?.logo?.publicId)
      await cloudinary.uploader.destroy(product.logo.publicId);

    await Promise.all(
      product.images.map((img) => {
        if (img.publicId) cloudinary.uploader.destroy(img?.publicId);
      })
    );
    await Promise.all(
      product.videos.map((video) => {
        if (video.publicId) {
          return cloudinary.uploader.destroy(video.publicId, {
            resource_type: 'video', // Explicitly set resource_type to 'video'
          });
        }
      })
    );
    // Delete from database
    await Product.deleteOne({ _id: productId });

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Product and associated files deleted successfully',
      deletedProductId: productId,
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
