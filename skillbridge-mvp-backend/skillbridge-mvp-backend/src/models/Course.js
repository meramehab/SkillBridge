const mongoose = require('mongoose');

// كورس في كتالوج المنصة - الإدارة بتضيفه، والطلاب يقدروا يستعرضوه ويضيفوه لمسار تعلمهم
const courseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    skill: { type: String, required: true, trim: true }, // المهارة اللي الكورس بيغطيها

    level: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner',
    },

    provider: { type: String, default: '' }, // اسم الجهة (يوديمي، كورسيرا، داخلي...)
    url: { type: String, default: '' }, // رابط الكورس (اختياري)

    durationHours: { type: Number, default: 0 },
    price: { type: Number, required: true, min: 1 }, // بالجنيه المصري - required and non-zero

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // قائمة الدروس ومحتواها
    lessons: [
      {
        title: { type: String, required: true, trim: true },
        description: { type: String, default: '' },
        durationMinutes: { type: Number, default: 15 },
        videoUrl: { type: String, default: '' },
        contentMarkdown: { type: String, default: '' },
        isFreePreview: { type: Boolean, default: false },
      },
    ],

    // الطلاب المسجلين في هذا الكورس
    enrolledStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // أسئلة اختبار الكورس - الإدارة بس اللي تضيفها/تعدّلها
    questions: [
      {
        questionText: { type: String, required: true },
        options: { type: [String], required: true },
        correctOptionIndex: { type: Number, required: true },
      },
    ],

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Course', courseSchema);
