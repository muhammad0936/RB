const Operator = require('../models/Operator');

exports.ensureIsOperator = async (id) => {
  const operator = await Operator.findById(id);
  if (!operator) {
    const error = new Error('Not authorized');
    error.statusCode = 401;
    throw error;
  }
  return operator;
};
