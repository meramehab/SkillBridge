const mongoose = require('mongoose');

const handleApiError = (res, error) => {
  // Always log the full error internally
  console.error('[API Error]:', error);

  const isDev = process.env.NODE_ENV !== 'production';
  const statusCode = error.statusCode || 500;

  // Handle expected operational errors
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      ...(isDev && { stack: error.stack }),
    });
  }

  // Handle Mongoose CastError (Invalid ObjectId) safely
  if (error instanceof mongoose.Error.CastError || error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'المعرف المقدم غير صالح.', // Invalid ID
      ...(isDev && { stack: error.stack }),
    });
  }

  // Handle Mongoose Validation Error safely
  if (error instanceof mongoose.Error.ValidationError || error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: isDev ? error.message : 'بيانات غير صالحة. يرجى التأكد من الحقول المدخلة.',
      ...(isDev && { stack: error.stack, errors: error.errors }),
    });
  }

  // Handle MongoDB Duplicate Key Error safely
  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: 'البيانات المدخلة موجودة بالفعل.', // Data already exists
      ...(isDev && { stack: error.stack }),
    });
  }

  // Generic 500 Fallback for unexpected errors
  return res.status(500).json({
    success: false,
    message: isDev ? error.message : 'حدث خطأ في السيرفر. يرجى المحاولة لاحقاً.',
    ...(isDev && { stack: error.stack }),
  });
};

module.exports = handleApiError;
