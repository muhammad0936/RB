const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const unlink = require('../util/deleteFile');
const unlinkAsync = require('../util/unlinkAsync');
const { StatusCodes } = require('http-status-codes');
const mongoose = require('mongoose');

// Models
const Admin = require('../models/Admin');
const Product = require('../models/Product');
const ProductType = require('../models/ProductType');
const State = require('../models/State');
const Governorate = require('../models/Governorate');
const City = require('../models/City');
const Coupon = require('../models/Coupon');

exports.createAdmin = async (req, res, next) => {
  try {
    // const result = validationResult(req);
    // if (!result.isEmpty()) {
    //   throw result.array().map((i) => {
    //     return { ...i, statusCode: 422 };
    //   });
    // }
    const { name, email, password, phone } = req.body;
    const query = {};
    if (email) query.$or = [{ email }];
    if (phone) {
      query.$or = query.$or || [];
      query.$or.push({ phone });
    }

    const existingAdmin = await Admin.findOne(query);

    if (existingAdmin) {
      const error = new Error(
        existingAdmin.email || -1 === email
          ? 'Email already exists!'
          : 'Phone already exists!'
      );
      error.statusCode = StatusCodes.BAD_REQUEST;
      throw error;
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    const admin = new Admin({
      name,
      email,
      phone,
      password: hashedPassword,
    });
    await admin.save();
    res.status(201).json({ message: 'Admin added successfully.' });
  } catch (err) {
    if (!err.statusCode && !err[0]) err.statusCode = 500;
    next(err);
  }
};

// Login Admin
exports.login = async (req, res, next) => {
  try {
    // const result = validationResult(req);
    // if (!result.isEmpty()) {
    //   console.log(result.array());
    //   throw result.array().map((i) => {
    //     return { ...i, statusCode: 422 };
    //   });
    // }
    const { email, password } = req.body;
    const loadedAdmin = await Admin.findOne({ email });

    if (!loadedAdmin) {
      const error = new Error('Email or password is incorrect!');
      error.statusCode = 401;
      throw error;
    }
    const isEqual = await bcrypt.compare(password, loadedAdmin.password);
    if (!isEqual) {
      const error = new Error('Email or password is incorrect!');
      error.statusCode = 401;
      throw error;
    }
    const token = jwt.sign(
      {
        email: loadedAdmin.email,
        userId: loadedAdmin._id,
      },
      'thisismysecretkey',
      { expiresIn: '30d' }
    );
    res.header('Authorization', `Bearer ${token}`);
    res.status(200).json({ message: 'signed in successfully.' });
  } catch (error) {
    if (!error.statusCode && !error[0]) error.statusCode = 500;
    next(error);
  }
};
// controllers/yourControllerFile.js

exports.addProductTypes = async (req, res, next) => {
  try {
    const admin = await Admin.findById(req.userId);
    if (!admin) {
      const error = new Error('Not authorized');
      error.statusCode = 401;
      throw error;
    }

    let { names, parentProductTypeId } = req.body;

    // Ensure 'names' is an array
    if (!Array.isArray(names)) names = names ? [names] : [];

    // Validate parentProductTypeId if provided
    if (
      parentProductTypeId &&
      !mongoose.Types.ObjectId.isValid(parentProductTypeId)
    ) {
      const error = new Error('Invalid parent product type ID');
      error.statusCode = 422;
      throw error;
    }

    // Use Promise.all to handle all async operations
    const createdProductTypes = await Promise.all(
      names.map(async (name) => {
        const productType = new ProductType({
          name,
          parentProductType: parentProductTypeId || null,
        });
        return await productType.save();
      })
    );

    if (createdProductTypes.length === 0) {
      const error = new Error('No product types created!');
      error.statusCode = 422;
      throw error;
    }

    res.status(201).json({
      message: 'Product types created successfully.',
      productTypes: createdProductTypes,
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
};
exports.deleteProductTypes = async (req, res, next) => {
  try {
    const { productTypesIds } = req.body;

    if (!productTypesIds) {
      const error = new Error('Product type IDs are required for deletion');
      error.statusCode = 400;
      throw error;
    }

    // Normalize input to array format
    const idsArray = Array.isArray(productTypesIds)
      ? productTypesIds
      : [productTypesIds];

    // Validate array content
    if (idsArray.length === 0) {
      const error = new Error('At least one product type ID must be provided');
      error.statusCode = 400;
      throw error;
    }

    // Validate MongoDB ID format
    const invalidIds = idsArray.filter(
      (id) => !mongoose.Types.ObjectId.isValid(id)
    );

    if (invalidIds.length > 0) {
      const error = new Error(
        `Invalid product type IDs provided: ${invalidIds.join(', ')}`
      );
      error.statusCode = 422;
      error.details = { invalidIds };
      throw error;
    }

    // Optionally, delete subtypes recursively
    const allIdsToDelete = [...idsArray];

    // Find and delete subtypes
    for (const id of idsArray) {
      const subTypes = await ProductType.find({ parentProductType: id }).select(
        '_id'
      );
      const subTypeIds = subTypes.map((subType) => subType._id.toString());
      allIdsToDelete.push(...subTypeIds);
    }

    // Perform deletion
    const deletionResult = await ProductType.deleteMany({
      _id: { $in: allIdsToDelete },
    });

    if (deletionResult.deletedCount === 0) {
      const error = new Error('No product types found for deletion');
      error.statusCode = 404;
      throw error;
    }

    res.status(200).json({
      success: true,
      message: `Successfully deleted ${deletionResult.deletedCount} product type(s)`,
      deletedCount: deletionResult.deletedCount,
    });
  } catch (error) {
    if (!error.statusCode) {
      error.statusCode = 500;
    }

    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      details: error.details || {},
      statusCode: error.statusCode,
    });
  }
};
exports.addProduct = async (req, res, next) => {
  try {
    // Verify admin authorization
    const admin = await Admin.findById(req.userId);
    if (!admin) {
      const error = new Error('Not authorized');
      error.statusCode = 401;
      throw error;
    }

    // Destructure required fields from the request body
    const { title, description, price, weight, availableSizes, productTypeId } =
      req.body;

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

    // Handle file uploads
    const logoUrl = req.files?.logo?.[0]?.path || '';
    const imagesUrls = req.files?.productImages?.map((i) => i?.path) || [];
    if (imagesUrls.length === 0) {
      const error = new Error('Provide at least one image.');
      error.statusCode = 422;
      throw error;
    }
    const videosUrls = req.files?.productVideos?.map((v) => v?.path) || [];

    // Create a new product
    const product = new Product({
      title,
      description,
      availableSizes,
      price: parseFloat(price),
      weight: parseFloat(weight),
      creator: admin._id,
      lastEditor: admin._id,
      logoUrl,
      imagesUrls,
      videosUrls,
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

    // Clean up uploaded files if there's an error
    if (req.files) {
      if (req.files?.logo?.[0]?.path) unlink(req.files.logo[0].path);
      req.files?.productImages?.forEach((i) => {
        if (i.path) unlink(i.path);
      });
      req.files?.productVideos?.forEach((v) => {
        if (v.path) unlink(v.path);
      });
    }

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
    const admin = await Admin.findById(req.userId);
    if (!admin) {
      const error = new Error('Not authorized');
      error.statusCode = StatusCodes.UNAUTHORIZED;
      throw error;
    }

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
    const admin = await Admin.findById(req.userId);
    if (!admin) {
      const error = new Error('Not authorized');
      error.statusCode = StatusCodes.UNAUTHORIZED;
      throw error;
    }

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

exports.addState = async (req, res, next) => {
  try {
    const admin = await Admin.findById(req.userId);
    if (!admin) {
      const error = new Error('Not authorized');
      error.statusCode = StatusCodes.UNAUTHORIZED;
      throw error;
    }

    const { name, firstKiloDeliveryCost, deliveryCostPerKilo } = req.body;
    const state = new State({
      name,
      firstKiloDeliveryCost,
      deliveryCostPerKilo,
    });
    await state.save();

    res.status(StatusCodes.CREATED).json(state);
  } catch (error) {
    next(error);
  }
};

exports.editState = async (req, res, next) => {
  try {
    const admin = await Admin.findById(req.userId);
    if (!admin) {
      const error = new Error('Not authorized');
      error.statusCode = StatusCodes.UNAUTHORIZED;
      throw error;
    }
    const {
      name = '',
      firstKiloDeliveryCost = '',
      deliveryCostPerKilo = '',
    } = req.body;
    const { stateId } = req.params;

    const state = await State.findById(stateId);
    if (!state) {
      const error = new Error('State not found');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }
    if (name) state.name = name;
    if (firstKiloDeliveryCost)
      state.firstKiloDeliveryCost = firstKiloDeliveryCost;
    if (deliveryCostPerKilo) state.deliveryCostPerKilo = deliveryCostPerKilo;

    await state.save();

    res.status(StatusCodes.OK).json(state);
  } catch (error) {
    next(error);
  }
};
exports.deleteState = async (req, res, next) => {
  try {
    const admin = await Admin.findById(req.userId);
    if (!admin) {
      const error = new Error('Not authorized');
      error.statusCode = StatusCodes.UNAUTHORIZED;
      throw error;
    }

    const { id } = req.params;
    const state = await State.findById(id).populate('governorates');

    if (!state) {
      const error = new Error('State not found');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Delete all governorates and their cities
    for (const governorate of state.governorates) {
      await City.deleteMany({ _id: { $in: governorate.cities } });
      await Governorate.findByIdAndDelete(governorate._id);
    }

    await State.findByIdAndDelete(id);

    res.status(StatusCodes.OK).json({
      message: 'State and all associated data deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
exports.addGovernorate = async (req, res, next) => {
  try {
    const admin = await Admin.findById(req.userId);
    if (!admin) {
      const error = new Error('Not authorized');
      error.statusCode = StatusCodes.UNAUTHORIZED;
      throw error;
    }

    const { name, stateId } = req.body;
    const state = await State.findById(stateId);

    if (!state) {
      const error = new Error('State not found');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    const governorate = new Governorate({ name });
    await governorate.save();

    state.governorates.push(governorate._id);
    await state.save();

    res.status(StatusCodes.CREATED).json(governorate);
  } catch (error) {
    next(error);
  }
};
exports.deleteGovernorate = async (req, res, next) => {
  try {
    const admin = await Admin.findById(req.userId);
    if (!admin) {
      const error = new Error('Not authorized');
      error.statusCode = StatusCodes.UNAUTHORIZED;
      throw error;
    }

    const { id } = req.params;
    const governorate = await Governorate.findById(id);

    if (!governorate) {
      const error = new Error('Governorate not found');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Remove from parent state
    await State.updateMany(
      { governorates: id },
      { $pull: { governorates: id } }
    );

    // Delete associated cities
    await City.deleteMany({ _id: { $in: governorate.cities } });
    await Governorate.findByIdAndDelete(id);

    res.status(StatusCodes.OK).json({
      message: 'Governorate and all associated cities deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

exports.addCity = async (req, res, next) => {
  try {
    const admin = await Admin.findById(req.userId);
    if (!admin) {
      const error = new Error('Not authorized');
      error.statusCode = StatusCodes.UNAUTHORIZED;
      throw error;
    }

    const { name, governorateId } = req.body;
    const governorate = await Governorate.findById(governorateId);

    if (!governorate) {
      const error = new Error('Governorate not found');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    const city = new City({ name });
    await city.save();

    governorate.cities.push(city._id);
    await governorate.save();

    res.status(StatusCodes.CREATED).json(city);
  } catch (error) {
    next(error);
  }
};
exports.deleteCity = async (req, res, next) => {
  try {
    const admin = await Admin.findById(req.userId);
    if (!admin) {
      const error = new Error('Not authorized');
      error.statusCode = StatusCodes.UNAUTHORIZED;
      throw error;
    }

    const { id } = req.params;
    const city = await City.findById(id);

    if (!city) {
      const error = new Error('City not found');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Remove from parent governorate
    await Governorate.updateMany({ cities: id }, { $pull: { cities: id } });

    await City.findByIdAndDelete(id);

    res.status(StatusCodes.OK).json({
      message: 'City deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// exports.addCoupon = async (req, res, next) => {
//   try {
//     const admin = await Admin.findById(req.userId);
//     if (!admin) {
//       const error = new Error('Not authorized');
//       error.statusCode = StatusCodes.UNAUTHORIZED;
//       throw error;
//     }
//     const { text, discount, expirationDate } = req.body;
//     const creator = req.userId; // Assuming the admin's ID is stored in req.userId after authentication

//     // Validate input
//     if (!text || !discount || !expirationDate) {
//       const error = new Error(
//         'Text, discount, and expiration date are required.'
//       );
//       error.statusCode = StatusCodes.BAD_REQUEST;
//       throw error;
//     }

//     // Check if the expiration date is in the future
//     if (new Date(expirationDate) <= new Date()) {
//       const error = new Error('Expiration date must be in the future.');
//       error.statusCode = StatusCodes.BAD_REQUEST;
//       throw error;
//     }

//     const isExists = await Coupon.exists({ text });

//     if (isExists) {
//       const error = new Error('Coupon text already exists');
//       error.statusCode = StatusCodes.BAD_REQUEST;
//       throw error;
//     }

//     // Create the coupon
//     const coupon = new Coupon({
//       text,
//       discount,
//       expirationDate,
//       creator,
//     });

//     // Save the coupon
//     await coupon.save();

//     // Send success response
//     res.status(StatusCodes.CREATED).json({
//       success: true,
//       message: 'Coupon created successfully.',
//       data: coupon,
//     });
//   } catch (error) {
//     // Error handling
//     if (!error.statusCode) {
//       error.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
//     }

//     console.error(`Add Coupon Error: ${error.message}`, {
//       couponData: req.body,
//       adminId: req.userId,
//       timestamp: new Date().toISOString(),
//     });

//     res.status(error.statusCode).json({
//       success: false,
//       message: error.message,
//       errorDetails:
//         process.env.NODE_ENV === 'development'
//           ? {
//               stack: error.stack,
//               code: error.code,
//             }
//           : undefined,
//     });
//   }
// };

// exports.deleteCoupon = async (req, res, next) => {
//   try {
//     const admin = await Admin.findById(req.userId);
//     if (!admin) {
//       const error = new Error('Not authorized');
//       error.statusCode = StatusCodes.UNAUTHORIZED;
//       throw error;
//     }
//     const { couponId } = req.params;

//     // Validate couponId
//     if (!mongoose.Types.ObjectId.isValid(couponId)) {
//       const error = new Error('Invalid coupon ID.');
//       error.statusCode = StatusCodes.BAD_REQUEST;
//       throw error;
//     }

//     // Find and delete the coupon
//     const coupon = await Coupon.findByIdAndDelete(couponId);

//     // Check if the coupon exists
//     if (!coupon) {
//       const error = new Error('Coupon not found.');
//       error.statusCode = StatusCodes.NOT_FOUND;
//       throw error;
//     }

//     // Send success response
//     res.status(StatusCodes.OK).json({
//       success: true,
//       message: 'Coupon deleted successfully.',
//       data: coupon,
//     });
//   } catch (error) {
//     // Error handling
//     if (!error.statusCode) {
//       error.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
//     }

//     console.error(`Delete Coupon Error: ${error.message}`, {
//       couponId: req.params.couponId,
//       adminId: req.userId,
//       timestamp: new Date().toISOString(),
//     });

//     res.status(error.statusCode).json({
//       success: false,
//       message: error.message,
//       errorDetails:
//         process.env.NODE_ENV === 'development'
//           ? {
//               stack: error.stack,
//               code: error.code,
//             }
//           : undefined,
//     });
//   }
// };

// exports.getCoupons = async (req, res, next) => {
//   try {
//     // Parse query parameters
//     const { activeOnly = 'true', sort = 'createdAt:desc' } = req.query;

//     // Build filter object
//     const filter = {};

//     // Filter active coupons only (not expired)
//     if (activeOnly === 'true') {
//       filter.expirationDate = { $gte: new Date() };
//     }

//     // Sort configuration
//     const [sortField, sortOrder] = sort.split(':');
//     const sortableFields = ['text', 'discount', 'expirationDate', 'createdAt'];
//     const validatedSortField = sortableFields.includes(sortField)
//       ? sortField
//       : 'createdAt';
//     const sortDirection = sortOrder === 'asc' ? 1 : -1;

//     // Fetch coupons
//     const coupons = await Coupon.find(filter)
//       .sort({ [validatedSortField]: sortDirection })
//       .populate('creator', 'name email') // Populate creator details
//       .lean();

//     // Send success response
//     res.status(StatusCodes.OK).json({
//       success: true,
//       count: coupons.length,
//       data: coupons,
//     });
//   } catch (error) {
//     // Error handling
//     if (!error.statusCode) {
//       error.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
//     }

//     console.error(`Get Coupons Error: ${error.message}`, {
//       queryParams: req.query,
//       timestamp: new Date().toISOString(),
//     });

//     res.status(error.statusCode).json({
//       success: false,
//       message: error.message,
//       errorDetails:
//         process.env.NODE_ENV === 'development'
//           ? {
//               stack: error.stack,
//               code: error.code,
//             }
//           : undefined,
//     });
//   }
// };

// Create new coupon (Admin only)
exports.addCoupon = async (req, res) => {
  try {
    const {
      code,
      discount,
      maxDiscount,
      expirationDate,
      minOrderAmount,
      discountType,
      usageLimit,
      validFor,
    } = req.body;

    // Validate required fields
    if (!code || !discount || !expirationDate) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Code, discount, and expiration date are required',
      });
    }

    // Check for existing coupon
    const existingCoupon = await Coupon.findOne({ code });
    if (existingCoupon) {
      return res.status(StatusCodes.CONFLICT).json({
        success: false,
        message: 'Coupon code already exists',
      });
    }

    // Validate discount values
    if (discountType === 'percentage' && discount > 100) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Percentage discount cannot exceed 100%',
      });
    }

    // Validate expiration date
    if (new Date(expirationDate) < new Date()) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Expiration date must be in the future',
      });
    }

    // Validate validFor products
    if (validFor && !Array.isArray(validFor)) validFor = [validFor];
    if (validFor && validFor.length > 0) {
      const validProducts = await Product.countDocuments({
        _id: { $in: validFor },
      });
      if (validProducts !== validFor.length) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: 'One or more invalid product IDs',
        });
      }
    }

    // Create new coupon
    const newCoupon = await Coupon.create({
      code,
      discount,
      maxDiscount,
      expirationDate,
      minOrderAmount,
      discountType,
      usageLimit,
      validFor,
      creator: req.userId, // Assuming admin ID from auth middleware
    });

    res.status(StatusCodes.CREATED).json({
      success: true,
      data: newCoupon,
    });
  } catch (error) {
    console.error('Add Coupon Error:', error.message);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to create coupon',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Delete coupon (Admin only)
exports.deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Invalid coupon ID',
      });
    }

    const coupon = await Coupon.findByIdAndDelete(id);

    if (!coupon) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Coupon not found',
      });
    }

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Coupon deleted successfully',
    });
  } catch (error) {
    console.error('Delete Coupon Error:', error.message);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to delete coupon',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Get coupons with filtering and pagination
exports.getCoupons = async (req, res) => {
  try {
    const { status, product, page = 1, limit = 10 } = req.query;
    const query = {};

    // Status filter
    if (status === 'active') {
      query.expirationDate = { $gte: new Date() };
      query.$expr = { $lt: ['$usedCount', '$usageLimit'] };
    } else if (status === 'expired') {
      query.$or = [
        { expirationDate: { $lt: new Date() } },
        { $expr: { $gte: ['$usedCount', '$usageLimit'] } },
      ];
    }

    // Product filter
    if (product) {
      query.validFor = product;
    }

    // Pagination
    const skip = (page - 1) * limit;
    const total = await Coupon.countDocuments(query);

    const coupons = await Coupon.find(query)
      .populate('creator', 'name email')
      .populate('validFor', 'title')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 })
      .lean();

    res.status(StatusCodes.OK).json({
      success: true,
      count: coupons.length,
      total,
      pages: Math.ceil(total / limit),
      data: coupons,
    });
  } catch (error) {
    console.error('Get Coupons Error:', error.message);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to retrieve coupons',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
