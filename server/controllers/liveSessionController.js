const LiveSession = require('../models/LiveSession');
const LiveParticipant = require('../models/LiveParticipant');
const GameCreation = require('../models/GameCreation');
const Enrollment = require('../models/Enrollment');
const GameResult = require('../models/GameResult');
const { awardOnlineXpForSession } = require('../services/onlineXpService');
const { liveGames, io: realtimeIO } = require('../realtimeState');
const Class = require('../models/Class');

const CODE_LENGTH = 8;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const genCode = async () => {
  const make = () => Array.from({ length: CODE_LENGTH }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  for (let i = 0; i < 5; i++) { const code = make(); const exists = await LiveSession.findOne({ code }).select('_id').lean(); if (!exists) return code; }
  return make();
};

const rankComparator = (a, b) => {
  // One consistent rule: higher score, then faster time, then fewer mistakes, then earlier finish
  if (a.score !== b.score) return b.score - a.score;
  if (a.effectiveTimeMs !== b.effectiveTimeMs) return a.effectiveTimeMs - b.effectiveTimeMs;
  if ((a.wrong || 0) !== (b.wrong || 0)) return (a.wrong || 0) - (b.wrong || 0);
  return (a.finishedAt || Infinity) - (b.finishedAt || Infinity);
};

exports.createSession = async (req, res) => {
  try {
    const { gameCreationId, title, classIds = [], allowLateJoin = false, config = {} } = req.body;
    if (req.user.role !== 'teacher') return res.status(403).json({ message: 'Teacher only' });
    const creation = await GameCreation.findById(gameCreationId).select('_id owner');
    if (!creation || String(creation.owner) !== String(req.user._id)) return res.status(403).json({ message: 'Not your game' });

    // Validate classes belong to this teacher
    const classes = Array.isArray(classIds) ? classIds : [];
    if (classes.length) {
      const Class = require('../models/Class');
      const owned = await Class.countDocuments({ _id: { $in: classes }, teacherId: req.user._id });
      if (owned !== classes.length) return res.status(400).json({ message: 'Invalid classes for this teacher' });
    }

    const code = await genCode();
    const session = await LiveSession.create({
      code,
      teacherId: req.user._id,
      gameCreationId,
      classes,
      title: title || undefined,
      allowLateJoin: !!allowLateJoin,
      config: {
        scoring: ['best', 'fastest', 'hybrid'].includes(config.scoring) ? config.scoring : 'hybrid',
        timePenaltyPerWrongMs: Number.isFinite(Number(config.timePenaltyPerWrongMs)) ? Number(config.timePenaltyPerWrongMs) : 3000,
        strictProgress: !!config.strictProgress,
      }
    });
    res.status(201).json({ sessionId: session._id, code: session.code });
  } catch (e) { res.status(500).json({ message: 'Server Error', error: e.message }); }
};

exports.listSessions = async (req, res) => {
  try {
    if (req.user.role !== 'teacher') return res.status(403).json({ message: 'Teacher only' });
    const { status } = req.query;
    const q = { teacherId: req.user._id };
    // Map friendly filters to schema statuses
    if (status === 'active') {
      q.status = { $in: ['lobby', 'running'] };
    } else if (status === 'past') {
      q.status = 'ended';
    } else if (status) {
      q.status = status; // allow direct usage if provided
    }

    const sessions = await LiveSession.find(q).sort({ createdAt: -1 }).lean();
    if (!sessions.length) return res.json([]);

    // Attach basic game info
    const creationIds = [...new Set(sessions.map(s => String(s.gameCreationId)))];
    const creations = await GameCreation.find({ _id: { $in: creationIds } }).select('_id name').lean();
    const creationMap = new Map(creations.map(c => [String(c._id), c]));

    // Aggregate participant metrics per session
    const ids = sessions.map(s => s._id);
    const parts = await LiveParticipant.aggregate([
      { $match: { sessionId: { $in: ids } } },
      { $group: { _id: '$sessionId', count: { $sum: 1 }, avgScore: { $avg: '$score' } } }
    ]);
    const partMap = new Map(parts.map(p => [String(p._id), { count: p.count, avgScore: p.avgScore }]));

    const enriched = sessions.map(s => ({
      ...s,
      gameCreation: creationMap.get(String(s.gameCreationId)) || null,
      participantsCount: partMap.get(String(s._id))?.count || 0,
      averageScore: partMap.get(String(s._id))?.avgScore ? Math.round(partMap.get(String(s._id))?.avgScore) : undefined,
    }));

    res.json(enriched);
  } catch (e) { res.status(500).json({ message: 'Server Error', error: e.message }); }
};

exports.listStudentActiveSessions = async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ message: 'Student only' });

    const [enrollments, embeddedClasses] = await Promise.all([
      Enrollment.find({ studentId: req.user._id, status: 'active' }).select('classId').lean(),
      Class.find({
        enrolledStudents: { $elemMatch: { studentId: req.user._id, status: 'active' } }
      }).select('_id').lean(),
    ]);

    const classIds = [
      ...new Set([
        ...enrollments.map(e => String(e.classId)).filter(Boolean),
        ...embeddedClasses.map(c => String(c._id)).filter(Boolean),
      ])
    ];

    if (!classIds.length) return res.json([]);

    // First, find sessions where this student is explicitly disconnected or active so they can always Rejoin/Resume
    const myParticipants = await LiveParticipant.find({
      studentId: req.user._id,
      status: { $in: ['active', 'disconnected'] }
    }).select('sessionId').lean();
    
    const myDisconnectedSessionIds = myParticipants.map(p => String(p.sessionId));

    const sessions = await LiveSession.find({
      status: { $ne: 'ended' },
      $or: [
        { 
          classes: { $in: classIds },
          status: 'lobby'
        },
        { 
          classes: { $in: classIds },
          status: 'running', 
          allowLateJoin: true 
        },
        { _id: { $in: myDisconnectedSessionIds } }
      ],
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!sessions.length) return res.json([]);

    const creationIds = [...new Set(sessions.map(s => String(s.gameCreationId)))];
    const teacherIds = [...new Set(sessions.map(s => String(s.teacherId)))];
    const sessionIds = sessions.map(s => s._id);
    const [creations, teachers, participants] = await Promise.all([
      GameCreation.find({ _id: { $in: creationIds } }).select('_id name template').populate('template', 'name iconUrl').lean(),
      require('../models/User').find({ _id: { $in: teacherIds } }).select('_id firstName lastName name').lean(),
      LiveParticipant.aggregate([
        { $match: { sessionId: { $in: sessionIds } } },
        { $group: { _id: '$sessionId', count: { $sum: 1 } } }
      ]),
    ]);

    const creationMap = new Map(creations.map(c => [String(c._id), c]));
    const teacherMap = new Map(teachers.map(t => [String(t._id), t]));
    const participantMap = new Map(participants.map(p => [String(p._id), p.count]));
    
    const activeRoomSessionIds = new Set();
    const myStatusMap = new Map();
    
    const { liveGames } = require('../realtimeState');
    for (const [code, room] of Object.entries(liveGames || {})) {
      if (room?.sessionId) {
        activeRoomSessionIds.add(String(room.sessionId));
        const me = room.players?.find(p => String(p.userId) === String(req.user._id));
        if (me && me.stats) {
          myStatusMap.set(String(room.sessionId), me.stats.status);
        }
      }
    }

    const items = sessions.map(session => {
      const creation = creationMap.get(String(session.gameCreationId));
      const teacher = teacherMap.get(String(session.teacherId));
      return {
        _id: session._id,
        code: session.code,
        title: session.title || creation?.name || 'Live game',
        status: session.status,
        allowLateJoin: session.allowLateJoin,
        createdAt: session.createdAt,
        startedAt: session.startedAt,
        isRoomOnline: activeRoomSessionIds.has(String(session._id)),
        myStatus: myStatusMap.get(String(session._id)) || null,
        participantsCount: participantMap.get(String(session._id)) || 0,
        gameCreation: creation ? {
          _id: creation._id,
          name: creation.name,
          templateName: creation.template?.name,
          iconUrl: creation.template?.iconUrl,
        } : null,
        teacher: teacher ? {
          _id: teacher._id,
          name: teacher.name || [teacher.firstName, teacher.lastName].filter(Boolean).join(' '),
        } : null,
      };
    });

    res.json(items);
  } catch (e) {
    res.status(500).json({ message: 'Server Error', error: e.message });
  }
};

