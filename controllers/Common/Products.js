const { StatusCodes } = require('http-status-codes');
const mongoose = require('mongoose');

const Product = require('../../models/Product');
const ProductType = require('../../models/ProductType');
const Order = require('../../models/Order');

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
          '_id title description price availableSizes weight productType logo images videos createdAt'
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

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      const error = new Error('Invalid product ID.');
      error.statusCode = StatusCodes.BAD_REQUEST;
      throw error;
    }

    const product = await Product.findById(productId)
    .select('-weight -creator -lastEditor -updatedAt -__v')
      .populate({
        path: 'productType',
        select: 'name parentProductType',
        populate: { path: 'parentProductType', select: 'name' },
      })
      .populate('creator', 'name email')
      .populate('lastEditor', 'name email')
      .lean();

    if (!product) {
      const error = new Error('Product not found.');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Format attributes for better client-side handling
    product.attributes = product.attributes.map((attr) => ({
      name: attr.name,
      options: attr.options,
      required: attr.required,
    }));

    res.status(StatusCodes.OK).json({
      success: true,
      data: product,
      productTypeDetails: {
        productType: product?.productType,
        parentProductType: product?.productType?.parentProductType,
      },
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to fetch product',
    });
  }
};
exports.getBestSellers = async (req, res, next) => {
  try {
    const { limit = 10, period = 'all' } = req.query;

    // Validate limit
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Limit must be a number between 1 and 100',
      });
    }

    // Define date range based on period
    let startDate;
    const currentDate = new Date();

    switch (period) {
      case 'week':
        startDate = new Date(currentDate.setDate(currentDate.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(currentDate.setMonth(currentDate.getMonth() - 1));
        break;
      case 'year':
        startDate = new Date(
          currentDate.setFullYear(currentDate.getFullYear() - 1)
        );
        break;
      default:
        startDate = null; // All time
    }

    const bestSellers = await Order.aggregate([
      // 1. Match orders within the specified period
      {
        $match: startDate
          ? {
              createdAt: { $gte: startDate },
              'products.product': { $exists: true, $type: 'objectId' },
            }
          : { 'products.product': { $exists: true, $type: 'objectId' } },
      },
      // 2. Unwind the products array
      { $unwind: '$products' },
      // 3. Filter valid product entries
      {
        $match: {
          'products.product': { $exists: true, $type: 'objectId' },
          'products.quantity': { $gt: 0 },
        },
      },
      // 4. Group by product ID and sum quantities
      {
        $group: {
          _id: '$products.product',
          totalQuantity: { $sum: '$products.quantity' },
        },
      },
      // 5. Sort by total quantity (descending)
      { $sort: { totalQuantity: -1 } },
      // 6. Limit the results
      { $limit: parseInt(limit) },
      // 7. Lookup product details
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'productDetails',
        },
      },
      // 8. Unwind product details
      {
        $unwind: { path: '$productDetails', preserveNullAndEmptyArrays: true },
      },
      // 9. Project final fields
      {
        $project: {
          _id: 0,
          productId: '$_id',
          name: '$productDetails.title',
          price: '$productDetails.price',
          image: {
            $cond: {
              if: { $isArray: '$productDetails.images' },
              then: { $arrayElemAt: ['$productDetails.images', 0] },
              else: null,
            },
          },
          totalQuantity: 1,
        },
      },
      // 10. Optional: Exclude products missing details
      // { $match: { name: { $exists: true } } },
    ]);

    // If no best sellers found
    if (bestSellers.length === 0) {
      return res.status(StatusCodes.OK).json({
        success: true,
        message: 'No best-selling products found',
        bestSellers: [],
      });
    }

    // Return best sellers
    res.status(StatusCodes.OK).json({
      success: true,
      numberOfEntities: bestSellers.length,
      bestSellers,
    });
  } catch (error) {
    console.error('Error fetching best sellers:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to fetch best-selling products',
    });
  }
};
