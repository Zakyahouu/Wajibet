const LiveParticipant = require('../models/LiveParticipant');
const LiveSession = require('../models/LiveSession');
const GameCreation = require('../models/GameCreation');
const User = require('../models/User');

const RANK_BONUS_RATIOS = [0.5, 0.25, 0.1]; // 1st, 2nd, 3rd place bonus, as a ratio of base amount

async function awardOnlineXpForSession(sessionId) {
  try {
    const session = await LiveSession.findById(sessionId).lean();
    if (!session) return;

    const gameCreation = await GameCreation.findById(session.gameCreationId).lean();
    const xpConf = gameCreation?.xp?.online;
    if (!xpConf || !xpConf.enabled) return;

    const participants = await LiveParticipant.find({ sessionId, xpProcessed: false });
    if (participants.length === 0) return;

    // Rank by score desc, tie-break by effectiveTimeMs asc (faster wins ties).
    const ranked = [...participants].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.effectiveTimeMs || 0) - (b.effectiveTimeMs || 0);
    });

    for (let i = 0; i < ranked.length; i++) {
      const p = ranked[i];
      const bonusRatio = RANK_BONUS_RATIOS[i] || 0;
      const xpAwarded = Math.round(Number(xpConf.amount || 0) * (1 + bonusRatio));

      const user = await User.findById(p.studentId);
      if (user) {
        user.xp = (user.xp || 0) + xpAwarded;
        user.level = Math.max(user.level || 1, 1 + Math.floor((user.xp || 0) / 500));
        await user.save();
      }
      p.xpProcessed = true;
      await LiveParticipant.findByIdAndUpdate(p._id, { xpProcessed: true });
    }
  } catch (e) {
    console.warn('[onlineXpService] Failed to award online XP (non-fatal):', e.message);
  }
}

module.exports = { awardOnlineXpForSession };
