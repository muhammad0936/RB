const mongoose = require('mongoose');

// Models
const Admin = require('../../models/Admin');
const ProductType = require('../../models/ProductType');
const { ensureIsAdmin } = require('../../util/ensureIsAdmin');

exports.addProductType = async (req, res, next) => {
  try {
    const admin = await ensureIsAdmin(req.userId);
    const { name, imageUrl, parentProductTypeId } = req.body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      const error = new Error('Valid product type name is required');
      error.statusCode = 422;
      throw error;
    }

    // Validate image URL format
    if (imageUrl && typeof imageUrl !== 'string') {
      const error = new Error('Invalid image URL format');
      error.statusCode = 422;
      throw error;
    }

    // Validate parent product type ID if provided
    if (parentProductTypeId) {
      if (!mongoose.Types.ObjectId.isValid(parentProductTypeId)) {
        const error = new Error('Invalid parent product type ID');
        error.statusCode = 422;
        throw error;
      }
      // Optional: Check if parent exists
      const parentExists = await ProductType.exists({
        _id: parentProductTypeId,
      });
      if (!parentExists) {
        const error = new Error('Parent product type not found');
        error.statusCode = 404;
        throw error;
      }
    }

    // Check for existing product type with same name
    const existingType = await ProductType.findOne({
      name: { $regex: new RegExp(`^${name}$`, 'i') },
    });

    if (existingType) {
      const error = new Error('Product type with this name already exists');
      error.statusCode = 409;
      throw error;
    }

    // Create new product type
    const productType = new ProductType({
      name: name.trim(),
      imageUrl: imageUrl || null,
      parentProductType: parentProductTypeId || null,
    });

    const savedProductType = await productType.save();

    res.status(201).json({
      message: 'Product type created successfully.',
      productType: {
        _id: savedProductType._id,
        name: savedProductType.name,
        imageUrl: savedProductType.imageUrl,
        parentProductType: savedProductType.parentProductType,
        createdAt: savedProductType.createdAt,
      },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
};
exports.deleteProductTypes = async (req, res, next) => {
  try {
    const admin = await ensureIsAdmin(req.userId);
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
