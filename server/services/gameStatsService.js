// server/services/gameStatsService.js
// Decoupled aggregation service — operates exclusively on the universal Tier 0 contract.
// No game-specific logic exists in this file.

const GameResult = require('../models/GameResult');
const GameCreation = require('../models/GameCreation');

// ============================================================================
// 1. computeStudentStats(gameResultId)
// ============================================================================
const computeStudentStats = async (gameResultId) => {
  const result = await GameResult.findById(gameResultId).lean();
  if (!result) throw new Error('GameResult not found');

  // Load the GameCreation to map itemIds to question content
  const creation = await GameCreation.findById(result.gameCreation).lean();
  const contentMap = new Map();
  if (creation && Array.isArray(creation.content)) {
    creation.content.forEach((item, idx) => {
      const id = item.itemId || `index_${idx}`;
      contentMap.set(id, {
        question: item.question || item.prompt || item.text || item.title || null,
        options: item.options || item.choices || undefined,
        correctIndex: item.correctIndex,
        correctText: item.correctText,
      });
    });
  }

  const answers = Array.isArray(result.answers) ? result.answers : [];
  const totalItems = answers.length;
  const correctCount = answers.filter(a => a.isCorrect === true).length;
  const skippedCount = answers.filter(a => a.skipped === true).length;
  const totalTimeMs = answers.reduce((sum, a) => sum + (a.timeMs || 0), 0);
  const totalScore = answers.reduce((sum, a) => sum + (a.score || 0), 0);
  const totalMaxScore = answers.reduce((sum, a) => sum + (a.maxScore || 0), 0);
  const accuracy = totalItems > 0 ? (correctCount / totalItems) * 100 : 0;

  // Per-item breakdown with question content joined
  const itemBreakdown = answers.map(a => {
    const contentInfo = contentMap.get(a.itemId) || {};
    return {
      itemId: a.itemId,
      itemIndex: a.itemIndex,
      type: a.type,
      isCorrect: a.isCorrect,
      userAnswer: a.userAnswer,
      correctAnswer: a.correctAnswer,
      score: a.score,
      maxScore: a.maxScore,
      timeMs: a.timeMs,
      attempts: a.attempts,
      skipped: a.skipped,
      meta: a.meta || {},
      question: contentInfo.question,
      options: contentInfo.options,
    };
  });

  // Sort to find hardest/slowest items
  const wrongItems = itemBreakdown.filter(i => !i.isCorrect && !i.skipped)
    .sort((a, b) => (b.timeMs || 0) - (a.timeMs || 0));
  const slowestItems = [...itemBreakdown].sort((a, b) => (b.timeMs || 0) - (a.timeMs || 0)).slice(0, 3);
  const skippedItems = itemBreakdown.filter(i => i.skipped);

  // Attempt trend — find all results for the same gameCreation by this student
  let trend = [];
  const allResults = await GameResult.find({
    student: result.student,
    gameCreation: result.gameCreation,
  }).sort({ createdAt: 1 }).select('score totalPossibleScore attemptNumber createdAt answers').lean();

  if (allResults.length > 1) {
    trend = allResults.map(r => {
      const rAnswers = Array.isArray(r.answers) ? r.answers : [];
      const rCorrect = rAnswers.filter(a => a.isCorrect === true).length;
      const rTotal = rAnswers.length;
      const rTime = rAnswers.reduce((s, a) => s + (a.timeMs || 0), 0);
      return {
        attemptNumber: r.attemptNumber,
        score: r.score,
        totalPossibleScore: r.totalPossibleScore,
        accuracy: rTotal > 0 ? (rCorrect / rTotal) * 100 : 0,
        totalTimeMs: rTime,
        createdAt: r.createdAt,
      };
    });
  }

  return {
    resultId: result._id,
    student: result.student,
    gameCreation: result.gameCreation,
    totalItems,
    correctCount,
    skippedCount,
    wrongCount: totalItems - correctCount - skippedCount,
    totalTimeMs,
    totalScore,
    totalMaxScore,
    accuracy: Math.round(accuracy * 100) / 100,
    itemBreakdown,
    wrongItems,
    slowestItems,
    skippedItems,
    trend,
    statsIncomplete: result.statsIncomplete || false,
  };
};

