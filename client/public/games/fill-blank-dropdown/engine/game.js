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
                if (!item.passage || !item.passage.passageTemplate) return;

                var passageTemplate = item.passage.passageTemplate;
                var blanks = item.passage.blanks || [];

                // Filter out if no blanks to avoid 0 score questions, unless intended
                if (blanks.length === 0) return;

                questions.push({
                    id: item.itemId,
                    index: index,
                    passageTemplate: passageTemplate,
                    blanks: blanks,
                    pointsPerBlank: pointsPerBlank,
                    shuffleOptions: shuffleOptions,
                    maxScore: blanks.length * pointsPerBlank
                });
            });
            return questions;
        },

        render: function (q, ctx) {
            var container = document.createElement('div');
            container.className = 'passage-container text-lg leading-loose text-gray-800';

            var parts = q.passageTemplate.split(/(\[\[.*?\]\])/g);
            var selects = [];

            parts.forEach(function (part) {
                var match = part.match(/\[\[(.*?)\]\]/);
                if (match) {
                    var id = match[1];
                    var blankDef = q.blanks.find(function (b) { return b.id === id; });
                    
                    if (blankDef) {
                        var select = document.createElement('select');
                        select.className = 'blank-select mx-1 px-2 py-1 bg-white border border-gray-300 rounded text-base cursor-pointer focus:outline-none focus:border-indigo-500 transition-colors shadow-sm';
                        select.dataset.blankId = id;

                        var defaultOpt = document.createElement('option');
                        defaultOpt.value = '';
                        defaultOpt.textContent = '— choose —';
                        defaultOpt.disabled = true;
                        defaultOpt.selected = true;
                        select.appendChild(defaultOpt);

                        var optionsToRender = blankDef.options.map(function(opt, idx) {
                            return { text: opt, isCorrect: idx === blankDef.correctIndex };
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
                    } else {
                        // Orphaned token, render as text
                        var text = document.createTextNode(part);
                        container.appendChild(text);
                    }
                } else {
                    var text2 = document.createTextNode(part);
                    container.appendChild(text2);
                }
            });

            ctx.prompt.appendChild(container);

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
            var isCorrect = true; // Overall correct if all blanks are correct

            var selects = q._selects || [];

            selects.forEach(function (select) {
                var blankId = select.dataset.blankId;
                var blankDef = q.blanks.find(function (b) { return b.id === blankId; });
                
                var studentAnswer = select.value;
                var correctAnswer = blankDef ? blankDef.options[blankDef.correctIndex] : null;
                
                var correct = false;
                if (!timedOut && studentAnswer !== '' && studentAnswer === correctAnswer) {
                    correct = true;
                    score += q.pointsPerBlank;
                } else {
                    isCorrect = false;
                }

                blanksResult.push({
                    id: blankId,
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
                meta: JSON.stringify({ blanks: blanksResult, passageTemplate: q.passageTemplate })
            };
        },

        reveal: function (q, result) {
            var selects = q._selects || [];
            
            var meta = {};
            try { meta = JSON.parse(result.meta); } catch(e) {}
            var blanksResult = meta.blanks || [];

            selects.forEach(function (select) {
                select.disabled = true;
                var blankId = select.dataset.blankId;
                var bResult = blanksResult.find(function(b) { return b.id === blankId; });

                if (bResult) {
                    if (bResult.isCorrect) {
                        select.classList.add('bg-green-100', 'border-green-500', 'text-green-800', 'font-medium');
                    } else {
                        select.classList.add('bg-red-50', 'border-red-400', 'text-red-700', 'line-through');
                        
                        var correction = document.createElement('span');
                        correction.className = 'ml-1 px-2 py-1 bg-green-100 text-green-800 border border-green-500 rounded text-sm font-medium inline-block align-middle shadow-sm';
                        correction.textContent = bResult.correctAnswer;
                        select.parentNode.insertBefore(correction, select.nextSibling);
                    }
                }
            });
        }
    });
})();
