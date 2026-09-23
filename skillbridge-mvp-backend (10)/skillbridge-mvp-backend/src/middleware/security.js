const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

// محدد معدل الطلبات للتوثيق والدخول لمنع هجمات التخمين والقوة الغاشمة (Brute-force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 20, // 20 محاولة لكل IP خلال 15 دقيقة
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'عدد محاولات تسجيل دخول كثيرة جدًا، يُرجى المحاولة بعد 15 دقيقة للحفاظ على أمان حسابك.',
  },
});

// محدد معدل طلبات بوابات الدفع لمنع التكرار العشوائي والاحتيال
const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 دقائق
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'تم تجاوز الحد المسموح به من طلبات الدفع، يُرجى الانتظار قليلاً والمحاولة لاحقاً.',
  },
});

// ميدل وير لتنقية المدخلات والحماية من هجمات NoSQL Injection و XSS
const sanitizeInputs = (req, res, next) => {
  const sanitizeObject = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;

    for (const key of Object.keys(obj)) {
      // منع مفاتيح الـ NoSQL المشبوهة ($where, $regex, etc.)
      if (key.startsWith('$') || key.includes('.')) {
        delete obj[key];
        continue;
      }

      if (typeof obj[key] === 'string') {
        // حماية بسيطة وفعالة ضد وسوم HTML/XSS الخبيثة
        obj[key] = obj[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .trim();
      } else if (typeof obj[key] === 'object') {
        sanitizeObject(obj[key]);
      }
    }
    return obj;
  };

  if (req.body) req.body = sanitizeObject(req.body);
  if (req.query) req.query = sanitizeObject(req.query);
  if (req.params) req.params = sanitizeObject(req.params);

  next();
};

// إنشاء توكن وصول مؤقت وموقع لمحتوى الفيديو المحمي
const generateSignedMediaToken = (userId, courseId, lessonId) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('بيئة العمل غير مهيأة بشكل صحيح: مفقود JWT_SECRET');
  
  const expiresAt = Date.now() + 60 * 60 * 1000; // صلاحية لساعة واحدة
  const payload = `${userId}:${courseId}:${lessonId}:${expiresAt}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ payload, signature })).toString('base64url');
};

// التحقق من صلاحية توكن الفيديو
const verifySignedMediaToken = (token) => {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return false;
    
    const jsonStr = Buffer.from(token, 'base64url').toString('utf8');
    const { payload, signature } = JSON.parse(jsonStr);

    const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (signature !== expectedSignature) return false;

    const parts = payload.split(':');
    const expiresAt = parseInt(parts[3], 10);
    if (Date.now() > expiresAt) return false;

    return {
      userId: parts[0],
      courseId: parts[1],
      lessonId: parts[2],
    };
  } catch {
    return false;
  }
};

module.exports = {
  authLimiter,
  paymentLimiter,
  sanitizeInputs,
  generateSignedMediaToken,
  verifySignedMediaToken,
};
