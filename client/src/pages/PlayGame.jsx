// PlayGame.jsx - Enhanced with minimal clean design
import React, { useState, useEffect, useRef, useContext } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { SocketContext } from '../context/SocketContext';
import { GameLogger } from '../utils/gameLogger';
import { useLanguage } from '../context/LanguageContext';
import axios from 'axios';

const PlayGame = () => {
  const { user } = useContext(AuthContext);
  const { language, isRTL } = useLanguage();
  const socketContext = useContext(SocketContext);
  const socket = socketContext?.socket;
  const socketConnected = socketContext?.connected;
  const navigate = useNavigate();
  const { creationId } = useParams();
  const location = useLocation();
  const assignmentId = location.state?.assignmentId || null;
  const liveInfo = location.state?.live || null;
  const [gameCreation, setGameCreation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [gate, setGate] = useState({ loading: true, allow: true, reason: null, attemptNumber: 1, attemptLimit: 1, attemptsRemaining: 1 });
  const [submitError, setSubmitError] = useState(null);
  const [liveSaved, setLiveSaved] = useState(false);
  const [liveEnded, setLiveEnded] = useState(false);

  const [resumeState, setResumeState] = useState(null);
  const [joinConfirmed, setJoinConfirmed] = useState(!liveInfo?.roomCode || user?.role !== 'student');
  const joinConfirmedRef = useRef(joinConfirmed);
  useEffect(() => {
    joinConfirmedRef.current = joinConfirmed;
  }, [joinConfirmed]);
  // True once the engine has announced GAME_INIT via the SDK handshake.
  const engineReady = useRef(false);
  const [engineFailed, setEngineFailed] = useState(false);

  const [ranks, setRanks] = useState([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const iframeRef = useRef(null);
  const checkpointBufferRef = useRef([]);
  const checkpointCounterRef = useRef(0);
  const gameCompleteHandledRef = useRef(false);
  const consecutiveAnswerFailures = useRef(0);
  const joinInFlightRef = useRef(false);
  const [syncWarning, setSyncWarning] = useState(false);

  const resolveEngineSrc = (enginePath) => {
    if (!enginePath) return '';
    const normalizedPath = enginePath
      .replace(/\/index\.html?$/i, '/')
      .replace(/\/?$/, '/');
    return new URL(normalizedPath, window.location.origin).toString();
  };

  const getLiveSessionId = () => {
    return liveInfo?.sessionId || liveInfo?.id || gameCreation?.liveSessionId || gameCreation?.sessionId || null;
  };



  useEffect(() => {
    const fetchGameCreation = async () => {
      try {
        const config = liveInfo?.roomCode ? { headers: { 'X-Live-Room': liveInfo.roomCode } } : undefined;
        const { data } = await axios.get(`/api/creations/${creationId}`, config);
        setGameCreation(data);
      } catch (err) {
        setError('Failed to load game');
      } finally {
        setLoading(false);
      }
    };
    fetchGameCreation();
  }, [creationId]);

  // Robust SDK Fallback: Wait 15 seconds for the engine to initialize
  useEffect(() => {
    if (gameCreation && !loading && !error && !engineFailed) {
      const timeout = setTimeout(() => {
        if (!engineReady.current) {
          setEngineFailed(true);
        }
      }, 15000);
      return () => clearTimeout(timeout);
    }
  }, [gameCreation, loading, error, engineFailed]);

  // Fetch canAttempt gate
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!assignmentId) { setGate(g => ({ ...g, loading: false })); return; }
        const res = await axios.get(`/api/assignments/${assignmentId}/can-attempt`, { params: { gameId: creationId } });
        if (!mounted) return;
        const d = res.data || {};
        setGate({ loading: false, allow: !!d.allow, reason: d.reason || null, attemptNumber: d.attemptNumber || 1, attemptLimit: d.attemptLimit || 1, attemptsRemaining: d.attemptsRemaining ?? 0 });
      } catch (e) {
        if (!mounted) return;
        setGate({ loading: false, allow: true, reason: null, attemptNumber: 1, attemptLimit: 1, attemptsRemaining: 1 });
      }
    })();
    return () => { mounted = false; };
  }, [assignmentId, creationId]);

  // Offline assignment checkpoint: fetch existing progress on load
  useEffect(() => {
    if (!assignmentId || !gameCreation || liveInfo?.roomCode) return;
    let mounted = true;
    (async () => {
      try {
        const res = await axios.get(`/api/game-progress/${assignmentId}/${gameCreation._id}`);
        if (mounted && res.data?.progress) {
          setResumeState(res.data.progress);
          if (Array.isArray(res.data.progress.answers)) {
            checkpointBufferRef.current = res.data.progress.answers;
          }
        }
      } catch (e) {
        // No checkpoint yet, or fetch failed — that's fine, just start fresh.
      }
    })();
    return () => { mounted = false; };
  }, [assignmentId, gameCreation, liveInfo?.roomCode]);

  useEffect(() => {
    const handleGameMessage = async (event) => {
      // WajibetSDK handshake: the engine announces GAME_INIT; reply with its config.
      if (event.data?.type === 'GAME_INIT') {
        engineReady.current = true;
        // For live student sessions, wait until the room join/resume handshake finishes
        // so the ACK carries the correct resumeState (see the joinConfirmed effect below).
        if (liveInfo?.roomCode && user?.role === 'student' && !joinConfirmed) return;
        if (iframeRef.current && iframeRef.current.contentWindow && gameCreation) {
          iframeRef.current.contentWindow.postMessage({
            type: 'GAME_INIT_ACK',
            payload: {
              gameCreation,
              direction: isRTL ? 'rtl' : 'ltr',
              locale: language || 'en',
              resumeState: resumeState || null,
            },
          }, '*');
        }
        return;
      }

      // Live progress: map the Tier 0 interaction to the leaderboard's live:answer event.
      if (liveInfo?.roomCode && socket && event.data?.type === 'LIVE_ANSWER') {
        try {
          const p = event.data.payload || {};
          const answers = [p];
          try { 
            GameLogger.log('PlayGame', 'Emitting live:answer (iframe)', { answers });
            socket.timeout(5000).emit('live:answer', { roomCode: liveInfo.roomCode, answers }, (err, response) => {
              if (err || (response && !response.success)) {
                consecutiveAnswerFailures.current++;
                if (consecutiveAnswerFailures.current >= 3) {
                  setSyncWarning(true);
                }
              } else {
                consecutiveAnswerFailures.current = 0;
                setSyncWarning(false);
              }
            });
          } catch {}
        } catch {}
      }
      // Offline assignment checkpoint: buffer answers and save every 3
      else if (!liveInfo?.roomCode && assignmentId && event.data?.type === 'LIVE_ANSWER') {
        checkpointBufferRef.current.push(event.data.payload || {});
        checkpointCounterRef.current += 1;
        if (checkpointCounterRef.current >= 3) {
          checkpointCounterRef.current = 0;
          const last = checkpointBufferRef.current[checkpointBufferRef.current.length - 1];
          axios.post('/api/game-progress', {
            assignmentId,
            gameCreationId: gameCreation?._id,
            currentItemIndex: (last?.itemIndex ?? 0) + 1,
            currentScore: checkpointBufferRef.current.reduce((s, a) => s + (Number(a?.score) || 0), 0),
            elapsedMs: checkpointBufferRef.current.reduce((s, a) => s + (Number(a?.timeMs) || 0), 0),
            answers: checkpointBufferRef.current,
          }).catch(() => {}); // best-effort, never block gameplay
        }
      }
      if (event.data?.type === 'GAME_COMPLETE') {
        if (gameCompleteHandledRef.current) {
          console.warn('[PlayGame] Duplicate GAME_COMPLETE received, ignoring.');
          return;
        }
        gameCompleteHandledRef.current = true;
        try {
          const raw = event.data.payload || {};
          // SDK v2 payload: { finalScore, totalTimeMs, answers[], statsSchemaVersion }.
          const answers = Array.isArray(raw.answers) ? raw.answers : [];
          const finalScore = Number.isFinite(Number(raw.finalScore))
            ? Number(raw.finalScore)
            : (Number(raw.score) || 0);
          const totalTimeMs = Number.isFinite(Number(raw.totalTimeMs)) ? Number(raw.totalTimeMs) : undefined;
          // Derive total possible score safely.
          // 1. If engine explicitly provided it in GAME_COMPLETE payload, use it.
          // 2. Otherwise, try to calculate from game config (pointsPerQuestion * content.length).
          // 3. Fallback to deriving from answers (which is inaccurate if skipped) or finalScore.
          const configPoints = Number(gameCreation?.config?.pointsPerQuestion);
          const itemsCount = Array.isArray(gameCreation?.content) ? gameCreation.content.length : 0;
          const configMax = (configPoints && itemsCount) ? (configPoints * itemsCount) : 0;
          
          const derivedMax = answers.reduce((sum, a) => sum + (Number(a?.maxScore) || 0), 0);
          
          const totalPossibleScore = Number.isFinite(Number(raw.totalPossibleScore))
            ? Number(raw.totalPossibleScore)
            : (configMax > 0 ? configMax : (derivedMax > 0 ? derivedMax : (itemsCount > 0 ? itemsCount : finalScore)));
          // Apply the same 3-second penalty per wrong answer that the socket handler uses, 
          // so Full Results perfectly matches Quick Results.
          const penaltyPerWrongMs = 3000;
          const adjustedTotalTimeMs = answers.reduce((acc, ans) => {
             return acc + (Number(ans?.timeMs) || 0) + (ans?.isCorrect ? 0 : penaltyPerWrongMs);
          }, 0);
          const finalTimeMs = adjustedTotalTimeMs > 0 ? adjustedTotalTimeMs : totalTimeMs;
          
          const body = {
            gameCreationId: gameCreation?._id,
            assignmentId: assignmentId || undefined,
            score: finalScore,
            totalPossibleScore,
            finalScore,
            totalTimeMs: finalTimeMs,
            statsSchemaVersion: raw.statsSchemaVersion || 1,
            answers,
          };
          // In a live session, lock in this player's final leaderboard row.
          if (liveInfo?.roomCode && socket) {
            const correct = answers.filter(a => a?.isCorrect).length;
            const wrong = answers.filter(a => a && a.isCorrect === false).length;
            try { socket.emit('live:finish', { roomCode: liveInfo.roomCode, userId: user?._id, totalTimeMs, score: finalScore, correct, wrong }); } catch {}
          }
          const headers = liveInfo?.roomCode ? { 'X-Live-Room': liveInfo.roomCode } : undefined;
          const resp = await axios.post('/api/results', body, headers ? { headers } : undefined);
          console.log('Result saved successfully');
          // Dispatch events so dashboards/components can refresh without polling
          window.dispatchEvent(new Event('assignmentProgressRefresh'));
          window.dispatchEvent(new Event('templateBadgesRefresh'));
          // Dispatch a detailed event with XP and badges hint
          try {
            const detail = { detail: { 
              xpAwarded: resp.data?.xpAwarded ?? 0,
              percentage: resp.data?.percentage,
              attemptNumber: resp.data?.attemptNumber,
              attemptsRemaining: resp.data?.attemptsRemaining,
              counted: resp.data?.counted,
            }};
            window.dispatchEvent(new CustomEvent('assignmentResultSaved', detail));
          } catch {}
          // Reflect new counters locally for header/overlay
          if (assignmentId) {
            const submittedAttempt = Number(resp.data?.attemptNumber || 0);
            const attemptLimit = Number(gate.attemptLimit || 1);
            const remaining = Number(resp.data?.attemptsRemaining ?? Math.max(0, (gate.attemptsRemaining || 0) - 1));
            const nextAttempt = submittedAttempt > 0 ? submittedAttempt + 1 : gate.attemptNumber;
            const allowNext = remaining > 0;
            setGate(g => ({
              ...g,
              attemptNumber: nextAttempt,
              attemptLimit,
              attemptsRemaining: remaining,
              allow: allowNext,
              reason: allowNext ? null : 'attempt_limit',
            }));
          }
          // If this was a live game, show a small banner to view recent live results
          if (liveInfo?.roomCode) {
            setLiveSaved(true);
            // Optional: auto-hide the banner after a while
            setTimeout(() => setLiveSaved(false), 8000);
          }
        } catch (err) {
          // Surface server reason codes and counters
          const resp = err?.response?.data || {};
          const reason = resp.reason || null;
          const reasonMap = {
            assignment_completed: 'This assignment is completed.',
            canceled: 'This assignment has been canceled.',
            time_window: 'This assignment is not currently active.',
            attempt_limit: 'Attempt limit reached for this game.',
          };
          const msg = reason ? (reasonMap[reason] || 'You cannot submit this result right now.') : (resp.message || 'Failed to save result.');
          setSubmitError(msg);
          // Reflect counters in header if provided
          if (typeof resp.attemptNumber === 'number' || typeof resp.attemptsRemaining === 'number' || typeof resp.attemptLimit === 'number') {
            setGate(g => ({
              ...g,
              allow: reason ? false : g.allow,
              attemptNumber: typeof resp.attemptNumber === 'number' ? resp.attemptNumber : g.attemptNumber,
              attemptLimit: typeof resp.attemptLimit === 'number' ? resp.attemptLimit : g.attemptLimit,
              attemptsRemaining: typeof resp.attemptsRemaining === 'number' ? resp.attemptsRemaining : g.attemptsRemaining,
              reason: reason ?? g.reason,
            }));
          }
          // Auto-clear after a short delay
          setTimeout(() => setSubmitError(null), 4000);
        }
      }
    };

    window.addEventListener('message', handleGameMessage);
    return () => window.removeEventListener('message', handleGameMessage);
  }, [socket, liveInfo?.roomCode, user?._id, user?.role, gameCreation, assignmentId, resumeState, joinConfirmed, isRTL, language]);

  // Listen for live leaderboard updates during a live session
  useEffect(() => {
    if (!socket || !liveInfo?.roomCode) return;
    const handleScoreboard = ({ ranks }) => {
      if (Array.isArray(ranks)) setRanks(ranks);
    };
    const handleGameEnded = ({ ranks }) => {
      if (Array.isArray(ranks)) setRanks(ranks);
      setLiveEnded(true);
      if (user?.role === 'student') {
        setTimeout(() => navigate('/student/dashboard', { state: { tab: 'live' } }), 2500);
      } else if (user?.role === 'teacher') {
        const sessionId = getLiveSessionId();
        if (sessionId) {
          setTimeout(() => navigate(`/teacher/live-sessions/${sessionId}`), 1200);
        } else {
          setTimeout(() => navigate(`/teacher/results/${creationId}`), 1200);
        }
      }
    };
    socket.on('live:scoreboard', handleScoreboard);
    socket.on('game-ended', handleGameEnded);
    return () => {
      if (socket) {
        socket.off('live:scoreboard', handleScoreboard);
        socket.off('game-ended', handleGameEnded);
      }
    };
  }, [socket, liveInfo?.roomCode, user?.role, navigate, gameCreation?.liveSessionId, gameCreation?.sessionId, liveInfo?.sessionId, liveInfo?.id]);



  useEffect(() => {
    if (!socket || !liveInfo?.roomCode || user?.role !== 'student') return;
    
    let joinTimeout;
    
    const handleJoinError = (msg) => {
      setError(msg || 'Could not join live game.');
      clearTimeout(joinTimeout);
    };
    
    const rejoinRoom = () => {
      if (joinInFlightRef.current) return;
      const playerName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.name || 'Player';
      if (user?._id) {
        try { 
          joinInFlightRef.current = true;
          const isRejoin = location.state?.isRejoin || joinConfirmedRef.current;
          const eventName = isRejoin ? 'rejoin-game' : 'join-game';
          GameLogger.log('PlayGame', `Emitting ${eventName}`, { roomCode: liveInfo.roomCode, userId: user._id });
          
          clearTimeout(joinTimeout);
          joinTimeout = setTimeout(() => {
            joinInFlightRef.current = false;
            setError('Connection timed out. Please refresh to try again.');
          }, 8000);
          
          socket.emit(eventName, { roomCode: liveInfo.roomCode, playerName, userId: user._id }, (response) => {
            joinInFlightRef.current = false;
            GameLogger.log('PlayGame', `${eventName} Ack Received`, response);
            clearTimeout(joinTimeout);
            
            if (response && response.success) {
              if (response.resumeState) {
                setResumeState(response.resumeState);
              }
              setJoinConfirmed(true);
            } else {
              setError(response?.reason || 'Failed to join game.');
            }
          }); 
        } catch {
          joinInFlightRef.current = false;
        }
      }
    };

    rejoinRoom();
    socket.on('connect', rejoinRoom);
    socket.on('join-error', handleJoinError);

    return () => {
      clearTimeout(joinTimeout);
      socket.off('connect', rejoinRoom);
      socket.off('join-error', handleJoinError);
    };
  }, [socket, liveInfo?.roomCode, user?.role, user?._id, user?.firstName, user?.lastName, user?.name, liveEnded]);

  useEffect(() => {
    if (!liveInfo?.roomCode) return;
    const handlePageHide = () => {
      if (socket && !liveEnded) {
        socket.emit('leave-game', { roomCode: liveInfo.roomCode });
      }
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [socket, liveInfo?.roomCode, liveEnded]);

  // Offline assignment checkpoint: flush on tab hide (visibilitychange)
  useEffect(() => {
    if (!assignmentId || liveInfo?.roomCode) return;
    const flush = () => {
      if (document.visibilityState !== 'hidden') return;
      if (checkpointBufferRef.current.length === 0) return;
      const last = checkpointBufferRef.current[checkpointBufferRef.current.length - 1];
      axios.post('/api/game-progress', {
        assignmentId,
        gameCreationId: gameCreation?._id,
        currentItemIndex: (last?.itemIndex ?? 0) + 1,
        currentScore: checkpointBufferRef.current.reduce((s, a) => s + (Number(a?.score) || 0), 0),
        elapsedMs: checkpointBufferRef.current.reduce((s, a) => s + (Number(a?.timeMs) || 0), 0),
        answers: checkpointBufferRef.current,
      }).catch(() => {});
    };
    document.addEventListener('visibilitychange', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
    };
  }, [assignmentId, gameCreation?._id, liveInfo?.roomCode]);

  // (Re)send the SDK handshake ACK once the engine is ready and we have the config.
  // Covers the case where GAME_INIT arrived before gameCreation / join / resume were ready.
  const sendInitAck = () => {
    if (!engineReady.current) return;
    if (!iframeRef.current?.contentWindow || !gameCreation) return;
    if (liveInfo?.roomCode && user?.role === 'student' && !joinConfirmed) return;
    iframeRef.current.contentWindow.postMessage({
      type: 'GAME_INIT_ACK',
      payload: {
        gameCreation,
        direction: isRTL ? 'rtl' : 'ltr',
        locale: language || 'en',
        resumeState: resumeState || null,
      },
    }, '*');
  };

  useEffect(() => {
    sendInitAck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinConfirmed, resumeState, gameCreation]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const getDashboardPath = () => {
    const paths = {
      admin: '/admin/dashboard',
      teacher: '/teacher/dashboard',
      student: '/student/dashboard'
    };
    return paths[user.role] || '/';
  };

  if (loading || gate.loading) return (
    <div className="h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full mx-auto mb-3"></div>
        <p className="text-gray-600 text-sm">Loading game...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center bg-white p-8 rounded-lg shadow-sm border border-gray-200">
        <div className="text-3xl mb-3">⚠️</div>
        <p className="text-gray-700 mb-4">{error}</p>
        <button 
          onClick={() => navigate(-1)}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors"
        >
          Go Back
        </button>
      </div>
    </div>
  );

  if (engineFailed) return (
    <div className="h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center bg-white p-10 rounded-2xl shadow-sm border border-gray-200 max-w-sm mx-4">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">🔌</span>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Game failed to load</h2>
        <p className="text-gray-500 text-sm mb-6">
          The game engine took too long to respond. This might be due to a poor connection or an issue with the game files.
        </p>
        <div className="flex gap-3 justify-center">
          <button 
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl text-sm transition-colors"
          >
            Go Back
          </button>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white font-medium rounded-xl text-sm transition-colors shadow-sm"
          >
            Try Again
          </button>
        </div>
      </div>
    </div>
  );

  const blockMsgMap = {
    assignment_completed: 'This assignment is completed.',
    canceled: 'This assignment has been canceled.',
    time_window: 'This assignment is not currently active.',
    attempt_limit: 'You have used all attempts for this game.',
  };

  return (
    <div className="h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link 
              to={getDashboardPath()}
              onClick={() => {
                if (socket && liveInfo?.roomCode && !liveEnded) {
                  socket.emit('leave-game', { roomCode: liveInfo.roomCode });
                }
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
              title="Exit Game"
            >
              ←
            </Link>
            <div className="flex items-center gap-3">
              <img src="/Logo.jpg" alt="Skill Snap Logo" className="w-8 h-8 object-contain rounded" />
              <h1 className="text-lg font-semibold text-gray-900">
                {gameCreation?.name || 'Game'}
              </h1>
              <p className="text-xs text-gray-500">
                {assignmentId ? `Attempt ${gate.attemptNumber} of ${gate.attemptLimit}` : (gameCreation?.template?.name ? `Playing • ${gameCreation?.template?.name}` : '')}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {liveInfo?.roomCode && (
              <button
                onClick={() => setShowLeaderboard(v => !v)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                title="Leaderboard"
                aria-label="Toggle leaderboard"
              >
                🏆
              </button>
            )}
            <button
              onClick={toggleFullscreen}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            >
              {isFullscreen ? '🔳' : '⛶'}
            </button>
            <Link 
              to={getDashboardPath()}
              onClick={() => {
                if (socket && liveInfo?.roomCode && !liveEnded) {
                  socket.emit('leave-game', { roomCode: liveInfo.roomCode });
                }
              }}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg transition-colors"
            >
              Exit
            </Link>
          </div>
        </div>
      </header>
      {/* Submission error banner */}
      {submitError && (
        <div className="bg-red-50 border-b border-red-200 text-red-700 text-sm px-6 py-2">{submitError}</div>
      )}
      {liveSaved && user?.role === 'student' && (
        <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-sm px-6 py-2 flex items-center justify-between">
          <span>Your live result was saved. You can find it in Live Sessions.</span>
          <Link to="/student/dashboard" onClick={(e)=>{ e.preventDefault(); navigate('/student/dashboard', { state: { tab: 'live' } }); }} className="underline">View Live Sessions</Link>
        </div>
      )}
      {liveEnded && liveInfo?.roomCode && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm px-6 py-2">
          This live session has ended. Returning to your dashboard.
        </div>
      )}
      {syncWarning && (
        <div className="bg-amber-500 text-white text-sm font-semibold px-6 py-2 text-center animate-pulse">
          ⚠️ Connection unstable: your progress may not be saving
        </div>
      )}

      {/* Live Leaderboard panel (students) */}
      {user?.role === 'student' && liveInfo?.roomCode && showLeaderboard && (
        <div className="absolute top-20 right-4 z-30 w-80 max-w-[85vw] bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="font-semibold text-gray-900 text-sm">Live Leaderboard</div>
            <button onClick={() => setShowLeaderboard(false)} className="text-gray-500 hover:text-gray-700">✕</button>
          </div>
          <div className="max-h-96 overflow-auto p-2">
            {(!Array.isArray(ranks) || ranks.length === 0) && (
              <div className="text-xs text-gray-500 px-2 py-3">No progress yet.</div>
            )}
            <ol className="space-y-1">
              {Array.isArray(ranks) && ranks.map((r, i) => {
                const isMe = String(r.userId || r.studentId) === String(user?._id);
                return (
                  <li key={`${r.userId || r.studentId || 'u'}-${i}`} className={`flex items-center justify-between px-3 py-2 rounded-md text-xs ${isMe ? 'bg-indigo-50 border border-indigo-200' : 'bg-gray-50 border border-gray-100'}`}>
                    <span className="text-gray-800 truncate mr-2">
                      {i + 1}. {r.name || r.firstName || 'Player'}
                    </span>
                    <span className="text-gray-600 whitespace-nowrap">{r.score ?? 0} pts • {(r.effectiveTimeMs ? (r.effectiveTimeMs/1000).toFixed(1) : '0.0')}s • {r.wrong || 0}×❌</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      )}
      
      {/* Game Container */}
      <main className="flex-1 bg-gray-100 p-4">
        <div className="h-full bg-black rounded-lg overflow-hidden shadow-sm">
      { !assignmentId || gate.allow ? (
        (gameCreation?.enginePath || gameCreation?.template?.enginePath) ? (
            <iframe
              ref={iframeRef}
            src={resolveEngineSrc(gameCreation.enginePath || gameCreation.template.enginePath)}
              title="Game Engine"
              className="w-full h-full border-0"
              onLoad={sendInitAck}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-white bg-gray-900">
              <div className="text-center">
                <div className="text-4xl mb-4">🎮</div>
                <p className="text-gray-300">Game engine not available</p>
                <p className="text-gray-500 text-sm mt-1">Contact administrator for support</p>
              </div>
            </div>
          )
      ) : (
        <div className="h-full flex items-center justify-center text-white bg-gray-900">
          <div className="text-center">
            <div className="text-4xl mb-4">⛔</div>
            <p className="text-gray-300">{blockMsgMap[gate.reason] || 'You cannot attempt this game right now.'}</p>
            {gate.reason === 'attempt_limit' && <p className="text-gray-400 text-sm mt-1">Attempts used: {gate.attemptLimit}</p>}
          </div>
        </div>
      )}
        </div>
      </main>
    </div>
  );
};

export default PlayGame;