const analyticsService = require('../services/analytics.service');
const universityService = require('../services/university.service');
const disputeService = require('../services/dispute.service');
const User = require('../models/User');
const Course = require('../models/Course');
const Project = require('../models/Project');
const Payment = require('../models/Payment');

// إحصائيات الإدارة المجمعة: Total Users, Total Revenue, Total Enrolled Courses, Active Jobs
const getAdminStats = async (req, res) => {
  try {
    const [totalUsers, activeJobs, courses, completedPayments] = await Promise.all([
      User.countDocuments(),
      Project.countDocuments({ status: { $in: ['open', 'in_progress'] } }),
      Course.find({ isActive: true }).select('enrolledStudents'),
      Payment.find({
        status: { $in: ['completed', 'released', 'held_in_escrow'] },
      }).select('amount platformFee'),
    ]);

    // حساب إجمالي التسجيلات في الكورسات
    const totalEnrolledCourses = courses.reduce((acc, curr) => {
      return acc + (curr.enrolledStudents ? curr.enrolledStudents.length : 0);
    }, 0);

    // حساب إجمالي الإيرادات المالية
    const totalRevenue = completedPayments.reduce((acc, curr) => acc + (curr.amount || 0), 0);
    const platformEarnings = completedPayments.reduce((acc, curr) => acc + (curr.platformFee || 0), 0);

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalRevenue,
        platformEarnings,
        totalEnrolledCourses,
        activeJobs,
        totalCoursesCount: courses.length,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// جلب قائمة المستخدمين مع دعم البحث والفلترة حسب الدور
const getAdminUsers = async (req, res) => {
  try {
    const { role, search, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (role && role !== 'all') {
      filter.role = role;
    }
    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const users = await User.find(filter)
      .select('-password')
      .populate('enrolledCourses', 'title price')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await User.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: users,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// تعديل دور المستخدم (Role: student / client / admin)
const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const validRoles = ['student', 'client', 'admin'];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'الدور المحدد غير صالح، يجب أن يكون student أو client أو admin',
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    }

    user.role = role;
    await user.save();

    res.status(200).json({
      success: true,
      message: `تم تغيير دور المستخدم بنجاح إلى ${role}`,
      data: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// جلب سجل المعاملات المالية بالكامل
const getAdminTransactions = async (req, res) => {
  try {
    const { status, limit = 100 } = req.query;
    const query = {};
    if (status && status !== 'all') {
      query.$or = [{ status }, { paymentStatus: status }];
    }

    const transactions = await Payment.find(query)
      .populate('client', 'fullName email')
      .populate('userId', 'fullName email')
      .populate('student', 'fullName email')
      .populate('course', 'title price')
      .populate('project', 'title budget')
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      data: transactions,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ملخص شامل للوحة تحكم الإدارة - بيجمع الإحصائيات + الطلبات المعلّقة في نداء واحد
const getDashboardSummary = async (req, res) => {
  try {
    const [overview, pendingVerifications, openDisputes] = await Promise.all([
      analyticsService.getPlatformOverview(),
      universityService.getPendingVerifications(),
      disputeService.getDisputes({ status: 'open' }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        overview,
        pendingVerificationsCount: pendingVerifications.length,
        openDisputesCount: openDisputes.length,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// تفعيل/تعطيل حساب مستخدم (بدل الحذف النهائي)
const toggleUserActive = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'المستخدم مش موجود' });
    }

    user.isActive = !user.isActive;
    await user.save();

    res.status(200).json({ success: true, data: { id: user._id, isActive: user.isActive } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getDashboardSummary,
  toggleUserActive,
  getAdminStats,
  getAdminUsers,
  updateUserRole,
  getAdminTransactions,
};

