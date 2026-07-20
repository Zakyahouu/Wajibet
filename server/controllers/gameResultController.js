// server/controllers/gameResultController.js

const GameResult = require('../models/GameResult');
const Assignment = require('../models/Assignment');
const User = require('../models/User');
const GameCreation = require('../models/GameCreation');
const LiveSession = require('../models/LiveSession');
const Enrollment = require('../models/Enrollment');
// Legacy global badge system removed
const { evaluateTemplateBadgeForResult } = require('./templateBadgeController');
const { checkCanAttempt } = require('../services/attemptGate');
const { computeStudentStats, computeGameGlobalStats } = require('../services/gameStatsService');

// In-memory TTL cache for global stats aggregations
const globalStatsCache = new Map();
const STATS_CACHE_TTL_MS = 30000; // 30 seconds

// Tier 0 contract validation — validates each answer in the answers array
const TIER_0_FIELDS = [
  { key: 'itemId',        type: 'string' },
  { key: 'itemIndex',     type: 'number' },
  { key: 'type',          type: 'string' },
  { key: 'isCorrect',     type: 'boolean' },
  { key: 'userAnswer',    required: true }, // Mixed — just check presence
  { key: 'correctAnswer', required: true }, // Mixed — just check presence
  { key: 'score',         type: 'number' },
  { key: 'maxScore',      type: 'number' },
  { key: 'timeMs',        type: 'number' },
  { key: 'attempts',      type: 'number' },
  { key: 'skipped',       type: 'boolean' },
];

/**
 * Validate an answers array against the Tier 0 contract.
 * Returns { valid: true } or { valid: false, violations: [...] }
 */
const validateAnswersContract = (answers) => {
  if (!Array.isArray(answers)) return { valid: true }; // no answers to validate

  const violations = [];

  answers.forEach((answer, idx) => {
    if (!answer || typeof answer !== 'object') {
      violations.push({ index: idx, field: '(entire item)', reason: 'Not an object' });
      return;
    }

    TIER_0_FIELDS.forEach(field => {
      const val = answer[field.key];

      // Check presence
      if (val === undefined || val === null) {
        violations.push({ index: idx, field: field.key, reason: 'Missing required field' });
        return;
      }

      // Check type (if specified)
      if (field.type && typeof val !== field.type) {
        violations.push({
          index: idx,
          field: field.key,
          reason: `Expected ${field.type}, got ${typeof val}`,
        });
      }
    });
  });

  return violations.length === 0
    ? { valid: true }
    : { valid: false, violations };
};

