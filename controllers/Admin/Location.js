const { StatusCodes } = require('http-status-codes');
// Models
const Admin = require('../../models/Admin');
const State = require('../../models/State');
const Governorate = require('../../models/Governorate');
const City = require('../../models/City');
const { ensureIsAdmin } = require('../../util/ensureIsAdmin');

exports.addState = async (req, res, next) => {
  try {
    const admin = await ensureIsAdmin(req.userId);

    const { name, firstKiloDeliveryCost, deliveryCostPerKilo } = req.body;
    const state = new State({
      name,
      firstKiloDeliveryCost,
      deliveryCostPerKilo,
    });
    await state.save();

    res.status(StatusCodes.CREATED).json(state);
  } catch (error) {
    next(error);
  }
};

exports.editState = async (req, res, next) => {
  try {
    const admin = await ensureIsAdmin(req.userId);
    const {
      name = '',
      firstKiloDeliveryCost = '',
      deliveryCostPerKilo = '',
    } = req.body;
    const { stateId } = req.params;

    const state = await State.findById(stateId);
    if (!state) {
      const error = new Error('State not found');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }
    if (name) state.name = name;
    if (firstKiloDeliveryCost)
      state.firstKiloDeliveryCost = firstKiloDeliveryCost;
    if (deliveryCostPerKilo) state.deliveryCostPerKilo = deliveryCostPerKilo;

    await state.save();

    res.status(StatusCodes.OK).json(state);
  } catch (error) {
    next(error);
  }
};
exports.deleteState = async (req, res, next) => {
  try {
    const admin = await ensureIsAdmin(req.userId);

    const { id } = req.params;
    const state = await State.findById(id).populate('governorates');

    if (!state) {
      const error = new Error('State not found');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Delete all governorates and their cities
    for (const governorate of state.governorates) {
      await City.deleteMany({ _id: { $in: governorate.cities } });
      await Governorate.findByIdAndDelete(governorate._id);
    }

    await State.findByIdAndDelete(id);

    res.status(StatusCodes.OK).json({
      message: 'State and all associated data deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
exports.addGovernorate = async (req, res, next) => {
  try {
    const admin = await ensureIsAdmin(req.userId);

    const { name, stateId } = req.body;
    const state = await State.findById(stateId);

    if (!state) {
      const error = new Error('State not found');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    const governorate = new Governorate({ name });
    await governorate.save();

    state.governorates.push(governorate._id);
    await state.save();

    res.status(StatusCodes.CREATED).json(governorate);
  } catch (error) {
    next(error);
  }
};
exports.deleteGovernorate = async (req, res, next) => {
  try {
    const admin = await ensureIsAdmin(req.userId);

    const { id } = req.params;
    const governorate = await Governorate.findById(id);

    if (!governorate) {
      const error = new Error('Governorate not found');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Remove from parent state
    await State.updateMany(
      { governorates: id },
      { $pull: { governorates: id } }
    );

    // Delete associated cities
    await City.deleteMany({ _id: { $in: governorate.cities } });
    await Governorate.findByIdAndDelete(id);

    res.status(StatusCodes.OK).json({
      message: 'Governorate and all associated cities deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

exports.addCity = async (req, res, next) => {
  try {
    const admin = await ensureIsAdmin(req.userId);

    const { name, governorateId } = req.body;
    const governorate = await Governorate.findById(governorateId);

    if (!governorate) {
      const error = new Error('Governorate not found');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    const city = new City({ name });
    await city.save();

    governorate.cities.push(city._id);
    await governorate.save();

    res.status(StatusCodes.CREATED).json(city);
  } catch (error) {
    next(error);
  }
};
exports.deleteCity = async (req, res, next) => {
  try {
    const admin = await ensureIsAdmin(req.userId);

    const { id } = req.params;
    const city = await City.findById(id);

    if (!city) {
      const error = new Error('City not found');
      error.statusCode = StatusCodes.NOT_FOUND;
      throw error;
    }

    // Remove from parent governorate
    await Governorate.updateMany({ cities: id }, { $pull: { cities: id } });

    await City.findByIdAndDelete(id);

    res.status(StatusCodes.OK).json({
      message: 'City deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
