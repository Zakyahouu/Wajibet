// server/routes/employeeRoutes.js

const express = require('express');
const router = express.Router();
const {
  createEmployee,
  getEmployees,
  getEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeSalaryHistory,
  payEmployeeSalary,
  getSalarySummary,
  getEmployeeByUsername,
  getEmployeeByUserId
} = require('../controllers/employeeController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { checkEmployeesAccess } = require('../middleware/permissionMiddleware');

// All routes are protected
router.use(protect);

// @route   POST /api/employees
// @desc    Create a new employee
// @access  Private (Manager)
router.post('/', authorize('manager'), createEmployee);

// @route   GET /api/employees
// @desc    Get all employees for a school
// @access  Private (Manager)
router.get('/', authorize('manager', 'staff'), getEmployees);

// @route   GET /api/employees/:id
// @desc    Get employee by ID
// @access  Private (Manager)
router.get('/:id', authorize('manager', 'staff'), getEmployee);

// @route   PUT /api/employees/:id
// @desc    Update employee
// @access  Private (Manager)
router.put('/:id', authorize('manager', 'staff'), checkEmployeesAccess, updateEmployee);

// @route   DELETE /api/employees/:id
// @desc    Delete employee (archive)
// @access  Private (Manager)
router.delete('/:id', authorize('manager', 'staff'), checkEmployeesAccess, deleteEmployee);

// @route   GET /api/employees/:id/salary
// @desc    Get employee salary history
// @access  Private (Manager)
router.get('/:id/salary', authorize('manager', 'staff'), checkEmployeesAccess, getEmployeeSalaryHistory);

// @route   POST /api/employees/:id/pay
// @desc    Pay employee salary
// @access  Private (Manager)
router.post('/:id/pay', authorize('manager', 'staff'), checkEmployeesAccess, payEmployeeSalary);

// @route   GET /api/employees/salary-summary/:schoolId/:year/:month
// @desc    Get salary summary for a month
// @access  Private (Manager)
router.get('/salary-summary/:schoolId/:year/:month', authorize('manager', 'staff'), checkEmployeesAccess, getSalarySummary);

// @route   GET /api/employees/by-username/:username
// @desc    Get employee by username (for staff users to check their permissions)
// @access  Private (Staff)
router.get('/by-username/:username', authorize('staff'), getEmployeeByUsername);

// @route   GET /api/employees/by-user/:userId
// @desc    Get employee by user ID (for staff users to check their permissions)
// @access  Private (Staff)
router.get('/by-user/:userId', authorize('staff'), getEmployeeByUserId);

module.exports = router;