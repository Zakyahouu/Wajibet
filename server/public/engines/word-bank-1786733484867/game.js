/* global WG */
(function () {
    function parseWordBankPassage(str) {
        if (!str || typeof str !== 'string') return [];
        var segments = [];
        var regex = /\[(.*?)\]/g;
        var lastIndex = 0;
        var match;
        var segId = 0;

        while ((match = regex.exec(str)) !== null) {
            if (match.index > lastIndex) {
                segments.push({
                    id: 't_' + (segId++),
                    type: 'text',
                    value: str.substring(lastIndex, match.index)
                });
            }
            segments.push({
                id: 'b_' + (segId++),
                type: 'blank',
                options: [match[1].trim()],
                correctIndex: 0
            });
            lastIndex = regex.lastIndex;
        }

        if (lastIndex < str.length) {
            segments.push({
                id: 't_' + (segId++),
                type: 'text',
                value: str.substring(lastIndex)
            });
        }

        return segments;
    }

    WG.run({
        type: 'fill-blank-dropdown',
        title: 'Word Bank',

        buildQuestions: function (settings, content) {
            var questions = [];
            var pointsPerBlank = parseInt(settings.pointsPerBlank, 10) || 10;
            var shuffleOptions = settings.shuffleOptions !== false;

            content.forEach(function (item, index) {
                var segments = [];
                var extraDistractors = [];

                // Support new structured wordBankPassage format
                if (item.passage && typeof item.passage === 'object' && item.passage.passageText) {
                    segments = parseWordBankPassage(item.passage.passageText);
                    extraDistractors = Array.isArray(item.passage.extraDistractors) ? item.passage.extraDistractors : [];
                } else if (typeof item.passage === 'string') {
                    segments = parseWordBankPassage(item.passage);
                    extraDistractors = Array.isArray(item.extraDistractors) ? item.extraDistractors : [];
                } else if (item.passageText) {
                    segments = parseWordBankPassage(item.passageText);
                    extraDistractors = Array.isArray(item.extraDistractors) ? item.extraDistractors : [];
                } else if (item.passage && item.passage.segments) {
                    // Backwards compatibility with legacy passage segments
                    segments = item.passage.segments;
                    extraDistractors = Array.isArray(item.extraDistractors) ? item.extraDistractors : [];
                }

                var blankCount = segments.filter(function (s) { return s.type === 'blank'; }).length;
                if (blankCount === 0) return;

                questions.push({
                    itemId:           item.itemId || ('item_' + index),
                    index:            index,
                    segments:         segments,
                    extraDistractors: extraDistractors,
                    pointsPerBlank:   pointsPerBlank,
                    shuffleOptions:   shuffleOptions,
                    maxScore:         blankCount * pointsPerBlank
                });
            });
            return questions;
        },

        render: function (q, ctx) {
            var container = document.createElement('div');
            container.className = 'passage-container reading-document';

            var bankContainer = document.createElement('div');
            bankContainer.className = 'word-bank';

            q._revealed = false;
            var placements = {}; // maps blankId -> bankEntryId
            var bankEntries = [];
            var blankSlots = [];

            // 1. Build the bank entries from blanks
            q.segments.forEach(function (seg, segIndex) {
                if (seg.type === 'blank') {
                    bankEntries.push({
                        id: 'bank_' + segIndex,
                        text: seg.options[seg.correctIndex],
                        sourceBlankId: seg.id
                    });
                }
            });

            // 2. Append extra distractors to the word bank pool
            if (Array.isArray(q.extraDistractors)) {
                q.extraDistractors.forEach(function (extraWord, extraIdx) {
                    var trimmed = String(extraWord || '').trim();
                    if (trimmed) {
                        bankEntries.push({
                            id: 'extra_' + extraIdx,
                            text: trimmed,
                            sourceBlankId: null
                        });
                    }
                });
            }

            if (q.shuffleOptions) {
                for (var i = bankEntries.length - 1; i > 0; i--) {
                    var j = Math.floor(Math.random() * (i + 1));
                    var temp = bankEntries[i];
                    bankEntries[i] = bankEntries[j];
                    bankEntries[j] = temp;
                }
            }

            // 3. Render bank chips
            var selectedBankId = null;
            var bankChips = {};

            bankEntries.forEach(function (entry) {
                var chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'bank-chip';
                chip.dataset.bankId = entry.id;
                chip.textContent = entry.text;

                chip.addEventListener('click', function () {
                    if (q._revealed) return;
                    if (chip.classList.contains('used')) return;

                    if (selectedBankId === entry.id) {
                        chip.classList.remove('selected');
                        selectedBankId = null;
                    } else {
                        if (selectedBankId) {
                            var prev = bankChips[selectedBankId];
                            if (prev) prev.classList.remove('selected');
                        }
                        chip.classList.add('selected');
                        selectedBankId = entry.id;
                    }
                });

                bankChips[entry.id] = chip;
                bankContainer.appendChild(chip);
            });

            // 4. Render passage and blank slots
            q.segments.forEach(function (seg, segIndex) {
                if (seg.type === 'text') {
                    var spanText = document.createElement('span');
                    spanText.style.whiteSpace = 'pre-wrap';
                    spanText.textContent = seg.value;
                    container.appendChild(spanText);
                } else if (seg.type === 'blank') {
                    var slot = document.createElement('span');
                    slot.className = 'blank-slot';
                    slot.dataset.segIndex = segIndex;
                    slot.dataset.blankId = seg.id;
                    slot.textContent = '________';
                    slot.tabIndex = 0;
                    slot.setAttribute('role', 'button');
                    slot.setAttribute('aria-label', (ctx && ctx.t) ? ctx.t('blankEmpty') : 'blank, empty');

                    function handleSlotInteraction() {
                        if (q._revealed) return;

                        // If already filled, return to bank
                        if (placements[seg.id]) {
                            var currentEntryId = placements[seg.id];
                            var currentChip = bankChips[currentEntryId];
                            if (currentChip) currentChip.classList.remove('used');
                            delete placements[seg.id];
                            slot.textContent = '________';
                            slot.classList.remove('filled');
                            slot.setAttribute('aria-label', (ctx && ctx.t) ? ctx.t('blankEmpty') : 'blank, empty');
                        }

                        // If a bank chip is selected, place it
                        if (selectedBankId) {
                            placements[seg.id] = selectedBankId;
                            var newChip = bankChips[selectedBankId];
                            newChip.classList.add('used');
                            newChip.classList.remove('selected');

                            var entry = bankEntries.find(function (e) { return e.id === selectedBankId; });
                            slot.textContent = entry.text;
                            slot.classList.add('filled');
                            slot.setAttribute('aria-label', (ctx && ctx.t) ? ctx.t('blankFilled', { text: entry.text }) : ('blank, filled with ' + entry.text));

                            selectedBankId = null;
                        }
                        checkComplete();
                    }

                    slot.addEventListener('click', handleSlotInteraction);
                    slot.addEventListener('keydown', function (e) {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSlotInteraction();
                        }
                    });

                    blankSlots.push(slot);
                    container.appendChild(slot);
                }
            });

            var qa = document.getElementById('questionArea');
            if (qa) {
                qa.innerHTML = '';
                qa.appendChild(bankContainer);
                qa.appendChild(container);
            }

            function checkComplete() {
                var allAnswered = blankSlots.every(function (slot) {
                    return !!placements[slot.dataset.blankId];
                });
                ctx.setCanConfirm(allAnswered);
            }

            q._placements = placements;
            q._bankEntries = bankEntries;
            q._blankSlots = blankSlots;
            q._bankChips = bankChips;
        },

        evaluate: function (q, timedOut) {
            var score = 0;
            var blanksResult = [];
            var isCorrect = true;

            q.segments.forEach(function (seg, segIndex) {
                if (seg.type === 'blank') {
                    var bankId = q._placements[seg.id];
                    var studentAnswer = '';
                    if (bankId) {
                        var entry = q._bankEntries.find(function (e) { return e.id === bankId; });
                        if (entry) studentAnswer = entry.text;
                    }

                    var correctAnswer = seg.options[seg.correctIndex];
                    var correct = false;

                    if (!timedOut && studentAnswer !== '' && studentAnswer === correctAnswer) {
                        correct = true;
                        score += q.pointsPerBlank;
                    } else {
                        isCorrect = false;
                    }

                    blanksResult.push({
                        id: seg.id,
                        studentAnswer: studentAnswer,
                        correctAnswer: correctAnswer,
                        isCorrect: correct
                    });
                }
            });

            var userAnswerStr = blanksResult.map(function (b) { return b.studentAnswer || '(none)'; }).join(', ');
            var correctAnswerStr = blanksResult.map(function (b) { return b.correctAnswer || ''; }).join(', ');

            return {
                isCorrect: isCorrect,
                score: score,
                userAnswer: userAnswerStr,
                correctAnswer: correctAnswerStr,
                meta: JSON.stringify({ blanksResult: blanksResult, segments: q.segments })
            };
        },

        reveal: function (q, result) {
            var meta = {};
            try { meta = JSON.parse(result.meta); } catch (e) { }
            var blanksResult = meta.blanksResult || [];

            q._revealed = true;

            (q._blankSlots || []).forEach(function (slot) {
                var blankId = slot.dataset.blankId;
                var bResult = blanksResult.find(function (b) { return b.id === blankId; });

                if (bResult) {
                    if (bResult.isCorrect) {
                        slot.classList.add('bg-green-100');
                    } else {
                        slot.classList.add('bg-red-50');

                        var correction = document.createElement('span');
                        correction.className = 'correction-span';
                        correction.textContent = bResult.correctAnswer;
                        slot.parentNode.insertBefore(correction, slot.nextSibling);
                    }
                }
                slot.style.pointerEvents = 'none';
            });

            if (q._bankChips) {
                Object.keys(q._bankChips).forEach(function (id) {
                    q._bankChips[id].classList.add('used');
                    q._bankChips[id].style.pointerEvents = 'none';
                });
            }
        }
    });
})();
