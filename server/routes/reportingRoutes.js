const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { checkReportsAccess } = require('../middleware/permissionMiddleware');
const { assignmentSummary, classPerformance, assignmentStudents, classStudentHistory, assignmentStudentAttempts, weeklyActiveUsers, sessionsByTemplate } = require('../controllers/reportingController');

router.use(protect, authorize('teacher', 'manager', 'admin', 'staff'), checkReportsAccess);

router.get('/assignments/:assignmentId/summary', assignmentSummary);
router.get('/assignments/:assignmentId/students', assignmentStudents);
router.get('/assignments/:assignmentId/students/:studentId/attempts', assignmentStudentAttempts);
router.get('/classes/:classId/performance', classPerformance);
router.get('/classes/:classId/students/:studentId/history', classStudentHistory);

// Analytics
router.get('/analytics/weekly-active-users', weeklyActiveUsers);
router.get('/analytics/sessions-by-template', sessionsByTemplate);

module.exports = router;
