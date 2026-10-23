// Every API reply has the same shape:
//   success: { success: true, data: ..., message?: ... }
//   error:   { success: false, message: ..., errors?: {...} }
exports.ok = (res, data = null, message, status = 200) => {
  const body = { success: true, data };
  if (message) body.message = message;
  return res.status(status).json(body);
};
exports.created = (res, data, message) => exports.ok(res, data, message, 201);
