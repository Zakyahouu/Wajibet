// client/src/pages/PlayerLobby.jsx
import React, { useEffect, useContext, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { SocketContext } from '../context/SocketContext';
import { AuthContext } from '../context/AuthContext';
import { GameLogger } from '../utils/gameLogger';

const PlayerLobby = () => {
  const { roomCode } = useParams();
  const socketContext = useContext(SocketContext);
  const socket = socketContext?.socket;
  const socketConnected = socketContext?.connected;
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const isRejoin = location.state?.isRejoin;
  const [error, setError] = useState('');
  const hasJoinedRef = useRef(false);
  const joinInFlightRef = useRef(false);

  // This useEffect hook listens for the game starting
  useEffect(() => {
    // Attempt to join the game room with full name from profile once socket is present
    const playerName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.name || 'Player';
    const userId = user?._id;
    let joinTimeout;

    const handleGameStarted = ({ gameCreationId }) => {
      clearTimeout(joinTimeout);
      GameLogger.log('PlayerLobby', 'Received game-started', { gameCreationId });
      console.log(`Player Lobby: Game starting! Navigating to play game: ${gameCreationId}`);
      navigate(`/student/play-game/${gameCreationId}`, { state: { live: { roomCode }, isRejoin: true } });
    };

    const handleScoreboard = ({ ranks }) => {
      clearTimeout(joinTimeout);
      console.log('Live scoreboard update (player):', ranks?.slice(0,5));
    };

    const handleJoinError = (msg) => {
      clearTimeout(joinTimeout);
      setError(msg || 'Could not join this room.');
    };

    const handlePlayerJoined = () => {
      clearTimeout(joinTimeout);
    };

    const handleGameEnded = () => {
      clearTimeout(joinTimeout);
      setError('This live session has ended.');
    };

    const doJoin = () => {
      if (joinInFlightRef.current) return;
      if (roomCode && userId && socket) {
        try { 
          joinInFlightRef.current = true;
          clearTimeout(joinTimeout);
          joinTimeout = setTimeout(() => {
            joinInFlightRef.current = false;
            setError('Connection timed out. Please refresh to try again.');
          }, 8000);
          
          const actualIsRejoin = isRejoin || hasJoinedRef.current;
          const eventName = actualIsRejoin ? 'rejoin-game' : 'join-game';
          GameLogger.log('PlayerLobby', `Emitting ${eventName}`, { roomCode, playerName, userId });
          
          socket.emit(eventName, { roomCode, playerName, userId }, (response) => {
            joinInFlightRef.current = false;
            clearTimeout(joinTimeout);
            if (response && response.success) {
              hasJoinedRef.current = true;
            } else {
              setError(response?.reason || 'Failed to join game.');
            }
          });
        } catch {
          joinInFlightRef.current = false;
        }
      }
    };

    if (socket) {
      doJoin();
      socket.on('connect', doJoin);
      socket.on('game-started', handleGameStarted);
      socket.on('live:scoreboard', handleScoreboard);
      socket.on('join-error', handleJoinError);
      socket.on('player-joined', handlePlayerJoined);
      socket.on('game-ended', handleGameEnded);
    }

    return () => {
      clearTimeout(joinTimeout);
      if (socket) {
        socket.off('connect', doJoin);
        socket.off('game-started', handleGameStarted);
        socket.off('live:scoreboard', handleScoreboard);
        socket.off('join-error', handleJoinError);
        socket.off('player-joined', handlePlayerJoined);
        socket.off('game-ended', handleGameEnded);
      }
    };
  }, [socket, socketContext, roomCode, user?._id, navigate]);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-8 text-center">
      {!error ? (
        <>
          <h1 className="text-4xl font-bold mb-2">You're In!</h1>
          <p className="text-sm text-gray-400 mb-6">{[user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.name}</p>
          <p className="text-xl text-gray-300 mb-8 flex items-center gap-3">
            <span className="inline-block w-6 h-6 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
            Waiting for the teacher to start the game...
          </p>
          <div className="bg-gray-800 p-6 rounded-lg">
            <p className="text-lg text-gray-500">Room Code</p>
            <p className="text-4xl font-bold font-mono text-indigo-400 select-all">{roomCode}</p>
          </div>
          <button
            onClick={() => navigate('/student/dashboard')}
            className="fixed bottom-3 right-3 px-2.5 py-1.5 rounded-md bg-red-900/30 hover:bg-red-700/80 border border-red-800/40 text-red-200/70 hover:text-white text-xs opacity-40 hover:opacity-100 transition-all focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
          >Exit</button>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-bold mb-3">Join Failed</h1>
          <p className="text-sm text-red-300 mb-6">{error}</p>
          <button
            onClick={() => navigate('/student/dashboard')}
            className="px-4 py-2 rounded-md bg-white text-gray-900 hover:bg-gray-100"
          >Back to Dashboard</button>
        </>
      )}
    </div>
  );
};

export default PlayerLobby;
