/**
 * Memory Matrix - V2 Prototype Game
 * Demonstrates:
 * 1. Strict UI/Logic Decoupling
 * 2. WajibetSDK telemetry contract (Tier 0)
 * 3. Native RTL Layout Handling
 * 4. Advanced State Recovery
 */

const GameEngine = (() => {
  // --- DOM Elements ---
  const container = document.getElementById('game-container');
  const levelDisplay = document.getElementById('level-display');
  const scoreDisplay = document.getElementById('score-display');
  const instructionText = document.getElementById('instruction-text');
  const grid = document.getElementById('grid');
  const tiles = Array.from(document.querySelectorAll('.tile'));
  const endOverlay = document.getElementById('end-overlay');
  const endTitle = document.getElementById('end-title');
  const endScore = document.getElementById('end-score');

  // --- State ---
  let currentLevel = 0;
  let score = 0;
  let pattern = [];
  let playerSequence = [];
  let isInputLocked = true;
  let levelStartTime = 0;

  const MAX_LEVELS = 10;
  
  // Translation Dictionary
  const translations = {
    en: {
      memorize: "Memorize the pattern...",
      yourTurn: "Your turn! Tap the pattern.",
      correct: "Perfect!",
      wrong: "Wrong tile!",
      gameOver: "Game Over!",
      victory: "Victory!",
      finalScore: "Final Score: "
    },
    ar: {
      memorize: "تذكر النمط...",
      yourTurn: "دورك! انقر على النمط.",
      correct: "ممتاز!",
      wrong: "مربع خاطئ!",
      gameOver: "انتهت اللعبة!",
      victory: "انتصار!",
      finalScore: "النتيجة النهائية: "
    }
  };

  let t = translations.en;

  // --- Initialization ---
  function init() {
    if (typeof WajibetSDK === 'undefined') {
      console.error('WajibetSDK not found! Ensure it is loaded.');
      return;
    }

    // Wait for the host React app to send configuration
    WajibetSDK.init((resumeState) => {
      applyConfig();
      
      // Handle State Recovery (if student disconnected and came back)
      if (resumeState) {
        currentLevel = resumeState.currentItemIndex || 0;
        score = resumeState.currentScore || 0;
        console.log(`[MemoryMatrix] Resuming from level ${currentLevel + 1} with score ${score}`);
      }

      // Show container and start
      container.style.display = 'block';
      updateHUD();
      
      if (currentLevel >= MAX_LEVELS) {
        endGame(true);
      } else {
        startLevel();
      }
    });

    // Bind events
    tiles.forEach(tile => {
      tile.addEventListener('click', () => handleTileClick(tile));
    });
  }

  function applyConfig() {
    // Apply RTL/LTR
    const direction = WajibetSDK.getDirection();
    document.documentElement.dir = direction;
    
    // Apply Locale
    const locale = WajibetSDK.getLocale();
    t = translations[locale] || translations.en;
  }

  // --- Game Loop ---
  function startLevel() {
    isInputLocked = true;
    playerSequence = [];
    updateHUD();
    instructionText.textContent = t.memorize;
    
    // Generate Pattern
    const patternLength = 3 + Math.floor(currentLevel / 2); // gets harder
    pattern = [];
    while (pattern.length < patternLength) {
      const randomIndex = Math.floor(Math.random() * 9);
      if (!pattern.includes(randomIndex)) {
        pattern.push(randomIndex);
      }
    }

    // Clear tiles
    tiles.forEach(tile => {
      tile.className = 'tile';
      tile.disabled = true;
    });

    // Show pattern
    setTimeout(() => {
      pattern.forEach(index => tiles[index].classList.add('highlight'));
      
      // Hide pattern after 2 seconds
      setTimeout(() => {
        pattern.forEach(index => tiles[index].classList.remove('highlight'));
        tiles.forEach(tile => tile.disabled = false);
        instructionText.textContent = t.yourTurn;
        isInputLocked = false;
        levelStartTime = Date.now(); // Start timing the user
      }, 2000);
    }, 1000);
  }

  function handleTileClick(tile) {
    if (isInputLocked) return;

    const index = parseInt(tile.dataset.index, 10);
    const expectedIndex = pattern[playerSequence.length];

    if (index === expectedIndex) {
      // Correct click
      tile.classList.add('correct');
      playerSequence.push(index);
      
      if (playerSequence.length === pattern.length) {
        handleLevelComplete();
      }
    } else {
      // Wrong click
      tile.classList.add('wrong');
      isInputLocked = true;
      instructionText.textContent = t.wrong;
      
      // Report failed interaction
      reportTelemetry(false);
      
      setTimeout(() => {
        endGame(false);
      }, 1000);
    }
  }

  function handleLevelComplete() {
    isInputLocked = true;
    instructionText.textContent = t.correct;
    score += 10 + (currentLevel * 5); // Base score + difficulty bonus
    updateHUD();

    // Report successful interaction
    reportTelemetry(true);

    currentLevel++;
    
    if (currentLevel >= MAX_LEVELS) {
      setTimeout(() => endGame(true), 1000);
    } else {
      setTimeout(() => startLevel(), 1500);
    }
  }

  function updateHUD() {
    levelDisplay.textContent = Math.min(currentLevel + 1, MAX_LEVELS);
    scoreDisplay.textContent = score;
  }

  // --- Telemetry & Completion ---
  function reportTelemetry(isCorrect) {
    const timeTaken = Date.now() - levelStartTime;
    
    WajibetSDK.recordInteraction({
      itemId: `level_${currentLevel + 1}`,
      itemIndex: currentLevel,
      type: 'memory',
      isCorrect: isCorrect,
      userAnswer: playerSequence.join(','),
      correctAnswer: pattern.join(','),
      score: isCorrect ? (10 + (currentLevel * 5)) : 0,
      maxScore: 10 + (currentLevel * 5),
      timeMs: timeTaken,
      attempts: 1,
      skipped: false
    });
  }

  function endGame(isVictory) {
    endOverlay.style.display = 'flex';
    endTitle.textContent = isVictory ? t.victory : t.gameOver;
    endScore.textContent = `${t.finalScore} ${score}`;
    
    // Overall time is not tracked cleanly here since we only track per-level time, 
    // but the host aggregates time internally based on LOG_TELEMETRY events.
    // We pass finalScore to finishGame.
    WajibetSDK.finishGame(score, 0); 
  }

  return { init };
})();

// Boot
window.onload = GameEngine.init;
