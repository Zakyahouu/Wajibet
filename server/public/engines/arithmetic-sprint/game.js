(function(){
  let creation, settings, pool=[], idx=0, score=0, streak=0, timerIv, timeLeft=0;
  const answers = [];
  let qStartMs = 0;
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
    return Promise.resolve();
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
        enterBtn.onclick = countdown;
      });
    }
  });
})();
