// client/src/pages/HostLobby.jsx
import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { SocketContext } from '../context/SocketContext';
import { useToast } from '../components/shared/ToastProvider';

const HostLobby = () => {
  const { gameCreationId, sessionId } = useParams();
  const socketContext = useContext(SocketContext);
  // SocketContext provides { socket, connected }
  const socket = socketContext?.socket;
  const socketConnected = socketContext?.connected;
  const navigate = useNavigate();

  const [roomCode, setRoomCode] = useState(null);
  const [players, setPlayers] = useState([]);
  const [playerSearch, setPlayerSearch] = useState('');
  const [ranks, setRanks] = useState([]);
  const [running, setRunning] = useState(false);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [awaitingCreate, setAwaitingCreate] = useState(false);
  const [sessionTitle, setSessionTitle] = useState('');
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const { toast } = useToast();

  const emitHostGame = (code, currentSessionId, creationId) => {
    if (!socket || !code) return;
    try {
      if (socketConnected) {
        socket.emit('host-game', { code, sessionId: currentSessionId, gameCreationId: creationId });
      } else {
        socket.once('connect', () => {
          try { socket.emit('host-game', { code, sessionId: currentSessionId, gameCreationId: creationId }); } catch {}
        });
      }
    } catch (err) {
      console.warn('host-game emit failed', err);
    }
  };

  useEffect(() => {
    return () => {
      if (socket && roomCode) {
        socket.emit('leave-room', roomCode);
      }
    };
  }, [socket, roomCode]);

  useEffect(() => {
    let mounted = true;
    if (!socket) return () => { mounted = false; };

    const handleRoomCreated = (newRoomCode) => {
      console.log(`Lobby: Room created with code: ${newRoomCode}`);
      setRoomCode(newRoomCode);
    };

    const handlePlayerJoined = (updatedPlayerList) => {
      console.log('Lobby: A player joined. New player list:', updatedPlayerList);
      setPlayers(updatedPlayerList);
    };

    const handleGameStarted = ({ gameCreationId }) => {
      console.log(`Lobby: Game starting! Staying in host view for leaderboard. gameCreationId=${gameCreationId}`);
      setRunning(true);
    };

    const handleGameEnded = ({ sessionId }) => {
      const creationId = sessionInfo?.gameCreationId || gameCreationId;
      if (sessionId && creationId) {
        navigate(`/teacher/results/${creationId}?sessionId=${sessionId}`);
        return;
      }
      if (sessionId) {
        navigate(`/teacher/live-sessions/${sessionId}`);
      }
    };

    const handleScoreboard = ({ ranks }) => {
      setRanks(Array.isArray(ranks) ? ranks : []);
    };

    (async () => {
      // Allow either gameCreationId (fresh) or sessionId (resume). Only redirect if both missing.
      if (!gameCreationId && !sessionId) { navigate('/teacher/dashboard'); return; }
      try {
        if (sessionId) {
          // Resume: fetch session to get code and creation
          const s = await axios.get(`/api/live-sessions/${sessionId}/summary`);
          const code = s.data?.session?.code;
          const creation = s.data?.session?.gameCreationId || gameCreationId;
          setSessionInfo(s.data?.session || null);
          if (!code || !creation) { navigate('/teacher/dashboard'); return; }
          emitHostGame(code, sessionId, creation);
        } else {
          // Fresh session: wait for user to confirm and optionally set a title
          setAwaitingCreate(true);
        }
      } catch (e) {
        console.error('Failed to create/resume live session', e);
      }
    })();

    socket.on('room-created', handleRoomCreated);
    socket.on('player-joined', handlePlayerJoined);
    socket.on('game-started', handleGameStarted);
    socket.on('game-ended', handleGameEnded);
    socket.on('live:scoreboard', handleScoreboard);

    return () => {
      mounted = false;
      if (socket) {
        socket.off('room-created', handleRoomCreated);
        socket.off('player-joined', handlePlayerJoined);
        socket.off('game-started', handleGameStarted);
        socket.off('game-ended', handleGameEnded);
        socket.off('live:scoreboard', handleScoreboard);
      }
    };
  }, [socket, socketConnected, gameCreationId, sessionId, sessionInfo?.gameCreationId, navigate]);

  useEffect(() => {
    if (!socket || !roomCode || !sessionInfo) return;
    const handleReconnect = () => {
      emitHostGame(roomCode, sessionInfo._id || sessionId, sessionInfo.gameCreationId || gameCreationId);
    };
    socket.on('connect', handleReconnect);
    return () => {
      socket.off('connect', handleReconnect);
    };
  }, [socket, roomCode, sessionInfo?._id, sessionInfo?.gameCreationId, sessionId, gameCreationId, socketConnected]);

  // --- NEW: Function to handle starting the game ---
  const handleStartGame = () => {
    if (!roomCode) return;
    if (!socket) {
      toast('No socket connection. Refresh the page to reconnect.');
      return;
    }
    if (!socketConnected) {
      toast('Waiting for realtime connection — please try again in a moment');
      return;
    }
    // Tell the server to start the game for everyone in this room.
    socket.emit('start-game', roomCode);
  };
  const handleEndGame = () => {
  if (!roomCode) return;
  setConfirmEndOpen(true);
  };

  const handleCreateLobby = async () => {
    try {
      // Fresh session: create then host
      const classesRes = await axios.get('/api/classes/teacher');
      const classIds = (classesRes.data || []).map(c => c._id);
      const createRes = await axios.post('/api/live-sessions', {
        title: sessionTitle?.trim() || undefined,
        gameCreationId,
        classIds,
        allowLateJoin: false,
        config: { strictProgress: false, timePenaltyPerWrongMs: 3000 }
      });
      const { sessionId: newSessionId, code } = createRes.data || {};
      setSessionInfo({ _id: newSessionId, code, status: 'lobby', title: sessionTitle?.trim() || undefined });
      setAwaitingCreate(false);
      try {
        if (socketConnected) {
          socket.emit('host-game', { code, sessionId: newSessionId, gameCreationId });
        } else if (socket) {
          socket.once('connect', () => {
            try { socket.emit('host-game', { code, sessionId: newSessionId, gameCreationId }); } catch {}
          });
          toast('Connecting to realtime server — your room will become active once connected.');
        } else {
          toast('Unable to connect to realtime server. Refresh to retry.');
        }
      } catch (err) {
        console.warn('Failed to emit host-game after create', err);
      }
    } catch (e) {
      console.error('Failed to create lobby', e);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-4">Game Lobby</h1>
      {sessionInfo && (
        <div className="mb-4 text-sm text-gray-300">
          <span className="mr-2">Registered as session</span>
          <Link to={`/teacher/live-sessions/${sessionInfo._id}`} className="text-indigo-300 underline">{sessionInfo._id}</Link>
        </div>
      )}
      
      {/* Fresh creation gate: let teacher set title before creating */}
    {!sessionInfo && awaitingCreate && (
        <div className="w-full max-w-md bg-gray-800 p-6 rounded-lg mb-8">
          <h2 className="text-2xl font-semibold mb-3">Create Lobby</h2>
          <label className="block text-sm text-gray-300 mb-1">Session name (optional)</label>
          <input
            className="w-full px-3 py-2 rounded bg-gray-700 text-white border border-gray-600 mb-3"
            placeholder="e.g., Friday Quiz – Class A"
            value={sessionTitle}
            onChange={(e) => setSessionTitle(e.target.value)}
          />
          <div className="rounded-md border border-amber-400/30 bg-amber-400/10 text-amber-200 p-3 text-sm mb-4">
            No late joins. Once the session starts, new students cannot join.
          </div>
      <button onClick={handleCreateLobby} className="px-4 py-2 rounded-md bg-green-600 hover:bg-green-700">Create Lobby</button>
        </div>
      )}

      {roomCode ? (
        <>
          <p className="text-xl text-gray-400 mb-2">Students can join with this code:</p>
          <div className="flex items-center gap-3 mb-8">
            <div className="bg-white text-gray-900 font-mono text-6xl font-bold px-6 py-4 rounded-lg shadow-lg tracking-widest select-all">
              {roomCode}
            </div>
            <button
              onClick={async()=>{ try{ await navigator.clipboard.writeText(roomCode); toast('Room code copied'); } catch{} }}
              className="px-3 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
              aria-label="Copy room code"
            >Copy</button>
          </div>
          {/* Quick actions for the host */}
          <div className="flex items-center gap-3 mb-6">
            <Link
              to={`/teacher/dashboard?tab=live-sessions`}
              className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-white text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              aria-label="Open Live Sessions"
            >Live Sessions</Link>
          </div>
          <div className="w-full max-w-md bg-gray-800 p-6 rounded-lg">
            <h2 className="text-2xl font-semibold mb-4">Players Joined ({players.length})</h2>
            <input
              type="text"
              value={playerSearch}
              onChange={e => setPlayerSearch(e.target.value)}
              placeholder="Search players..."
              className="w-full mb-3 px-3 py-2 rounded bg-gray-700 text-white border border-gray-600"
              aria-label="Search players"
            />
            <div className="max-h-64 overflow-y-auto">
              <ul className="space-y-2">
                {players.length > 0 ? (
                  players
                    .filter(p => p.name.toLowerCase().includes(playerSearch.toLowerCase()))
                    .map((player) => (
                      <li key={player.id} className="bg-gray-700 p-3 rounded-md text-lg flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-base">
                          {player.name ? player.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() : '?'}
                        </div>
                        <span className="truncate">{player.name}</span>
                      </li>
                    ))
                ) : (
                  <li className="text-gray-500">Waiting for players...</li>
                )}
              </ul>
            </div>
          </div>
          {/* Live leaderboard preview */}
          <div className="w-full max-w-md bg-gray-800 p-6 rounded-lg mt-6">
            <h2 className="text-2xl font-semibold mb-4">Live Leaderboard</h2>
            {ranks.length === 0 ? (
              <div className="text-gray-500">No progress yet.</div>
            ) : (
              <ol className="space-y-2">
                {ranks.slice(0, 10).map((r, i) => (
                  <li key={`${r.userId}-${i}`} className="bg-gray-700 p-3 rounded-md text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-300 font-bold w-6">{i+1}.</span>
                      <span className="text-gray-100 font-medium truncate max-w-[120px]">{r.name || r.userId}</span>
                      
                      {r.status === 'disconnected' && (
                        <span className="px-2 py-0.5 text-xs font-semibold rounded bg-red-900/50 text-red-300 border border-red-700/50">
                          Disconnected
                        </span>
                      )}
                      {r.status === 'finished' && (
                        <span className="px-2 py-0.5 text-xs font-semibold rounded bg-green-900/50 text-green-300 border border-green-700/50">
                          Finished
                        </span>
                      )}
                      {r.status === 'active' && (
                        <span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-900/50 text-blue-300 border border-blue-700/50">
                          Playing (Q{r.currentItemIndex + 1})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <div className="flex flex-col items-end">
                        <span className="text-gray-400 font-semibold tracking-wide uppercase text-[10px]">Score</span>
                        <span className="text-amber-400 font-bold">{r.score}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-gray-400 font-semibold tracking-wide uppercase text-[10px]">Time</span>
                        <span className="text-gray-200">{(r.effectiveTimeMs/1000).toFixed(1)}s</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-gray-400 font-semibold tracking-wide uppercase text-[10px]">Wrong</span>
                        <span className={r.wrong > 0 ? "text-red-400" : "text-gray-200"}>{r.wrong||0}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
          {/* Controls */}
          <div className="mt-8 flex items-center gap-3">
            <button 
              onClick={handleStartGame}
              className="px-6 py-3 text-lg font-semibold text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300" 
              disabled={players.length === 0 || running}
            >
              {running ? 'Running…' : 'Start Game'}
            </button>
            {running && (
              <button
                onClick={handleEndGame}
                className="px-6 py-3 text-lg font-semibold text-white bg-red-600 rounded-md hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                aria-label="End Game"
              >End Game</button>
            )}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-3 text-2xl text-gray-300">
          <span className="inline-block w-6 h-6 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          <span>Preparing lobby…</span>
        </div>
      )}

      <Link to="/teacher/dashboard" className="mt-8 text-indigo-400 hover:underline">
        Exit Lobby
      </Link>

      {/* Confirm End Game modal */}
      {confirmEndOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white text-gray-900 rounded-xl shadow-xl w-full max-w-md overflow-hidden max-h-[90vh]">
            <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="text-lg font-semibold">End Game</h3>
              <button onClick={() => setConfirmEndOpen(false)} className="text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400" aria-label="Close">✕</button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <p>Are you sure you want to end this live game for everyone?</p>
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => setConfirmEndOpen(false)} className="px-4 py-2 text-sm rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300">Cancel</button>
                <button
                  onClick={() => {
                    setConfirmEndOpen(false);
                    if (!roomCode) return;
                    if (!socket) { toast('No socket connection. Refresh to reconnect.'); return; }
                    if (!socketConnected) { toast('Waiting for realtime connection — try again in a moment'); return; }
                    socket.emit('end-game', roomCode);
                  }}
                  className="px-4 py-2 text-sm rounded-md text-white bg-red-600 hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                >End Game</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HostLobby;
