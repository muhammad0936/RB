const { StatusCodes } = require('http-status-codes');
const mongoose = require('mongoose');

const State = require('../../models/State');
const Governorate = require('../../models/Governorate');
const { OrderStatus } = require('../../util/types');

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
