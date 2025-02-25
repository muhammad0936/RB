const { StatusCodes } = require('http-status-codes');

// Models
const Customer = require('../../models/Customer');
const { ensureIsAdmin } = require('../../util/ensureIsAdmin');

// Get all customers with filters
exports.getCustomers = async (req, res) => {
  try {
    const admin = await ensureIsAdmin(req.userId);
    const {
      page = 1,
      limit = 20,
      search,
      sortBy = '-createdAt',
      startDate,
      endDate,
      hasOrders,
    } = req.query;

    const filter = {};
    const projection = {
      password: 0,
      resetToken: 0,
      resetTokenExpiration: 0,
      __v: 0,
    };

    // Search filter
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filter.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
      ];
    }

    // Date range filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: sortBy,
      select: projection,
    };

    const customers = await Customer.paginate(filter, options);

    // Transform response for dashboard
    const response = {
      success: true,
      customers: customers.docs.map((customer) => ({
        id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        joined: customer.createdAt,
        lastActivity: customer.updatedAt,
      })),
      pagination: {
        totalCustomers: customers.totalDocs,
        currentPage: customers.page,
        totalPages: customers.totalPages,
        hasNextPage: customers.hasNextPage,
      },
    };

    res.status(StatusCodes.OK).json(response);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || 'Failed to retrieve customers',
    });
  }
};
