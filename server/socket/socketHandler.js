const { liveGames } = require('../realtimeState');
const LiveParticipant = require('../models/LiveParticipant');
const LiveSession = require('../models/LiveSession');
const Enrollment = require('../models/Enrollment');
const Class = require('../models/Class');
const GameCreation = require('../models/GameCreation');
const { awardOnlineXpForSession } = require('../services/onlineXpService');

module.exports = function (io) {
  if (!io) return;

// Rebuilds an in-memory liveGames[roomCode] entry from persisted DB records
// if the process restarted and lost it. Returns the room object, or null if
// there genuinely is no such active session (not a restart-recovery case).
async function ensureRoomLoaded(roomCode) {
  if (liveGames[roomCode]) {
    return liveGames[roomCode]; // fast path — already in memory, do nothing extra
  }

  const session = await LiveSession.findOne({ code: roomCode }).lean();
  if (!session || session.status === 'ended') {
    return null; // no recovery possible — this is a genuinely invalid/ended room code
  }

  let config = { itemPauseCapMs: 120000, maxPauseCycles: 2, rejoinWindowMs: 600000 };
  if (session.gameCreationId) {
    const creation = await GameCreation.findById(session.gameCreationId)
      .select('itemPauseCapMs maxPauseCycles rejoinWindowMs').lean();
    if (creation) {
      config.itemPauseCapMs = creation.itemPauseCapMs ?? 120000;
      config.maxPauseCycles = creation.maxPauseCycles ?? 2;
      config.rejoinWindowMs = creation.rejoinWindowMs ?? 600000;
    }
  }

  const participants = await LiveParticipant.find({ sessionId: session._id }).lean();
  const players = participants.map((p) => ({
    id: null, // no live socket yet — set when they actually reconnect
    userId: p.studentId,
    name: [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Student',
    stats: {
      score: p.score || 0,
      correct: p.correct || 0,
      wrong: p.wrong || 0,
      effectiveTimeMs: p.effectiveTimeMs || 0,
      currentItemIndex: p.currentItemIndex || 0,
      currentItemStartedAt: p.currentItemStartedAt || new Date(),
      // Everyone lost their live connection when the server restarted — force
      // 'disconnected' so they go through the normal rejoin flow, UNLESS they
      // had already genuinely finished before the restart.
      status: p.status === 'finished' ? 'finished' : 'disconnected',
      pausedRemainingMs: p.pausedRemainingMs || 0,
      pauseCyclesUsed: 0,
      accumulatedPauseMs: p.accumulatedPauseMs || 0,
      // We don't know exactly when they really disconnected before the crash/restart,
      // so we start their pause clock from "now" — this slightly undercounts their
      // pause duration, which is the safer direction (favors the student, not the platform).
      disconnectedAt: new Date(),
      dirty: false,
    },
  }));

  const room = {
    players,
    sessionId: session._id,
    gameCreationId: session.gameCreationId,
    hostUserId: session.teacherId,
    status: session.status === 'running' ? 'running' : 'lobby',
    config,
  };

  liveGames[roomCode] = room;
  console.log(`[socket] Rehydrated room ${roomCode} from DB after apparent restart (${players.length} participants).`);
  return room;
}

  // Background Finalizer loop handles timeouts
  let flusherInterval = setInterval(async () => {
    try {
      for (const code of Object.keys(liveGames)) {
        const room = liveGames[code];
        if (!room || !room.sessionId) continue;
        
        let hasActive = false;
        let hasDisconnected = false;
        let allFinishedOrDisconnected = true;
        
        for (const player of room.players) {
          if (player.stats && player.stats.status === 'active') hasActive = true;
          if (player.stats && player.stats.status === 'disconnected') hasDisconnected = true;
          if (player.stats && player.stats.status !== 'finished' && player.stats.status !== 'disconnected') allFinishedOrDisconnected = false;

          // 1. Process dirty stats
          if (player.stats && player.stats.dirty) {
            player.stats.dirty = false; // clear flag before save to prevent race conditions
            await LiveParticipant.findOneAndUpdate(
              { sessionId: room.sessionId, studentId: player.userId },
              { $set: {
                score: player.stats.score,
                correct: player.stats.correct,
                wrong: player.stats.wrong,
                effectiveTimeMs: player.stats.effectiveTimeMs,
                currentItemIndex: player.stats.currentItemIndex,
                currentItemStartedAt: player.stats.currentItemStartedAt,
                status: player.stats.status,
                pausedRemainingMs: player.stats.pausedRemainingMs,
                accumulatedPauseMs: player.stats.accumulatedPauseMs,
                leftAt: player.stats.status === 'disconnected' ? new Date() : undefined
              } }
            ).catch(err => {
              console.error('[socket] Background save failed for', player.userId, err);
              player.stats.dirty = true; // retry next tick
            });
          }
        }

        // 2. Ghost eviction
        if (!hasActive && hasDisconnected && allFinishedOrDisconnected) {
          if (!room.emptySince) {
            room.emptySince = Date.now();
          } else if (Date.now() - room.emptySince > 60000) {
            console.log(`[socket] Room ${code} ghost eviction triggered. Finishing disconnected players.`);
            for (const player of room.players) {
              if (player.stats && player.stats.status === 'disconnected') {
                player.stats.status = 'finished';
                player.stats.dirty = true;
                await LiveParticipant.findOneAndUpdate(
                  { sessionId: room.sessionId, studentId: player.userId },
                  { $set: { status: 'finished', finishedAt: new Date() } }
                );
              }
            }
            // The room will be auto-ended by the 'live:finish' check soon, but we can force it:
            setTimeout(async () => {
              try {
                const session = await LiveSession.findById(room.sessionId);
                if (session && session.status !== 'ended') {
                  session.status = 'ended';
                  session.endedAt = new Date();
                  await session.save();
                  awardOnlineXpForSession(session._id); // fire-and-forget
                }
                io.to(code).emit('game-ended', { sessionId: room.sessionId, autoEnded: true });
                delete liveGames[code];
              } catch (e) {
                console.error('[socket] Auto-end failed:', e);
              }
            }, 3000);
          }
        } else {
          room.emptySince = null;
        }
      }
    } catch (e) {
      console.error('[socket] background flusher error:', e);
    }
  }, 4000);

  // Real-time ticking leaderboard for the Host dashboard
  let tickerInterval = setInterval(() => {
    try {
      for (const code of Object.keys(liveGames)) {
        const room = liveGames[code];
        // Only tick and emit if the game is actually running
        if (!room || !room.sessionId || room.status !== 'running') continue;
        
        let hasActivePlayer = false;
        const now = Date.now();
        
        const ranks = room.players
          .filter(p => p.stats)
          .map(p => {
            let liveTime = p.stats.effectiveTimeMs || 0;
            // Add real-time ticking if they are active on a question
            if (p.stats.status === 'active' && p.stats.currentItemStartedAt) {
              hasActivePlayer = true;
              const elapsed = now - new Date(p.stats.currentItemStartedAt).getTime();
              if (elapsed > 0) {
                liveTime += elapsed;
              }
            }
            
            return {
              userId: String(p.userId),
              name: p.name || 'Unknown',
              score: p.stats.score || 0,
              correct: p.stats.correct || 0,
              wrong: p.stats.wrong || 0,
              effectiveTimeMs: liveTime,
              finishedAt: p.stats.finishedAt,
              status: p.stats.status || 'active',
              currentItemIndex: p.stats.currentItemIndex || 0
            };
          })
          .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (a.effectiveTimeMs !== b.effectiveTimeMs) return a.effectiveTimeMs - b.effectiveTimeMs;
            return (a.wrong || 0) - (b.wrong || 0);
          });
          
        // Emit only if there are active players ticking up time
        if (hasActivePlayer) {
          io.to(code).emit('live:scoreboard', { ranks });
        }
      }
    } catch (e) {
      console.error('[socket] live ticker error:', e);
    }
  }, 1000);

  // Graceful shutdown flush
  const shutdown = async () => {
    console.log('[socket] SIGTERM/SIGINT received, flushing sockets...');
    clearInterval(flusherInterval);
    clearInterval(tickerInterval);
    // Flush all players immediately
    for (const code of Object.keys(liveGames)) {
      const room = liveGames[code];
      if (!room || !room.sessionId) continue;
      for (const player of room.players) {
        if (player.stats && player.stats.status === 'active') {
          await LiveParticipant.findOneAndUpdate(
            { sessionId: room.sessionId, studentId: player.userId },
            { $set: { 
              status: 'disconnected', 
              pausedRemainingMs: player.stats.pausedRemainingMs, 
              accumulatedPauseMs: player.stats.accumulatedPauseMs,
              score: player.stats.score,
              currentItemIndex: player.stats.currentItemIndex,
              leftAt: new Date()
            } }
          );
        } else if (player.stats && player.stats.dirty) {
          await LiveParticipant.findOneAndUpdate(
            { sessionId: room.sessionId, studentId: player.userId },
            { $set: { 
              status: player.stats.status, 
              pausedRemainingMs: player.stats.pausedRemainingMs, 
              accumulatedPauseMs: player.stats.accumulatedPauseMs,
              score: player.stats.score,
              currentItemIndex: player.stats.currentItemIndex,
            } }
          );
        }
      }
    }
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  io.on('connection', (socket) => {
    console.log('[socket] connected', socket.id);

    socket.on('identify', (payload) => {
      try {
        const { role, userId } = payload || {};
        if (socket.user && String(socket.user._id) === String(userId) && socket.user.role === role) {
          socket._identified = { role, userId };
          console.log('[socket] identify', socket.id, role, userId);
        }
      } catch (e) { console.warn('identify handler failed', e); }
    });

    socket.on('host-game', async ({ code, sessionId, gameCreationId } = {}) => {
      try {
        if (!code) return;
        if (socket.user?.role !== 'teacher') {
          socket.emit('host-error', 'Only teachers can host live games.');
          return;
        }
        let session = null;
        if (sessionId) {
          session = await LiveSession.findOne({
            _id: sessionId,
            teacherId: socket.user._id,
            gameCreationId
          }).select('_id status').lean();
          if (!session) {
            socket.emit('host-error', 'Live session not found or not owned by this teacher.');
            return;
          }
        }
        
        let config = { itemPauseCapMs: 120000, maxPauseCycles: 2, rejoinWindowMs: 600000 };
        if (gameCreationId) {
          const creation = await GameCreation.findById(gameCreationId).select('itemPauseCapMs maxPauseCycles rejoinWindowMs').lean();
          if (creation) {
            config.itemPauseCapMs = creation.itemPauseCapMs ?? 120000;
            config.maxPauseCycles = creation.maxPauseCycles ?? 2;
            config.rejoinWindowMs = creation.rejoinWindowMs ?? 600000;
          }
        }

        const room = (await ensureRoomLoaded(code)) || (liveGames[code] = { players: [], sessionId: null, gameCreationId: null, status: 'lobby', config });
        room.sessionId = sessionId || room.sessionId;
        room.gameCreationId = gameCreationId || room.gameCreationId;
        room.hostUserId = socket.user._id;
        room.status = room.status === 'running' || session?.status === 'running' ? 'running' : 'lobby';
        socket.join(code);
        io.to(socket.id).emit('room-created', code);
        io.to(socket.id).emit('player-joined', room.players.slice());
        
        if (room.status === 'running') {
          io.to(socket.id).emit('game-started', { gameCreationId: room.gameCreationId });
          
          const ranks = room.players
            .filter(p => p.stats)
            .map(p => ({
              userId: String(p.userId),
              name: p.name || 'Unknown',
              score: p.stats.score || 0,
              correct: p.stats.correct || 0,
              wrong: p.stats.wrong || 0,
              effectiveTimeMs: p.stats.effectiveTimeMs || 0,
              finishedAt: p.stats.finishedAt,
              status: p.stats.status || 'active',
              currentItemIndex: p.stats.currentItemIndex || 0
            }))
            .sort((a, b) => {
              if (b.score !== a.score) return b.score - a.score;
              if (a.effectiveTimeMs !== b.effectiveTimeMs) return a.effectiveTimeMs - b.effectiveTimeMs;
              return (a.wrong || 0) - (b.wrong || 0);
            });
          io.to(socket.id).emit('live:scoreboard', { ranks });
        }
        
        console.log('[socket] host-game -> created/rejoined room', code, room.status);
      } catch (e) { console.error('host-game handler failed', e); }
    });

    socket.on('join-game', async ({ roomCode, playerName, userId } = {}, cb) => {
      try {
        const room = await ensureRoomLoaded(roomCode);
        if (!room) { socket.emit('join-error', 'Room not found'); return; }
        if (socket.user?.role !== 'student') { socket.emit('join-error', 'Only students can join as players.'); return; }
        const verifiedUserId = socket.user._id;
        if (userId && String(userId) !== String(verifiedUserId)) { socket.emit('join-error', 'Invalid player identity.'); return; }

        let studentClassId = null;
        let session = null;
        if (room.sessionId) {
          session = await LiveSession.findById(room.sessionId).select('classes status allowLateJoin').lean();
          if (!session || session.status === 'ended') { socket.emit('join-error', 'This live session has ended.'); return; }
          const alreadyInRoom = room.players.some(p => String(p.userId) === String(verifiedUserId));
          if (session.status === 'running' && session.allowLateJoin === false && !alreadyInRoom) {
            socket.emit('join-error', 'Late joining is not allowed for this session.');
            return;
          }
          if (Array.isArray(session.classes) && session.classes.length > 0) {
            const enrollment = await Enrollment.findOne({
              studentId: verifiedUserId,
              classId: { $in: session.classes },
              status: 'active'
            }).select('classId').lean();

            const embeddedClass = enrollment ? null : await Class.findOne({
              _id: { $in: session.classes },
              enrolledStudents: { $elemMatch: { studentId: verifiedUserId, status: 'active' } }
            }).select('_id').lean();

            if (!enrollment && !embeddedClass) {
              socket.emit('join-error', 'You are not enrolled in a class for this live session.');
              return;
            }
            studentClassId = enrollment?.classId || embeddedClass?._id;
          }
        }

        const existing = room.players.find(p => String(p.userId) === String(verifiedUserId));
        let isRejoining = false;
        
        if (!existing) {
          const player = { 
            id: socket.id, 
            userId: verifiedUserId, 
            name: playerName,
            stats: {
              score: 0, correct: 0, wrong: 0, effectiveTimeMs: 0,
              currentItemIndex: 0, currentItemStartedAt: new Date(),
              status: 'active', pausedRemainingMs: 0, pauseCyclesUsed: 0
            }
          };
          room.players.push(player);
        } else {
          existing.id = socket.id;
          existing.name = playerName;
          
          if (existing.stats && existing.stats.status === 'disconnected') {
            socket.emit('join-error', 'You are already in this room. Please use the Rejoin button.');
            return;
          } else if (!existing.stats) {
            existing.stats = {
              score: 0, correct: 0, wrong: 0, effectiveTimeMs: 0,
              currentItemIndex: 0, currentItemStartedAt: new Date(),
              status: 'active', pausedRemainingMs: 0, pauseCyclesUsed: 0
            };
          }
        }
        socket.join(roomCode);

        let resumeState = null;

        if (room.sessionId && verifiedUserId) {
          try {
            const User = require('../models/User');
            const student = await User.findById(verifiedUserId).select('firstName lastName').lean();

            await LiveParticipant.findOneAndUpdate(
              { sessionId: room.sessionId, studentId: verifiedUserId },
              {
                $set: {
                  firstName: student?.firstName || playerName?.split(' ')[0] || 'Student',
                  lastName: student?.lastName || playerName?.split(' ')[1] || '',
                  classId: studentClassId,
                  lastPingAt: new Date()
                },
                $setOnInsert: {
                  joinedAt: new Date(),
                  score: 0,
                  correct: 0,
                  wrong: 0,
                  rawTimeMs: 0,
                  effectiveTimeMs: 0,
                  pauseCyclesUsed: 0
                }
              },
              { upsert: true, new: true }
            );

            console.log('[socket] LiveParticipant created/updated for', playerName, 'in session', room.sessionId);
          } catch (e) {
            console.error('[socket] Failed to create LiveParticipant:', e);
          }
        }

        io.to(roomCode).emit('player-joined', room.players.slice());
        io.to(roomCode).emit('live:session-count', { sessionId: room.sessionId, participantsCount: room.players.length });
        console.log('[socket] player joined', playerName, '->', roomCode);

        if (typeof cb === 'function') {
           cb({ success: true, resumeState });
        }
      } catch (e) { console.error('join-game handler failed', e); }
    });

    socket.on('start-game', async (roomCode) => {
      try {
        const room = liveGames[roomCode];
        if (!room) return;
        if (String(room.hostUserId || '') !== String(socket.user?._id || '')) return;
        room.status = 'running';
        if (room.sessionId) {
          try {
            const session = await LiveSession.findById(room.sessionId);
            if (session && session.status !== 'ended') {
              session.status = 'running';
              if (!session.startedAt) session.startedAt = new Date();
              await session.save();
            }
          } catch (e) {
            console.error('[socket] Failed to mark live session as running:', e);
          }
        }
        io.to(roomCode).emit('game-started', { gameCreationId: room.gameCreationId, sessionId: room.sessionId });
        console.log('[socket] start-game ->', roomCode);
      } catch (e) { console.error('start-game handler failed', e); }
    });

    socket.on('end-game', async (roomCode) => {
      try {
        const room = liveGames[roomCode];
        if (!room) return;
        if (String(room.hostUserId || '') !== String(socket.user?._id || '')) return;

        let finalRanks = [];

        if (room.sessionId) {
          try {
            const session = await LiveSession.findById(room.sessionId);
            if (session && session.status !== 'ended') {
              session.status = 'ended';
              session.endedAt = new Date();
              if (!session.startedAt) session.startedAt = session.createdAt || new Date();
              await session.save();
              awardOnlineXpForSession(session._id); // fire-and-forget
              console.log('[socket] end-game -> session marked as ended:', room.sessionId);
            }
          } catch (e) {
            console.error('[socket] Failed to update session status:', e);
          }

          try {
            const allParticipants = await LiveParticipant.find({
              sessionId: room.sessionId
            }).lean();

            finalRanks = allParticipants
              .map(p => {
                const pName = p.firstName ? [p.firstName, p.lastName].filter(Boolean).join(' ') : 'Unknown';
                return {
                  userId: String(p.studentId),
                  name: pName,
                  score: p.score || 0,
                  correct: p.correct || 0,
                  wrong: p.wrong || 0,
                  effectiveTimeMs: p.effectiveTimeMs || 0,
                  finishedAt: p.finishedAt,
                  status: p.status || 'active',
                  currentItemIndex: p.currentItemIndex || 0
                };
              })
              .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                if (a.effectiveTimeMs !== b.effectiveTimeMs) return a.effectiveTimeMs - b.effectiveTimeMs;
                return (a.wrong || 0) - (b.wrong || 0);
              });

            io.to(roomCode).emit('live:scoreboard', { ranks: finalRanks });
          } catch (e) {
            console.error('[socket] Failed to fetch final leaderboard:', e);
          }
        }

        io.to(roomCode).emit('game-ended', { sessionId: room.sessionId, ranks: finalRanks });
        try { delete liveGames[roomCode]; } catch { }
        console.log('[socket] end-game ->', roomCode);
      } catch (e) { console.error('end-game handler failed', e); }
    });

    socket.on('live:answer', async ({ roomCode, answers } = {}) => {
      try {
        const room = liveGames[roomCode];
        if (!room || !room.sessionId) return;
        if (socket.user?.role !== 'student') return;
        
        const userId = socket.user._id;
        console.log(`\n[WAJIBET_V2] [socket] LIVE:ANSWER RECEIVED -> room: ${roomCode}, user: ${userId}`);
        console.log(`[WAJIBET_V2] [socket] Raw Answers Payload:`, JSON.stringify(answers, null, 2));

        if (!Array.isArray(answers) || answers.length === 0) return;

        try {
          const player = room.players.find(p => String(p.userId) === String(userId));
          if (player && player.stats) {
            
            let totalCorrect = 0;
            let totalWrong = 0;
            let totalTimeMs = 0;
            let totalScore = 0;

            // Process the V2 array
            for (const answer of answers) {
              if (answer.isCorrect) totalCorrect++;
              else totalWrong++;
              
              totalScore += (answer.score || 0);
              
              // 3 second penalty for wrong answers to discourage spamming
              const timePenaltyMs = answer.isCorrect ? 0 : 3000;
              totalTimeMs += (answer.timeMs || 0) + timePenaltyMs;
              
              // Store the detailed answer for the DB
              if (!player.stats.answers) player.stats.answers = [];
              player.stats.answers.push(answer);
            }

            player.stats.correct = (player.stats.correct || 0) + totalCorrect;
            player.stats.wrong = (player.stats.wrong || 0) + totalWrong;
            player.stats.score = (player.stats.score || 0) + totalScore;
            player.stats.effectiveTimeMs = (player.stats.effectiveTimeMs || 0) + totalTimeMs;
            
            player.stats.currentItemIndex = (player.stats.currentItemIndex || 0) + answers.length;
            player.stats.currentItemStartedAt = new Date();
            player.stats.pauseCyclesUsed = 0; 
            
            console.log(`[WAJIBET_V2] [socket] Calculated -> Score += ${totalScore}, Time += ${totalTimeMs}ms`);
            console.log(`[WAJIBET_V2] [socket] New Totals -> Score: ${player.stats.score}, Time: ${player.stats.effectiveTimeMs}ms, Index: ${player.stats.currentItemIndex}`);

            if (room.sessionId) {
              await LiveParticipant.findOneAndUpdate(
                { sessionId: room.sessionId, studentId: userId },
                {
                  $inc: { 
                    correct: totalCorrect, 
                    wrong: totalWrong, 
                    effectiveTimeMs: totalTimeMs 
                  },
                  $set: { 
                    score: player.stats.score, 
                    currentItemIndex: player.stats.currentItemIndex, 
                    currentItemStartedAt: player.stats.currentItemStartedAt,
                    pauseCyclesUsed: 0,
                    lastPingAt: new Date()
                  },
                  $push: {
                    answers: { $each: answers }
                  }
                }
              ).catch(e => console.error('[WAJIBET_V2] [socket] DB write failed', e));
            }

            const ranks = room.players
              .filter(p => p.stats)
              .map(p => ({
                userId: String(p.userId),
                name: p.name || 'Unknown',
                score: p.stats.score || 0,
                correct: p.stats.correct || 0,
                wrong: p.stats.wrong || 0,
                effectiveTimeMs: p.stats.effectiveTimeMs || 0,
                finishedAt: p.stats.finishedAt,
                status: p.stats.status || 'active',
                currentItemIndex: p.stats.currentItemIndex || 0
              }))
              .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                if (a.effectiveTimeMs !== b.effectiveTimeMs) return a.effectiveTimeMs - b.effectiveTimeMs;
                return (a.wrong || 0) - (b.wrong || 0);
              });

            io.to(roomCode).emit('live:scoreboard', { ranks });
          }
        } catch (e) {
          console.error('[socket] Failed to update participant in memory:', e);
        }
      } catch (e) {
        console.error('live:answer handler failed', e);
      }
    });

    socket.on('live:finish', async ({ roomCode, userId }) => {
      try {
        const room = liveGames[roomCode];
        if (!room || !room.sessionId) return;
        
        const player = room.players.find(p => String(p.userId) === String(userId));
        if (player && player.stats) {
          player.stats.finishedAt = new Date();
          
          if (room.sessionId) {
            await LiveParticipant.findOneAndUpdate(
              { sessionId: room.sessionId, studentId: userId },
              { $set: { finishedAt: player.stats.finishedAt } }
            ).catch(e => console.error('[WAJIBET_V2] [socket] finish write failed', e));
          }
          
          const ranks = room.players
            .filter(p => p.stats)
            .map(p => ({
              userId: String(p.userId),
              name: p.name || 'Unknown',
              score: p.stats.score || 0,
              correct: p.stats.correct || 0,
              wrong: p.stats.wrong || 0,
              effectiveTimeMs: p.stats.effectiveTimeMs || 0,
              finishedAt: p.stats.finishedAt
            }))
            .sort((a, b) => {
              if (b.score !== a.score) return b.score - a.score;
              if (a.effectiveTimeMs !== b.effectiveTimeMs) return a.effectiveTimeMs - b.effectiveTimeMs;
              return (a.wrong || 0) - (b.wrong || 0);
            });

          io.to(roomCode).emit('live:scoreboard', { ranks });
          console.log(`[WAJIBET_V2] [socket] Player Finished -> room: ${roomCode}, user: ${userId}`);
        }
      } catch (e) {
        console.error('live:finish handler failed', e);
      }
    });

    socket.on('live:finish', async ({ roomCode, userId, totalTimeMs, score, correct, wrong } = {}) => {
      try {
        const room = liveGames[roomCode];
        if (!room || !room.sessionId) return;
        if (socket.user?.role !== 'student') return;

        console.log(`\n[WAJIBET_V2] [socket] LIVE:FINISH RECEIVED -> room: ${roomCode}, user: ${userId}`);
        console.log(`[WAJIBET_V2] [socket] Engine Payload -> Score: ${score}, Correct: ${correct}, Wrong: ${wrong}, totalTimeMs: ${totalTimeMs}`);

        try {
          const participant = await LiveParticipant.findOne({
            sessionId: room.sessionId,
            studentId: userId
          });

          if (participant) {
            participant.finishedAt = participant.finishedAt || new Date();
            participant.status = 'finished';
            
            // We NO LONGER overwrite effectiveTimeMs from the engine's totalTimeMs. 
            // We trust the backend's live:answer calculation instead to prevent 0s bugs.
            
            if (typeof score === 'number') participant.score = score;
            if (typeof correct === 'number') participant.correct = correct;
            if (typeof wrong === 'number') participant.wrong = wrong;
            
            await participant.save();
            
            console.log(`[WAJIBET_V2] [socket] DB Saved! Final Backend Time: ${participant.effectiveTimeMs}ms`);

            const player = room.players.find(p => String(p.userId) === String(userId));
            if (player && player.stats) {
               player.stats.status = 'finished';
               player.stats.finishedAt = participant.finishedAt;
               player.stats.score = participant.score;
            }

            const allParticipants = await LiveParticipant.find({
              sessionId: room.sessionId
            }).lean();

            const allFinished = allParticipants.every(p => p.finishedAt);
            const ranks = allParticipants
              .map(p => {
                const pName = p.firstName ? [p.firstName, p.lastName].filter(Boolean).join(' ') : 'Unknown';
                return {
                  userId: String(p.studentId),
                  name: pName,
                  score: p.score || 0,
                  correct: p.correct || 0,
                  wrong: p.wrong || 0,
                  effectiveTimeMs: p.effectiveTimeMs || 0,
                  finishedAt: p.finishedAt,
                  status: p.status || 'active',
                  currentItemIndex: p.currentItemIndex || 0
                };
              })
              .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                if (a.effectiveTimeMs !== b.effectiveTimeMs) return a.effectiveTimeMs - b.effectiveTimeMs;
                return (a.wrong || 0) - (b.wrong || 0);
              });

            io.to(roomCode).emit('live:scoreboard', { ranks });

            if (allFinished) {
              setTimeout(async () => {
                try {
                  const session = await LiveSession.findById(room.sessionId);
                  if (session && session.status !== 'ended') {
                    session.status = 'ended';
                    session.endedAt = new Date();
                    if (!session.startedAt) session.startedAt = session.createdAt || new Date();
                    await session.save();
                  }
                  io.to(roomCode).emit('game-ended', { sessionId: room.sessionId, autoEnded: true });
                  delete liveGames[roomCode];
                } catch (e) {
                  console.error('[socket] Auto-end failed:', e);
                }
              }, 3000);
            }
          }
        } catch (e) {
          console.error('[socket] Failed to update participant finish:', e);
        }
      } catch (e) {
        console.error('[socket] live:finish handler failed', e);
      }
    });

    socket.on('disconnect', async () => {
      try {
        console.log(`[WAJIBET_V2] [socket] DISCONNECT DETECTED -> socket: ${socket.id}`);
        for (const code of Object.keys(liveGames)) {
          const room = liveGames[code];
          
          if (room.hostUserId && socket.user && String(room.hostUserId) === String(socket.user._id)) {
             console.log(`[WAJIBET_V2] [socket] HOST DISCONNECTED -> room: ${code}`);
             continue;
          }

          const player = room.players.find(p => p.id === socket.id);
          if (player) {
            if (player.stats && player.stats.status === 'active') {
              player.stats.status = 'disconnected';
              const startedAt = player.stats.currentItemStartedAt ? new Date(player.stats.currentItemStartedAt).getTime() : Date.now();
              const elapsed = Date.now() - startedAt;
              player.stats.pausedRemainingMs = elapsed; 
              player.stats.disconnectedAt = new Date();
              
              if (room.sessionId) {
                await LiveParticipant.findOneAndUpdate(
                  { sessionId: room.sessionId, studentId: player.userId },
                  { $set: { 
                    status: 'disconnected', 
                    pausedRemainingMs: elapsed,
                    accumulatedPauseMs: player.stats.accumulatedPauseMs,
                    score: player.stats.score,
                    currentItemIndex: player.stats.currentItemIndex,
                    currentItemStartedAt: player.stats.currentItemStartedAt,
                    leftAt: new Date()
                  } }
                ).catch(e => console.error(e));
              }
            }
            io.to(code).emit('live:session-count', { sessionId: room.sessionId, participantsCount: room.players.length });
          }
        }
      } catch (e) { console.error('disconnect cleanup failed', e); }
    });
    socket.on('leave-game', async ({ roomCode }) => {
      try {
        if (!roomCode) return;
        const room = liveGames[roomCode];
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
          if (player.stats && player.stats.status === 'active') {
            player.stats.status = 'disconnected';
            const startedAt = player.stats.currentItemStartedAt ? new Date(player.stats.currentItemStartedAt).getTime() : Date.now();
            const elapsed = Date.now() - startedAt;
            player.stats.pausedRemainingMs = elapsed; 
            player.stats.disconnectedAt = new Date();
            
            if (room.sessionId) {
              await LiveParticipant.findOneAndUpdate(
                { sessionId: room.sessionId, studentId: player.userId },
                { $set: { 
                  status: 'disconnected', 
                  pausedRemainingMs: elapsed,
                  accumulatedPauseMs: player.stats.accumulatedPauseMs,
                  score: player.stats.score,
                  currentItemIndex: player.stats.currentItemIndex,
                  currentItemStartedAt: player.stats.currentItemStartedAt,
                  leftAt: new Date()
                } }
              ).catch(e => console.error(e));
            }
          }
          io.to(roomCode).emit('live:session-count', { sessionId: room.sessionId, participantsCount: room.players.length });
        }
        socket.leave(roomCode);
      } catch (e) { console.error('leave-game cleanup failed', e); }
    });

    socket.on('rejoin-game', async ({ roomCode, userId }, cb) => {
      try {
        const room = await ensureRoomLoaded(roomCode);
        if (!room) { socket.emit('join-error', 'Room not found'); return; }
        if (socket.user?.role !== 'student' || String(socket.user._id) !== String(userId)) return;

        const player = room.players.find(p => String(p.userId) === String(userId));
        if (player && player.stats && (player.stats.status === 'disconnected' || player.stats.status === 'active')) {
          const wasDisconnected = player.stats.status === 'disconnected';
          
          player.id = socket.id;
          socket.join(roomCode);
          
          if (wasDisconnected) {
            const disconnectDurationMs = Date.now() - new Date(player.stats.disconnectedAt || Date.now()).getTime();
            player.stats.accumulatedPauseMs = (player.stats.accumulatedPauseMs || 0) + disconnectDurationMs;
            
            if (player.stats.accumulatedPauseMs > (room.config?.itemPauseCapMs || 120000)) {
              player.stats.currentItemIndex = (player.stats.currentItemIndex || 0) + 1;
              player.stats.currentItemStartedAt = new Date(); 
              player.stats.pausedRemainingMs = 0;
              player.stats.accumulatedPauseMs = 0; 
              console.log('[socket] Player exceeded pause cap. Auto-skipped item.');
            } else {
               player.stats.currentItemStartedAt = new Date(Date.now() - player.stats.pausedRemainingMs);
            }
            
            player.stats.status = 'active';
            player.stats.dirty = true;
            room.emptySince = null; // Clear empty timer
          } else {
            // Player was active, but component remounted (SPA navigation).
            // Calculate elapsed time dynamically based on current time so they resume exactly where they were
            const startedAt = player.stats.currentItemStartedAt ? new Date(player.stats.currentItemStartedAt).getTime() : Date.now();
            player.stats.pausedRemainingMs = Date.now() - startedAt;
          }
          
          const resumeState = {
            currentItemIndex: player.stats.currentItemIndex,
            currentScore: player.stats.score,
            elapsedMs: player.stats.pausedRemainingMs
          };
          
          socket.emit('live:resume-state', resumeState);
          
          io.to(roomCode).emit('live:session-count', { sessionId: room.sessionId, participantsCount: room.players.length });
          console.log(`[WAJIBET_V2] [socket] REJOIN SUCCESS -> player: ${player.name}, room: ${roomCode}, elapsedMs: ${resumeState.elapsedMs}, index: ${resumeState.currentItemIndex}`);
          
          if (typeof cb === 'function') {
            cb({ success: true, resumeState });
          }
        } else {
          console.warn(`[WAJIBET_V2] [socket] REJOIN REJECTED -> user: ${userId}, room: ${roomCode} - Invalid Status: ${player?.stats?.status}`);
          socket.emit('join-error', 'Cannot rejoin. Invalid game state.');
        }
      } catch (e) { console.error('rejoin-game handler failed', e); }
    });

    socket.on('leave-room', (code) => {
      if (code) {
        socket.leave(code);
        console.log(`[socket] left room: ${code}`);
      }
    });

  });

};

