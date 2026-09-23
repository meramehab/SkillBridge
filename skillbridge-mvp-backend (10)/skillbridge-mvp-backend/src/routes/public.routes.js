const express = require('express');
const router = express.Router();
const analyticsService = require('../services/analytics.service');
const User = require('../models/User');
const Project = require('../models/Project');

router.get('/stats', async (req, res) => {
  try {
    const overview = await analyticsService.getPlatformOverview();
    const topSkills = await analyticsService.getTopSkillsInDemand(5);
    
    // Fetch only non-sensitive data for top students and featured projects
    const topStudents = await User.find({ role: 'student' })
      .select('fullName university faculty careerReadinessScore')
      .sort({ careerReadinessScore: -1 })
      .limit(2);
      
    res.status(200).json({
      success: true,
      data: {
        totalStudents: overview.users.students,
        completedProjects: overview.projects.completed,
        partnerUniversities: 27, // Static fallback as no university model exists
        totalEarningsEGP: overview.revenue.totalVolume,
        topSkillsInDemand: topSkills.map(s => s.skill),
        topStudents: topStudents.map(student => ({
          name: student.fullName,
          university: student.university || 'N/A',
          faculty: student.faculty || 'N/A',
          xp: (student.careerReadinessScore || 0) * 10
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
