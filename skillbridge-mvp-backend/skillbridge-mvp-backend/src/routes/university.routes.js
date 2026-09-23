const express = require('express');
const router = express.Router();
const multer = require('multer');

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('يرجى رفع صورة صالحة (JPEG, PNG).'), false);
    }
  }
});
const {
  submitVerification,
  reviewVerification,
  getPendingVerifications,
} = require('../controllers/university.controller');
const { protect, authorize } = require('../middleware/auth');

router.post('/verify', protect, submitVerification);
router.get('/pending', protect, authorize('admin'), getPendingVerifications);
router.put('/:id/review', protect, authorize('admin'), reviewVerification);

router.post('/upload-id', protect, upload.single('studentCardImage'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'يرجى رفع صورة الكارنيه الجامعي' });
    }
    
    // Simulate OCR processing since no OCR backend service exists
    res.status(200).json({
      success: true,
      data: {
        studentIdNumber: "2023" + Math.floor(1000 + Math.random() * 9000),
        extractedUniversity: "جامعة القاهرة",
        extractedFaculty: "حاسبات ومعلومات",
        documentUrl: "memory-upload" // Mock URL for compatibility
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
