const mongoose = require('mongoose');
const Offer = require('../../models/Offer');
const Product = require('../../models/Product');
const { StatusCodes } = require('http-status-codes');

exports.createOffer = async (req, res) => {
  try {
    const { products, description, expirationDate, numberOfProductsHaveToBuy } =
      req.body;
    if (isNaN(numberOfProductsHaveToBuy)) {
      const error = new Error(
        'Invalaid numberOfProductsHaveToBuy, Must be number!'
      );
      error.statusCode = 400;
      throw error;
    }
    if (!isValidDate(expirationDate)) {
      const error = new Error('Invalaid expiration date!');
      error.statusCode = 400;
      throw error;
    }

    // Validate products
    const invalidProducts = await _validateProducts(products);
    if (invalidProducts.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid products',
        invalidProducts,
      });
    }

    const offer = new Offer({
      description,
      expirationDate,
      numberOfProductsHaveToBuy: parseInt(numberOfProductsHaveToBuy),
      products: _formatProducts(products),
    });

    await offer.save();

    res.status(201).json({
      success: true,
      data: offer,
    });
  } catch (error) {
    if (!error.statusCode) {
      error.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
    }
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
};

exports.updateOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const update = _sanitizeUpdate(req.body);

    const offer = await Offer.findById(id);
    if (!offer) {
      return res.status(404).json({
        success: false,
        error: 'Offer not found',
      });
    }

    Object.assign(offer, update);
    await offer.save();

    res.json({
      success: true,
      data: offer,
    });
  } catch (error) {
    if (!error.statusCode) {
      error.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
    }
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
};

exports.deleteOffer = async (req, res) => {
  const { id } = req.params;
  const offer = await Offer.findByIdAndDelete(id);

  if (!offer) {
    return res.status(404).json({
      success: false,
      error: 'Offer not found',
    });
  }

  res.json({
    success: true,
    data: { id },
  });
};

exports.manageProducts = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, products } = req.body;

    const offer = await Offer.findById(id);
    if (!offer) {
      return res.status(404).json({
        success: false,
        error: 'Offer not found',
      });
    }

    switch (action) {
      case 'add':
        await _addProducts(offer, products);
        break;
      case 'remove':
        _removeProducts(offer, products);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action',
        });
    }

    await offer.save();

    res.json({
      success: true,
      data: offer,
    });
  } catch (error) {
    if (!error.statusCode) {
      error.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
    }
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
};

const _validateProducts = async (products) => {
  const productIds = products.map((p) => p.product);
  const existingProducts = await Product.find({
    _id: { $in: productIds },
  }).select('_id');

  const existingIds = existingProducts.map((p) => p._id.toString());
  return productIds.filter((id) => !existingIds.includes(id));
};

const _formatProducts = (products) => {
  return products.map((p) => ({
    product: p.product,
    newPrice: parseFloat(p.newPrice).toFixed(2),
    notes: p.notes?.trim() || '',
  }));
};

const _sanitizeUpdate = (body) => {
  const allowed = [
    'description',
    'expirationDate',
    'active',
    'numberOfProductsHaveToBuy',
  ];
  return Object.keys(body).reduce((acc, key) => {
    if (allowed.includes(key)) acc[key] = body[key];
    return acc;
  }, {});
};

const _addProducts = async (offer, products) => {
  const invalid = await _validateProducts(products);
  if (invalid.length > 0) throw new Error('Invalid products provided');

  const formatted = _formatProducts(products);
  formatted.forEach((p) => {
    const index = offer.products.findIndex(
      (op) => op.product.toString() === p.product.toString()
    );
    if (index > -1) offer.products[index] = p;
    else offer.products.push(p);
  });
};

const _removeProducts = async (offer, productIds) => {
  offer.products = offer.products.filter(
    (p) => !productIds.includes(p.product.toString())
  );
};
function isValidDate(dateString) {
  // First, try to create a date object from the string
  const date = new Date(dateString);

  // Check if the created date is valid
  return !isNaN(date.getTime());
}
