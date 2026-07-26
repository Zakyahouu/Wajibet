const asyncHandler = require('express-async-handler');
const GameProgress = require('../models/GameProgress');

// POST /api/game-progress
// body: { assignmentId, gameCreationId, currentItemIndex, currentScore, elapsedMs, answers }
const saveProgress = asyncHandler(async (req, res) => {
  const { assignmentId, gameCreationId, currentItemIndex, currentScore, elapsedMs, answers } = req.body;
  if (!assignmentId || !gameCreationId) {
    res.status(400);
    throw new Error('assignmentId and gameCreationId are required');
  }
  const doc = await GameProgress.findOneAndUpdate(
    { student: req.user._id, assignment: assignmentId, gameCreation: gameCreationId },
    {
      $set: {
        currentItemIndex: Number(currentItemIndex) || 0,
        currentScore: Number(currentScore) || 0,
        elapsedMs: Number(elapsedMs) || 0,
        answers: Array.isArray(answers) ? answers.slice(0, 1000) : [],
      },
    },
    { upsert: true, new: true }
  );
  res.json({ saved: true, id: doc._id });
});

// GET /api/game-progress/:assignmentId/:gameCreationId
const getProgress = asyncHandler(async (req, res) => {
  const { assignmentId, gameCreationId } = req.params;
  const doc = await GameProgress.findOne({
    student: req.user._id,
    assignment: assignmentId,
    gameCreation: gameCreationId,
  }).lean();
  if (!doc) {
    return res.json({ progress: null });
  }
  res.json({
    progress: {
      currentItemIndex: doc.currentItemIndex,
      currentScore: doc.currentScore,
      elapsedMs: doc.elapsedMs,
      answers: doc.answers,
    },
  });
});

// Internal helper — NOT a route. Call this from gameResultController after a
// successful submission so the checkpoint doesn't linger after the attempt is done.
async function clearProgress(studentId, assignmentId, gameCreationId) {
  if (!assignmentId) return;
  try {
    await GameProgress.deleteOne({ student: studentId, assignment: assignmentId, gameCreation: gameCreationId });
  } catch (e) {
    console.warn('[gameProgress] Failed to clear checkpoint (non-fatal):', e.message);
  }
}

module.exports = { saveProgress, getProgress, clearProgress };
