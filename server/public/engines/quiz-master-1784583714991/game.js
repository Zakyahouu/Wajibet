let gameState = {
  questions: [],
  currentIndex: 0,
  score: 0,
  settings: null,
  isGameOver: false,
  startTime: null
};

window.onload = () => {
  // Initialize the SDK
  if (typeof WajibetSDK !== 'undefined') {
    WajibetSDK.init((resumeState) => {
      document.documentElement.dir = WajibetSDK.getDirection();
      startGame(resumeState);
    });
  } else {
    console.error("WajibetSDK is not loaded.");
  }
};

function startGame(resumeState) {
  const creation = WajibetSDK.getGameCreation();
  gameState.settings = creation.settings;
  gameState.questions = [...creation.content];

  // Apply Theme Color
  const themeColors = {
    blue: '#3182ce',
    green: '#38a169',
    purple: '#805ad5',
    orange: '#dd6b20'
  };
  if (gameState.settings.themeColor && themeColors[gameState.settings.themeColor]) {
    document.documentElement.style.setProperty('--theme-color', themeColors[gameState.settings.themeColor]);
  }

  if (gameState.settings.shuffleQuestions) {
    gameState.questions = shuffleArray(gameState.questions);
  }

  if (resumeState) {
    gameState.currentIndex = resumeState.currentItemIndex || 0;
    gameState.score = resumeState.currentScore || 0;
  }

  gameState.startTime = Date.now();
  
  document.getElementById('total-q').textContent = gameState.questions.length;
  showScreen('game-screen');
  
  if (gameState.currentIndex >= gameState.questions.length) {
    endGame();
  } else {
    loadQuestion();
  }
}

function loadQuestion() {
  const currentQ = gameState.questions[gameState.currentIndex];
  document.getElementById('score-display').textContent = gameState.score;
  document.getElementById('current-q').textContent = gameState.currentIndex + 1;
  document.getElementById('question-text').textContent = currentQ.questionText;

  const optionsGrid = document.getElementById('options-grid');
  optionsGrid.innerHTML = '';

  // Gather and shuffle options
  let options = [
    { text: currentQ.correctAnswer, isCorrect: true },
    { text: currentQ.wrongAnswer1, isCorrect: false },
    { text: currentQ.wrongAnswer2, isCorrect: false },
    { text: currentQ.wrongAnswer3, isCorrect: false }
  ];
  options = shuffleArray(options);

  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = opt.text;
    btn.onclick = () => handleAnswer(opt.isCorrect, btn);
    optionsGrid.appendChild(btn);
  });
}

function handleAnswer(isCorrect, selectedBtn) {
  // Disable all buttons
  const buttons = document.querySelectorAll('.option-btn');
  buttons.forEach(btn => btn.disabled = true);

  if (isCorrect) {
    selectedBtn.classList.add('correct');
    gameState.score += parseInt(gameState.settings.pointsPerQuestion) || 10;
    
    // Play correct sound (SDK feature)
    if (WajibetSDK.playSound) WajibetSDK.playSound('correct');
  } else {
    selectedBtn.classList.add('wrong');
    // Highlight the correct one
    buttons.forEach(btn => {
      const currentQ = gameState.questions[gameState.currentIndex];
      if (btn.textContent === currentQ.correctAnswer) {
        btn.classList.add('correct');
      }
    });
    
    // Play wrong sound (SDK feature)
    if (WajibetSDK.playSound) WajibetSDK.playSound('wrong');
  }

  // Update UI score
  document.getElementById('score-display').textContent = gameState.score;

  // Wait a moment then move to next
  setTimeout(() => {
    gameState.currentIndex++;
    
    if (gameState.currentIndex < gameState.questions.length) {
      // Save state
      const elapsedMs = Date.now() - gameState.startTime;
      WajibetSDK.updateScore(gameState.score, {
        currentItemIndex: gameState.currentIndex,
        currentScore: gameState.score,
        elapsedMs: elapsedMs
      });
      loadQuestion();
    } else {
      endGame();
    }
  }, 1500);
}

function endGame() {
  gameState.isGameOver = true;
  showScreen('result-screen');
  document.getElementById('final-score').textContent = gameState.score;
  
  const elapsedMs = Date.now() - gameState.startTime;
  const isPerfect = gameState.score === (gameState.questions.length * (parseInt(gameState.settings.pointsPerQuestion) || 10));
  
  document.getElementById('result-message').textContent = isPerfect ? "Perfect Score!" : "Good job!";
  
  WajibetSDK.gameOver(gameState.score, {
    currentItemIndex: gameState.currentIndex,
    currentScore: gameState.score,
    elapsedMs: elapsedMs
  });
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

function shuffleArray(array) {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
}
