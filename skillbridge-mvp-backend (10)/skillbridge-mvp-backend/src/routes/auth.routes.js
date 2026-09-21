const express = require('express');
const router = express.Router();
const { register, login, logout } = require('../controllers/auth.controller');

const { authLimiter } = require('../middleware/security');

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/logout', logout);

module.exports = router;
