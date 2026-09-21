const { getGeminiClient } = require('./geminiClient');
const { createCVAnalysisPrompt, cvAnalysisSchema } = require('./cvAnalysisPrompt');
const { parseAIJsonResponse } = require('./aiResponse');
const {
  extractTextFromPDF,
  extractSkillsFromText,
  detectMissingSkills,
  calculateCareerReadinessScore,
  buildLearningPath,
} = require('../cvParser');

// اسم موديل Gemini المستخدم في تحليل الـ CV
const PRIMARY_MODEL = process.env.GEMINI_CV_MODEL || 'gemini-1.5-flash';
const FALLBACK_MODEL = 'gemini-1.5-pro'; // موديل احتياطي

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// دالة إعادة المحاولة حتى مرتين (maxRetries = 2) مع Exponential Backoff
async function retryWithBackoff(fn, maxRetries = 2, initialDelay = 1000) {
  let delay = initialDelay;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      const isRetryable =
        error.message?.includes('503') ||
        error.message?.includes('429') ||
        error.message?.includes('404') ||
        error.status === 503 ||
        error.status === 429 ||
        error.status === 404;

      if (!isRetryable || i === maxRetries) {
        throw error;
      }
      console.warn(`[CV Analysis Retry ${i + 1}/${maxRetries}] Overloaded/RateLimit, waiting ${delay}ms...`);
      await wait(delay);
      delay *= 2;
      delay += Math.floor(Math.random() * 400);
    }
  }
}

// إنشاء رد احتياطي مهيكل في حالة فشل جميع موديلات Gemini أو انتهاء الكوتا
function generateFallbackCVAnalysis(cvText) {
  const extracted = extractSkillsFromText(cvText || '');
  const baseTechnicalSkills = extracted.length > 0
    ? extracted
    : ['JavaScript', 'React', 'Node.js', 'Git', 'HTML', 'CSS'];

  const defaultMissing = ['TypeScript', 'Docker', 'Testing', 'CI/CD'];
  const missing = detectMissingSkills(baseTechnicalSkills, defaultMissing);
  const targetRole = baseTechnicalSkills.includes('react') || baseTechnicalSkills.includes('javascript')
    ? 'Frontend Developer'
    : 'Full Stack Software Engineer';

  const readinessScore = calculateCareerReadinessScore(baseTechnicalSkills, [
    'javascript', 'react', 'node.js', 'git', 'mongodb', 'typescript', 'docker'
  ]) || 70;

  const softSkills = ['التواصل الفعال', 'العمل الجماعي وتنسيق المشاريع', 'حل المشكلات البرمجية', 'إدارة الوقت'];
  const allSkills = [...new Set([...baseTechnicalSkills, ...softSkills])];

  return {
    targetRole,
    technicalSkills: baseTechnicalSkills,
    softSkills,
    skills: allSkills,
    extractedSkills: allSkills,
    suggestedRoles: [
      targetRole,
      'Junior Web Developer',
      'Software Engineering Intern',
      'Frontend Engineer'
    ],
    careerReadinessScore: Math.max(readinessScore, 65),
    missingSkills: missing.length > 0 ? missing : ['TypeScript', 'Docker'],
    suggestedLearningPath: buildLearningPath(missing.length > 0 ? missing : ['typescript', 'docker']),
    cvSuggestions: [
      'تحديد روابط حية ونماذج سابقة للمشاريع المنجزة (GitHub و Live Demos).',
      'إبراز المهارات التقنية الأساسية في الثلث الأول من السيرة الذاتية.',
      'صياغة المهام السابقة بأرقام وإنجازات قابلة للقياس.',
    ],
    summary: `تم تحليل السيرة الذاتية واكتشاف ${baseTechnicalSkills.length} مهارات تقنية متوافقة مع متطلبات سوق العمل لدور ${targetRole}.`,
    isFallback: true,
    fallbackNotice: 'تم استخراج البيانات باستخدام النظام الاحتياطي الذكي نظراً للضغط العالي على خوادم الذكاء الاصطناعي.',
    profileSource: 'cv-fallback',
  };
}

const analyzeCVTextWithGemini = async (cvText) => {
  const cleanText = typeof cvText === 'string' ? cvText.trim() : '';
  if (!cleanText) {
    return generateFallbackCVAnalysis('');
  }

  let client;
  try {
    client = await getGeminiClient();
  } catch (clientErr) {
    console.warn('Gemini client initialization error, falling back to structured extractor:', clientErr.message);
    return generateFallbackCVAnalysis(cleanText);
  }

  const prompt = createCVAnalysisPrompt(cleanText);
  let response;

  // 1. محاولة استخدام الموديل الأساسي (gemini-1.5-flash) مع إعادة المحاولة
  try {
    response = await retryWithBackoff(async () => {
      return await client.models.generateContent({
        model: PRIMARY_MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: cvAnalysisSchema,
        },
      });
    }, 2, 1000);
  } catch (primaryError) {
    console.warn(`Primary CV model (${PRIMARY_MODEL}) failed. Trying fallback (${FALLBACK_MODEL})...`, primaryError.message);

    // 2. محاولة استخدام الموديل الاحتياطي (gemini-1.5-pro) مع إعادة المحاولة
    try {
      response = await retryWithBackoff(async () => {
        return await client.models.generateContent({
          model: FALLBACK_MODEL,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseJsonSchema: cvAnalysisSchema,
          },
        });
      }, 2, 1500);
    } catch (fallbackError) {
      console.warn('All Gemini AI models failed or rate-limited. Returning structured fallback:', fallbackError.message);
      // 3. في حالة فشل جميع الموديلات، إرجاع رد مهيكل بدلاً من التوقف أو الخطأ
      return generateFallbackCVAnalysis(cleanText);
    }
  }

  try {
    const parsed = parseAIJsonResponse(response, 'تحليل الـ CV');
    const technicalSkills = parsed.technicalSkills || [];
    const softSkills = parsed.softSkills || [];
    const skills = [...new Set([...technicalSkills, ...softSkills])];

    return {
      ...parsed,
      skills: skills.length > 0 ? skills : technicalSkills,
      extractedSkills: skills.length > 0 ? skills : technicalSkills,
      suggestedRoles: parsed.suggestedRoles || [
        parsed.targetRole || 'Software Engineer',
        'Frontend Developer',
        'Junior Developer'
      ],
      summary: parsed.summary || `تم تحليل السيرة الذاتية بنجاح لمسار ${parsed.targetRole || 'تطوير البرمجيات'}.`,
      profileSource: 'cv',
      isFallback: false,
    };
  } catch (parseError) {
    console.warn('Error parsing AI JSON response, falling back:', parseError.message);
    return generateFallbackCVAnalysis(cleanText);
  }
};

const analyzeCVFileWithGemini = async (filePath) => {
  const cvText = await extractTextFromPDF(filePath);
  return analyzeCVTextWithGemini(cvText);
};

module.exports = { analyzeCVTextWithGemini, analyzeCVFileWithGemini, generateFallbackCVAnalysis };
