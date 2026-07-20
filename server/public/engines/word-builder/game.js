(function () {
    let creation, settings, items = [],
        idx = 0, score = 0, currentAttempts = 0, timerInterval = null;
    const answers = [];
    let liveRoomCode = null;
    let gameStartTime = null;
    let puzzleStartTime = null;
    let totalWordsAttempted = 0;
    const byId = id => document.getElementById(id);

    // --- Element References ---
    const container = byId('container');
    const screens = { ready: byId('ready-screen'), play: byId('play-screen'), done: byId('done-screen') };
    const loader = byId('loader'); 
    const readyContent = [byId('start-btn'), document.querySelector('.logo'), document.querySelector('.title')];
    const startBtn = byId('start-btn');
    const timerContainer = byId('timer-container');
    const scoreContainer = byId('score-container');
    const timerEl = byId('timer');
    const progressEl = byId('progress');
    const attemptsContainer = byId('attempts-container');
    const attemptsEl = byId('attempts');
    const hintBox = byId('hint-box');
    const hintText = byId('hint-text');
    const wordPreview = byId('word-preview');
    const buildArea = byId('build-area');
    const letterBank = byId('letter-bank');
    const clearBtn = byId('clear-btn');
    const checkBtn = byId('check-btn');
    const goNextBtn = byId('go-next-btn');
    const summaryText = byId('summary-text');

    let draggedElement = null;
    let isRtl = false;

    const showScreen = (id) => {
        Object.values(screens).forEach(s => s.classList.add('hidden'));
        screens[id].classList.remove('hidden');
    };

    function applyTextDirection(dir) {
        const normalized = dir === 'right_to_left' ? 'rtl' : 'ltr';
        isRtl = normalized === 'rtl';
        document.body.setAttribute('dir', normalized);
        wordPreview.style.direction = normalized;
        wordPreview.style.textAlign = normalized === 'rtl' ? 'right' : 'center';
        buildArea.style.direction = normalized;
        buildArea.style.flexDirection = normalized === 'rtl' ? 'row-reverse' : 'row';
        buildArea.style.justifyContent = normalized === 'rtl' ? 'flex-end' : 'flex-start';
        letterBank.style.direction = normalized;
        letterBank.style.justifyContent = normalized === 'rtl' ? 'flex-end' : 'center';
        hintText.style.direction = normalized;
        hintText.style.textAlign = normalized === 'rtl' ? 'right' : 'left';
    }

    const start = () => {
        document.body.classList.remove('game-ended'); // Ensure end-game class is removed on new start
        showScreen('play');
        idx = 0;
        score = 0;
        totalWordsAttempted = 0;
        answers.length = 0;
        gameStartTime = Date.now();
        renderPuzzle();
    };

    const renderPuzzle = () => {
        const puzzle = items[idx];
        if (!puzzle) {
            finish();
            return;
        }

        stopTimer();
        container.classList.remove('correct-state');
        buildArea.classList.remove('wrong-state');
        buildArea.innerHTML = '<span class="placeholder">Drop letters here to build your world . . .</span>';
        wordPreview.textContent = '';
        
        progressEl.textContent = `${idx + 1}/${items.length}`;
        scoreContainer.classList.remove('hidden');

        if (settings.gameMode === 'attempts_based') {
            currentAttempts = settings.maxAttempts || 3;
            attemptsEl.textContent = currentAttempts;
            attemptsContainer.classList.remove('hidden');
            timerContainer.classList.add('hidden');
        } else {
            attemptsContainer.classList.add('hidden');
            timerContainer.classList.remove('hidden');
            startTimer(settings.timePerWord || 30);
        }

        if (puzzle.hint && settings.showHints !== false) {
            hintText.textContent = puzzle.hint;
            hintBox.style.display = 'block';
        } else {
            hintBox.style.display = 'none';
        }

        letterBank.innerHTML = '';
        let lettersToUse = (puzzle.word || '').split('');
        if (puzzle.extraLetters) {
            lettersToUse = lettersToUse.concat((puzzle.extraLetters || '').split(''));
        }
        
        shuffle(lettersToUse).forEach(letter => {
            if (letter.trim() !== '') createLetterButton(letter, letterBank);
        });

        checkBtn.classList.remove('hidden');
        clearBtn.classList.remove('hidden');
        goNextBtn.classList.add('hidden');
        puzzleStartTime = Date.now();
    };

    function createLetterButton(letter, parent) {
        const btn = document.createElement('button');
        btn.className = 'letter-btn';
        btn.textContent = letter.toUpperCase();
        btn.draggable = true;

        btn.addEventListener('click', () => handleLetterClick(btn));
        btn.addEventListener('dragstart', handleDragStart);
        btn.addEventListener('dragend', handleDragEnd);
        btn.addEventListener('dragover', handleDragOver);
        btn.addEventListener('drop', handleDropOnLetter);
        
        parent.appendChild(btn);
    }
    
    function startTimer(duration) {
        let timeLeft = duration;
        timerEl.textContent = `${timeLeft}s`;
        timerInterval = setInterval(() => {
            timeLeft--;
            timerEl.textContent = `${timeLeft}s`;
            if (timeLeft <= 0) {
                stopTimer();
                handleTimeoutOrNoTries();
            }
        }, 1000);
    }

    const stopTimer = () => {
        if(timerInterval) clearInterval(timerInterval);
        timerInterval = null;
    };

    function updateWordPreview() {
        const letters = Array.from(buildArea.querySelectorAll('.letter-btn')).map(btn => btn.textContent);
        const builtWord = (isRtl ? letters.reverse() : letters).join('');
        wordPreview.textContent = builtWord;
    }

    function getBuiltWord() {
        const letters = Array.from(buildArea.querySelectorAll('.letter-btn')).map(btn => btn.textContent);
        return (isRtl ? letters.reverse() : letters).join('');
    }

    function getTotalPossibleScore() {
        return items.reduce((sum, item) => sum + Number(item.points || 10), 0);
    }

    function recordAnswer({ correct, selectedWord, timedOut = false, scoreDelta = 0 }) {
        const puzzle = items[idx] || {};
        const deltaMs = puzzleStartTime ? Math.max(0, Date.now() - puzzleStartTime) : 0;
        
        const interactionObject = {
            itemId: puzzle.itemId || `item_${idx}`,
            itemIndex: idx,
            type: 'word-builder',
            isCorrect: !!correct,
            userAnswer: selectedWord || '',
            correctAnswer: puzzle.word || '',
            score: Number(scoreDelta || 0),
            maxScore: Number(puzzle.points || 10),
            timeMs: deltaMs,
            attempts: 1, // You might increment this if multiple attempts happen per item
            skipped: !!timedOut,
            meta: {
                selectedWord: selectedWord || ''
            }
        };

        WajibetSDK.recordInteraction(interactionObject);
        answers.push(interactionObject);
    }
    
    function handleLetterClick(btn) {
        if (btn.parentElement === letterBank) moveLetter(btn, 'to_build');
        else moveLetter(btn, 'to_bank');
    }

    function moveLetter(btn, destination) {
        const target = destination === 'to_build' ? buildArea : letterBank;
        if (buildArea.querySelector('.placeholder')) buildArea.innerHTML = '';
        if (destination === 'to_build' && isRtl) {
            target.insertBefore(btn, target.firstChild);
        } else {
            target.appendChild(btn);
        }
        if (buildArea.children.length === 0) buildArea.innerHTML = '<span class="placeholder">Drop letters here to build your world . . .</span>';
        updateWordPreview();
    }

    function handleDragStart() { draggedElement = this; this.classList.add('dragging'); }
    function handleDragEnd() { if(draggedElement) draggedElement.classList.remove('dragging'); draggedElement = null; }
    function handleDragOver(e) { e.preventDefault(); }
    function handleDropOnBuildArea(e) { e.preventDefault(); if (draggedElement) moveLetter(draggedElement, 'to_build'); }
    function handleDropOnLetter(e) {
        e.preventDefault(); e.stopPropagation();
        if (draggedElement && draggedElement !== this && this.parentElement === buildArea) {
            this.parentElement.insertBefore(draggedElement, this);
            updateWordPreview();
        }
    }

    function checkAnswer() {
        const puzzle = items[idx];
        const builtWord = getBuiltWord();
        const pointsEarned = Number(puzzle.points || 10);

        if (builtWord.toLowerCase() === (puzzle.word || '').toLowerCase()) {
            stopTimer();
            totalWordsAttempted++;
            score += pointsEarned;
            
            container.classList.add('correct-state');
            wordPreview.textContent = 'Correct!!!!';
            checkBtn.classList.add('hidden');
            clearBtn.classList.add('hidden');
            goNextBtn.classList.remove('hidden');

            recordAnswer({ correct: true, selectedWord: builtWord, scoreDelta: pointsEarned });
        } else {
            wordPreview.textContent = 'Wrong word';
            buildArea.classList.add('wrong-state');
            recordAnswer({ correct: false, selectedWord: builtWord, scoreDelta: 0 });

            if (settings.gameMode === 'attempts_based') {
                currentAttempts--;
                attemptsEl.textContent = currentAttempts;
                if (currentAttempts <= 0) {
                    stopTimer();
                    handleTimeoutOrNoTries(false);
                    return;
                }
            }

            setTimeout(() => {
                buildArea.classList.remove('wrong-state');
                clearBuildArea();
            }, 1200);
        }
    }
    
    function handleTimeoutOrNoTries(shouldRecord = true) {
        const builtWord = getBuiltWord();
        if (shouldRecord) {
            recordAnswer({ correct: false, selectedWord: builtWord, timedOut: true, scoreDelta: 0 });
        }
        buildArea.innerHTML = `<span class="feedback-text">Word was: ${items[idx].word.toUpperCase()}</span>`;
        letterBank.innerHTML = '';
        checkBtn.classList.add('hidden');
        clearBtn.classList.add('hidden');
        goNextBtn.classList.remove('hidden');
    }

    function clearBuildArea() {
        const lettersInBuildArea = Array.from(buildArea.children);
        lettersInBuildArea.forEach(btn => {
            if (btn.classList.contains('letter-btn')) moveLetter(btn, 'to_bank');
        });
        updateWordPreview();
    }

        checkBtn.classList.add('hidden');
        clearBtn.classList.add('hidden');
        goNextBtn.classList.remove('hidden');
    }

    function clearBuildArea() {
        const lettersInBuildArea = Array.from(buildArea.children);
        lettersInBuildArea.forEach(btn => {
            if (btn.classList.contains('letter-btn')) moveLetter(btn, 'to_bank');
        });
        updateWordPreview();
    }

    function goToNext() {
        idx++;
        renderPuzzle();
    }

    function finish() {
        stopTimer();
        const totalTime = gameStartTime ? Date.now() - gameStartTime : 0;
        const totalPossibleScore = getTotalPossibleScore();
        
        document.body.classList.add('game-ended');
        container.classList.add('correct-state'); 
        summaryText.textContent = `You scored ${score} out of ${totalPossibleScore}!`;
        showScreen('done');
        
        WajibetSDK.finishGame(score, totalTime);
    }

    const shuffle = (array) => array.sort(() => Math.random() - 0.5);

    function preloadAssets(assetList, onComplete) {
        if (!assetList || assetList.length === 0) { onComplete(); return; }
        let loaded = 0;
        assetList.forEach(url => {
            const img = new Image();
            img.src = url;
            img.onload = img.onerror = () => {
                loaded++;
                if(loaded === assetList.length) onComplete();
            }
        });
    }

    startBtn.onclick = start;
    clearBtn.onclick = clearBuildArea;
    checkBtn.onclick = checkAnswer;
    goNextBtn.onclick = goToNext;
    buildArea.addEventListener('dragover', handleDragOver);
    buildArea.addEventListener('drop', handleDropOnBuildArea);

    WajibetSDK.init((payload) => {
        // Platform sends: { type: 'INIT_GAME', payload: { settings, content, liveInfo, userId, sessionId } }
        const data = window.WajibetGameCreation || payload.gameCreation || payload;
        
        creation = data;
        settings = data.settings || data.config || {};
        
        // Use WajibetSDK's direction if provided, otherwise fallback to settings
        const dir = payload.direction || settings.textDirection || 'ltr';
        applyTextDirection(dir);
        
        items = Array.isArray(data.content) ? data.content.map((item, i) => ({
            itemId: item.itemId || `q_${i}`,
            word: item.word || '',
            hint: item.hint || '',
            extraLetters: item.extraLetters || '',
            points: item.points || 10
        })) : [];

        if (items.length > 0) {
            // Replaced asset preloading as requested in Commit B for CSS visual extraction later
            loader.classList.add('hidden');
            readyContent.forEach(el => el.classList.remove('hidden'));
            
            if (payload.resumeState) {
                idx = payload.resumeState.currentItemIndex || 0;
                score = payload.resumeState.currentScore || 0;
                if (idx >= items.length) { finish(); }
                else { start(); } // You might want to jump directly to renderPuzzle, but start() works for word-builder's current structure
            } else {
                showScreen('ready');
            }
        } else {
            document.body.innerHTML = '<h1>Error: No game content found.</h1>';
        }
    });
})();
