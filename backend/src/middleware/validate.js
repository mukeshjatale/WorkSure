const ApiError = require('../utils/ApiError');

// validate(validatorFn) runs e.g. validateRegister(req.body).
// If something is wrong -> 400 with a field-by-field error list.
// If fine -> the cleaned data is available as req.valid.
module.exports = (validatorFn, source = 'body') => (req, res, next) => {
  const { errors, value } = validatorFn(req[source] || {});
  if (Object.keys(errors).length > 0) {
    return next(new ApiError(400, 'Please fix the highlighted fields', errors));
  }
  req.valid = value;
  next();
};
