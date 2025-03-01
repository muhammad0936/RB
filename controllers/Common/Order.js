const { OrderStatus } = require('../../util/types');

exports.getOrderStatuses = async (req, res) => {
  res.status(200).json(OrderStatus);
};
