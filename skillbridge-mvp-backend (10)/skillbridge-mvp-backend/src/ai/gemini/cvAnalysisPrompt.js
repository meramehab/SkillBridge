// الـ prompt والـ schema المستخدمين لتحليل الـ CV بـ Gemini

const createCVAnalysisPrompt = (cvText) => {
  return `
You are a CV information extraction system for SkillBridge.
Instructions:
- Extract information supported by the CV.
- Infer a 'targetRole' based on the CV content.
- Extract 'technicalSkills' and 'softSkills' explicitly.
- Calculate a 'careerReadinessScore' from 0 to 100 based on how well the CV is written and the skills match a professional level.
- Identify 'missingSkills' that the user should learn to improve their career readiness for the target role.
- Provide a 'suggestedLearningPath' where each item has a 'skill' (from missingSkills) and a 'resourceSuggestion' (e.g., a known course name).
- Provide 'cvSuggestions' to improve the resume format or content.
- Ensure the output strictly matches the JSON schema.
- Do not include markdown in the output.
CV text:
"""
${cvText}
"""
  `.trim();
};

const cvAnalysisSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'targetRole',
    'technicalSkills',
    'softSkills',
    'careerReadinessScore',
    'missingSkills',
    'suggestedLearningPath',
    'cvSuggestions'
  ],
  properties: {
    targetRole: { type: 'string' },
    technicalSkills: { type: 'array', items: { type: 'string' } },
    softSkills: { type: 'array', items: { type: 'string' } },
    careerReadinessScore: { type: 'number' },
    missingSkills: { type: 'array', items: { type: 'string' } },
    suggestedLearningPath: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['skill', 'resourceSuggestion'],
        properties: {
          skill: { type: 'string' },
          resourceSuggestion: { type: 'string' },
        },
      },
    },
    cvSuggestions: { type: 'array', items: { type: 'string' } },
    personalInfo: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'email', 'phone', 'location'],
      properties: {
        name: { type: ['string', 'null'] },
        email: { type: ['string', 'null'] },
        phone: { type: ['string', 'null'] },
        location: { type: ['string', 'null'] },
      },
    },
    education: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['institution', 'degree', 'field', 'startDate', 'endDate'],
        properties: {
          institution: { type: 'string' },
          degree: { type: ['string', 'null'] },
          field: { type: ['string', 'null'] },
          startDate: { type: ['string', 'null'] },
          endDate: { type: ['string', 'null'] },
        },
      },
    },
    experience: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['company', 'role', 'startDate', 'endDate', 'description'],
        properties: {
          company: { type: 'string' },
          role: { type: 'string' },
          startDate: { type: ['string', 'null'] },
          endDate: { type: ['string', 'null'] },
          description: { type: ['string', 'null'] },
        },
      },
    },
    projects: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'description', 'technologies'],
        properties: {
          name: { type: 'string' },
          description: { type: ['string', 'null'] },
          technologies: { type: 'array', items: { type: 'string' } },
        },
      },
    }
  },
};

module.exports = { createCVAnalysisPrompt, cvAnalysisSchema };
