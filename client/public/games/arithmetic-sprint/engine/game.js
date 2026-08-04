(function(){
  let settings = {}, pool = [], idx = 0, score = 0, streak = 0;
  let timerIv = null, timeLeft = 0;
  let qStartMs = 0;
  let gameStartMs = 0;
  let resumeElapsedMs = 0;
  
  let selectedChoice = null;
  
  const byId = (id) => document.getElementById(id);
  const screens = {ready: byId('ready'), countdown: byId('countdown'), play: byId('play'), done: byId('done'), loading: byId('loading')};
  const enterBtn = byId('enterBtn');
  const timerEl = byId('timer').querySelector('.text');
  const progressEl = byId('progress').querySelector('.text');
  const scoreEl = byId('score').querySelector('.text');
  const qWrapper = document.querySelector('.question-wrapper');
  const qEl = byId('question');
  const optionsContainer = byId('options-container');
  const summary = byId('summary');
  const progressBar = byId('progress-bar');
  const streakCounter = byId('streak-counter');
  
  let confirmBtn = null;
  let nextBtn = null;

  const show = (id) => { Object.values(screens).forEach(s => s.classList.add('hidden')); screens[id].classList.remove('hidden'); };
  
  const shuffle = (a) => {
    const copy = a.slice();
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = copy[i];
        copy[i] = copy[j];
        copy[j] = temp;
    }
    return copy;
  };
  
  const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const calc = (a, op, b) => { switch(op){ case '+': return a+b; case '-': return a-b; case '×': return a*b; case '÷': return b===0? NaN : a/b; default: return NaN; } };

  function buildChoices(answer) {
    const choices = new Set();
    if (Number.isFinite(answer) && answer >= 0) choices.add(answer);
    let guard = 0;
    while (choices.size < 3 && guard < 20) {
      const offset = rnd(1, 5);
      const next = choices.size % 2 === 0 ? answer + offset : answer - offset;
      if (Number.isFinite(next) && next >= 0) choices.add(next);
      guard++;
    }
    return shuffle(Array.from(choices));
  }

  function showBonus(text, type) {
    const bonusEl = document.createElement('div');
    bonusEl.textContent = text;
    bonusEl.className = `bonus-pop ${type}`;
    document.body.appendChild(bonusEl);
    setTimeout(() => bonusEl.remove(), 1500);
  }

  function updateStreakDisplay() {
    if (streak >= 2) {
      streakCounter.textContent = `🔥 ${streak}x Streak!`;
      streakCounter.classList.remove('hidden');
      streakCounter.style.animation = 'pulse 0.5s ease-out';
    } else {
      streakCounter.classList.add('hidden');
    }
  }

  function countdown(){ 
    show('countdown'); 
    let n = 3; 
    const c = document.querySelector('#countdown .count'); 
    c.textContent = n; 
    const iv = setInterval(() => { 
      n--; 
      c.textContent = n; 
      if(n <= 0){ 
        clearInterval(iv); 
        start(); 
      } 
    }, 800); 
  }

  function render(){
    qWrapper.style.opacity = '0';
    selectedChoice = null;
    
    if (confirmBtn) { confirmBtn.classList.add('hidden'); confirmBtn.disabled = true; }
    if (nextBtn) nextBtn.classList.add('hidden');
    
    setTimeout(() => {
      const q = pool[idx]; 
      if(!q){ finish(); return; }
      
      progressEl.textContent = (idx + 1) + '/' + pool.length;
      scoreEl.textContent = score;
      progressBar.style.width = ((idx) / pool.length * 100) + '%';

      qEl.innerHTML = '<span dir="ltr">' + q.question + '</span>';
      
      optionsContainer.innerHTML = '';
      const shuffledChoices = shuffle(q.choices);
      shuffledChoices.forEach(choice => {
        const btn = document.createElement('button');
        btn.className = 'btn option-btn';
        btn.textContent = choice;
        btn.onclick = () => selectAnswer(btn, choice);
        optionsContainer.appendChild(btn);
      });

      qStartMs = Date.now();

      qStartMs = Date.now();
      qWrapper.style.opacity = '1';
    }, 200);
  }

  function selectAnswer(btn, choice) {
    if (btn.disabled) return;
    
    var children = optionsContainer.children;
    for (var i = 0; i < children.length; i++) {
        children[i].classList.remove('selected');
        children[i].disabled = true;
    }
    btn.classList.add('selected');
    selectedChoice = choice;
    
    confirmAnswer();
  }

  function confirmAnswer() {
    if (selectedChoice === null) return;
    
    const q = pool[idx];
    const correctAnswer = q.answer;
    const ok = selectedChoice === correctAnswer;
    const deltaMs = Date.now() - qStartMs;
    const pointsPerCorrect = Number(settings.pointsPerCorrect ?? 1);
    const penaltyPerWrong  = Number(settings.penaltyPerWrong  ?? 0);
    
    var scoreDelta;
    if (ok) {
      scoreDelta = pointsPerCorrect;
    } else {
      scoreDelta = penaltyPerWrong > 0 ? -penaltyPerWrong : 0;
    }
    
    if (ok && deltaMs <= 2000) {
      showBonus('⚡ Fast Answer!', 'speed');
    }
    
    if (ok) {
      streak++;
      score += pointsPerCorrect;
      if (streak >= 2) updateStreakDisplay();
    } else {
      streak = 0;
      updateStreakDisplay();
      score = Math.max(0, score - penaltyPerWrong);
    }
    scoreEl.textContent = score;
    
    var children = optionsContainer.children;
    for (var i = 0; i < children.length; i++) {
      const btn = children[i];
      const choice = Number(btn.textContent);
      if (choice === correctAnswer) {
        btn.classList.add('correct');
        btn.innerHTML = '✓ ' + choice;
        if (ok) btn.style.animation = 'thump 0.3s ease-out';
      } else if (choice === selectedChoice && !ok) {
        btn.classList.add('wrong');
        btn.innerHTML = '✗ ' + choice;
        btn.style.animation = 'shake 0.5s ease-out';
      }
      btn.disabled = true;
      btn.classList.remove('selected');
    }

    WajibetSDK.recordInteraction({
      itemId: q.itemId,
      itemIndex: idx,
      type: 'arithmetic',
      isCorrect: ok,
      userAnswer: String(selectedChoice),
      correctAnswer: String(correctAnswer),
      score: scoreDelta,
      maxScore: pointsPerCorrect,
      timeMs: deltaMs,
      attempts: 1,
      skipped: false,
      meta: {
        question: q.question,
        correctAnswer: correctAnswer,
        selectedAnswer: selectedChoice,
        penaltyApplied: !ok && penaltyPerWrong > 0 ? penaltyPerWrong : 0
      }
    });

    setTimeout(() => {
        idx++;
        if (idx >= pool.length) {
            finish();
        } else {
            render();
        }
    }, 1000);
  }

  function start(resumeState){
    document.body.style.backgroundImage = 'url(assets/background.jpeg)';
    show('play');
    
    if (resumeState) {
        idx = resumeState.currentItemIndex || 0;
        score = resumeState.currentScore || 0;
        resumeElapsedMs = resumeState.elapsedMs || 0;
    } else {
        idx = 0;
        score = 0;
        resumeElapsedMs = 0;
    }
    
    streak = 0; 
    render();
    gameStartMs = Date.now();

    if (settings.durationSec > 0){
      timeLeft = Number(settings.durationSec);
      if (resumeState) {
        timeLeft = Math.max(0, Math.floor(timeLeft - (resumeElapsedMs / 1000)));
      }
      
      if (timeLeft <= 0) {
          finish();
          return;
      }
      
      timerEl.textContent = timeLeft + 's';
      timerIv = setInterval(()=>{ 
        timeLeft--; 
        timerEl.textContent = timeLeft + 's'; 
        
        if (timeLeft <= 10) {
          timerEl.parentElement.classList.add('urgent-timer');
        } else {
          timerEl.parentElement.classList.remove('urgent-timer');
        }
        
        if(timeLeft <= 0){ 
          clearInterval(timerIv); 
          timerEl.parentElement.classList.remove('urgent-timer');
          finish(); 
        } 
      }, 1000);
    } else { 
      timerEl.textContent = 'Sprint'; 
      timerEl.parentElement.style.visibility = 'hidden'; 
    }
  }

  function finish(){
    if (timerIv) clearInterval(timerIv);
    timerEl.parentElement.classList.remove('urgent-timer');
    show('done');
    summary.textContent = 'Final Score: ' + score;
    
    const totalTime = (gameStartMs ? Date.now() - gameStartMs : 0) + resumeElapsedMs;
    WajibetSDK.finishGame(score, totalTime);
  }

  const preloadAssets = () => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = 'assets/background.jpeg';
    });
  };

  window.onload = function() {
    if (typeof WajibetSDK === 'undefined') {
        byId('loading').textContent = 'SDK not loaded.';
        return;
    }

    WajibetSDK.init(function(resumeState) {
        document.documentElement.dir = WajibetSDK.getDirection();
        const creation = WajibetSDK.getGameCreation() || {};
        settings = creation.config || {};
        
        show('loading');
        preloadAssets().then(() => {
          pool = [];
          if (settings.autoGenerate) {
            const numEquations = settings.questionCount || 10;
            const operations = [];
            if (settings.opAdd) operations.push('+');
            if (settings.opSub) operations.push('-');
            if (settings.opMul) operations.push('*');
            if (settings.opDiv) operations.push('/');
            if (operations.length === 0) operations.push('+', '-');
            const minNumRaw = Number(settings.numberRangeMin ?? 1);
            const maxNumRaw = Number(settings.numberRangeMax ?? 20);
            const minNum = Number.isFinite(minNumRaw) ? Math.min(minNumRaw, maxNumRaw) : 1;
            const maxNum = Number.isFinite(maxNumRaw) ? Math.max(minNumRaw, maxNumRaw) : 20;
            
            for (let i = 0; i < numEquations; i++) {
              let num1, num2, op, answer;
              op = operations[Math.floor(Math.random() * operations.length)];
              
              if (op === '/') {
                if (maxNum < 2) op = '+';
              }
              if (op === '/') {
                const divisorMax = Math.min(10, Math.max(2, maxNum));
                num2 = rnd(2, divisorMax);
                const quotientMin = Math.ceil(Math.max(0, minNum) / num2);
                const quotientMax = Math.floor(maxNum / num2);
                if (quotientMax < quotientMin) op = '+';
                else {
                  const quotient = rnd(quotientMin, quotientMax);
                  num1 = num2 * quotient;
                  answer = quotient;
                }
              }
              if (op !== '/' || answer === undefined) {
                num1 = rnd(minNum, maxNum);
                num2 = rnd(minNum, maxNum);
                if (op === '+') answer = num1 + num2;
                else if (op === '-') {
                  if (num2 > num1) { const t = num1; num1 = num2; num2 = t; }
                  answer = num1 - num2;
                } else if (op === '*') answer = num1 * num2;
              }
              const question = num1 + ' ' + op + ' ' + num2;
              pool.push({
                itemId: 'gen-' + i,
                question: question,
                answer: answer,
                choices: buildChoices(answer)
              });
            }
          } else if (creation.content && Array.isArray(creation.content)) {
            pool = creation.content.map((item, i) => {
              const itemId = item.itemId || ('item_' + i);
              if (item.operandA !== undefined && item.operation !== undefined && item.operandB !== undefined) {
                const a = Number(item.operandA);
                const b = Number(item.operandB);
                const op = item.operation;
                let answer = Number(item.correctAnswer);

                if (!Number.isFinite(answer)) {
                  if (op === '+') answer = a + b;
                  else if (op === '-') answer = a - b;
                  else if (op === '*') answer = a * b;
                  else if (op === '/') {
                    if (b === 0 || a % b !== 0) return null;
                    answer = a / b;
                  }
                }
                if (!Number.isFinite(answer) || answer < 0) return null;
                return { itemId: itemId, question: a + ' ' + op + ' ' + b, answer: answer, choices: buildChoices(answer) };
              } else if (typeof item.expression === 'string') {
                const answer = parseFloat(item.correctAnswer);
                return { itemId: itemId, question: item.expression, answer: answer, choices: buildChoices(answer) };
              } else if (item.a !== undefined && item.op !== undefined && item.b !== undefined) {
                const answer = calc(item.a, item.op, item.b);
                const wrong1 = item.wrong1 ?? answer + rnd(1,5);
                const wrong2 = item.wrong2 ?? answer - rnd(1,5);
                return { itemId: itemId, question: item.a + ' ' + item.op + ' ' + item.b, answer: answer, choices: shuffle([answer, wrong1, wrong2]) };
              }
            }).filter(Boolean);
          }
          
          if (!pool.length) {
            document.body.innerHTML = '<h1 style="color:#fff;text-align:center;">No valid questions found. Please check your settings.</h1>';
            return;
          }
          
          show('ready');
          
          if (resumeState) {
              enterBtn.textContent = 'Continue';
              enterBtn.onclick = () => start(resumeState);
          } else {
              enterBtn.onclick = countdown;
          }
        });
    });
  };
})();
