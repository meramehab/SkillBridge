const Payment = require('../models/Payment');
const Project = require('../models/Project');
const Course = require('../models/Course');
const crypto = require('crypto');

const PLATFORM_FEE_PERCENT = 0.1; // 10% عمولة المنصة - قابلة للتعديل
const PAYMOB_BASE_URL = process.env.PAYMOB_BASE_URL || 'https://accept.paymob.com';

// الدفع ممكن يكون لمشروع أو لكورس - الدالة دي بتحدد نوع العنصر وترجع بياناته
const resolveItemAndAmount = async ({ projectId, courseId, reqAmount }) => {
  if (projectId) {
    const project = await Project.findById(projectId);
    if (!project) {
      const error = new Error('المشروع مش موجود');
      error.statusCode = 404;
      throw error;
    }
    if (!project.budget) {
      const error = new Error('المشروع لا يملك ميزانية محددة للدفع');
      error.statusCode = 400;
      throw error;
    }
    return { title: project.title, project: project._id, course: null, amount: project.budget };
  }

  if (courseId) {
    const course = await Course.findById(courseId);
    if (!course) {
      const error = new Error('الكورس مش موجود');
      error.statusCode = 404;
      throw error;
    }
    // يجب تحديد السعر من قاعدة البيانات وعدم الاعتماد على المدخلات من العميل
    return { title: course.title, project: null, course: course._id, amount: course.price };
  }

  const error = new Error('لازم تحددي مشروع أو كورس للدفع');
  error.statusCode = 400;
  throw error;
};

// إنشاء عملية دفع وتجميد الفلوس في الـ Escrow
// MVP: لو PAYMENT_MODE=mock بيشتغل من غير أي API خارجي حقيقي
const createEscrowPayment = async ({ projectId, courseId, clientId, amount }) => {
  const item = await resolveItemAndAmount({ projectId, courseId, reqAmount: amount });
  const platformFee = +(item.amount * PLATFORM_FEE_PERCENT).toFixed(2);

  const payment = await Payment.create({
    project: item.project,
    course: item.course,
    itemTitle: item.title,
    client: clientId,
    amount: item.amount,
    platformFee,
    provider: 'paymob',
    providerTransactionId:
      process.env.PAYMENT_MODE === 'mock' ? `MOCK-${Date.now()}` : null,
    status: 'held_in_escrow',
    heldAt: new Date(),
  });

  return payment;
};

// إفراج الفلوس للطالب بعد موافقة العميل على التسليم
const releaseEscrowPayment = async (paymentId, studentId, userAuth) => {
  const payment = await Payment.findById(paymentId);
  if (!payment) {
    const error = new Error('عملية الدفع مش موجودة');
    error.statusCode = 404;
    throw error;
  }
  
  if (payment.client.toString() !== userAuth.id && userAuth.role !== 'admin') {
    const error = new Error('غير مصرح لك بإفراج هذه الدفعة');
    error.statusCode = 403;
    throw error;
  }

  if (payment.status !== 'held_in_escrow') {
    const error = new Error('الفلوس دي مش في حالة تجميد قابلة للإفراج');
    error.statusCode = 400;
    throw error;
  }

  payment.student = studentId;
  payment.status = 'released';
  payment.releasedAt = new Date();
  await payment.save();

  return payment;
};

const refundPayment = async (paymentId) => {
  const payment = await Payment.findById(paymentId);
  if (!payment) {
    const error = new Error('عملية الدفع مش موجودة');
    error.statusCode = 404;
    throw error;
  }

  if (payment.status === 'refunded' || payment.paymentStatus === 'refunded') {
    return payment;
  }

  payment.status = 'refunded';
  payment.paymentStatus = 'refunded';
  await payment.save();
  return payment;
};

const getPaymentsByProject = async (projectId) => {
  return Payment.find({ project: projectId });
};

const getPaymentById = async (paymentId) => {
  return Payment.findById(paymentId);
};

