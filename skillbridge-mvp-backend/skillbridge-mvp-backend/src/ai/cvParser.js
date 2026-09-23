const fs = require('fs');
const pdfParse = require('pdf-parse');

// قائمة مهارات مرجعية بسيطة نقارن بيها نص الـ CV - MVP (من غير أي API مدفوع)
// ممكن توسعها براحتك لاحقًا
const SKILLS_DB = [
  'javascript', 'typescript', 'node.js', 'nodejs', 'express', 'react', 'next.js',
  'vue', 'angular', 'mongodb', 'mongoose', 'postgresql', 'mysql', 'sql',
  'python', 'django', 'flask', 'java', 'spring', 'php', 'laravel',
  'html', 'css', 'tailwind', 'bootstrap', 'git', 'docker', 'kubernetes',
  'aws', 'firebase', 'rest api', 'graphql', 'jwt', 'redux', 'testing',
  'figma', 'ui/ux', 'machine learning', 'data analysis', 'c++', 'c#', '.net',
];

// استخراج النص من ملف PDF مع معالجة آمنة لأخطاء XRef المعقدة
const extractTextFromPDF = async (fileInput) => {
  try {
    let dataBuffer;
    if (Buffer.isBuffer(fileInput)) {
      dataBuffer = fileInput;
    } else {
      if (!fs.existsSync(fileInput)) {
        return '';
      }
      dataBuffer = fs.readFileSync(fileInput);
    }
    if (!dataBuffer || dataBuffer.length === 0) {
      return '';
    }

    // محاولة تحليل PDF أولاً باستخدام خيارات آمنة تتجاوز أخطاء الـ XRef
    try {
      const options = {
        max: 0,
        pagerender: function (pageData) {
          return pageData.getTextContent({
            normalizeWhitespace: true,
            disableCombineTextItems: false,
          }).then(function (textContent) {
            let lastY, text = '';
            for (let item of textContent.items) {
              if (lastY == item.transform[5] || !lastY) text += item.str;
              else text += '\n' + item.str;
              lastY = item.transform[5];
            }
            return text;
          }).catch(() => '');
        },
      };
      const data = await pdfParse(dataBuffer, options);
      if (data && data.text && data.text.trim().length > 20) {
        return data.text.trim();
      }
    } catch (parseErr) {
      console.warn('Standard pdf-parse failed with XRef issue, using fallback text extractor:', parseErr.message);
    }

    // في حالة فشل pdf-parse (مثل bad XRef entry)، نستخرج النصوص المقروءة مباشرة من الـ Buffer
    const bufferString = dataBuffer.toString('latin1');
    const textMatches = bufferString.match(/[(]([\s\S]*?)[)]\s*T[jJ]/g) || [];
    let extractedWords = textMatches
      .map(m => m.replace(/^[(\s]+|[)\s\w]*$/g, ''))
      .filter(w => w.length > 1)
      .join(' ');

    if (!extractedWords || extractedWords.length < 20) {
      // استخراج عام للكلمات المعتادة
      const rawPrintable = bufferString.replace(/[^\x20-\x7E\u0600-\u06FF\n]/g, ' ');
      extractedWords = rawPrintable
        .split(/\s+/)
        .filter(w => w.length > 2 && !w.startsWith('/') && !w.startsWith('%'))
        .slice(0, 500)
        .join(' ');
    }

    return extractedWords || 'Document content extracted from PDF buffer.';
  } catch (error) {
    console.error('PDF Parsing Critical Fallback:', error.message);
    return 'Document text extraction fallback.';
  }
};

// Skill Extraction from CV - استخراج المهارات بمطابقة كلمات مفتاحية بسيطة
const extractSkillsFromText = (text) => {
  const lowerText = text.toLowerCase();
  const foundSkills = SKILLS_DB.filter((skill) => lowerText.includes(skill));
  return [...new Set(foundSkills)];
};

// Missing Skills Detection - بمقارنة مهارات الطالب بمهارات مطلوبة لمسار معين
const detectMissingSkills = (studentSkills, requiredSkills) => {
  const studentSet = new Set(studentSkills.map((s) => s.toLowerCase()));
  return requiredSkills.filter((skill) => !studentSet.has(skill.toLowerCase()));
};

// Career Readiness Score - نسبة بسيطة بناءً على عدد المهارات المطابقة لمسار مستهدف
const calculateCareerReadinessScore = (studentSkills, targetPathSkills) => {
  if (!targetPathSkills || targetPathSkills.length === 0) return 0;
  const studentSet = new Set(studentSkills.map((s) => s.toLowerCase()));
  const matched = targetPathSkills.filter((s) => studentSet.has(s.toLowerCase()));
  return Math.round((matched.length / targetPathSkills.length) * 100);
};

// Personalized Learning Path - اقتراح مصادر تعلم بسيطة للمهارات الناقصة
const LEARNING_RESOURCES = {
  javascript: 'freeCodeCamp - JavaScript Algorithms and Data Structures',
  react: 'React Official Docs + Scrimba React Course',
  'node.js': 'Node.js - The Complete Guide (Udemy)',
  mongodb: 'MongoDB University - M001 Basics',
  python: 'CS50P - Introduction to Programming with Python',
  sql: 'SQLBolt - Interactive SQL Tutorial',
  git: 'Git & GitHub Crash Course',
};

const buildLearningPath = (missingSkills) => {
  return missingSkills.map((skill) => ({
    skill,
    resourceSuggestion: LEARNING_RESOURCES[skill.toLowerCase()] || `ابحث عن كورس مقدمة في ${skill}`,
  }));
};

// تحليل شامل لملف CV: بيرجع كل النتائج مرة واحدة
const analyzeCV = async (filePath, targetPathSkills = []) => {
  const rawText = await extractTextFromPDF(filePath);
  const extractedSkills = extractSkillsFromText(rawText);
  const missingSkills = detectMissingSkills(extractedSkills, targetPathSkills);
  const careerReadinessScore = calculateCareerReadinessScore(extractedSkills, targetPathSkills);
  const suggestedLearningPath = buildLearningPath(missingSkills);

  return {
    rawText,
    extractedSkills,
    missingSkills,
    careerReadinessScore,
    suggestedLearningPath,
  };
};

module.exports = {
  extractTextFromPDF,
  extractSkillsFromText,
  detectMissingSkills,
  calculateCareerReadinessScore,
  buildLearningPath,
  analyzeCV,
};
