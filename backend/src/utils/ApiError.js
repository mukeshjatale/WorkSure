// An error with an HTTP status code. Controllers throw it; errorHandler turns it into JSON.
class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
module.exports = ApiError;