// إنشاء عملية دفع حقيقية بـ Paymob (Intention API) - بيتطلب PAYMOB_SECRET_KEY, PAYMOB_INTEGRATION_ID في .env
// المرجع الرسمي: https://developers.paymob.com/paymob-docs/developers/intention-apis/create-intention
const createPaymobPaymentIntention = async ({ projectId, courseId, clientId, amount, billingData }) => {
  const item = await resolveItemAndAmount({ projectId, courseId, reqAmount: amount });

  if (!process.env.PAYMOB_SECRET_KEY || !process.env.PAYMOB_INTEGRATION_ID) {
    const error = new Error('إعدادات Paymob مش متظبطة في .env (PAYMOB_SECRET_KEY / PAYMOB_INTEGRATION_ID)');
    error.statusCode = 500;
    throw error;
  }

  const platformFee = +(item.amount * PLATFORM_FEE_PERCENT).toFixed(2);

  // بننشئ سجل الدفع عندنا الأول (status: pending) عشان نستخدم الـ id بتاعه كـ special_reference
  // ده أهم حاجة تربط بين الدفعة عندنا وبين الـ webhook اللي هيرجع من Paymob بعدين
  const payment = await Payment.create({
    project: item.project,
    course: item.course,
    itemTitle: item.title,
    client: clientId,
    amount: item.amount,
    platformFee,
    provider: 'paymob',
    status: 'pending',
  });

  const amountCents = Math.round(item.amount * 100);

  const response = await fetch(`${PAYMOB_BASE_URL}/v1/intention/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${process.env.PAYMOB_SECRET_KEY}`,
    },
    body: JSON.stringify({
      amount: amountCents,
      currency: 'EGP',
      payment_methods: [Number(process.env.PAYMOB_INTEGRATION_ID)],
      items: [
        {
          name: item.title,
          amount: amountCents,
          quantity: 1,
        },
      ],
      billing_data: billingData,
      special_reference: payment._id.toString(),
      notification_url: process.env.PAYMOB_WEBHOOK_URL || undefined,
      redirection_url: process.env.PAYMOB_REDIRECT_URL || undefined,
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.client_secret) {
    payment.status = 'failed';
    await payment.save();
    const error = new Error(data.message || 'فشل إنشاء عملية الدفع مع Paymob');
    error.statusCode = 502;
    throw error;
  }

  payment.providerTransactionId = String(data.id || data.intention_order_id || '');
  await payment.save();

  return {
    paymentId: payment._id,
    clientSecret: data.client_secret,
    publicKey: process.env.PAYMOB_PUBLIC_KEY,
    checkoutUrl: process.env.PAYMOB_CHECKOUT_URL || 'https://accept.paymob.com/unifiedcheckout/',
  };
};

// التحقق من توقيع الـ HMAC اللي Paymob بيبعته مع كل webhook (عشان نتأكد إن الطلب فعلاً من Paymob)
// ترتيب الحقول موثّق رسميًا وثابت (20 حقل، من غير أي فاصل بينهم)، اتأكدنا منه من توثيق Paymob الرسمي
const HMAC_FIELDS = [
  'amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction',
  'id', 'integration_id', 'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded',
  'is_standalone_payment', 'is_voided', 'order.id', 'owner', 'pending',
  'source_data.pan', 'source_data.sub_type', 'source_data.type', 'success',
];

const getNestedValue = (obj, path) => {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
};

const verifyPaymobHmac = (transactionObj, receivedHmac) => {
  if (!process.env.PAYMOB_HMAC_SECRET || !receivedHmac) return false;

  const message = HMAC_FIELDS.map((field) => {
    const value = getNestedValue(transactionObj, field);
    return value === undefined || value === null ? '' : String(value);
  }).join('');

  const computedHmac = crypto
    .createHmac('sha512', process.env.PAYMOB_HMAC_SECRET)
    .update(message)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(computedHmac), Buffer.from(receivedHmac));
  } catch {
    return false; // لو الأطوال مختلفة، timingSafeEqual بترمي خطأ بدل ما ترجع false
  }
};

// بيتنادى من الـ webhook بعد التأكد من الـ HMAC - بيحدّث حالة الدفعة عندنا بناءً على نتيجة Paymob
const handlePaymobWebhook = async (transactionObj) => {
  const specialReference = transactionObj.special_reference || transactionObj?.order?.merchant_order_id;
  if (!specialReference) return null;

  const payment = await Payment.findById(specialReference);
  if (!payment) return null;
  
  // idempotency
  if (payment.status === 'held_in_escrow' || payment.status === 'completed') {
    return payment;
  }

  if (transactionObj.success === true && transactionObj.pending === false) {
    payment.status = 'held_in_escrow';
    payment.paymentStatus = 'completed';
    payment.heldAt = new Date();
    payment.providerTransactionId = String(transactionObj.id);
  } else if (transactionObj.pending !== true) {
    payment.status = 'failed';
    payment.paymentStatus = 'failed';
  }

  await payment.save();
  return payment;
};

