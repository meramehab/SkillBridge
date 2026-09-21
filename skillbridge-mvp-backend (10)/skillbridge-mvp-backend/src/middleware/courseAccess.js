const Course = require('../models/Course');
const User = require('../models/User');
const Payment = require('../models/Payment');

/**
 * ميدل وير للتحقق من إمكانية وصول المستخدم لمحتوى الكورس والدروس
 * يسمح بالدخول لـ:
 * 1. المسؤول (Admin)
 * 2. منشئ الكورس (Course Creator)
 * 3. الطالب المشترك/المسجل في الكورس (عبر enrolledCourses أو enrolledStudents أو سجل دفع مكتمل)
 */
const checkCourseAccess = async (req, res, next) => {
  try {
    const courseId = req.params.id || req.params.courseId;
    if (!courseId) {
      return res.status(400).json({ success: false, message: 'معرّف الكورس مطلوب' });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'الكورس غير موجود' });
    }

    // الأدمن دائمًا مسموح له
    if (req.user && req.user.role === 'admin') {
      req.course = course;
      req.hasFullAccess = true;
      return next();
    }

    // منشئ الكورس
    if (req.user && course.createdBy && course.createdBy.toString() === req.user.id) {
      req.course = course;
      req.hasFullAccess = true;
      return next();
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        code: 'AUTH_REQUIRED',
        message: 'يجب تسجيل الدخول للوصول إلى هذا المحتوى',
      });
    }

    // التحقق من قائمة الطلاب المسجلين في الكورس نفسه
    const isEnrolledInCourse =
      course.enrolledStudents &&
      course.enrolledStudents.some((id) => id.toString() === userId.toString());

    if (isEnrolledInCourse) {
      req.course = course;
      req.hasFullAccess = true;
      return next();
    }

    // التحقق من مستخدم النظام وقائمة كورساته
    const user = await User.findById(userId).select('enrolledCourses');
    const isEnrolledInUser =
      user &&
      user.enrolledCourses &&
      user.enrolledCourses.some((id) => id.toString() === courseId.toString());

    if (isEnrolledInUser) {
      req.course = course;
      req.hasFullAccess = true;
      return next();
    }

    // التحقق من وجود معاملة دفع ناجحة لهذا الكورس
    const completedPayment = await Payment.findOne({
      course: courseId,
      $or: [{ client: userId }, { userId: userId }],
      status: { $in: ['completed', 'released', 'held_in_escrow'] },
    });

    if (completedPayment) {
      // مزامنة التسجيل تلقائيًا إذا لم يكن مضافًا
      if (user && !isEnrolledInUser) {
        user.enrolledCourses.push(course._id);
        await user.save();
      }
      if (!isEnrolledInCourse) {
        course.enrolledStudents.push(userId);
        await course.save();
      }

      req.course = course;
      req.hasFullAccess = true;
      return next();
    }

    // لو مفيش وصول كامل
    return res.status(403).json({
      success: false,
      code: 'COURSE_LOCKED',
      message: 'هذا المحتوى محمي ويتطلب الاشتراك في الكورس أولاً',
      course: {
        id: course._id,
        title: course.title,
        price: course.price,
      },
    });
  } catch (error) {
    console.error('Course access check error:', error);
    return res.status(500).json({ success: false, message: 'خطأ في التحقق من صلاحية الوصول للكورس' });
  }
};

module.exports = { checkCourseAccess };
