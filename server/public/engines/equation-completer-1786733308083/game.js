/* global WG */
(function () {
    function parseEquationString(str) {
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
        type: 'equation-completer',
        title: 'Equation Completer',
        lede: 'Complete each equation by filling in the missing value.',

        buildQuestions: function (settings, content) {
            var questions = [];
            var pointsPerBlank = parseInt(settings.pointsPerBlank, 10) || 10;

            content.forEach(function (item, index) {
                var segments = [];
                var hint = null;

                // Support new structured equationBuilder object or string
                if (item.equation) {
                    var eqStr = typeof item.equation === 'string' ? item.equation : (item.equation.equation || '');
                    hint = (typeof item.equation === 'object' && item.equation.hint) || item.hint || null;
                    segments = parseEquationString(eqStr);
                } else if (item.passage && item.passage.segments) {
                    // Backwards compatibility with legacy passage segments
                    segments = item.passage.segments;
                    hint = item.hint || null;
                }

                var blankCount = segments.filter(function (s) { return s.type === 'blank'; }).length;
                if (blankCount === 0) return;

                questions.push({
                    itemId:         item.itemId || ('item_' + index),
                    index:          index,
                    segments:       segments,
                    hint:           hint,
                    pointsPerBlank: pointsPerBlank,
                    maxScore:       blankCount * pointsPerBlank
                });
            });
            return questions;
        },

        render: function (q, ctx) {
            var wrapper = document.createElement('div');
            wrapper.className = 'math-board-wrapper';

            if (q.hint) {
                var hintEl = document.createElement('div');
                hintEl.className = 'eq-hint-banner';
                hintEl.innerHTML = '<span class="eq-hint-icon">💡</span> <span class="eq-hint-text">' + q.hint + '</span>';
                wrapper.appendChild(hintEl);
            }

            var container = document.createElement('div');
            container.className = 'equation-row';
            var inputs = [];
            var activeInput = null;

            function setActiveInput(inp) {
                activeInput = inp;
                inputs.forEach(function (i) { i.classList.remove('active-input'); });
                if (activeInput) {
                    activeInput.classList.add('active-input');
                }
            }

            q.segments.forEach(function (seg, segIndex) {
                if (seg.type === 'text') {
                    var span = document.createElement('span');
                    span.className = 'eq-text';
                    span.textContent = seg.value;
                    container.appendChild(span);
                } else if (seg.type === 'blank') {
                    var input = document.createElement('input');
                    input.type = 'text';
                    input.inputMode = 'decimal'; // Triggers native phone/tablet numeric keypad
                    input.pattern = '[0-9.-/]*';
                    input.className = 'eq-input';
                    input.placeholder = '?';
                    input.dataset.segIndex = segIndex;
                    input.dataset.blankId  = seg.id;
                    input.autocomplete = 'off';
                    input.spellcheck = false;

                    input.addEventListener('focus', function () { setActiveInput(this); });
                    input.addEventListener('click', function () { setActiveInput(this); });
                    input.addEventListener('input', function () { checkComplete(); });
                    input.addEventListener('keydown', function (e) {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            var next = inputs[inputs.indexOf(input) + 1];
                            if (next) {
                                next.focus();
                                setActiveInput(next);
                            }
                        }
                    });

                    inputs.push(input);
                    container.appendChild(input);
                }
            });

            wrapper.appendChild(container);

            // Optional On-Screen Keypad Widget (can be toggled on/off)
            var keypadWrapper = document.createElement('div');
            keypadWrapper.className = 'student-keypad-wrapper';

            var toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'keypad-toggle-btn';
            toggleBtn.innerHTML = '<span class="keypad-toggle-icon">⌨️</span> <span class="keypad-toggle-text">On-Screen Keypad</span>';

            var keypad = document.createElement('div');
            keypad.className = 'student-keypad hidden';

            toggleBtn.addEventListener('click', function () {
                var isHidden = keypad.classList.toggle('hidden');
                toggleBtn.classList.toggle('active', !isHidden);
                toggleBtn.querySelector('.keypad-toggle-text').textContent = isHidden ? 'On-Screen Keypad' : 'Hide Keypad ✕';
            });

            var keyRows = [
                ['1', '2', '3', '4', '5'],
                ['6', '7', '8', '9', '0'],
                ['.', '-', '/', '⌫', 'AC']
            ];

            var keypadButtons = [];

            keyRows.forEach(function (row) {
                var rowDiv = document.createElement('div');
                rowDiv.className = 'student-keypad-row';

                row.forEach(function (keyVal) {
                    var btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'student-keypad-btn';
                    btn.textContent = keyVal;

                    if (keyVal === '⌫' || keyVal === 'AC') {
                        btn.classList.add('action-btn');
                    }

                    btn.addEventListener('click', function (e) {
                        e.preventDefault();
                        if (!activeInput && inputs[0]) {
                            setActiveInput(inputs[0]);
                        }
                        if (!activeInput) return;

                        if (keyVal === '⌫') {
                            activeInput.value = activeInput.value.slice(0, -1);
                        } else if (keyVal === 'AC') {
                            activeInput.value = '';
                        } else {
                            activeInput.value += keyVal;
                        }

                        checkComplete();
                        activeInput.focus();
                    });

                    keypadButtons.push(btn);
                    rowDiv.appendChild(btn);
                });

                keypad.appendChild(rowDiv);
            });

            keypadWrapper.appendChild(toggleBtn);
            keypadWrapper.appendChild(keypad);
            wrapper.appendChild(keypadWrapper);

            var qa = document.getElementById('questionArea');
            if (qa) { qa.innerHTML = ''; qa.appendChild(wrapper); }

            if (inputs[0]) {
                setTimeout(function () {
                    inputs[0].focus();
                    setActiveInput(inputs[0]);
                }, 50);
            }

            function checkComplete() {
                var allFilled = inputs.every(function (inp) { return inp.value.trim() !== ''; });
                ctx.setCanConfirm(allFilled);
            }

            q._inputs = inputs;
            q._keypadWrapper = keypadWrapper;
            q._keypadButtons = keypadButtons;
        },

        evaluate: function (q, timedOut) {
            var score       = 0;
            var isCorrect   = true;
            var blanksResult = [];
            var inputs      = q._inputs || [];

            inputs.forEach(function (input) {
                var segIndex   = parseInt(input.dataset.segIndex, 10);
                var seg        = q.segments[segIndex];
                var studentRaw = input.value.trim();
                var correctRaw = seg ? String(seg.options[seg.correctIndex] || '').trim() : '';

                // Numeric-aware: "2.0" === "2" is correct
                var numS   = parseFloat(studentRaw);
                var numC   = parseFloat(correctRaw);
                var numMatch = !isNaN(numS) && !isNaN(numC) && numS === numC;
                var strMatch = studentRaw.toLowerCase() === correctRaw.toLowerCase();
                var correct  = !timedOut && studentRaw !== '' && (numMatch || strMatch);

                if (correct) { score += q.pointsPerBlank; } else { isCorrect = false; }

                blanksResult.push({
                    id:            seg ? seg.id : '',
                    studentAnswer: studentRaw,
                    correctAnswer: correctRaw,
                    isCorrect:     correct
                });
            });

            return {
                isCorrect:     isCorrect,
                score:         score,
                userAnswer:    blanksResult.map(function (b) { return b.studentAnswer || '(blank)'; }).join(', '),
                correctAnswer: blanksResult.map(function (b) { return b.correctAnswer; }).join(', '),
                meta: { blanksResult: blanksResult, segments: q.segments }
            };
        },

        reveal: function (q, result) {
            var inputs       = q._inputs || [];
            var blanksResult = (result.meta && result.meta.blanksResult) || [];

            inputs.forEach(function (input) {
                input.disabled = true;
                input.classList.remove('active-input');
                var blankId = input.dataset.blankId;
                var bResult = blanksResult.find(function (b) { return b.id === blankId; });
                if (!bResult) return;
                if (bResult.isCorrect) {
                    input.classList.add('eq-correct');
                } else {
                    input.classList.add('eq-wrong');
                    var correction = document.createElement('span');
                    correction.className = 'eq-correction';
                    correction.textContent = bResult.correctAnswer;
                    input.parentNode.insertBefore(correction, input.nextSibling);
                }
            });

            if (q._keypadWrapper) {
                q._keypadWrapper.style.opacity = '0.5';
                q._keypadWrapper.style.pointerEvents = 'none';
            }
        }
    });
})();