// ---------- فودافون كاش (تحويل يدوي + تأكيد من الإدارة) ----------
// مفيش API رسمي لفودافون كاش لرقم شخصي، فالنظام هنا "شبه يدوي وشغال فعليًا":
// الطالب بيبعت طلب دفع، الطلب بيتسجل pending، والإدارة بتأكده يدويًا بعد ما تتأكد إن الفلوس وصلت فعليًا
const createVodafoneCashRequest = async ({ projectId, courseId, clientId, amount, senderPhone, transactionRef }) => {
  const item = await resolveItemAndAmount({ projectId, courseId, reqAmount: amount });
  const platformFee = +(item.amount * PLATFORM_FEE_PERCENT).toFixed(2);

  const payment = await Payment.create({
    project: item.project,
    course: item.course,
    itemTitle: item.title,
    client: clientId,
    amount: item.amount,
    platformFee,
    provider: 'vodafone_cash',
    providerTransactionId: transactionRef || senderPhone,
    status: 'pending',
  });

  return payment;
};

const getPendingVodafoneCashPayments = async () => {
  return Payment.find({ provider: 'vodafone_cash', status: 'pending' })
    .populate('client', 'fullName email')
    .populate('project', 'title budget')
    .populate('course', 'title')
    .sort({ createdAt: -1 });
};

// الإدارة بتأكد إن الفلوس وصلت فعليًا على رقم فودافون كاش، وبعدها الدفعة بتتحط في الضمان المالي
const confirmVodafoneCashPayment = async (paymentId) => {
  const payment = await Payment.findById(paymentId);
  if (!payment) {
    const error = new Error('طلب الدفع مش موجود');
    error.statusCode = 404;
    throw error;
  }
  if (payment.provider !== 'vodafone_cash') {
    const error = new Error('الطلب ده مش دفعة فودافون كاش');
    error.statusCode = 400;
    throw error;
  }

  payment.status = 'held_in_escrow';
  payment.heldAt = new Date();
  await payment.save();
  return payment;
};

const rejectVodafoneCashPayment = async (paymentId) => {
  const payment = await Payment.findById(paymentId);
  if (!payment) {
    const error = new Error('طلب الدفع مش موجود');
    error.statusCode = 404;
    throw error;
  }

  payment.status = 'failed';
  await payment.save();
  return payment;
};

