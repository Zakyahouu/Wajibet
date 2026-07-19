(function(){
  let creation, settings, pool=[], idx=0, score=0, streak=0, timerIv, timeLeft=0;
  const answers = [];
  let qStartMs = 0;
  let shuffledBackgrounds = [];
  const byId=(id)=>document.getElementById(id);

  const themes = [ 
    { group: 1, color: '#6366f1' }, // Indigo (core cosmic)
    { group: 2, color: '#8b5cf6' }, // Purple (mystical)
    { group: 3, color: '#06b6d4' }, // Cyan (electric)
    { group: 4, color: '#f59e0b' }  // Amber (star-like)
  ];

  // --- Asset Preloading ---
  let assetsLoaded = false;
  const preloadAssets = () => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        assetsLoaded = true;
        resolve();
      };
      img.onerror = () => {
        // Continue even if image fails to load
        assetsLoaded = true;
        resolve();
      };
      img.src = 'assets/background.jpeg';
    });
  };

  // --- Element References ---
  const screens={ready:byId('ready'),countdown:byId('countdown'),play:byId('play'),done:byId('done'),loading:byId('loading')};
  const enterBtn=byId('enterBtn'); 
  const timerEl=byId('timer').querySelector('.text'); 
  const progressEl=byId('progress').querySelector('.text'); 
  const scoreEl=byId('score').querySelector('.text');
  const qWrapper=document.querySelector('.question-wrapper'); 
  const qEl=byId('question'); 
  const optionsContainer=byId('options-container'); 
  const summary=byId('summary');
  const progressBar = byId('progress-bar'); 
  const streakCounter = byId('streak-counter');
  
  const show=(id) => { Object.values(screens).forEach(s=>s.classList.add('hidden')); screens[id].classList.remove('hidden'); };
  const shuffle = (a) => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(([_, v]) => v);
  const rnd=(min,max) => Math.floor(Math.random()*(max-min+1))+min;
  const calc=(a,op,b) => { switch(op){ case '+': return a+b; case '-': return a-b; case '×': return a*b; case '÷': return b===0? NaN : a/b; default: return NaN; } };

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

  function countdown(){ show('countdown'); let n=3; const c=document.querySelector('#countdown .count'); c.textContent=n; const iv=setInterval(()=>{ n--; c.textContent=n; if(n<=0){ clearInterval(iv); start(); } }, 800); }

  function gen(){ /* ... (generation logic is the same, omitted for brevity) ... */ }

  function render(){
    qWrapper.style.opacity = '0'; // Start fade out for transition
    
    setTimeout(() => {
      const q = pool[idx]; if(!q){ finish(); return; }
      
      // Update HUD and Progress Bar
      progressEl.textContent = `${idx+1}/${pool.length}`;
      scoreEl.textContent = score;
      progressBar.style.width = `${((idx + 1) / pool.length) * 100}%`;

      qEl.textContent = q.question;
      optionsContainer.innerHTML = '';
      const shuffledChoices = shuffle(q.choices);
      shuffledChoices.forEach(choice => {
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = choice;
        btn.onclick = () => checkAnswer(choice, q.answer);
        optionsContainer.appendChild(btn);
      });

      qStartMs = Date.now();
      qWrapper.style.opacity = '1'; // Fade in new question
    }, 200); // Delay matches opacity transition time
  }

  function checkAnswer(selectedValue, correctAnswer) {
    const ok = selectedValue === correctAnswer;
    const deltaMs = Date.now() - qStartMs;
    const pointsPerCorrect = Number(settings.pointsPerCorrect ?? 1);
    const penaltyPerWrong = Number(settings.penaltyPerWrong ?? 0);
    const scoreDelta = ok ? pointsPerCorrect : -penaltyPerWrong;
    
    // Speed bonus: +50 points if answered within 2 seconds (but score is just correct answers count)
    if (ok && deltaMs <= 2000) {
      showBonus('+50 Speed Bonus!', 'speed');
    }
    
    // Streak logic
    if (ok) {
      streak++;
      score += pointsPerCorrect;
      if (streak >= 2) {
        updateStreakDisplay();
      }
    } else {
      streak = 0;
      updateStreakDisplay();
      score = Math.max(0, score - penaltyPerWrong);
    }
    
    // Visual Feedback with enhanced animations
    [...optionsContainer.children].forEach(btn => {
      const choice = Number(btn.textContent);
      if(choice === correctAnswer) {
        btn.classList.add('correct');
        if (ok) btn.style.animation = 'thump 0.3s ease-out';
      } else if(choice === selectedValue && !ok) {
        btn.classList.add('wrong');
        btn.style.animation = 'shake 0.5s ease-out';
      }
      btn.disabled = true;
    });

    answers.push({ index: idx, correct: ok, timeMs: deltaMs, points: scoreDelta });
    window.parent.postMessage({ type:'LIVE_ANSWER', payload:{ correct: ok, deltaMs, scoreDelta, currentScore: score }}, '*');
    setTimeout(()=>{ idx++; render(); }, 1200); // Longer delay for animations
  }

  function start(){
    // Set background image
    document.body.style.backgroundImage = `url(assets/background.jpeg)`;
    
    show('play'); idx=0; score=0; streak=0; gen(); render();

    if (settings.durationSec > 0){
      timeLeft = Number(settings.durationSec);
      timerEl.textContent = `${timeLeft}s`;
      timerIv = setInterval(()=>{ 
        timeLeft--; 
        timerEl.textContent=`${timeLeft}s`; 
        
        // Add shake effect when time is running low
        if (timeLeft <= 10) {
          timerEl.parentElement.classList.add('urgent-timer');
        } else {
          timerEl.parentElement.classList.remove('urgent-timer');
        }
        
        if(timeLeft<=0){ 
          clearInterval(timerIv); 
          timerEl.parentElement.classList.remove('urgent-timer');
          finish(); 
        } 
      }, 1000);
    } else { timerEl.textContent = 'Sprint'; timerEl.parentElement.style.visibility = 'hidden'; }
  }

  function finish(){
    if (timerIv) clearInterval(timerIv);
    // Remove urgent timer effect
    timerEl.parentElement.classList.remove('urgent-timer');
    show('done');
    summary.textContent = `Final Score: ${score}`;
    const totalTimeMs = answers.reduce((a,b)=>a+(b.timeMs || 0),0);
    const pointsPerCorrect = Number(settings.pointsPerCorrect ?? 1);
    window.parent.postMessage({ type:'LIVE_FINISH', payload:{ totalTimeMs }}, '*');
    window.parent.postMessage({ type:'GAME_COMPLETE', payload:{ gameCreationId: creation?.gameCreationId || creation?._id, score, totalPossibleScore: pool.length * pointsPerCorrect, answers }}, '*');
  }

  window.addEventListener('message', (e)=>{
    if (e.data?.type==='INIT_GAME'){
      // Handle both old format (payload) and new platform format
      const data = e.data.payload || e.data;
      creation = data;
      settings = data.settings || data.config || {};
      
      // Preload all assets before starting
      show('loading');
      preloadAssets().then(() => {
        gen = function() {
          pool = [];
          
          // Check if using automatic generation
          if (settings.autoGenerate) {
            // Auto-generate equations based on settings
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
              
              // Pick random operation from selected operations
              op = operations[Math.floor(Math.random() * operations.length)];
              
              // Generate numbers based on operation
              if (op === '/') {
                if (maxNum < 2) {
                  op = '+';
                }
              }

              if (op === '/') {
                // For division: ensure whole number result (child-friendly)
                // num2 is divisor, num1 is multiple of num2
                const divisorMax = Math.min(10, Math.max(2, maxNum));
                num2 = rnd(2, divisorMax); // divisor 2-10
                const quotientMin = Math.ceil(Math.max(0, minNum) / num2);
                const quotientMax = Math.floor(maxNum / num2);
                if (quotientMax < quotientMin) {
                  op = '+';
                } else {
                  const quotient = rnd(quotientMin, quotientMax);
                  num1 = num2 * quotient; // ensure exact division
                  answer = quotient;
                }
              }

              if (op !== '/' || answer === undefined) {
                // For +, -, *: normal random generation
                num1 = rnd(minNum, maxNum);
                num2 = rnd(minNum, maxNum);
                
                if (op === '+') answer = num1 + num2;
                else if (op === '-') {
                  if (num2 > num1) [num1, num2] = [num2, num1];
                  answer = num1 - num2;
                } else if (op === '*') answer = num1 * num2;
              }
              
              const question = `${num1} ${op} ${num2}`;
              
              pool.push({
                question,
                answer,
                choices: buildChoices(answer)
              });
            }
          } else if (data.content && Array.isArray(data.content)) {
            // Manual content from platform
            pool = data.content.map(item => {
              if (item.operandA !== undefined && item.operation !== undefined && item.operandB !== undefined) {
                // New structured format: { operandA, operation, operandB, correctAnswer }
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
                const question = `${a} ${op} ${b}`;
                return {
                  question,
                  answer,
                  choices: buildChoices(answer)
                };
              } else if (typeof item.expression === 'string') {
                // Fallback to old expression format
                const question = item.expression;
                const answer = parseFloat(item.correctAnswer);
                return { 
                  question, 
                  answer, 
                  choices: buildChoices(answer)
                };
              } else if (item.a !== undefined && item.op !== undefined && item.b !== undefined) {
                // Fallback to oldest format
                const answer = calc(item.a, item.op, item.b);
                const wrong1 = item.wrong1 ?? answer + rnd(1,5);
                const wrong2 = item.wrong2 ?? answer - rnd(1,5);
                return { question: `${item.a} ${item.op} ${item.b}`, answer, choices: shuffle([answer, wrong1, wrong2]) };
              }
            }).filter(Boolean);
          }
        }
        gen();
        if (!pool.length) {
          document.body.innerHTML = '<h1 style="color:#fff;text-align:center;">No valid questions found. Please check your settings.</h1>';
          return;
        }
        show('ready');
        enterBtn.onclick = countdown;
      });
    }
  });
})();
