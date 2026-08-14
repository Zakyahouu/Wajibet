/* global WG */
(function () {
    WG.run({
        type: 'fill-blank-dropdown',
        title: 'Fill-in-the-Blanks',

        buildQuestions: function (settings, content) {
            var questions = [];
            var pointsPerBlank = parseInt(settings.pointsPerBlank, 10) || 10;
            var shuffleOptions = settings.shuffleOptions !== false;

            content.forEach(function (item, index) {
                if (!item.passage || !item.passage.segments) return;

                var segments = item.passage.segments;
                var blankCount = segments.filter(function (s) { return s.type === 'blank'; }).length;

                // Filter out if no blanks to avoid 0 score questions, unless intended
                if (blankCount === 0) return;

                questions.push({
                    itemId: item.itemId || ('item_' + index),
                    index: index,
                    segments: segments,
                    pointsPerBlank: pointsPerBlank,
                    shuffleOptions: shuffleOptions,
                    maxScore: blankCount * pointsPerBlank
                });
            });
            return questions;
        },

        render: function (q, ctx) {
            var container = document.createElement('div');
            container.className = 'passage-container';

            var selects = [];

            q.segments.forEach(function (seg, segIndex) {
                if (seg.type === 'text') {
                    // Split on newlines to render <br> elements, or use white-space: pre-wrap in CSS
                    var span = document.createElement('span');
                    span.style.whiteSpace = 'pre-wrap';
                    span.textContent = seg.value;
                    container.appendChild(span);
                } else if (seg.type === 'blank') {
                    var select = document.createElement('select');
                    select.className = 'blank-select';
                    select.dataset.segIndex = segIndex;
                    select.dataset.blankId = seg.id;

                    var defaultOpt = document.createElement('option');
                    defaultOpt.value = '';
                    defaultOpt.textContent = (ctx && ctx.t) ? ctx.t('chooseBlankOption') : '— choose —';
                    defaultOpt.disabled = true;
                    defaultOpt.selected = true;
                    select.appendChild(defaultOpt);

                    var optionsToRender = seg.options.map(function(opt, idx) {
                        return { text: opt, isCorrect: idx === seg.correctIndex };
                    });

                    if (q.shuffleOptions) {
                        // Fisher-Yates shuffle
                        for (var i = optionsToRender.length - 1; i > 0; i--) {
                            var j = Math.floor(Math.random() * (i + 1));
                            var temp = optionsToRender[i];
                            optionsToRender[i] = optionsToRender[j];
                            optionsToRender[j] = temp;
                        }
                    }

                    optionsToRender.forEach(function (opt) {
                        var option = document.createElement('option');
                        option.value = opt.text;
                        option.textContent = opt.text;
                        select.appendChild(option);
                    });

                    select.addEventListener('change', function () {
                        checkComplete();
                    });

                    selects.push(select);
                    container.appendChild(select);
                }
            });

            var qa = document.getElementById('questionArea');
            if (qa) {
                qa.innerHTML = '';
                qa.appendChild(container);
            }

            function checkComplete() {
                var allAnswered = selects.every(function (sel) { return sel.value !== ''; });
                ctx.setCanConfirm(allAnswered);
            }

            // Save selects for evaluation
            q._selects = selects;
        },

        evaluate: function (q, timedOut) {
            var score = 0;
            var blanksResult = [];
            var isCorrect = true;

            var selects = q._selects || [];

            selects.forEach(function (select) {
                var segIndex = parseInt(select.dataset.segIndex, 10);
                var seg = q.segments[segIndex];
                
                var studentAnswer = select.value;
                var correctAnswer = seg ? seg.options[seg.correctIndex] : null;
                
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
            });

            var userAnswerStr = blanksResult.map(function(b) { return b.studentAnswer || '(none)'; }).join(', ');
            var correctAnswerStr = blanksResult.map(function(b) { return b.correctAnswer || ''; }).join(', ');

            return {
                isCorrect: isCorrect,
                score: score,
                userAnswer: userAnswerStr,
                correctAnswer: correctAnswerStr,
                meta: JSON.stringify({ blanksResult: blanksResult, segments: q.segments })
            };
        },

        reveal: function (q, result) {
            var selects = q._selects || [];
            
            var meta = {};
            try { meta = JSON.parse(result.meta); } catch(e) {}
            var blanksResult = meta.blanksResult || [];

            selects.forEach(function (select) {
                select.disabled = true;
                var blankId = select.dataset.blankId;
                var bResult = blanksResult.find(function(b) { return b.id === blankId; });

                if (bResult) {
                    if (bResult.isCorrect) {
                        select.classList.add('bg-green-100');
                    } else {
                        select.classList.add('bg-red-50');
                        
                        var correction = document.createElement('span');
                        correction.className = 'correction-span';
                        correction.textContent = bResult.correctAnswer;
                        select.parentNode.insertBefore(correction, select.nextSibling);
                    }
                }
            });
        }
    });
})();