// إنشاء أو تنفيذ عملية دفع مباشرة لكورس/اشتراك/مشروع
const processDirectCheckout = async ({ userId, courseId, projectId, amount, paymentMethod = 'sandbox', sandboxAutoSucceed = false }) => {
  const User = require('../models/User');
  let itemTitle = 'خدمة المنصة';
  let course = null;
  let project = null;

  if (courseId) {
    course = await Course.findById(courseId);
    if (!course) {
      const error = new Error('الكورس غير موجود');
      error.statusCode = 404;
      throw error;
    }
    itemTitle = course.title;
  } else if (projectId) {
    project = await Project.findById(projectId);
    if (!project) {
      const error = new Error('المشروع غير موجود');
      error.statusCode = 404;
      throw error;
    }
    if (!project.budget) {
      const error = new Error('المشروع لا يملك ميزانية محددة للدفع');
      error.statusCode = 400;
      throw error;
    }
    itemTitle = project.title;
  } else {
    const error = new Error('يجب تحديد كورس أو مشروع للدفع');
    error.statusCode = 400;
    throw error;
  }

  const isMockEnvironment = process.env.PAYMENT_MODE === 'mock' && process.env.NODE_ENV !== 'production';

  if (paymentMethod === 'sandbox' && !isMockEnvironment) {
    const error = new Error('طريقة الدفع التجريبية غير متاحة');
    error.statusCode = 400;
    throw error;
  }

  // استخدم السعر الفعلي للكورس من قاعدة البيانات، ولا تعتمد على المدخلات من الـ frontend
  const finalAmount = course ? course.price : project.budget;
  const platformFee = +(finalAmount * PLATFORM_FEE_PERCENT).toFixed(2);
  const transactionId = `TXN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

  // إذا كان sandbox ومحدد له النجاح الفوري يجب أن يكون PAYMENT_MODE === 'mock' ولا يعمل في الـ production أبدًا
  const isCompletedImmediately = isMockEnvironment && (sandboxAutoSucceed || paymentMethod === 'sandbox');

  const payment = await Payment.create({
    userId,
    client: userId,
    courseId: course?._id || null,
    course: course?._id || null,
    projectId: project?._id || null,
    project: project?._id || null,
    itemTitle,
    amount: finalAmount,
    platformFee,
    provider: paymentMethod,
    providerTransactionId: transactionId,
    transactionId,
    paymentMethod,
    paymentStatus: isCompletedImmediately ? 'completed' : 'pending',
    status: isCompletedImmediately ? 'completed' : 'pending',
    heldAt: new Date(),
    releasedAt: isCompletedImmediately ? new Date() : null,
  });

  // إذا اكتملت العملية وكان هناك كورس، نسجل المستخدم فوراً في الكورس
  if (isCompletedImmediately && course) {
    await User.findByIdAndUpdate(userId, {
      $addToSet: { enrolledCourses: course._id },
    });
    await Course.findByIdAndUpdate(course._id, {
      $addToSet: { enrolledStudents: userId },
    });
  }

  return payment;
};

// التحقق من الدفع وتأكيده (verify)
const verifyPaymentCompletion = async ({ transactionId, paymentId, status = 'completed' }, userAuth) => {
  const User = require('../models/User');
  const query = {};
  if (paymentId) query._id = paymentId;
  else if (transactionId) query.$or = [{ transactionId }, { providerTransactionId: transactionId }];
  else {
    const error = new Error('معرف المعاملة أو الدفع مطلوب');
    error.statusCode = 400;
    throw error;
  }

  const payment = await Payment.findOne(query);
  if (!payment) {
    const error = new Error('سجل الدفع غير موجود');
    error.statusCode = 404;
    throw error;
  }
  
  // منع الـ frontend من تأكيد أي عملية دفع ما لم تكن sandbox في بيئة التطوير
  const isMockEnvironment = process.env.PAYMENT_MODE === 'mock' && process.env.NODE_ENV !== 'production';
  if (!isMockEnvironment) {
    const error = new Error('غير مصرح بتأكيد عملية دفع حقيقية من واجهة المستخدم');
    error.statusCode = 403;
    throw error;
  }

  const targetUserId = payment.userId || payment.client;
  if (targetUserId && targetUserId.toString() !== userAuth.id && userAuth.role !== 'admin') {
    const error = new Error('غير مصرح لك بتأكيد هذه المعاملة');
    error.statusCode = 403;
    throw error;
  }

  if (payment.paymentStatus === 'completed' || payment.paymentStatus === 'success') {
    return payment;
  }

  const isSuccess = status === 'completed' || status === 'success';
  payment.paymentStatus = isSuccess ? 'completed' : 'failed';
  payment.status = isSuccess ? 'completed' : 'failed';
  if (isSuccess) {
    payment.releasedAt = new Date();
  }
  await payment.save();

  // تفعيل الكورس للمستخدم إذا كان الدفع لكورس وناجح
  const targetCourseId = payment.courseId || payment.course;
  if (isSuccess && targetCourseId && targetUserId) {
    await User.findByIdAndUpdate(targetUserId, {
      $addToSet: { enrolledCourses: targetCourseId },
    });
    await Course.findByIdAndUpdate(targetCourseId, {
      $addToSet: { enrolledStudents: targetUserId },
    });
  }

  return payment;
};

module.exports = {
  createEscrowPayment,
  releaseEscrowPayment,
  refundPayment,
  getPaymentsByProject,
  getPaymentById,
  createPaymobPaymentIntention,
  verifyPaymobHmac,
  handlePaymobWebhook,
  createVodafoneCashRequest,
  getPendingVodafoneCashPayments,
  confirmVodafoneCashPayment,
  rejectVodafoneCashPayment,
  processDirectCheckout,
  verifyPaymentCompletion,
};

