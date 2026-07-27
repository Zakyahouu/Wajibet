/**
 * Wajibet Word Builder — V2 engine.
 *
 * SDK handshake (init → getGameCreation → resumeState)
 * Full Tier 0 telemetry via recordInteraction (once per item)
 * finishGame (SDK bundles the answers)
 * RTL via getDirection + existing letter-ordering logic
 * Resume support (currentItemIndex, currentScore, elapsedMs)
 */
(function () {
    'use strict';

    var settings = {};
    var items = [];
    var idx = 0;
    var score = 0;
    var currentAttempts = 0;
    var itemAttemptCount = 0; // tracks attempts for the current item (for Tier 0)
    var timerInterval = null;
    var gameStartTime = null;
    var puzzleStartTime = null;
    var resumeElapsedMs = 0; // added to final totalTimeMs on resume

    var byId = function (id) { return document.getElementById(id); };

    // --- Element References ---
    var container = byId('container');
    var screens = { ready: byId('ready-screen'), play: byId('play-screen'), done: byId('done-screen') };
    var loader = byId('loader');
    var readyContent = [byId('start-btn'), document.querySelector('.logo'), document.querySelector('.title')];
    var startBtn = byId('start-btn');
    var timerContainer = byId('timer-container');
    var scoreContainer = byId('score-container');
    var timerEl = byId('timer');
    var progressEl = byId('progress');
    var attemptsContainer = byId('attempts-container');
    var attemptsEl = byId('attempts');
    var hintBox = byId('hint-box');
    var hintText = byId('hint-text');
    var wordPreview = byId('word-preview');
    var buildArea = byId('build-area');
    var letterBank = byId('letter-bank');
    var clearBtn = byId('clear-btn');
    var checkBtn = byId('check-btn');
    var goNextBtn = byId('go-next-btn');
    var summaryText = byId('summary-text');

    var draggedElement = null;
    var isRtl = false;

    function showScreen(id) {
        Object.values(screens).forEach(function (s) { s.classList.add('hidden'); });
        screens[id].classList.remove('hidden');
    }

    function applyTextDirection(dir) {
        var normalized = dir === 'rtl' ? 'rtl' : 'ltr';
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

    // Fisher-Yates shuffle (returns a copy)
    function shuffle(arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
        }
        return a;
    }

    function start(resumeState) {
        document.body.classList.remove('game-ended');
        showScreen('play');

        if (resumeState) {
            idx = resumeState.currentItemIndex || 0;
            score = resumeState.currentScore || 0;
            resumeElapsedMs = resumeState.elapsedMs || 0;
        } else {
            idx = 0;
            score = 0;
            resumeElapsedMs = 0;
        }

        gameStartTime = Date.now();
        renderPuzzle();
    }

    function renderPuzzle() {
        var puzzle = items[idx];
        if (!puzzle) { finish(); return; }

        stopTimer();
        itemAttemptCount = 0; // reset per-item attempt counter
        container.classList.remove('correct-state');
        buildArea.classList.remove('wrong-state');
        buildArea.innerHTML = '<span class="placeholder">Drop letters here to build your world . . .</span>';
        wordPreview.textContent = '';

        progressEl.textContent = (idx + 1) + '/' + items.length;
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
        var lettersToUse = (puzzle.word || '').split('');
        if (puzzle.extraLetters) {
            lettersToUse = lettersToUse.concat((puzzle.extraLetters || '').split(''));
        }

        shuffle(lettersToUse).forEach(function (letter) {
            if (letter.trim() !== '') createLetterButton(letter, letterBank);
        });

        checkBtn.classList.remove('hidden');
        clearBtn.classList.remove('hidden');
        goNextBtn.classList.add('hidden');
        puzzleStartTime = Date.now();
    }

    function createLetterButton(letter, parent) {
        var btn = document.createElement('button');
        btn.className = 'letter-btn';
        btn.textContent = letter.toUpperCase();
        btn.draggable = true;

        btn.addEventListener('click', function () { handleLetterClick(btn); });
        btn.addEventListener('dragstart', handleDragStart);
        btn.addEventListener('dragend', handleDragEnd);
        btn.addEventListener('dragover', handleDragOver);
        btn.addEventListener('drop', handleDropOnLetter);

        parent.appendChild(btn);
    }

    function startTimer(duration) {
        var timeLeft = duration;
        timerEl.textContent = timeLeft + 's';
        timerInterval = setInterval(function () {
            timeLeft--;
            timerEl.textContent = timeLeft + 's';
            if (timeLeft <= 0) {
                stopTimer();
                handleTimeoutOrNoTries();
            }
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = null;
    }

    function updateWordPreview() {
        var letters = Array.from(buildArea.querySelectorAll('.letter-btn')).map(function (btn) { return btn.textContent; });
        var builtWord = (isRtl ? letters.reverse() : letters).join('');
        wordPreview.textContent = builtWord;
    }

    function getBuiltWord() {
        var letters = Array.from(buildArea.querySelectorAll('.letter-btn')).map(function (btn) { return btn.textContent; });
        return (isRtl ? letters.reverse() : letters).join('');
    }

    function getTotalPossibleScore() {
        return items.reduce(function (sum, item) { return sum + Number(item.points || 10); }, 0);
    }

    // Emit Tier 0 interaction — called ONCE per item when it resolves
    function emitInteraction(correct, builtWord, timedOut) {
        var puzzle = items[idx] || {};
        var deltaMs = puzzleStartTime ? Math.max(0, Date.now() - puzzleStartTime) : 0;
        var pointsEarned = correct ? Number(puzzle.points || 10) : 0;

        WajibetSDK.recordInteraction({
            itemId:        puzzle.itemId || ('item_' + idx),
            itemIndex:     idx,
            type:          'word-builder',
            isCorrect:     correct,
            userAnswer:    String(builtWord || ''),
            correctAnswer: String(puzzle.word || '').toUpperCase(),
            score:         pointsEarned,
            maxScore:      Number(puzzle.points || 10),
            timeMs:        deltaMs,
            attempts:      itemAttemptCount,
            skipped:       !!timedOut,
            meta: {
                targetWord: puzzle.word || '',
                builtWord: builtWord || '',
                timedOut: !!timedOut
            }
        });
    }

    function handleLetterClick(btn) {
        if (btn.parentElement === letterBank) moveLetter(btn, 'to_build');
        else moveLetter(btn, 'to_bank');
    }

    function moveLetter(btn, destination) {
        var target = destination === 'to_build' ? buildArea : letterBank;
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
    function handleDragEnd() { if (draggedElement) draggedElement.classList.remove('dragging'); draggedElement = null; }
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
        var puzzle = items[idx];
        var builtWord = getBuiltWord();
        var pointsEarned = Number(puzzle.points || 10);
        itemAttemptCount++;

        if (builtWord.toLowerCase() === (puzzle.word || '').toLowerCase()) {
            // CORRECT
            stopTimer();
            score += pointsEarned;

            container.classList.add('correct-state');
            wordPreview.textContent = 'Correct!!!!';
            checkBtn.classList.add('hidden');
            clearBtn.classList.add('hidden');
            goNextBtn.classList.remove('hidden');
            goNextBtn.textContent = (idx + 1 >= items.length) ? 'Finish' : 'Go next';

            // Emit ONCE on correct resolution
            emitInteraction(true, builtWord, false);
        } else {
            // WRONG
            wordPreview.textContent = 'Wrong word';
            buildArea.classList.add('wrong-state');

            if (settings.gameMode === 'attempts_based') {
                currentAttempts--;
                attemptsEl.textContent = currentAttempts;
                if (currentAttempts <= 0) {
                    stopTimer();
                    // Emit ONCE on out-of-attempts resolution
                    emitInteraction(false, builtWord, false);
                    handleTimeoutOrNoTries(false);
                    return;
                }
            }

            setTimeout(function () {
                buildArea.classList.remove('wrong-state');
                clearBuildArea();
            }, 1200);
        }
    }

    function handleTimeoutOrNoTries(shouldEmit) {
        var builtWord = getBuiltWord();
        if (shouldEmit !== false) {
            // Emit ONCE on timeout resolution
            itemAttemptCount++;
            emitInteraction(false, builtWord, true);
        }
        buildArea.innerHTML = '<span class="feedback-text">Word was: ' + items[idx].word.toUpperCase() + '</span>';
        letterBank.innerHTML = '';
        checkBtn.classList.add('hidden');
        clearBtn.classList.add('hidden');
        goNextBtn.classList.remove('hidden');
        goNextBtn.textContent = (idx + 1 >= items.length) ? 'Finish' : 'Go next';
    }

    function clearBuildArea() {
        var lettersInBuildArea = Array.from(buildArea.children);
        lettersInBuildArea.forEach(function (btn) {
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
        var totalTime = gameStartTime ? (Date.now() - gameStartTime) : 0;
        totalTime += resumeElapsedMs;
        var totalPossibleScore = getTotalPossibleScore();

        document.body.classList.add('game-ended');
        container.classList.add('correct-state');
        summaryText.textContent = 'You scored ' + score + ' out of ' + totalPossibleScore + '!';
        showScreen('done');

        WajibetSDK.finishGame(score, totalTime);
    }

    function preloadAssets(assetList, onComplete) {
        if (!assetList || assetList.length === 0) { onComplete(); return; }
        var loaded = 0;
        assetList.forEach(function (url) {
            var img = new Image();
            img.src = url;
            img.onload = img.onerror = function () {
                loaded++;
                if (loaded === assetList.length) onComplete();
            };
        });
    }

    // --- Event wiring ---
    clearBtn.onclick = clearBuildArea;
    checkBtn.onclick = checkAnswer;
    goNextBtn.onclick = goToNext;
    buildArea.addEventListener('dragover', handleDragOver);
    buildArea.addEventListener('drop', handleDropOnBuildArea);

    // --- SDK Boot ---
    window.onload = function () {
        if (typeof WajibetSDK === 'undefined') {
            loader.textContent = 'SDK not loaded.';
            return;
        }

        WajibetSDK.init(function (resumeState) {
            applyTextDirection(WajibetSDK.getDirection());
            document.documentElement.dir = WajibetSDK.getDirection();

            var creation = WajibetSDK.getGameCreation() || {};
            settings = creation.config || {};
            items = Array.isArray(creation.content) ? creation.content.map(function (item) {
                return {
                    itemId: item.itemId || null,
                    word: item.word || '',
                    hint: item.hint || '',
                    extraLetters: item.extraLetters || '',
                    points: item.points || 10
                };
            }) : [];

            if (items.length === 0) {
                document.body.innerHTML = '<h1>Error: No game content found.</h1>';
                return;
            }

            var assetsToLoad = ['assets/image.png', 'assets/image_correct.png', 'assets/background_end.png'];
            preloadAssets(assetsToLoad, function () {
                loader.classList.add('hidden');
                readyContent.forEach(function (el) { el.classList.remove('hidden'); });

                if (resumeState) {
                    startBtn.textContent = 'Continue';
                }
                startBtn.onclick = function () { start(resumeState); };
            });
            showScreen('ready');
        });
    };
})();
