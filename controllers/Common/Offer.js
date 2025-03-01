const mongoose = require('mongoose');
const Offer = require('../../models/Offer');
const Product = require('../../models/Product');
const { StatusCodes } = require('http-status-codes');

exports.getOffers = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      // populate: 'products.product',
      sort: { createdAt: -1 },
    };

    const offers = await Offer.paginate({}, options);

    res.status(200).json({
      success: true,
      data: {
        offers: offers.docs,
        pagination: {
          total: offers.totalDocs,
          pages: offers.totalPages,
          page: offers.page,
          hasNextPage: offers.hasNextPage,
        },
      },
    });
  } catch (error) {
    if (!error.statusCode) {
      error.statusCode = 500;
    }
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
};

exports.getOneOffer = async (req, res) => {
  try {
    const { id } = req.params;

    const offer = await Offer.findById(id).populate('products.product').lean();

    if (!offer) {
      const error = new Error('Offer not found');
      error.statusCode = 404;
      throw error;
    }

    // Format prices to 2 decimal places
    offer.products = offer.products.map((p) => ({
      ...p,
      newPrice: parseFloat(p.newPrice).toFixed(2),
    }));

    res.status(200).json({
      success: true,
      data: offer,
    });
  } catch (error) {
    if (error.name === 'CastError') {
      error.statusCode = 400;
      error.message = 'Invalid offer ID format';
    }
    if (!error.statusCode) {
      error.statusCode = 500;
    }
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
};
