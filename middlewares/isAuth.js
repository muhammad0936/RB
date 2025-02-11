const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  try {
    let token = req.get('Authorization');
    if (!token) {
      const error = new Error('jwt must be provided');
      error.statusCode = 422;
      throw error;
    }
    token = token.split(' ')[1];
    let decodedToken;
    decodedToken = jwt.verify(token, 'thisismysecretkey');
    if (!decodedToken) {
      const error = new Error('Not authenticated!');
      error.statusCode = 401;
      throw error;
    }
    req.userId = decodedToken.userId;
    next();
  } catch (error) {
    if (!error.statusCode) error.statusCode = 500;
    next(error);
  }
};
