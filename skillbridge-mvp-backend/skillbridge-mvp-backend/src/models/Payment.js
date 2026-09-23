const mongoose = require('mongoose');

// نظام ضمان مالي آمن (Escrow) - فلوس العميل بتتجمد لحد ما يوافق على التسليم
const paymentSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
    itemTitle: { type: String, default: '' }, // اسم المشروع أو الكورس وقت الدفع (نسخة ثابتة)
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // حقول عامة تدعم شراء الكورسات والاشتراكات والمشاريع
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
    transactionId: { type: String, default: null },
    paymentStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending',
    },
    paymentMethod: { type: String, default: 'card' }, // card, vodafone_cash, sandbox

    amount: { type: Number, required: true },
    platformFee: { type: Number, default: 0 }, // عمولة المنصة من كل صفقة

    // MVP: mock إلى أن يتم ربط Paymob فعليًا
    provider: { type: String, default: 'paymob' },
    providerTransactionId: { type: String, default: null },

    status: {
      type: String,
      enum: ['pending', 'held_in_escrow', 'released', 'refunded', 'failed', 'completed'],
      default: 'pending',
    },

    heldAt: { type: Date, default: null },
    releasedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Pre-save hook to keep userId/clientId and courseId/course aligned
paymentSchema.pre('save', function (next) {
  if (this.clientId && !this.userId) {
    this.userId = this.clientId;
  } else if (this.userId && !this.clientId) {
    this.clientId = this.userId;
  }
  if (this.course && !this.courseId) {
    this.courseId = this.course;
  } else if (this.courseId && !this.course) {
    this.course = this.courseId;
  }
  if (this.paymentStatus === 'completed' && this.status === 'pending') {
    this.status = 'completed';
  } else if (this.status === 'completed' && this.paymentStatus === 'pending') {
    this.paymentStatus = 'completed';
  }
  next();
});

module.exports = mongoose.model('Payment', paymentSchema);