exports.getSummary = async (req, res) => {
  try {
    const { id } = req.params;
    const s = await LiveSession.findById(id).lean();
    if (!s) return res.status(404).json({ message: 'Not found' });
    if (String(s.teacherId) !== String(req.user._id) && req.user.role !== 'admin' && req.user.role !== 'manager') {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const participants = await LiveParticipant.find({ sessionId: id }).lean();
    // Ranking
    const ranks = participants.map(p => ({
      studentId: p.studentId,
      firstName: p.firstName,
      lastName: p.lastName,
      classId: p.classId,
      score: p.score,
      correct: p.correct,
      wrong: p.wrong,
      effectiveTimeMs: p.effectiveTimeMs,
      finishedAt: p.finishedAt,
    })).sort((a, b) => rankComparator(a, b));
    res.json({ session: s, ranks, participants });
  } catch (e) { res.status(500).json({ message: 'Server Error', error: e.message }); }
};

// Lightweight details endpoint for lobby header or quick inspect
exports.getDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const s = await LiveSession.findById(id).lean();
    if (!s) return res.status(404).json({ message: 'Not found' });
    if (String(s.teacherId) !== String(req.user._id) && req.user.role !== 'admin' && req.user.role !== 'manager') {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const creation = await GameCreation.findById(s.gameCreationId).select('_id name').lean();
    res.json({ ...s, gameCreation: creation || null });
  } catch (e) { res.status(500).json({ message: 'Server Error', error: e.message }); }
};

