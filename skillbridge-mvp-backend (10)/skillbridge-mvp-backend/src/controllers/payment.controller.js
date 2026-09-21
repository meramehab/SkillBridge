const paymentService = require('../services/payment.service');
const User = require('../models/User');

const createEscrowPayment = async (req, res) => {
  try {
    const { projectId, courseId, amount } = req.body;
    const payment = await paymentService.createEscrowPayment({
      projectId,
      courseId,
      clientId: req.user.id,
      amount,
    });
    res.status(201).json({ success: true, data: payment });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

const releaseEscrowPayment = async (req, res) => {
  try {
    const { studentId } = req.body;
    const payment = await paymentService.releaseEscrowPayment(req.params.id, studentId);
    res.status(200).json({ success: true, data: payment });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

const refundPayment = async (req, res) => {
  try {
    const payment = await paymentService.refundPayment(req.params.id);
    res.status(200).json({ success: true, data: payment });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

const getPaymentsByProject = async (req, res) => {
  try {
    const payments = await paymentService.getPaymentsByProject(req.params.projectId);
    res.status(200).json({ success: true, data: payments });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// إنشاء عملية دفع حقيقية عبر Paymob - بيرجع clientSecret يستخدمه الفرونت اند لفتح صفحة الدفع
const createPaymobPayment = async (req, res) => {
  try {
    const { projectId, courseId, amount } = req.body;
    const user = await User.findById(req.user.id);

    const result = await paymentService.createPaymobPaymentIntention({
      projectId,
      courseId,
      clientId: req.user.id,
      amount,
      billingData: {
        first_name: user?.fullName?.split(' ')[0] || 'Student',
        last_name: user?.fullName?.split(' ').slice(1).join(' ') || 'User',
        email: user?.email || 'test@example.com',
        phone_number: req.body.phone || '+201000000000',
        country: 'EG',
        // باقي الحقول المطلوبة من Paymob بيانات افتراضية لو مش متوفرة
        street: 'NA', building: 'NA', floor: 'NA', apartment: 'NA', city: 'Cairo', state: 'NA',
      },
    });

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// الـ webhook اللي Paymob بينادي عليه لما حالة الدفع تتحدث (endpoint عام، من غير JWT، لازم يتحقق بـ HMAC بدل كده)
const paymobWebhook = async (req, res) => {
  try {
    const receivedHmac = req.query.hmac;
    const transactionObj = req.body?.obj;

    if (!transactionObj) {
      return res.status(400).json({ success: false, message: 'بيانات ناقصة' });
    }

    const isValid = paymentService.verifyPaymobHmac(transactionObj, receivedHmac);
    if (!isValid) {
      // لو الـ HMAC مش مطابق، ممكن يكون الطلب مش فعليًا من Paymob - نتجاهله
      return res.status(401).json({ success: false, message: 'توقيع غير صالح' });
    }

    await paymentService.handlePaymobWebhook(transactionObj);
    res.status(200).json({ success: true });
  } catch (error) {
    // مهم: نرجّع 200 حتى لو حصل خطأ داخلي بسيط، عشان Paymob متعملش إعادة محاولات لا نهائية
    // بس نسجل الخطأ في الـ logs عشان نراجعه
    console.error('Paymob webhook error:', error);
    res.status(200).json({ success: false });
  }
};

// فودافون كاش - الطالب/العميل بيبعت طلب دفع بعد التحويل اليدوي
const createVodafoneCashPayment = async (req, res) => {
  try {
    const { projectId, courseId, amount, senderPhone, transactionRef } = req.body;
    const payment = await paymentService.createVodafoneCashRequest({
      projectId,
      courseId,
      clientId: req.user.id,
      amount,
      senderPhone,
      transactionRef,
    });
    res.status(201).json({ success: true, data: payment });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// الإدارة بس - عرض كل طلبات فودافون كاش المعلّقة
const getPendingVodafoneCashPayments = async (req, res) => {
  try {
    const payments = await paymentService.getPendingVodafoneCashPayments();
    res.status(200).json({ success: true, data: payments });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// الإدارة بس - تأكيد إن الفلوس وصلت فعليًا
const confirmVodafoneCashPayment = async (req, res) => {
  try {
    const payment = await paymentService.confirmVodafoneCashPayment(req.params.id);
    res.status(200).json({ success: true, data: payment });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

const rejectVodafoneCashPayment = async (req, res) => {
  try {
    const payment = await paymentService.rejectVodafoneCashPayment(req.params.id);
    res.status(200).json({ success: true, data: payment });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// Checkout مباشر لدفع الكورسات والاشتراكات
const checkoutPayment = async (req, res) => {
  try {
    const { courseId, projectId, amount, paymentMethod, sandboxAutoSucceed } = req.body;
    const payment = await paymentService.processDirectCheckout({
      userId: req.user.id,
      courseId,
      projectId,
      amount,
      paymentMethod: paymentMethod || 'sandbox',
      sandboxAutoSucceed: sandboxAutoSucceed ?? true,
    });

    res.status(201).json({
      success: true,
      message: payment.paymentStatus === 'completed' ? 'تم الدفع وتفعيل المحتوى بنجاح' : 'تم بدء عملية الدفع',
      data: {
        paymentId: payment._id,
        transactionId: payment.transactionId,
        amount: payment.amount,
        status: payment.paymentStatus,
        paymentStatus: payment.paymentStatus,
        courseId: payment.courseId,
        createdAt: payment.createdAt,
      },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// التحقق من حالة الدفع وتأكيده يدويًا أو عبر بوابة الدفع
const verifyPayment = async (req, res) => {
  try {
    const { transactionId, paymentId, status } = req.body;
    const payment = await paymentService.verifyPaymentCompletion({
      transactionId,
      paymentId,
      status: status || 'completed',
    });

    res.status(200).json({
      success: true,
      message: 'تم تأكيد الدفع وتفعيل الوصول',
      data: {
        paymentId: payment._id,
        transactionId: payment.transactionId,
        status: payment.paymentStatus,
        paymentStatus: payment.paymentStatus,
        amount: payment.amount,
        courseId: payment.courseId,
        createdAt: payment.createdAt,
      },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createEscrowPayment,
  releaseEscrowPayment,
  refundPayment,
  getPaymentsByProject,
  createPaymobPayment,
  paymobWebhook,
  createVodafoneCashPayment,
  getPendingVodafoneCashPayments,
  confirmVodafoneCashPayment,
  rejectVodafoneCashPayment,
  checkoutPayment,
  verifyPayment,
};
