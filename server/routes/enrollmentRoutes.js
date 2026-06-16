const express = require('express');
const router = express.Router();
const {
  getEnrollments,
  getStudentEnrollments,
  getClassEnrollments,
  createEnrollment,
  updateEnrollment,
  deleteEnrollment,
  recordAttendance,
  getAvailableClasses,
  getEnrollmentSummary,
  getClassEnrollmentSummaries,
} = require('../controllers/enrollmentController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { checkStudentsAccess } = require('../middleware/permissionMiddleware');
const Enrollment = require('../models/Enrollment');
const Attendance = require('../models/Attendance');
const asyncHandler = require('express-async-handler');

// Apply auth to all routes
router.use(protect);

// Routes
router.route('/')
  .get(authorize('manager', 'staff'), checkStudentsAccess, getEnrollments)
  .post(authorize('manager'), createEnrollment);

router.route('/available-classes')
  .get(authorize('manager', 'staff'), checkStudentsAccess, getAvailableClasses);

router.route('/student/:studentId')
  .get(authorize('manager', 'staff', 'student'), checkStudentsAccess, getStudentEnrollments);

router.route('/class/:classId')
  .get(authorize('manager', 'staff'), checkStudentsAccess, getClassEnrollments);

router.route('/:id/summary')
  .get(authorize('manager', 'staff', 'student'), checkStudentsAccess, getEnrollmentSummary);

router.route('/class/:classId/summaries')
  .get(authorize('manager', 'staff'), checkStudentsAccess, getClassEnrollmentSummaries);

router.route('/:id')
  .put(authorize('manager'), updateEnrollment)
  .delete(authorize('manager'), deleteEnrollment);

router.route('/:id/attendance')
  .post(authorize('manager', 'staff'), checkStudentsAccess, recordAttendance);

// (history moved to /api/attendance/history)

module.exports = router;