exports.endSession = async (req, res) => {
  try {
    const { id } = req.params;
    const s = await LiveSession.findById(id);
    if (!s) return res.status(404).json({ message: 'Not found' });
    if (String(s.teacherId) !== String(req.user._id) && req.user.role !== 'admin' && req.user.role !== 'manager') {
      return res.status(403).json({ message: 'Not authorized' });
    }
    if (s.status === 'ended') return res.json({ message: 'Already ended' });
    s.status = 'ended';
    s.endedAt = new Date();
    if (!s.startedAt) s.startedAt = new Date(s.createdAt || Date.now());
    await s.save();
    awardOnlineXpForSession(s._id); // fire-and-forget

    // Notify any active socket room for this session so players and hosts exit cleanly.
    try {
      const socket = typeof realtimeIO === 'function' ? realtimeIO() : realtimeIO;
      const roomEntry = Object.entries(liveGames).find(([, room]) => String(room?.sessionId) === String(id));
      if (socket && roomEntry) {
        const [roomCode, room] = roomEntry;
        const participants = await LiveParticipant.find({ sessionId: id })
          .populate('studentId', 'firstName lastName name')
          .lean();
        const ranks = participants
          .map(p => {
            const stu = p.studentId;
            const name = (stu && typeof stu === 'object')
              ? (stu.name || [stu.firstName, stu.lastName].filter(Boolean).join(' ') || 'Unknown')
              : ([p.firstName, p.lastName].filter(Boolean).join(' ') || 'Unknown');
            return {
              userId: String(stu?._id || p.studentId),
              name,
              score: p.score || 0,
              correct: p.correct || 0,
              wrong: p.wrong || 0,
              effectiveTimeMs: p.effectiveTimeMs || 0,
              finishedAt: p.finishedAt,
            };
          })
          .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (a.effectiveTimeMs !== b.effectiveTimeMs) return a.effectiveTimeMs - b.effectiveTimeMs;
            return (a.wrong || 0) - (b.wrong || 0);
          });

        socket.to(roomCode).emit('live:scoreboard', { ranks });
        socket.to(roomCode).emit('game-ended', { sessionId: id, ranks, manualEnded: true });
        delete liveGames[roomCode];
        console.log('[liveSessionController] endSession -> broadcast game-ended for room', roomCode, 'session', id);
      }
    } catch (notifyErr) {
      console.error('[liveSessionController] Failed to notify live room on endSession:', notifyErr);
    }

    res.json({ message: 'Session ended' });
  } catch (e) { res.status(500).json({ message: 'Server Error', error: e.message }); }
};

// Permanently delete a past session and all associated data (participants and results)
exports.deleteSession = async (req, res) => {
  try {
    const { id } = req.params;
    const s = await LiveSession.findById(id).lean();
    if (!s) return res.status(404).json({ message: 'Not found' });
    // Only the owning teacher (or admins/managers) can delete
    const isOwner = String(s.teacherId) === String(req.user._id);
    if (!isOwner && req.user.role !== 'admin' && req.user.role !== 'manager') {
      return res.status(403).json({ message: 'Not authorized' });
    }
    // Only allow deleting ended sessions to avoid accidental active removal
    if (s.status !== 'ended') {
      return res.status(400).json({ message: 'Only past sessions can be deleted' });
    }
    // Remove participants and results first, then session
    await LiveParticipant.deleteMany({ sessionId: id });
    await GameResult.deleteMany({ liveSessionId: id });
    await LiveSession.deleteOne({ _id: id });
    return res.json({ deleted: true });
  } catch (e) { res.status(500).json({ message: 'Server Error', error: e.message }); }
};
