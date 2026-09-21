const express = require('express');
const router = express.Router();
const {
  getDashboardSummary,
  toggleUserActive,
  getAdminStats,
  getAdminUsers,
  updateUserRole,
  getAdminTransactions,
} = require('../controllers/admin.controller');
const { protect, requireAdmin } = require('../middleware/auth');

// جميع راوتس الإدارة محمية بواسطة requireAdmin
router.use(protect, requireAdmin);

router.get('/stats', getAdminStats);
router.get('/users', getAdminUsers);
router.patch('/users/:id/role', updateUserRole);
router.put('/users/:id/role', updateUserRole);
router.get('/transactions', getAdminTransactions);
router.get('/dashboard', getDashboardSummary);
router.put('/users/:id/toggle-active', toggleUserActive);

module.exports = router;

