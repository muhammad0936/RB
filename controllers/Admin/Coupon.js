const { StatusCodes } = require('http-status-codes');
const mongoose = require('mongoose');

// Models
const Product = require('../../models/Product');
const Coupon = require('../../models/Coupon');
const { ensureIsAdmin } = require('../../util/ensureIsAdmin');

exports.addCoupon = async (req, res) => {
  try {
    const admin = await ensureIsAdmin(req.userId);
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
    const admin = await ensureIsAdmin(req.userId);
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
    const admin = await ensureIsAdmin(req.userId);
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

    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;

    res.status(StatusCodes.OK).json({
      success: true,
      count: coupons.length,
      data: coupons,
      pagination: {
        totalCoupons: total, // Changed from totalOrders to totalCoupons
        currentPage: parseInt(page),
        totalPages: totalPages,
        hasNextPage: hasNextPage,
      },
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
