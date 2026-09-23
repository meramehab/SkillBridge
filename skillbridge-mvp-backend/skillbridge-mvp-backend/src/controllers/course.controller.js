const courseService = require('../services/course.service');

const createCourse = async (req, res) => {
  try {
    if (req.body.price === undefined || req.body.price <= 0) {
      return res.status(400).json({ success: false, message: 'سعر الكورس مطلوب ويجب أن يكون أكبر من الصفر' });
    }
    const course = await courseService.createCourse(req.user.id, req.body);
    res.status(201).json({ success: true, data: course });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

const getCourses = async (req, res) => {
  try {
    const courses = await courseService.getCourses(req.query);
    res.status(200).json({ success: true, data: courses });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// نسخة كاملة (بالإجابات الصحيحة) - للأدمن بس، تُستخدم في صفحة إدارة الكورسات
const getCoursesForAdmin = async (req, res) => {
  try {
    const courses = await courseService.getCoursesForAdmin();
    res.status(200).json({ success: true, data: courses });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

const getCourseById = async (req, res) => {
  try {
    const course = await courseService.getCourseById(req.params.id);
    res.status(200).json({ success: true, data: course });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

const updateCourse = async (req, res) => {
  try {
    const course = await courseService.updateCourse(req.params.id, req.body);
    res.status(200).json({ success: true, data: course });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

const deleteCourse = async (req, res) => {
  try {
    await courseService.deleteCourse(req.params.id);
    res.status(200).json({ success: true, message: 'تم حذف الكورس' });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

const enrollCourse = async (req, res) => {
  try {
    const path = await courseService.enrollCourseInLearningPath(req.user.id, req.params.id);
    res.status(200).json({ success: true, data: path });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// عرض أسئلة الاختبار (من غير الإجابات الصحيحة)
const getExamQuestions = async (req, res) => {
  try {
    const exam = await courseService.getCourseExamQuestions(req.params.id);
    res.status(200).json({ success: true, data: exam });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// تسليم إجابات الاختبار وحساب النتيجة
const submitExam = async (req, res) => {
  try {
    const { answers } = req.body;
    const result = await courseService.submitCourseExam(req.user.id, req.params.id, answers);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// جلب الدروس الكاملة وروابط المشاهدة للمشتركين فقط
const getCourseLessons = async (req, res) => {
  try {
    const course = req.course; // وضعها ميدل وير checkCourseAccess
    const security = require('../middleware/security');

    // تزويد روابط الدروس بتوكنات تشغيل آمنة وموقعة بدلاً من روابط عامة عارية
    const securedLessons = (course.lessons || []).map((lesson) => {
      const signedToken = security.generateSignedMediaToken(req.user.id, course._id, lesson._id);
      return {
        _id: lesson._id,
        title: lesson.title,
        description: lesson.description,
        durationMinutes: lesson.durationMinutes,
        isFreePreview: lesson.isFreePreview,
        contentMarkdown: lesson.contentMarkdown,
        // رابط الفيديو محمي بتوكن وصول مؤقت
        videoUrl: lesson.videoUrl,
        signedAccessToken: signedToken,
        streamUrl: `/api/courses/${course._id}/lessons/${lesson._id}/stream?token=${signedToken}`,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        courseId: course._id,
        title: course.title,
        description: course.description,
        lessons: securedLessons,
        hasFullAccess: true,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// فحص صلاحية الوصول للكورس للطالب الحالي
const checkCourseAccessStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const Course = require('../models/Course');
    const User = require('../models/User');
    const Payment = require('../models/Payment');

    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({ success: false, message: 'الكورس غير موجود' });
    }

    if (req.user.role === 'admin' || (course.createdBy && course.createdBy.toString() === userId)) {
      return res.status(200).json({ success: true, hasAccess: true, reason: 'admin_or_creator' });
    }

    const isEnrolledInCourse = (course.enrolledStudents || []).some(
      (sId) => sId.toString() === userId
    );

    const user = await User.findById(userId).select('enrolledCourses');
    const isEnrolledInUser = (user?.enrolledCourses || []).some(
      (cId) => cId.toString() === id
    );

    const payment = await Payment.findOne({
      course: id,
      $or: [{ client: userId }, { userId }],
      status: { $in: ['completed', 'released', 'held_in_escrow'] },
    });

    const hasAccess = Boolean(isEnrolledInCourse || isEnrolledInUser || payment);

    res.status(200).json({
      success: true,
      hasAccess,
      price: course.price,
      title: course.title,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createCourse,
  getCourses,
  getCoursesForAdmin,
  getCourseById,
  updateCourse,
  deleteCourse,
  enrollCourse,
  getExamQuestions,
  submitExam,
  getCourseLessons,
  checkCourseAccessStatus,
};
