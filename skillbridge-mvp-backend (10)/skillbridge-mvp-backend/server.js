require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const authRoutes = require('./src/routes/auth.routes');
const userRoutes = require('./src/routes/user.routes');
const projectRoutes = require('./src/routes/project.routes');
const paymentRoutes = require('./src/routes/payment.routes');
const universityRoutes = require('./src/routes/university.routes');
const squadRoutes = require('./src/routes/squad.routes');
const disputeRoutes = require('./src/routes/dispute.routes');
const leaderboardRoutes = require('./src/routes/leaderboard.routes');
const notificationsRoutes = require('./src/routes/notifications.routes');
const aiRoutes = require('./src/routes/ai.routes');

// راوتس إضافية
const adminRoutes = require('./src/routes/admin.routes');
const analyticsRoutes = require('./src/routes/analytics.routes');
const studentDashboardRoutes = require('./src/routes/studentDashboard.routes');
const marketplaceRoutes = require('./src/routes/marketplace.routes');
const learningPathRoutes = require('./src/routes/learningPath.routes');
const communityRoutes = require('./src/routes/community.routes');
const courseRoutes = require('./src/routes/course.routes');

const { sanitizeInputs } = require('./src/middleware/security');

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173'];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sanitizeInputs);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/university', universityRoutes);
app.use('/api/squads', squadRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/public', require('./src/routes/public.routes'));

// راوتس إضافية
app.use('/api/admin', adminRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/student-dashboard', studentDashboardRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/learning-path', learningPathRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/courses', courseRoutes);

app.get('/', (req, res) => {
  res.json({ success: true, message: 'SkillBridge MVP Backend شغال ✅' });
});

// Error handler عام (fallback)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'حصل خطأ في السيرفر' });
});

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ متصل بقاعدة البيانات');
    app.listen(PORT, () => console.log(`🚀 السيرفر شغال على بورت ${PORT}`));
  })
  .catch((err) => {
    console.error('❌ فشل الاتصال بقاعدة البيانات:', err.message);
    process.exit(1);
  });