// ============================================================================
// 2. computeGameGlobalStats(gameCreationId, options)
// ============================================================================
const computeGameGlobalStats = async (gameCreationId, options = {}) => {
  const { assignmentId, classId, dateRange, liveSessionId, studentId } = options;

  // Build the query filter
  const query = { gameCreation: gameCreationId };
  if (assignmentId) query.assignment = assignmentId;
  if (liveSessionId) query.liveSessionId = liveSessionId;
  if (studentId) query.student = studentId;
  if (dateRange?.start) query.createdAt = { ...query.createdAt, $gte: new Date(dateRange.start) };
  if (dateRange?.end) query.createdAt = { ...query.createdAt, $lte: new Date(dateRange.end) };

  // Fetch all results
  const allResults = await GameResult.find(query)
    .select('student score totalPossibleScore answers statsIncomplete totalTimeMs createdAt')
    .lean();

  // Separate complete vs incomplete
  const completeResults = allResults.filter(r => !r.statsIncomplete);
  const incompleteCount = allResults.filter(r => r.statsIncomplete).length;

  const totalParticipants = new Set(allResults.map(r => r.student.toString())).size;
  const totalSubmissions = allResults.length;

  // Score distribution (bucketed: 0-10, 10-20, ..., 90-100)
  const scoreBuckets = Array(10).fill(0);
  completeResults.forEach(r => {
    const pct = r.totalPossibleScore > 0 ? (r.score / r.totalPossibleScore) * 100 : 0;
    const bucket = Math.min(9, Math.floor(pct / 10));
    scoreBuckets[bucket]++;
  });

  // Average score
  const avgScore = completeResults.length > 0
    ? completeResults.reduce((s, r) => s + (r.totalPossibleScore > 0 ? (r.score / r.totalPossibleScore) * 100 : 0), 0) / completeResults.length
    : 0;

  // Completion rate (results that have answers vs total)
  const withAnswers = completeResults.filter(r => Array.isArray(r.answers) && r.answers.length > 0);
  const completionRate = totalSubmissions > 0 ? (withAnswers.length / totalSubmissions) * 100 : 0;

  // Per-item stats — aggregate across all complete results
  const itemStatsMap = new Map();
  const studentTimesAndAccuracies = [];

  completeResults.forEach(r => {
    const answers = Array.isArray(r.answers) ? r.answers : [];
    if (answers.length === 0) return;

    let correctCount = 0;
    let totalMs = 0;

    answers.forEach(a => {
      const key = a.itemId || `idx_${a.itemIndex}`;
      if (!itemStatsMap.has(key)) {
        itemStatsMap.set(key, {
          itemId: key,
          itemIndex: a.itemIndex,
          type: a.type,
          totalAnswered: 0,
          correctCount: 0,
          wrongCount: 0,
          skippedCount: 0,
          timeMsValues: [],
        });
      }
      const stats = itemStatsMap.get(key);
      stats.totalAnswered++;
      if (a.skipped) stats.skippedCount++;
      else if (a.isCorrect) stats.correctCount++;
      else stats.wrongCount++;
      if (typeof a.timeMs === 'number') stats.timeMsValues.push(a.timeMs);

      if (a.isCorrect) correctCount++;
      totalMs += (a.timeMs || 0);
    });

    const accuracy = answers.length > 0 ? (correctCount / answers.length) * 100 : 0;
    const avgTimeMs = answers.length > 0 ? totalMs / answers.length : 0;
    studentTimesAndAccuracies.push({ student: r.student.toString(), accuracy, avgTimeMs });
  });

  // Build per-item output
  const perItemStats = Array.from(itemStatsMap.values()).map(s => {
    const sorted = [...s.timeMsValues].sort((a, b) => a - b);
    const median = sorted.length > 0
      ? (sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)])
      : 0;

    return {
      itemId: s.itemId,
      itemIndex: s.itemIndex,
      type: s.type,
      totalAnswered: s.totalAnswered,
      correctRate: s.totalAnswered > 0 ? Math.round((s.correctCount / s.totalAnswered) * 10000) / 100 : 0,
      wrongRate: s.totalAnswered > 0 ? Math.round((s.wrongCount / s.totalAnswered) * 10000) / 100 : 0,
      skippedRate: s.totalAnswered > 0 ? Math.round((s.skippedCount / s.totalAnswered) * 10000) / 100 : 0,
      avgTimeMs: s.timeMsValues.length > 0
        ? Math.round(s.timeMsValues.reduce((a, b) => a + b, 0) / s.timeMsValues.length)
        : 0,
      medianTimeMs: Math.round(median),
    };
  });

  // Rank: hardest → easiest (by wrongRate desc)
  const rankedByDifficulty = [...perItemStats].sort((a, b) => b.wrongRate - a.wrongRate);
  // Rank: slowest → fastest (by avgTimeMs desc)
  const rankedBySpeed = [...perItemStats].sort((a, b) => b.avgTimeMs - a.avgTimeMs);

  // stumblingBlock — single item with highest wrong rate
  const stumblingBlock = rankedByDifficulty.length > 0 ? rankedByDifficulty[0] : null;

  // rushingStudents — bottom 25% accuracy AND bottom 25% time (fastest + worst)
  let rushingStudents = [];
  if (studentTimesAndAccuracies.length >= 4) {
    const sortedByAccuracy = [...studentTimesAndAccuracies].sort((a, b) => a.accuracy - b.accuracy);
    const sortedBySpeed = [...studentTimesAndAccuracies].sort((a, b) => a.avgTimeMs - b.avgTimeMs);
    const q25AccuracyThreshold = sortedByAccuracy[Math.floor(sortedByAccuracy.length * 0.25)]?.accuracy ?? 0;
    const q25SpeedThreshold = sortedBySpeed[Math.floor(sortedBySpeed.length * 0.25)]?.avgTimeMs ?? 0;

    rushingStudents = studentTimesAndAccuracies
      .filter(s => s.accuracy <= q25AccuracyThreshold && s.avgTimeMs <= q25SpeedThreshold)
      .map(s => s.student);
  }

  // Load meta stats if template has a metaStatsSchema
  const creation = await GameCreation.findById(gameCreationId).select('template').lean();
  let metaStats = null;
  if (creation?.template) {
    const GameTemplate = require('../models/GameTemplate');
    const template = await GameTemplate.findById(creation.template).select('metaStatsSchema').lean();
    if (template?.metaStatsSchema && template.metaStatsSchema.length > 0) {
      metaStats = await computeMetaStats(gameCreationId, template.metaStatsSchema, completeResults);
    }
  }

  return {
    gameCreationId,
    totalParticipants,
    totalSubmissions,
    incompleteCount,
    avgScore: Math.round(avgScore * 100) / 100,
    completionRate: Math.round(completionRate * 100) / 100,
    scoreDistribution: scoreBuckets.map((count, i) => ({
      range: `${i * 10}-${(i + 1) * 10}`,
      count,
    })),
    perItemStats,
    rankedByDifficulty,
    rankedBySpeed,
    stumblingBlock,
    rushingStudents,
    metaStats,
  };
};

