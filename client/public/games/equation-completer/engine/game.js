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

            q.segments.forEach(function (seg, segIndex) {
                if (seg.type === 'text') {
                    var span = document.createElement('span');
                    span.className = 'eq-text';
                    span.textContent = seg.value;
                    container.appendChild(span);
                } else if (seg.type === 'blank') {
                    var input = document.createElement('input');
                    input.type = 'text';
                    input.inputMode = 'decimal';
                    input.className = 'eq-input';
                    input.placeholder = '?';
                    input.dataset.segIndex = segIndex;
                    input.dataset.blankId  = seg.id;
                    input.autocomplete = 'off';
                    input.spellcheck = false;

                    input.addEventListener('input', function () { checkComplete(); });
                    input.addEventListener('keydown', function (e) {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            var next = inputs[inputs.indexOf(input) + 1];
                            if (next) { next.focus(); }
                        }
                    });

                    inputs.push(input);
                    container.appendChild(input);
                }
            });

            wrapper.appendChild(container);

            var qa = document.getElementById('questionArea');
            if (qa) { qa.innerHTML = ''; qa.appendChild(wrapper); }

            if (inputs[0]) { setTimeout(function () { inputs[0].focus(); }, 50); }

            function checkComplete() {
                var allFilled = inputs.every(function (inp) { return inp.value.trim() !== ''; });
                ctx.setCanConfirm(allFilled);
            }

            q._inputs = inputs;
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
        }
    });
})();