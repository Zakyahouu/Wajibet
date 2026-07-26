const express = require('express');
const router = express.Router();
const { saveProgress, getProgress } = require('../controllers/gameProgressController');
const { protect } = require('../middleware/authMiddleware');

router.post('/', protect, saveProgress);
router.get('/:assignmentId/:gameCreationId', protect, getProgress);

module.exports = router;
