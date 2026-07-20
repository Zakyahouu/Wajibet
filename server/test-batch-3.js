const fs = require('fs');
const path = require('path');

// Mock Mongoose models
const mockLiveParticipant = {
  findOneAndUpdate: async () => ({}),
  findOne: async () => ({}),
  find: () => {
    return {
      populate: () => {
        return { lean: async () => [] };
      },
      lean: async () => []
    };
  }
};
const mockLiveSession = {
  findById: () => ({ select: () => ({ lean: async () => ({ status: 'running', classes: [], allowLateJoin: true }) }) }),
  findOne: () => ({ select: () => ({ lean: async () => ({ status: 'running', classes: [], allowLateJoin: true }) }) })
};

// Mock io and socket
let mockRooms = {};
let emits = [];
const mockIo = {
  to: (room) => ({
    emit: (event, payload) => {
      emits.push({ room, event, payload });
    }
  }),
  on: (event, cb) => {
    if (event === 'connection') global.connectionHandler = cb;
  }
};

class MockSocket {
  constructor(id, userId, role) {
    this.id = id;
    this.user = { _id: userId, role };
    this.handlers = {};
  }
  on(event, cb) {
    this.handlers[event] = cb;
  }
  emit(event, payload) {
    emits.push({ room: this.id, event, payload });
  }
  join(room) {
    mockRooms[room] = mockRooms[room] || [];
    mockRooms[room].push(this.id);
  }
  disconnect() {
    if (this.handlers['disconnect']) this.handlers['disconnect']();
  }
}

// Inject mocks via require cache override
require.cache[require.resolve('./models/LiveParticipant')] = { exports: mockLiveParticipant };
require.cache[require.resolve('./models/LiveSession')] = { exports: mockLiveSession };
require.cache[require.resolve('./models/User')] = { exports: { findById: async () => ({ select: () => ({ lean: async () => ({ firstName: 'Test' }) }) }) } };
require.cache[require.resolve('./models/Enrollment')] = { exports: { findOne: async () => ({ select: () => ({ lean: async () => null }) }) } };
require.cache[require.resolve('./models/Class')] = { exports: { findOne: async () => ({ select: () => ({ lean: async () => null }) }) } };

const socketHandler = require('./socket/socketHandler');

console.log('--- Test Batch 3: Independent Pacing & Reconnect ---');

socketHandler(mockIo);

const host = new MockSocket('host-1', 'teacher-1', 'teacher');
connectionHandler(host);

(async () => {
  await host.handlers['host-game']({ code: 'ROOM_123', sessionId: 'sess-1', gameCreationId: 'game-1' });

  const pA = new MockSocket('pa-1', 'student-a', 'student');
  const pB = new MockSocket('pb-1', 'student-b', 'student');
  const pC = new MockSocket('pc-1', 'student-c', 'student');

  connectionHandler(pA);
  connectionHandler(pB);
  connectionHandler(pC);

  await pA.handlers['join-game']({ roomCode: 'ROOM_123', playerName: 'Alice', userId: 'student-a' });
  await pB.handlers['join-game']({ roomCode: 'ROOM_123', playerName: 'Bob', userId: 'student-b' });
  await pC.handlers['join-game']({ roomCode: 'ROOM_123', playerName: 'Charlie', userId: 'student-c' });

  const { liveGames } = require('./realtimeState');
  const room = liveGames['ROOM_123'];

  console.log('Test 1: 3 simulated players joined', room.players.length === 3 ? 'PASS' : 'FAIL');

  // Test 2: Leaderboard updates per player pacing
  emits = [];
  await pA.handlers['live:answer']({ roomCode: 'ROOM_123', userId: 'student-a', correct: true, deltaMs: 2000, scoreDelta: 10 });
  let scoreboardEmit = emits.find(e => e.event === 'live:scoreboard');
  console.log('Test 2: Leaderboard updates immediately (debounced)', scoreboardEmit ? 'PASS' : 'FAIL');

  const playerA = room.players.find(p => p.userId === 'student-a');
  console.log('Test 2b: In-memory dirty flag set', playerA.stats.dirty ? 'PASS' : 'FAIL');

  // Test 3: Disconnect Player B mid-item
  const playerB = room.players.find(p => p.userId === 'student-b');
  playerB.stats.currentItemStartedAt = new Date(Date.now() - 5000); // 5s ago
  pB.disconnect();

  console.log('Test 3: Player B disconnected status', playerB.stats.status === 'disconnected' ? 'PASS' : 'FAIL');
  console.log('Test 3b: Elapsed time paused', playerB.stats.pausedRemainingMs >= 5000 ? 'PASS' : 'FAIL');

  // Test 4: Reconnect Player B
  emits = [];
  const pB2 = new MockSocket('pb-2', 'student-b', 'student');
  connectionHandler(pB2);
  await pB2.handlers['rejoin-game']({ roomCode: 'ROOM_123', userId: 'student-b' });

  let resumeEmit = emits.find(e => e.event === 'live:resume-state');
  console.log('Test 4: Reconnect sends RESUME_STATE', resumeEmit ? 'PASS' : 'FAIL');
  console.log('Test 4b: Player B active again', playerB.stats.status === 'active' ? 'PASS' : 'FAIL');
  console.log('Test 4c: Elapsed time restored correctly in RESUME_STATE', resumeEmit.payload.elapsedMs >= 5000 ? 'PASS' : 'FAIL');

  // Test 5: Reconnect Player C exceeding pause cap
  const playerC = room.players.find(p => p.userId === 'student-c');
  playerC.stats.currentItemIndex = 0;
  playerC.stats.currentItemStartedAt = new Date();
  pC.disconnect();

  // simulate 3 minutes disconnect
  playerC.stats.disconnectedAt = new Date(Date.now() - (3 * 60 * 1000));
  const pC2 = new MockSocket('pc-2', 'student-c', 'student');
  connectionHandler(pC2);
  await pC2.handlers['rejoin-game']({ roomCode: 'ROOM_123', userId: 'student-c' });

  console.log('Test 5: Exceeding pause cap auto-skips item', playerC.stats.currentItemIndex === 1 ? 'PASS' : 'FAIL');
  console.log('Test 5b: Accumulator reset', playerC.stats.accumulatedPauseMs === 0 ? 'PASS' : 'FAIL');

  // Test 6: Host disconnect
  host.disconnect();
  console.log('Test 6: Host disconnect keeps room alive', liveGames['ROOM_123'] ? 'PASS' : 'FAIL');

  console.log('\nAll Batch 3 tests completed.');
  process.exit(0);
})();
