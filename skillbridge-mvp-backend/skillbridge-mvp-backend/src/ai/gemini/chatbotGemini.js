const { getGeminiClient } = require('./geminiClient');
const Chatbot = require('../../models/Chatbot');

// استخدام موديل أحدث وأكثر استقراراً
const PRIMARY_MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-1.5-flash';
const FALLBACK_MODEL = 'gemini-1.5-pro'; // موديل احتياطي

const SYSTEM_INSTRUCTION = `
You are the official SkillBridge AI Assistant. SkillBridge is a freelancing and learning platform for university students.
Your knowledge is strictly limited to the SkillBridge platform context, which includes:
- Skills verification and CV analysis
- University student readiness and career paths
- Micro-gigs, freelance projects, and clients
- Learning paths and educational resources
- Squads (student teams working together)
- Payment processes within the platform
- Dispute resolution

CRITICAL RULES:
1. You MUST ONLY answer questions related to the SkillBridge platform context listed above.
2. If the user asks ANY question outside of this context (e.g., cooking recipes, general history, coding problems not related to platform skills, weather, etc.), you MUST reply exactly with this phrase: "I don't have this information in SkillBridge context". Do not try to be helpful or answer the question anyway.
3. Be friendly, concise, and professional.
4. Answer in Arabic by default unless the user speaks in English, but always adhere to rule #2.
`.trim();

// دالة انتظار (Sleep)
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// دالة إعادة المحاولة مع Exponential Backoff حتى مرتين (2 retries)
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

      console.warn(`[Chatbot Retry ${i + 1}/${maxRetries}] Overloaded/RateLimit, waiting ${delay}ms...`);
      await wait(delay);
      delay *= 2;
      delay += Math.floor(Math.random() * 400);
    }
  }
}

class ChatbotGemini {
  async getResponse(message, userId, sessionId) {
    try {
      const apiKey = (process.env.GEMINI_API_KEY || '').trim();
      if (!apiKey) {
        return {
          response: 'مرحباً بك في منصة SkillBridge! سيرفر المساعد الذكي يعمل حالياً بالوضع الاحتياطي.',
          intent: 'greeting',
          confidence: 100,
          isFallback: true,
        };
      }

      // 1. جلب أو إنشاء جلسة الشات
      let chatSession = await Chatbot.findOne({ userId, sessionId });
      if (!chatSession) {
        chatSession = new Chatbot({ userId, sessionId, messages: [], context: {} });
        await chatSession.save();
      }

      const history = (chatSession.messages || []).map((msg) => ({
        role: msg.role === 'bot' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);

      let botResponseText = '';

      // 2. المحاولة الأساسية مع Retry حتى مرتين
      try {
        botResponseText = await retryWithBackoff(async () => {
          const model = genAI.getGenerativeModel({
            model: PRIMARY_MODEL,
            systemInstruction: SYSTEM_INSTRUCTION,
          });
          const chat = model.startChat({ history });
          const result = await chat.sendMessage(message);
          return result.response.text();
        }, 2, 1000);
      } catch (primaryError) {
        console.warn(`Primary chatbot model (${PRIMARY_MODEL}) failed. Trying fallback (${FALLBACK_MODEL})...`, primaryError.message);

        // 3. المحاولة الاحتياطية (Fallback)
        try {
          botResponseText = await retryWithBackoff(async () => {
            const fallbackModel = genAI.getGenerativeModel({
              model: FALLBACK_MODEL,
              systemInstruction: SYSTEM_INSTRUCTION,
            });
            const chat = fallbackModel.startChat({ history });
            const result = await chat.sendMessage(message);
            return result.response.text();
          }, 2, 1500);
        } catch (fallbackError) {
          console.error('All chatbot models failed:', fallbackError.message);
          // 4. الرد النهائي في حالة الفشل التام بدون كراش
          return {
            response: 'عذراً، سيرفرات الذكاء الاصطناعي عليها ضغط شديد حالياً. يرجى المحاولة بعد قليل، أو استكشاف مسارات التعلم والمشاريع المتاحة.',
            intent: 'fallback',
            confidence: 0,
            isFallback: true,
          };
        }
      }

      // 5. تحديد النية (Intent)
      let intent = 'general';
      if (botResponseText.includes("I don't have this information in SkillBridge context")) {
        intent = 'out_of_context';
      }

      // 6. حفظ الرسائل في قاعدة البيانات
      chatSession.messages.push(
        { role: 'user', content: message, timestamp: new Date() },
        { role: 'bot', content: botResponseText, timestamp: new Date(), intent }
      );
      await chatSession.save();

      return { response: botResponseText, intent, confidence: 100 };

    } catch (error) {
      console.error('Gemini Real Error:', error);
      return {
        response: 'عذراً، حدث خطأ غير متوقع في معالجة طلبك. يرجى المحاولة لاحقاً.',
        intent: 'error',
        confidence: 0,
      };
    }
  }
}

module.exports = new ChatbotGemini();