// ============================================================================
// 3. computeMetaStats(gameCreationId, metaStatsSchema, preloadedResults?)
// ============================================================================
const computeMetaStats = async (gameCreationId, metaStatsSchema, preloadedResults = null) => {
  // Get all complete results if not preloaded
  const results = preloadedResults || await GameResult.find({
    gameCreation: gameCreationId,
    statsIncomplete: { $ne: true },
  }).select('answers').lean();

  // Collect all meta values for each declared key
  const metaValues = {};
  metaStatsSchema.forEach(schema => {
    metaValues[schema.key] = [];
  });

  results.forEach(r => {
    const answers = Array.isArray(r.answers) ? r.answers : [];
    answers.forEach(a => {
      if (!a.meta || typeof a.meta !== 'object') return;
      metaStatsSchema.forEach(schema => {
        if (a.meta[schema.key] !== undefined && a.meta[schema.key] !== null) {
          metaValues[schema.key].push(a.meta[schema.key]);
        }
      });
    });
  });

  // Apply the generic aggregation verbs — NO game-specific logic here
  const output = metaStatsSchema.map(schema => {
    const values = metaValues[schema.key] || [];
    let result;

    switch (schema.aggregation) {
      case 'average': {
        const nums = values.filter(v => typeof v === 'number');
        result = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
        result = Math.round(result * 100) / 100;
        break;
      }
      case 'sum': {
        const nums = values.filter(v => typeof v === 'number');
        result = nums.reduce((a, b) => a + b, 0);
        break;
      }
      case 'frequency': {
        result = {};
        values.forEach(v => {
          const key = String(v);
          result[key] = (result[key] || 0) + 1;
        });
        break;
      }
      case 'top_n': {
        const freq = {};
        values.forEach(v => {
          const key = String(v);
          freq[key] = (freq[key] || 0) + 1;
        });
        result = Object.entries(freq)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([value, count]) => ({ value, count }));
        break;
      }
      case 'min_max': {
        const nums = values.filter(v => typeof v === 'number');
        result = nums.length > 0
          ? { min: Math.min(...nums), max: Math.max(...nums) }
          : { min: null, max: null };
        break;
      }
      case 'boolean_rate': {
        const total = values.length;
        const truthy = values.filter(v => !!v).length;
        result = total > 0 ? Math.round((truthy / total) * 10000) / 100 : 0;
        break;
      }
      default:
        result = null;
    }

    return {
      key: schema.key,
      label: schema.label,
      aggregation: schema.aggregation,
      sampleSize: values.length,
      result,
    };
  });

  return output;
};

module.exports = {
  computeStudentStats,
  computeGameGlobalStats,
  computeMetaStats,
};
