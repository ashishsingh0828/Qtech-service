export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function errorHandler(err, req, res, _next) {
  let status = err.status || 500;
  let message = err.message;

  if (err.name === "MulterError") {
    status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    message = err.code === "LIMIT_FILE_SIZE" ? "That file is too large. The limit is 10 MB." : "Upload failed: " + err.message;
  } else if (err.type === "entity.parse.failed") {
    status = 400;
    message = "Request body is not valid JSON.";
  } else if (err.type === "entity.too.large") {
    status = 413;
    message = "Request is too large.";
  } else if (err.name === "ValidationError" && err.errors) {
    status = 400;
    message = Object.values(err.errors).map((e) => e.message).join(" ");
  } else if (err.code === 11000) {
    status = 409;
    message = "That record already exists.";
  }

  if (status >= 500) {
    console.error(err);
    message = "Something went wrong on the server.";
  }
  res.status(status).json({ message });
}
