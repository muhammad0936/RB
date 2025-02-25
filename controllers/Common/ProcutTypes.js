const { StatusCodes } = require('http-status-codes');
const mongoose = require('mongoose');

const ProductType = require('../../models/ProductType');
exports.getParentProductTypes = async (req, res, next) => {
  try {
    // Fetch all product types where parentProductType is null (top-level types)
    const parentProductTypes = await ProductType.find({
      parentProductType: null,
    });

    res.status(200).json({
      message: 'Parent product types fetched successfully.',
      productTypes: parentProductTypes,
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
};

exports.getChildProductTypes = async (req, res, next) => {
  try {
    const parentProductTypeId = req.params.parentProductTypeId;

    // Validate the provided ID
    if (!mongoose.Types.ObjectId.isValid(parentProductTypeId)) {
      const error = new Error('Invalid parent product type ID');
      error.statusCode = 422;
      throw error;
    }
    const parentProductTypeeExists = await ProductType.exists({
      _id: parentProductTypeId,
    });
    if (!parentProductTypeeExists) {
      const error = new Error('Parent product type not found!');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Fetch all product types where parentProductType matches the given ID
    const childProductTypes = await ProductType.find({
      parentProductType: parentProductTypeId,
    });

    res.status(200).json({
      message: 'Child product types fetched successfully.',
      productTypes: childProductTypes,
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
};
