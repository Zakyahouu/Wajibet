const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const {
  getAllVirtualLabs,
  getVirtualLabById,
  createVirtualLab,
  updateVirtualLab,
  deleteVirtualLab,
  getVirtualLabFile,
} = require('../controllers/virtualLabController');

const { protect, admin } = require('../middleware/authMiddleware');

const destDir = path.join(__dirname, '../public/virtual-labs/');
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, destDir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${Date.now()}-${base}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  if (file.mimetype === 'text/html') {
    cb(null, true);
  } else {
    cb(new Error('Only HTML files are allowed'), false);
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

router.route('/')
  .get(protect, getAllVirtualLabs)
  .post(protect, admin, upload.single('labFile'), createVirtualLab);

router.route('/file/:filename')
  .get(protect, getVirtualLabFile);

router.route('/:id')
  .get(protect, getVirtualLabById)
  .put(protect, admin, upload.single('labFile'), updateVirtualLab)
  .delete(protect, admin, deleteVirtualLab);

module.exports = router;
