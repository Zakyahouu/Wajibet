const mongoose = require('mongoose');

const gameProgressSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    assignment: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Assignment' },
    gameCreation: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'GameCreation' },
    currentItemIndex: { type: Number, default: 0 },
    currentScore: { type: Number, default: 0 },
    elapsedMs: { type: Number, default: 0 },
    answers: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);

// One in-progress checkpoint per student/assignment/game combination.
gameProgressSchema.index({ student: 1, assignment: 1, gameCreation: 1 }, { unique: true });

// Auto-expire abandoned checkpoints after 30 days of inactivity.
gameProgressSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

module.exports = mongoose.model('GameProgress', gameProgressSchema);
