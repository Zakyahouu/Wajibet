// server/models/GameResult.js

const mongoose = require('mongoose');

const gameResultSchema = new mongoose.Schema(
  {
    // The student who played the game
    student: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    // The specific game creation that was played
    gameCreation: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'GameCreation',
    },
    // The assignment this result belongs to (optional for live sessions)
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
      ref: 'Assignment',
    },
    // The score the student achieved
    score: {
      type: Number,
      required: true,
    },
    // The total possible score for this game
  totalPossibleScore: {
    type: Number,
    required: true,
  },
  // Attempt sequence number for this assignment/game pair
  attemptNumber: { type: Number, default: 1 },
  // Whether this attempt counts towards official reports (e.g., first-only policy)
  counted: { type: Boolean, default: true },
  // True when initiated by admin/teacher (test/hotspot), never grants XP
  isTest: { type: Boolean, default: false },
  // XP awarded for this attempt (0 for non-counted or tests)
  xpAwarded: { type: Number, default: 0 },
  // Optional live session id if this result comes from a real-time session
  liveSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession' },
   // ========================================================================
   // Per-question answers array — Unified Telemetry Contract
   // ========================================================================
   // Each element in this array MUST conform to the Tier 0 contract:
   //
   //   itemId        (String, required)  — Permanent atomic ID from GameCreation.content[].itemId
   //   itemIndex     (Number, required)  — Zero-based position in the item list
   //   type          (String, required)  — Descriptor for grouping/rendering (e.g. "multiple-choice")
   //   isCorrect     (Boolean, required) — Whether the student answered correctly
   //   userAnswer    (Mixed, required)   — The student's actual response
   //   correctAnswer (Mixed, required)   — The expected correct response
   //   score         (Number, required)  — Points earned for this item
   //   maxScore      (Number, required)  — Maximum possible points for this item
   //   timeMs        (Number, required)  — Milliseconds spent on this item
   //   attempts      (Number, required)  — Number of attempts on this item
   //   skipped       (Boolean, required) — Whether the student skipped this item
   //
   // Optional Tier 1 — engine-specific metadata:
   //   meta          (Object, optional)  — Declared via GameTemplate.metaStatsSchema
   //                                       for declarative aggregation
   //
   // Kept as [Mixed] intentionally — the meta object must remain flexible per engine.
   // ========================================================================
   answers: {
     type: [mongoose.Schema.Types.Mixed],
     default: undefined,
   },

   // Total time in milliseconds for the entire game session
   totalTimeMs: { type: Number },
   // Final composite score for the session
   finalScore: { type: Number },
   // Schema version — drives the backend validator. Currently only version 1.
   statsSchemaVersion: { type: Number, default: 1 },
   // Set to true when a production payload failed contract validation but was saved anyway
   statsIncomplete: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

// Performance indexes for frequent query patterns
// Composite index accelerates filtering by student + assignment + gameCreation
gameResultSchema.index({ student: 1, assignment: 1, gameCreation: 1 });
// Secondary index for assignment aggregations (teacher analytics potential)
gameResultSchema.index({ assignment: 1 });
// Index for template badge evaluation by gameCreation & student
gameResultSchema.index({ gameCreation: 1, student: 1 });
// Index to quickly find counted attempts
gameResultSchema.index({ assignment: 1, gameCreation: 1, student: 1, counted: 1 });
// Index for live session lookups (student recent live results)
gameResultSchema.index({ liveSessionId: 1, student: 1, createdAt: -1 });

module.exports = mongoose.model('GameResult', gameResultSchema);
