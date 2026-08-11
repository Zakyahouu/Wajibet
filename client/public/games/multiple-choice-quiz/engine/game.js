(function(){
	let settings = {}, items=[], idx=0, score=0, timerIv, qStartMs = 0;
	const answers = [];   // local per-item timing log; SDK buffers its own answers
	const byId = (id) => document.getElementById(id);
	let preloadedBackgrounds = [];
	let resumeElapsedMs = 0;
	let gameStartMs = 0;
	
	let selectedKey = null;

	const themes = [
		{ bg: 1, color: '#ec4899' },
		{ bg: 2, color: '#ec4899' },
		{ bg: 3, color: '#ec4899' },
		{ bg: 4, color: '#3b82f6' },
		{ bg: 5, color: '#3b82f6' },
		{ bg: 6, color: '#3b82f6' },
		{ bg: 7, color: '#22c55e' },
		{ bg: 8, color: '#22c55e' },
		{ bg: 9, color: '#22c55e' },
		{ bg: 10, color: '#fb923c' },
		{ bg: 11, color: '#fb923c' },
		{ bg: 12, color: '#f97316' },
		{ bg: 13, color: '#f97316' }
	];

	const preloadBackgrounds = () => {
		for (let i = 1; i <= 13; i++) {
			const img = new Image();
			img.src = 'assets/' + i + '.jpeg';
			preloadedBackgrounds.push(img);
		}
	};

	const screens = { ready: byId('ready-screen'), countdown: byId('countdown-screen'), play: byId('play-screen'), done: byId('done-screen') };
	const enterBtn = byId('enter-btn');
	const qIdxEl = byId('q-idx');
	const timerTextEl = byId('timer-display').querySelector('.text');
	const scoreTextEl = byId('score-display').querySelector('.text');
	const qCard = byId('question-card');
	const qEl = byId('question-text');
	const optsGrid = byId('options-grid');
	const explainEl = byId('explain-container');
	const timerBorder = byId('timer-border');
	const nextBtn = byId('next-btn');
	const confirmBtn = byId('confirm-btn');
	
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
	
	const stopTimer = () => { if (timerIv) { clearInterval(timerIv); timerIv = null; } };

	const countdown = () => { 
		show('countdown');
		let n = 3;
		const c = document.querySelector('#countdown-screen .count');
		c.textContent = n;
		const iv = setInterval(() => { n--; c.textContent = n; if (n <= 0) { clearInterval(iv); start(); } }, 800); 
	};
	
	const render = () => {
		const item = items[idx];
		if (!item) { finish(); return; }

		qCard.classList.remove('fade-out');
		optsGrid.classList.remove('fade-out');
		
		selectedKey = null;

		// FIX BUG 3: always clear any running timer before rendering the new question
		stopTimer();
		qCard.style.animation = '';
		
		const defaultColor = '#3b82f6';
		if (!settings.backgroundUrl) {
			const bgIndex = (idx % 13) + 1;
			document.body.style.backgroundImage = 'url(assets/' + bgIndex + '.jpeg)';
			const theme = themes.find(t => t.bg === bgIndex);
			document.documentElement.style.setProperty('--primary-color', theme ? theme.color : defaultColor);
		} else {
			document.documentElement.style.setProperty('--primary-color', defaultColor);
		}

		qIdxEl.textContent = (idx + 1) + ' / ' + items.length;
		explainEl.classList.add('hidden');
		nextBtn.classList.add('hidden');
		confirmBtn.classList.remove('hidden');
		confirmBtn.disabled = true;
		
		qEl.textContent = item.question;
		
		const optionsMap = { A: 'triangle', B: 'diamond', C: 'square', D: 'circle' };
		const rawOptions = [['A', item.optionA], ['B', item.optionB], ['C', item.optionC], ['D', item.optionD]].filter(([_, val]) => val && val.trim());
		
		optsGrid.innerHTML = '';
		optsGrid.className = 'options-grid ' + (rawOptions.length === 3 ? 'three-options' : '');
		
		rawOptions.forEach(([key, label]) => {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'opt';
			btn.textContent = label;
			btn.setAttribute('data-key', key);
			btn.setAttribute('data-shape', optionsMap[key]);
			btn.onclick = () => selectOption(btn, key);
			optsGrid.appendChild(btn);
		});

		confirmBtn.onclick = () => lockAndReveal();

		const sec = settings.timePerQuestion || 0;
		if (sec > 0) {
			let timeLeft = sec;
			timerTextEl.textContent = timeLeft + 's';
			
			timerBorder.style.transition = 'none';
			timerBorder.style.width = '100%';
			void timerBorder.offsetWidth;
			
			timerBorder.style.transition = 'width ' + sec + 's linear';
			timerBorder.style.width = '0%';
			
			timerIv = setInterval(() => {
				timeLeft--;
				timerTextEl.textContent = timeLeft + 's';
				if (timeLeft <= 3 && timeLeft > 0) qCard.style.animation = 'shake 0.5s infinite';
				if (timeLeft <= 0) lockAndReveal(true);
			}, 1000);
		} else {
			timerTextEl.textContent = '---';
			timerBorder.style.width = '100%';
		}
		
		qStartMs = Date.now();
	};

	const selectOption = (btn, key) => {
		if (btn.disabled) return;
		
		[...optsGrid.children].forEach(b => b.classList.remove('selected'));
		btn.classList.add('selected');
		selectedKey = key;
		
		confirmBtn.disabled = false;
	};

	const lockAndReveal = (timedOut = false) => {
		if (!timedOut && !selectedKey) return;
		
		stopTimer();
		qCard.style.animation = '';
		confirmBtn.classList.add('hidden');
		
		const item = items[idx];
		if (!item) return;

		const correctKey = String(item.correct || 'A').toUpperCase();
		const ok = !!(selectedKey && selectedKey.toUpperCase() === correctKey);

		// FIX BUG 2: respect teacher-configured points (settings.pointsPerQuestion)
		const pointsPerQ = Number(settings.pointsPerQuestion) || 1;
		const scoreEarned = ok ? pointsPerQ : 0;
		if (ok) {
			score += scoreEarned;
			scoreTextEl.textContent = score;
			scoreTextEl.classList.add('pop');
			scoreTextEl.addEventListener('animationend', () => scoreTextEl.classList.remove('pop'), { once: true });
		}

		const deltaMs = Math.max(0, Date.now() - qStartMs);
		// Always push to local answers array for totalTimeMs calculation
		answers.push({ index: idx, correct: ok, selectedKey: selectedKey || 'TIMEOUT', timeMs: deltaMs });


		[...optsGrid.children].forEach(b => {
			const key = b.getAttribute('data-key');
			if (key.toUpperCase() === correctKey) {
				b.classList.add('correct');
				b.innerHTML = '✓ ' + b.textContent;
			} else if (key === selectedKey) {
				b.classList.add('wrong');
				b.innerHTML = '✗ ' + b.textContent;
			}
			b.disabled = true;
			b.classList.remove('selected');
		});

		const rawOptions = [['A', item.optionA], ['B', item.optionB], ['C', item.optionC], ['D', item.optionD]].filter(([_, val]) => val && val.trim());
		let correctText = correctKey;
		let userText = null;
        for (let i = 0; i < rawOptions.length; i++) {
            if (rawOptions[i][0] === correctKey) correctText = rawOptions[i][1];
            if (rawOptions[i][0] === selectedKey) userText = rawOptions[i][1];
        }

		// FIX BUG 1: userAnswer must never be null (SDK throws if it is).
		// When timed out with no selection, use the empty string.
		const safeUserAnswer = userText !== null ? userText : (timedOut ? '' : '');
		
		WajibetSDK.recordInteraction({
			itemId: item.itemId || ('item_' + idx),
			itemIndex: idx,
			type: 'multiple_choice',
			isCorrect: ok,
			userAnswer: safeUserAnswer,
			correctAnswer: correctText,
			score: scoreEarned,
			maxScore: pointsPerQ,
			timeMs: deltaMs,
			attempts: 1,
			skipped: timedOut,
			meta: {
				question: item.question,
				options: rawOptions.map(o => o[1]),
				explanation: item.explanation,
				timedOut: timedOut,
				selectedKey: selectedKey || null,
				correctKey: correctKey
			}
		});

		if (item.explanation) {
			explainEl.innerHTML = '<strong>Explanation:</strong> ' + item.explanation;
			explainEl.classList.remove('hidden');
		}

		nextBtn.classList.remove('hidden');
		if (idx + 1 >= items.length) {
			nextBtn.textContent = 'Finish Game';
		} else {
			nextBtn.textContent = 'Next Question';
		}
		
		nextBtn.onclick = () => {
			if (idx + 1 >= items.length) {
				finish();
				return;
			}
			
			qCard.classList.add('fade-out');
			optsGrid.classList.add('fade-out');
			
			setTimeout(() => {
				idx++;
				render();
			}, 300);
		};
	};

	const start = (resumeState) => { 
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
		
		scoreTextEl.textContent = score; 
		gameStartMs = Date.now();
		render(); 
	};
	
	const finish = () => {
		show('done');
		stopTimer();
		// FIX BUG 4: use answers array length * avg time (local tracking)
		// totalTimeMs from local answers is in sync because we push BEFORE recordInteraction
		const totalTimeMs = answers.reduce((a, b) => a + (b.timeMs || 0), 0) + resumeElapsedMs;
		const totalPossibleScore = items.length * (Number(settings.pointsPerQuestion) || 1);
		byId('summary-text').textContent = 'You scored ' + score + ' out of ' + totalPossibleScore + '!';
		WajibetSDK.finishGame(score, totalTimeMs);
	};
	
	window.onload = function() {
		if (typeof WajibetSDK === 'undefined') {
			byId('ready-screen').innerHTML = '<h2>SDK not loaded.</h2>';
			return;
		}

		WajibetSDK.init(function(resumeState) {
			document.documentElement.dir = WajibetSDK.getDirection();
			const creation = WajibetSDK.getGameCreation() || {};
			settings = creation.config || {};
			items = Array.isArray(creation.content) ? creation.content : [];
			
			if (items.length === 0) { 
				byId('ready-screen').innerHTML = '<h2>Error: No questions provided.</h2>'; 
				return; 
			}
			
			preloadBackgrounds();
			show('ready'); 
			
			if (resumeState) {
				enterBtn.textContent = 'Continue';
				enterBtn.onclick = () => start(resumeState);
			} else {
				enterBtn.onclick = countdown;
			}
		});
	};
})();