// @desc    Submit a result for a game
// @route   POST /api/results
// @access  Private/Student
const submitGameResult = async (req, res) => {
  try {
  const { gameCreationId, score, totalPossibleScore, assignmentId, answers, liveSessionId: liveSessionIdFromBody } = req.body;
  const studentId = req.user._id;

  // v2 SDK payloads may omit totalPossibleScore; derive it from the Tier 0 answers'
  // maxScore so a valid submission is never rejected for a missing legacy field.
  let resolvedTotalPossibleScore = totalPossibleScore;
  if (resolvedTotalPossibleScore === undefined && Array.isArray(answers)) {
    const derived = answers.reduce((sum, a) => sum + (Number(a && a.maxScore) || 0), 0);
    if (derived > 0) resolvedTotalPossibleScore = derived;
  }

    if (!gameCreationId || score === undefined || resolvedTotalPossibleScore === undefined) {
      return res.status(400).json({ message: 'Missing required result data.' });
    }

  // Load creation to read policy/xp snapshot
  const creation = await GameCreation.findById(gameCreationId).populate('template');
  if (!creation) return res.status(404).json({ message: 'Game creation not found.' });

  // If this is a teacher/admin test run, don't persist or require assignment.
  // Do not trust a student-provided isTest flag; students must pass assignment/live validation.
  if (req.user.role && req.user.role !== 'student') {
    return res.status(201).json({
      message: 'Test run received (not recorded).',
      counted: false,
      isTest: true,
    });
  }

  // Detect live session context (either explicit liveSessionId in body or via in-room header)
  let liveSessionId = liveSessionIdFromBody || null;
  if (!liveSessionId) {
    const hintedCode = req.headers['x-live-room'];
    try {
      if (hintedCode && req.liveGames && req.liveGames[hintedCode]) {
        liveSessionId = req.liveGames[hintedCode].sessionId || null;
      }
    } catch {}
  }

  let assignment;
    if (assignmentId) {
      assignment = await Assignment.findOne({ _id: assignmentId, gameCreations: gameCreationId });
    } else if (!liveSessionId) {
      // Fallback: any assignment referencing this game for this student either explicitly or via class membership
      const Class = require('../models/Class');
      const myClasses = await Class.find({ 'enrolledStudents.studentId': studentId }).select('_id');
      const myClassIds = myClasses.map(c => c._id.toString());
      assignment = await Assignment.findOne({
        gameCreations: gameCreationId,
        $or: [ { students: studentId }, { classes: { $in: myClassIds } } ]
      });
    }

	  // If no assignment, allow only verified live session submissions (store as live-only, no XP)
    if (!assignment && !liveSessionId) {
      return res.status(404).json({ message: 'No active assignment found for this game.' });
    }

    if (!assignment && liveSessionId) {
      const session = await LiveSession.findById(liveSessionId).select('gameCreationId classes status').lean();
      if (!session || String(session.gameCreationId) !== String(gameCreationId) || session.status === 'ended') {
        return res.status(403).json({ message: 'Not allowed to submit for this live session.' });
      }

      if (Array.isArray(session.classes) && session.classes.length > 0) {
        const enrollment = await Enrollment.findOne({
          studentId,
          classId: { $in: session.classes },
          status: 'active'
        }).select('_id').lean();

        if (!enrollment) {
          return res.status(403).json({ message: 'Student is not enrolled in this live session.' });
        }
      }
    }

    // Centralized gate
  // Skip gate for pure live submissions (no assignment)
  const gate = assignment ? await checkCanAttempt({ assignment, studentId, gameId: gameCreationId }) : { allow: true, attemptNumber: 1, attemptLimit: 1, attemptsRemaining: 1 };
    if (!gate.allow) {
      // Map gate.reason to consistent HTTP status + message
      const status = gate.reason === 'attempt_limit' ? 400 : 403;
      const reasonMessages = {
        canceled: 'This assignment has been canceled.',
        assignment_completed: 'This assignment is completed.',
        time_window: 'This assignment is not yet active.',
        attempt_limit: 'Attempt limit reached for this assignment.',
      };
      return res.status(status).json({
        message: reasonMessages[gate.reason] || 'Not allowed to submit result.',
        reason: gate.reason,
        attemptNumber: gate.attemptNumber,
        attemptLimit: gate.attemptLimit,
        attemptsRemaining: gate.attemptsRemaining,
      });
    }

    const attemptNumber = gate.attemptNumber;

  // Determine counted based on creation policy (first_only) and if a prior counted exists
  const priorCounted = assignment ? await GameResult.findOne({
    student: studentId,
    gameCreation: gameCreationId,
    assignment: assignment._id,
    counted: true,
  }).select('_id').lean() : null;
  const hasCounted = !!priorCounted;
  const firstOnly = (creation.attemptPolicy || 'first_only') === 'first_only';
  // Live submissions are always counted for the live leaderboard; they don't affect assignments when none
  const counted = assignment ? (firstOnly ? !hasCounted : true) : true;

  // Determine if this is a test run (teacher/admin/hotspot) - trusted over client flag
  const isTest = req.user.role !== 'student';

    // XP policy
    let xpAwarded = 0;
  if (!isTest && counted && assignment) {
      // assignment mode: honor creation.xp.assignment
      const xpConf = creation.xp?.assignment || { enabled: true, amount: 0, firstAttemptOnly: true };
      if (xpConf.enabled) xpAwarded = Number(xpConf.amount || 0);
    }

  // --- Tier 0 Contract Validation ---
  let statsIncomplete = false;
  if (Array.isArray(answers) && answers.length > 0) {
    const validation = validateAnswersContract(answers);
    if (!validation.valid) {
      if (process.env.NODE_ENV !== 'production') {
        // FAIL-LOUD: reject the payload in dev/staging
        const firstViolation = validation.violations[0];
        return res.status(400).json({
          message: `Contract violation at answers[${firstViolation.index}].${firstViolation.field}: ${firstViolation.reason}`,
          violations: validation.violations,
        });
      } else {
        // FAIL-SOFT: log and flag, but let the save proceed
        console.warn(`[gameResult] Contract violation for gameCreation=${gameCreationId} student=${studentId}:`,
          JSON.stringify(validation.violations.slice(0, 5)));
        statsIncomplete = true;
      }
    }
  }

  const gameResult = await GameResult.create({
      student: studentId,
      gameCreation: gameCreationId,
      assignment: assignment ? assignment._id : undefined,
      liveSessionId: liveSessionId || undefined,
      score,
      totalPossibleScore: resolvedTotalPossibleScore,
      attemptNumber,
      counted,
      isTest,
      xpAwarded,
      answers: Array.isArray(answers) ? answers.slice(0, 1000) : undefined,
      totalTimeMs: req.body.totalTimeMs || undefined,
      finalScore: req.body.finalScore || undefined,
      statsSchemaVersion: req.body.statsSchemaVersion || 1,
      statsIncomplete,
    });

  // Invalidate the cache entry for this game creation
  globalStatsCache.delete(gameCreationId.toString());

    // --- Update student's XP and points ---
  const percentage = resolvedTotalPossibleScore > 0 ? Math.round((score / resolvedTotalPossibleScore) * 100) : 0;
  const pointsEarned = score; // raw score as points

    const user = await User.findById(studentId);
  if (user) {
      // Only add xpAwarded, not percentage-based anymore
      user.xp = (user.xp || 0) + (xpAwarded || 0);
      user.totalPoints = (user.totalPoints || 0) + pointsEarned;

      // Simple level-up: every 500 XP -> +1 level
      const newLevel = 1 + Math.floor((user.xp || 0) / 500);
      user.level = Math.max(user.level || 1, newLevel);
      await user.save();
    }

  // New per-template tiered badge evaluation
  if (!isTest && counted && assignment) {
      evaluateTemplateBadgeForResult({ userId: studentId, gameCreationId, percentage });
    }

    // Optional: auto-complete when all targeted students have at least one counted attempt for all games
    try {
      const freshAssignment = await Assignment.findById(assignment._id).lean();
      if (freshAssignment && freshAssignment.status !== 'canceled' && freshAssignment.status !== 'completed') {
        const studentIds = (freshAssignment.students || []).map(s => s.toString());
        const gameIds = (freshAssignment.gameCreations || []).map(g => g.toString());
        if (studentIds.length && gameIds.length) {
          const results = await GameResult.find({
            assignment: freshAssignment._id,
            counted: true,
            gameCreation: { $in: gameIds },
            student: { $in: studentIds },
          }).select('student gameCreation').lean();
          const byStudent = new Map();
          for (const r of results) {
            const k = r.student.toString();
            if (!byStudent.has(k)) byStudent.set(k, new Set());
            byStudent.get(k).add(r.gameCreation.toString());
          }
          let allDone = true;
          for (const sid of studentIds) {
            const set = byStudent.get(sid);
            if (!set || set.size < gameIds.length) { allDone = false; break; }
          }
          if (allDone) {
            const A = require('../models/Assignment');
            await A.findByIdAndUpdate(freshAssignment._id, { status: 'completed', completedAt: new Date() });
          }
        }
      }
    } catch (e) {
      // Best effort, ignore errors here
    }

    res.status(201).json({
      message: 'Result submitted successfully!',
      result: gameResult,
      xpAwarded,
      pointsEarned,
      percentage,
      attemptNumber,
      attemptsRemaining: assignment ? (gate.attemptsRemaining - 1 >= 0 ? gate.attemptsRemaining - 1 : 0) : 0,
      counted,
      isTest,
    });

  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Get attempt history for a specific assignment/game pair
// @route   GET /api/results/history/:assignmentId/:gameCreationId
// @access  Private/Student
const getAttemptHistory = async (req, res) => {
  try {
    const { assignmentId, gameCreationId } = req.params;
    const studentId = req.user._id;
    const results = await GameResult.find({ assignment: assignmentId, gameCreation: gameCreationId, student: studentId })
      .sort({ createdAt: 1 })
      .select('score totalPossibleScore attemptNumber createdAt');
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

// @desc    Get all results for a specific game creation (with ownership + optional filters)
// @route   GET /api/results/:gameCreationId?classId=&startDate=&endDate=
// @access  Private (Teacher/Admin/Manager)
const getResultsForGame = async (req, res) => {
  try {
    const { gameCreationId } = req.params;
    const { classId, startDate, endDate, sessionId } = req.query;

    // 1) Authorize access: teachers must own the game; admins/managers allowed
    const creation = await GameCreation.findById(gameCreationId).select('owner');
    if (!creation) return res.status(404).json({ message: 'Game creation not found' });

    const isTeacher = req.user?.role === 'teacher';
    const isOwner = creation.owner?.toString() === req.user?._id?.toString();
    const isElevated = req.user && (req.user.role === 'admin' || req.user.role === 'manager');
    if (!((isTeacher && isOwner) || isElevated)) {
      return res.status(403).json({ message: 'Not authorized to view results for this game.' });
    }

    // 2) If sessionId provided, return only results for that live session
    if (sessionId) {
      const results = await GameResult.find({
        liveSessionId: sessionId,
        gameCreation: gameCreationId
      })
        .populate('student', 'name firstName lastName')
        .sort({ createdAt: -1 });

      return res.status(200).json(results);
    }

    // 3) Build assignment scope: limit to this teacher's assignments by default
    const assignmentQuery = { gameCreations: gameCreationId };
    if (isTeacher) assignmentQuery.teacher = req.user._id;
    if (classId) assignmentQuery.classes = classId;
    const assignments = await Assignment.find(assignmentQuery).select('_id');
    const assignmentIds = assignments.map(a => a._id);

    // If no matching assignments, return empty
    if (assignmentIds.length === 0) return res.status(200).json([]);

    // 3) Build result query with optional date range
    const resultQuery = { gameCreation: gameCreationId, assignment: { $in: assignmentIds } };
    if (startDate || endDate) {
      resultQuery.createdAt = {};
      if (startDate) resultQuery.createdAt.$gte = new Date(startDate);
      if (endDate) resultQuery.createdAt.$lte = new Date(endDate);
    }

    const results = await GameResult.find(resultQuery)
      .populate('student', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Get aggregated global stats for a game creation
// @route   GET /api/results/:gameCreationId/stats/global
// @access  Private (Teacher/Admin/Manager)
const getGameGlobalStats = async (req, res) => {
  try {
    const { gameCreationId } = req.params;

    // Authorization: teacher must own the game; admins/managers allowed
    const creation = await GameCreation.findById(gameCreationId).select('owner');
    if (!creation) return res.status(404).json({ message: 'Game creation not found' });

    const isTeacher = req.user?.role === 'teacher';
    const isOwner = creation.owner?.toString() === req.user?._id?.toString();
    const isElevated = req.user && (req.user.role === 'admin' || req.user.role === 'manager');
    
    if (!((isTeacher && isOwner) || isElevated)) {
      return res.status(403).json({ message: 'Not authorized to view stats for this game.' });
    }

    // Check TTL Cache
    const cacheKey = gameCreationId.toString();
    const cached = globalStatsCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < STATS_CACHE_TTL_MS)) {
      return res.status(200).json(cached.data);
    }

    // Options from query
    const options = {
      assignmentId: req.query.assignmentId,
      classId: req.query.classId,
      dateRange: (req.query.startDate || req.query.endDate) ? {
        start: req.query.startDate,
        end: req.query.endDate
      } : undefined
    };

    const stats = await computeGameGlobalStats(gameCreationId, options);

    // Save to cache
    globalStatsCache.set(cacheKey, { data: stats, timestamp: Date.now() });

    res.status(200).json(stats);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Get student-specific stats for a game creation
// @route   GET /api/results/:gameCreationId/stats/student/:studentId
// @access  Private (Teacher/Admin/Manager or self)
const getStudentStats = async (req, res) => {
  try {
    const { gameCreationId, studentId } = req.params;

    // Authorization: self, teacher who owns the game, or admin/manager
    const isSelf = req.user?._id?.toString() === studentId;
    let allowed = isSelf;

    if (!isSelf) {
      const creation = await GameCreation.findById(gameCreationId).select('owner');
      if (!creation) return res.status(404).json({ message: 'Game creation not found' });

      const isTeacher = req.user?.role === 'teacher';
      const isOwner = creation.owner?.toString() === req.user?._id?.toString();
      const isElevated = req.user && (req.user.role === 'admin' || req.user.role === 'manager');

      allowed = (isTeacher && isOwner) || isElevated;
    }

    if (!allowed) {
      return res.status(403).json({ message: 'Not authorized to view stats for this student.' });
    }

    // Find the latest counted GameResult for this student and game
    const result = await GameResult.findOne({
      student: studentId,
      gameCreation: gameCreationId,
    }).sort({ createdAt: -1 }).select('_id');

    if (!result) {
      return res.status(404).json({ message: 'No game result found for this student.' });
    }

    const stats = await computeStudentStats(result._id);
    res.status(200).json(stats);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};


module.exports = {
  submitGameResult,
  getResultsForGame, // NEW: Export the new function
  getAttemptHistory,
  getGameGlobalStats,
  getStudentStats,
};

// @desc    Get single result with full details (teacher/admin only)
// @route   GET /api/results/detail/:resultId
// @access  Private
module.exports.getResultDetail = async (req, res) => {
  try {
    const { resultId } = req.params;
    const result = await GameResult.findById(resultId).populate('student', 'firstName lastName name').lean();
    if (!result) return res.status(404).json({ message: 'Result not found' });

    // Authorization: teacher must own the game; admin/manager allowed; student can only see own
    const creation = await GameCreation.findById(result.gameCreation)
      .select('owner content name template')
      .populate('template', 'enginePath name');
    const isElevated = req.user && (req.user.role === 'admin' || req.user.role === 'manager');
    const isTeacherOwner = req.user?.role === 'teacher' && creation?.owner?.toString() === req.user?._id?.toString();
    const isOwnerStudent = req.user?._id?.toString() === result.student?._id?.toString();
    if (!isElevated && !isTeacherOwner && !isOwnerStudent) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Build merged view of questions + answers
    const content = Array.isArray(creation?.content) ? creation.content : [];
    const ans = Array.isArray(result.answers) ? result.answers : [];
    const byIndex = new Map(ans.filter(a=>typeof a?.index==='number').map(a=>[a.index, a]));
    const items = content.map((q, idx) => ({
      index: idx,
      question: q.question || q.prompt || q.text || q.title || null,
      options: q.options || q.choices || undefined,
      correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : undefined,
      correctText: q.correctText || undefined,
      answer: byIndex.get(idx) || null,
    }));

    res.json({
      result: {
        _id: result._id,
        student: result.student,
        score: result.score,
        totalPossibleScore: result.totalPossibleScore,
        attemptNumber: result.attemptNumber,
        counted: result.counted,
        createdAt: result.createdAt,
      },
      game: { _id: creation?._id, name: creation?.name, template: creation?.template },
      items,
    });
  } catch (e) {
    res.status(500).json({ message: 'Server Error', error: e.message });
  }
};

// --- Student self metrics ---
// @desc    Summary metrics for the logged-in student
// @route   GET /api/results/me/summary
// @access  Private/Student
module.exports.getMyResultsSummary = async (req, res) => {
  try {
    const studentId = req.user._id;
    // Count unique gameCreations with at least one counted result
    const counted = await GameResult.find({ student: studentId, counted: true, isTest: false })
      .select('gameCreation createdAt')
      .sort({ createdAt: -1 })
      .lean();
    const uniqueGames = new Set(counted.map(r => r.gameCreation.toString())).size;

    // Current streak: consecutive days with at least one counted result ending today
    const daySet = new Set(counted.map(r => new Date(r.createdAt).toISOString().slice(0,10)));
    let streak = 0;
    let cursor = new Date();
    // normalize to local date string compare by ISO date
    for (;;) {
      const iso = new Date(Date.UTC(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())).toISOString().slice(0,10);
      if (daySet.has(iso)) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        // allow skipping future days only; break when first missing day
        break;
      }
    }

    // Total points from user profile
    const user = await User.findById(studentId).select('totalPoints');
    const totalPoints = user?.totalPoints || 0;

    // Time spent: approximate sum of attempt durations if tracked; fallback to attempt count * 5min
    // We don't store duration, so approximate 5 minutes per counted attempt
    const attempts = counted.length;
    const approxMinutes = attempts * 5;

    res.json({
      gamesCompleted: uniqueGames,
      currentStreakDays: streak,
      totalPoints,
      timeSpentMinutes: approxMinutes,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

// @desc    Recent games for the logged-in student (latest counted attempts)
// @route   GET /api/results/me/recent?limit=5
// @access  Private/Student
module.exports.getMyRecentResults = async (req, res) => {
  try {
    const studentId = req.user._id;
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit || '5')));
    const results = await GameResult.find({ student: studentId, counted: true, isTest: false })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('gameCreation', 'name')
      .select('score totalPossibleScore createdAt gameCreation')
      .lean();
    const mapped = results.map(r => ({
      name: r.gameCreation?.name || 'Game',
      percentage: r.totalPossibleScore > 0 ? Math.round((r.score / r.totalPossibleScore) * 100) : 0,
      createdAt: r.createdAt,
    }));
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

// @desc    Recent live session results for the logged-in student
// @route   GET /api/results/me/live?limit=5
// @access  Private/Student
module.exports.getMyRecentLiveResults = async (req, res) => {
  try {
    const studentId = req.user._id;
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit || '5')));
    const results = await GameResult.find({ student: studentId, isTest: false, liveSessionId: { $exists: true, $ne: null } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('gameCreation', 'name')
      .populate('liveSessionId', 'code title')
      .select('score totalPossibleScore createdAt gameCreation liveSessionId')
      .lean();
    const mapped = results.map(r => ({
      name: r.liveSessionId?.title || r.gameCreation?.name || 'Live Game',
      code: r.liveSessionId?.code || null,
      percentage: r.totalPossibleScore > 0 ? Math.round((r.score / r.totalPossibleScore) * 100) : 0,
      createdAt: r.createdAt,
    }));
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};
