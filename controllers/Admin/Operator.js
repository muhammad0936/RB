const Operator = require('../../models/Operator');
const bcrypt = require('bcryptjs');

const { ensureIsAdmin } = require('../../util/ensureIsAdmin');

exports.addOperator = async (req, res) => {
  try {
    const admin = await ensureIsAdmin(req.userId);
    const { name, email, password, phone } = req.body;
    // Check if operator with the same email or phone already exists
    const existingOperator = await Operator.findOne({
      $or: [{ email }, { phone }],
    });
    if (existingOperator) {
      return res.status(400).json({
        message: 'Operator with the same email or phone already exists',
      });
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    const newOperator = new Operator({
      name,
      email,
      password: hashedPassword,
      phone,
    });
    await newOperator.save();

    res.status(201).json({
      message: 'Operator added successfully',
      operator: {
        id: newOperator._id,
        name: newOperator.name,
        email: newOperator.email,
        phone: newOperator.phone,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error adding operator', error: error.message });
  }
};

exports.deleteOperator = async (req, res) => {
  try {
    const admin = await ensureIsAdmin(req.userId);
    const { id } = req.params;

    const operator = await Operator.findByIdAndDelete(id);
    if (!operator) {
      return res.status(404).json({ message: 'Operator not found' });
    }

    res.status(200).json({ message: 'Operator deleted successfully' });
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error deleting operator', error: error.message });
  }
};

exports.getOperators = async (req, res) => {
  try {
    const admin = await ensureIsAdmin(req.userId);
    const { name, email, phone, page = 1, limit = 10 } = req.query;
    const filters = {};

    // Filters
    if (name) filters.name = new RegExp(name, 'i'); // Case-insensitive search
    if (email) filters.email = email;
    if (phone) filters.phone = phone;

    // Pagination
    const skip = (page - 1) * limit;
    const total = await Operator.countDocuments(filters);

    const operators = await Operator.find(filters)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;

    res.status(200).json({
      success: true,
      count: operators.length,
      data: operators,
      pagination: {
        totalOperators: total, // Total number of operators
        currentPage: parseInt(page),
        totalPages: totalPages,
        hasNextPage: hasNextPage,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching operators',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
