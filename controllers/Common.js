const { StatusCodes } = require('http-status-codes');
const mongoose = require('mongoose');

const Admin = require('../models/Admin');
const Product = require('../models/Product');
const ProductType = require('../models/ProductType');
const State = require('../models/State');
const Governorate = require('../models/Governorate');
const City = require('../models/City');
const { OrderStatus } = require('../util/types');

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

exports.getProducts = async (req, res, next) => {
  try {
    // Parse and validate query parameters
    const {
      page = 1,
      limit = 25,
      sort = 'createdAt:desc',
      search,
      minPrice,
      maxPrice,
      sizes,
      productType,
      weight,
    } = req.query;

    // Sanitize numerical parameters
    const parsedPage = Math.max(1, parseInt(page));
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit)));
    const parsedMinPrice = parseFloat(minPrice);
    const parsedMaxPrice = parseFloat(maxPrice);

    // Build filter object
    const filter = {};

    // Text search filter
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    // Price range filter
    if (!isNaN(parsedMinPrice) || !isNaN(parsedMaxPrice)) {
      filter.price = {};
      if (!isNaN(parsedMinPrice)) filter.price.$gte = parsedMinPrice;
      if (!isNaN(parsedMaxPrice)) filter.price.$lte = parsedMaxPrice;
    }

    // Size filter
    let sizeArray = [];
    if (sizes) {
      sizeArray = Array.isArray(sizes) ? sizes : [sizes];
      filter.availableSizes = {
        $in: sizeArray
          .map((size) => parseInt(size))
          .filter((size) => !isNaN(size)),
      };
    }

    // Product type filter
    if (productType && mongoose.Types.ObjectId.isValid(productType)) {
      // Fetch child product types if the provided productType is a parent
      const childProductTypes = await ProductType.find({
        parentProductType: productType,
      }).select('_id');
      const childProductTypeIds = childProductTypes.map((type) => type._id);

      filter.productType = {
        $in: [productType, ...childProductTypeIds],
      };
    }

    if (weight) {
      filter.weight = parseFloat(weight);
    }

    // Sort configuration
    const [sortField, sortOrder] = sort.split(':');
    const sortableFields = ['title', 'price', 'createdAt', 'updatedAt'];
    const validatedSortField = sortableFields.includes(sortField)
      ? sortField
      : 'createdAt';
    const sortDirection = sortOrder === 'asc' ? 1 : -1;

    // Database queries
    const [products, totalCount] = await Promise.all([
      Product.find(filter)
        .select(
          '_id title description price weight productType logoUrl imagesUrls createdAt'
        )
        .populate({
          path: 'productType',
          select: 'name parentProductType',
          populate: {
            path: 'parentProductType',
            select: 'name',
          },
        })
        .sort({ [validatedSortField]: sortDirection })
        .skip((parsedPage - 1) * parsedLimit)
        .limit(parsedLimit)
        .lean(),

      Product.countDocuments(filter),
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / parsedLimit);
    const hasNextPage = parsedPage < totalPages;
    const hasPreviousPage = parsedPage > 1;

    // Response format
    res.status(StatusCodes.OK).json({
      success: true,
      count: products.length,
      totalCount,
      page: parsedPage,
      totalPages,
      hasNextPage,
      hasPreviousPage,
      data: products,
      filters: {
        search: search || undefined,
        priceRange: {
          min: !isNaN(parsedMinPrice) ? parsedMinPrice : undefined,
          max: !isNaN(parsedMaxPrice) ? parsedMaxPrice : undefined,
        },
        sizes: sizeArray ? sizeArray.map((s) => parseInt(s)) : undefined,
        productType: productType || undefined,
      },
      sort: {
        field: validatedSortField,
        order: sortDirection === 1 ? 'asc' : 'desc',
      },
    });
  } catch (error) {
    // Error handling
    if (!error.statusCode) {
      error.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
    }

    console.error(`Product Fetch Error: ${error.message}`, {
      queryParams: req.query,
      userId: req.userId,
      timestamp: new Date().toISOString(),
    });

    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      errorDetails:
        process.env.NODE_ENV === 'development'
          ? {
              stack: error.stack,
              code: error.code,
            }
          : undefined,
    });
  }
};

exports.getOneProduct = async (req, res, next) => {
  try {
    const { productId } = req.params;

    // Validate productId
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      const error = new Error('Invalid product ID.');
      error.statusCode = StatusCodes.BAD_REQUEST;
      throw error;
    }

    // Fetch the product by ID
    const product = await Product.findById(productId)
      .select(
        '_id title description price weight availableSizes logoUrl imagesUrls videosUrls productType creator lastEditor createdAt updatedAt'
      )
      .populate({
        path: 'productType',
        select: 'name parentProductType',
        populate: {
          path: 'parentProductType',
          select: 'name',
        },
      })
      .populate('creator', 'name email')
      .populate('lastEditor', 'name email')
      .lean();

    // Check if the product exists
    if (!product) {
      const error = new Error('Product not found.');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Send the product data in the response
    res.status(StatusCodes.OK).json({
      success: true,
      data: product,
      productTypeDetails: {
        productType: product.productType,
        parentProductType: product.productType.parentProductType,
      },
    });
  } catch (error) {
    // Error handling
    if (!error.statusCode) {
      error.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
    }

    console.error(`Product Fetch Error: ${error.message}`, {
      productId: req.params.productId,
      userId: req.userId,
      timestamp: new Date().toISOString(),
    });

    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      errorDetails:
        process.env.NODE_ENV === 'development'
          ? {
              stack: error.stack,
              code: error.code,
            }
          : undefined,
    });
  }
};

exports.getAllStates = async (req, res, next) => {
  try {
    const states = await State.find().select(
      '_id name firstKiloDeliveryCost deliveryCostPerKilo'
    );
    res.status(StatusCodes.OK).json(states);
  } catch (error) {
    next(error);
  }
};

exports.getStateByName = async (req, res, next) => {
  try {
    const { name = '' } = req.query;
    const state = await State.findOne({ name }).select(
      '_id name firstKiloDeliveryCost deliveryCostPerKilo'
    );
    if (!state) {
      const error = new Error('State not found');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }
    res.status(StatusCodes.OK).json(state);
  } catch (error) {
    next(error);
  }
};

exports.getGovernoratesByState = async (req, res, next) => {
  try {
    const state = await State.findById(req.params.stateId).populate({
      path: 'governorates',
      select: '_id name',
    });
    if (!state) {
      const error = new Error('State not found');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }
    res.status(StatusCodes.OK).json(state.governorates);
  } catch (error) {
    next(error);
  }
};
exports.getCitiesByGovernorate = async (req, res, next) => {
  try {
    const governorate = await Governorate.findById(
      req.params.governorateId
    ).populate({ path: 'cities', select: '_id name' });
    if (!governorate) {
      const error = new Error('Governorate not found');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }
    res.status(StatusCodes.OK).json(governorate.cities);
  } catch (error) {
    next(error);
  }
};

exports.getOrderStatuses = async (req, res) => {
  res.status(200).json(OrderStatus);
};
