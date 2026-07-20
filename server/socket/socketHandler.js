const { liveGames } = require('../realtimeState');
const LiveParticipant = require('../models/LiveParticipant');
const LiveSession = require('../models/LiveSession');
const Enrollment = require('../models/Enrollment');
const Class = require('../models/Class');

module.exports = function (io) {
  if (!io) return;

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
        const room = liveGames[code] = liveGames[code] || { players: [], sessionId: null, gameCreationId: null, status: 'lobby' };
        room.sessionId = sessionId || room.sessionId;
        room.gameCreationId = gameCreationId || room.gameCreationId;
        room.hostUserId = socket.user._id;
        room.status = room.status === 'running' || session?.status === 'running' ? 'running' : 'lobby';
        // join the socket to the room so emits can target it
        socket.join(code);

        // Send room-created to host only
        io.to(socket.id).emit('room-created', code);

        // Notify any listeners about current players (likely empty at host creation)
        io.to(code).emit('player-joined', room.players.slice());
        console.log('[socket] host-game -> created room', code);
      } catch (e) { console.error('host-game handler failed', e); }
    });

    socket.on('join-game', async ({ roomCode, playerName, userId } = {}, cb) => {
      try {
        const room = liveGames[roomCode];
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

        // add or update player in memory
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
              status: 'active', pausedRemainingMs: 0, accumulatedPauseMs: 0,
              dirty: false
            }
          };
          room.players.push(player);
        } else {
          existing.id = socket.id;
          existing.name = playerName;
          
          if (existing.stats && existing.stats.status === 'disconnected') {
            isRejoining = true;
            // Calculate pause abuse guard
            const disconnectDurationMs = Date.now() - new Date(existing.stats.disconnectedAt).getTime();
            existing.stats.accumulatedPauseMs = (existing.stats.accumulatedPauseMs || 0) + disconnectDurationMs;
            
            if (existing.stats.accumulatedPauseMs > 120000) {
              existing.stats.currentItemIndex = (existing.stats.currentItemIndex || 0) + 1;
              existing.stats.currentItemStartedAt = new Date();
              existing.stats.pausedRemainingMs = 0;
              existing.stats.accumulatedPauseMs = 0;
              console.log('[socket] Player exceeded pause cap on rejoin. Auto-skipped item.');
            } else {
               existing.stats.currentItemStartedAt = new Date(Date.now() - (existing.stats.pausedRemainingMs || 0));
            }
            existing.stats.status = 'active';
            existing.stats.dirty = true;
          } else if (!existing.stats) {
            existing.stats = {
              score: 0, correct: 0, wrong: 0, effectiveTimeMs: 0,
              currentItemIndex: 0, currentItemStartedAt: new Date(),
              status: 'active', pausedRemainingMs: 0, accumulatedPauseMs: 0,
              dirty: false
            };
          }
        }
        socket.join(roomCode);

        let resumeState = null;
        if (isRejoining && existing) {
          resumeState = {
            currentItemIndex: existing.stats.currentItemIndex,
            currentScore: existing.stats.score,
            elapsedMs: existing.stats.pausedRemainingMs
          };
          socket.emit('live:resume-state', resumeState);
        }

        // ✅ Create or update LiveParticipant in database
        if (room.sessionId && verifiedUserId) {
          try {
            const User = require('../models/User');
            const student = await User.findById(verifiedUserId).select('firstName lastName').lean();

            // Create or update participant record
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
                  effectiveTimeMs: 0
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

        // Update session status in database
        if (room.sessionId) {
          try {
            const session = await LiveSession.findById(room.sessionId);
            if (session && session.status !== 'ended') {
              session.status = 'ended';
              session.endedAt = new Date();
              if (!session.startedAt) session.startedAt = session.createdAt || new Date();
              await session.save();
              console.log('[socket] end-game -> session marked as ended:', room.sessionId);
            }
          } catch (e) {
            console.error('[socket] Failed to update session status:', e);
          }

          // Fetch final leaderboard from DB
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
                  finishedAt: p.finishedAt
                };
              })
              .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                if (a.effectiveTimeMs !== b.effectiveTimeMs) return a.effectiveTimeMs - b.effectiveTimeMs;
                return (a.wrong || 0) - (b.wrong || 0);
              });

            // Emit final scoreboard
            io.to(roomCode).emit('live:scoreboard', { ranks: finalRanks });
          } catch (e) {
            console.error('[socket] Failed to fetch final leaderboard:', e);
          }
        }

        io.to(roomCode).emit('game-ended', { sessionId: room.sessionId, ranks: finalRanks });
        // remove live game state
        try { delete liveGames[roomCode]; } catch { }
        console.log('[socket] end-game ->', roomCode);
      } catch (e) { console.error('end-game handler failed', e); }
    });

    // ✅ Handle live answer submissions from players
    socket.on('live:answer', async ({ roomCode, userId, correct, deltaMs, scoreDelta, currentScore } = {}) => {
      try {
        const room = liveGames[roomCode];
        if (!room || !room.sessionId) return;
        if (socket.user?.role !== 'student' || String(socket.user._id) !== String(userId)) return;

        console.log('[socket] live:answer ->', { roomCode, userId, correct, deltaMs, scoreDelta, currentScore });

        // Update participant record in memory
        try {
          const player = room.players.find(p => String(p.userId) === String(userId));
          if (player && player.stats) {
            // Update stats
            if (correct) {
              player.stats.correct = (player.stats.correct || 0) + 1;
            } else {
              player.stats.wrong = (player.stats.wrong || 0) + 1;
            }

            if (typeof currentScore === 'number') {
              player.stats.score = currentScore;
            } else if (typeof scoreDelta === 'number') {
              player.stats.score = (player.stats.score || 0) + scoreDelta;
            }

            // Add time penalty for wrong answers (3 seconds per wrong)
            const timePenaltyMs = correct ? 0 : 3000;
            player.stats.effectiveTimeMs = (player.stats.effectiveTimeMs || 0) + deltaMs + timePenaltyMs;
            
            // Advance pacing
            player.stats.currentItemIndex = (player.stats.currentItemIndex || 0) + 1;
            player.stats.currentItemStartedAt = new Date();
            player.stats.dirty = true; // Mark for background save

            // Calculate ranks entirely in-memory
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

            // Emit updated scoreboard to everyone in the room
            io.to(roomCode).emit('live:scoreboard', { ranks });
          } else {
            console.warn('[socket] live:answer - participant not found in memory:', { roomCode, userId });
          }
        } catch (e) {
          console.error('[socket] Failed to update participant in memory:', e);
        }
      } catch (e) {
        console.error('[socket] live:answer handler failed', e);
      }
    });

    // ✅ Handle when a player finishes the game
    socket.on('live:finish', async ({ roomCode, userId, totalTimeMs, score, correct, wrong } = {}) => {
      try {
        const room = liveGames[roomCode];
        if (!room || !room.sessionId) return;
        if (socket.user?.role !== 'student' || String(socket.user._id) !== String(userId)) return;

        console.log('[socket] live:finish ->', { roomCode, userId, totalTimeMs, score, correct, wrong });

        // Mark participant as finished and set final stats
        try {
          const participant = await LiveParticipant.findOne({
            sessionId: room.sessionId,
            studentId: userId
          });

          if (participant) {
            participant.finishedAt = participant.finishedAt || new Date();
            // Set final score data from GAME_COMPLETE
            if (typeof score === 'number') participant.score = score;
            if (typeof correct === 'number') participant.correct = correct;
            if (typeof wrong === 'number') participant.wrong = wrong;
            if (typeof totalTimeMs === 'number') {
              participant.effectiveTimeMs = totalTimeMs;
            }
            await participant.save();
            console.log('[socket] LiveParticipant updated:', { score: participant.score, correct: participant.correct, wrong: participant.wrong });

            // Check if all participants have finished
            const allParticipants = await LiveParticipant.find({
              sessionId: room.sessionId
            }).lean();

            const allFinished = allParticipants.every(p => p.finishedAt);
            const finishedCount = allParticipants.filter(p => p.finishedAt).length;

            console.log('[socket] Participants finished:', finishedCount, '/', allParticipants.length);

            // Emit final scoreboard
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
                  finishedAt: p.finishedAt
                };
              })
              .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                if (a.effectiveTimeMs !== b.effectiveTimeMs) return a.effectiveTimeMs - b.effectiveTimeMs;
                return (a.wrong || 0) - (b.wrong || 0);
              });

            io.to(roomCode).emit('live:scoreboard', { ranks });

            // If all finished, auto-end the session after a short delay
            if (allFinished) {
              console.log('[socket] All participants finished! Auto-ending session in 3 seconds...');
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
                  console.log('[socket] Session auto-ended:', room.sessionId);
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

    socket.on('disconnect', () => {
      try {
        console.log('[socket] disconnected', socket.id);
        for (const code of Object.keys(liveGames)) {
          const room = liveGames[code];
          
          if (room.hostUserId && socket.user && String(room.hostUserId) === String(socket.user._id)) {
             // Host disconnected. Do NOT kill the room.
             console.log('[socket] Host disconnected, keeping room alive:', code);
             continue;
          }

          const player = room.players.find(p => p.id === socket.id);
          if (player) {
            if (player.stats && player.stats.status === 'active') {
              player.stats.status = 'disconnected';
              // Calculate elapsed time on current item
              const startedAt = player.stats.currentItemStartedAt ? new Date(player.stats.currentItemStartedAt).getTime() : Date.now();
              const elapsed = Date.now() - startedAt;
              // We'll store this elapsed time as pausedRemainingMs since we don't know the budget here.
              // When they rejoin, we'll calculate how much pause time accumulated.
              player.stats.pausedRemainingMs = elapsed; 
              player.stats.disconnectedAt = new Date();
              player.stats.dirty = true;
            }
            // Notify others
            io.to(code).emit('live:session-count', { sessionId: room.sessionId, participantsCount: room.players.length });
          }
        }
      } catch (e) { console.error('disconnect cleanup failed', e); }
    });
    
    // ✅ Rejoin Game handler
    socket.on('rejoin-game', async ({ roomCode, userId }) => {
      try {
        const room = liveGames[roomCode];
        if (!room) { socket.emit('join-error', 'Room not found'); return; }
        if (socket.user?.role !== 'student' || String(socket.user._id) !== String(userId)) return;

        const player = room.players.find(p => String(p.userId) === String(userId));
        if (player && player.stats && player.stats.status === 'disconnected') {
          player.id = socket.id;
          socket.join(roomCode);
          
          // Calculate pause abuse guard
          const disconnectDurationMs = Date.now() - new Date(player.stats.disconnectedAt).getTime();
          player.stats.accumulatedPauseMs = (player.stats.accumulatedPauseMs || 0) + disconnectDurationMs;
          
          if (player.stats.accumulatedPauseMs > 120000) {
            // Exceeded 2-minute cap, skip item
            player.stats.currentItemIndex = (player.stats.currentItemIndex || 0) + 1;
            player.stats.currentItemStartedAt = new Date(); // Reset timer
            player.stats.pausedRemainingMs = 0;
            player.stats.accumulatedPauseMs = 0; // Reset for next item
            console.log('[socket] Player exceeded pause cap. Auto-skipped item.');
          } else {
             // Resume item
             // Shift the startedAt forward so elapsed time matches
             player.stats.currentItemStartedAt = new Date(Date.now() - player.stats.pausedRemainingMs);
          }
          
          player.stats.status = 'active';
          player.stats.dirty = true;
          
          // Send RESUME_STATE
          socket.emit('live:resume-state', {
            currentItemIndex: player.stats.currentItemIndex,
            currentScore: player.stats.score,
            elapsedMs: player.stats.pausedRemainingMs
          });
          
          io.to(roomCode).emit('live:session-count', { sessionId: room.sessionId, participantsCount: room.players.length });
          console.log('[socket] player rejoined', player.name, '->', roomCode);
        } else {
          socket.emit('join-error', 'Cannot rejoin. You are not disconnected in this room.');
        }
      } catch (e) { console.error('rejoin-game handler failed', e); }
    });

  });

  // Background Finalizer / Flusher loop (Runs every 4 seconds)
  setInterval(async () => {
    try {
      for (const code of Object.keys(liveGames)) {
        const room = liveGames[code];
        if (!room || !room.sessionId) continue;
        
        for (const player of room.players) {
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
                accumulatedPauseMs: player.stats.accumulatedPauseMs
              } }
            ).catch(err => {
              console.error('[socket] Background save failed for', player.userId, err);
              player.stats.dirty = true; // retry next tick
            });
          }
          
          // Task 4: Session-level auto-finalizer job (Rejoin window: 10 mins disconnected)
          if (player.stats && player.stats.status === 'disconnected') {
             const disconnectMs = Date.now() - new Date(player.stats.disconnectedAt).getTime();
             const sessionRejoinWindowMs = 10 * 60 * 1000; // 10 minutes buffer
             
             if (disconnectMs > sessionRejoinWindowMs) {
                console.log(`[socket] Player ${player.userId} absent past rejoin window. Auto-finalizing.`);
                player.stats.status = 'finished';
                player.stats.dirty = true;
                
                await LiveParticipant.findOneAndUpdate(
                  { sessionId: room.sessionId, studentId: player.userId },
                  { $set: { status: 'finished', finishedAt: new Date() } }
                );
             }
          }
        }
      }
    } catch (e) {
      console.error('[socket] background flusher error:', e);
    }
  }, 4000);

};
