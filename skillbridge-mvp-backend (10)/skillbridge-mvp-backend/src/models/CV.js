const mongoose = require('mongoose');

// الملف الشخصي الموثق - نتيجة تحليل الـ CV (Member1 AI)
const cvSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    originalFileUrl: { type: String, required: true },
    rawText: { type: String, default: '' }, // النص المستخرج من الملف

    targetRole: { type: String, default: '' },
    technicalSkills: [{ type: String }],
    softSkills: [{ type: String }],
    extractedSkills: [{ type: String }], // Keeping for backwards compatibility
    missingSkills: [{ type: String }], // Missing Skills Detection

    careerReadinessScore: { type: Number, default: 0 }, // Career Readiness Score
    cvSuggestions: [{ type: String }], // Suggestions for improving the CV

    // Personalized Learning Path
    suggestedLearningPath: [
      {
        skill: { type: String },
        resourceSuggestion: { type: String }, // مثلاً: اسم كورس مقترح
      },
    ],

    parsedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CV', cvSchema);
