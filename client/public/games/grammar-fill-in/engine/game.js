/* global WG */
(function () {
    function parseGrammarSentence(sentence, options, correctIndex, blanks) {
        if (!sentence || typeof sentence !== 'string') return [];
        var segments = [];
        var blankPlaceholderRegex = /\[(.*?)\]|____+|___/g;
        var lastIndex = 0;
        var match;
        var blankIdx = 0;

        while ((match = blankPlaceholderRegex.exec(sentence)) !== null) {
            if (match.index > lastIndex) {
                segments.push({
                    id: 't_' + segments.length,
                    type: 'text',
                    value: sentence.substring(lastIndex, match.index)
                });
            }

            var bData = (Array.isArray(blanks) && blanks[blankIdx]) ? blanks[blankIdx] : null;
            var bOptions = (bData && Array.isArray(bData.options) && bData.options.length > 0)
                ? bData.options
                : (Array.isArray(options) ? options : ['', '']);
            var bCorrect = (bData && Number.isInteger(bData.correctIndex))
                ? bData.correctIndex
                : (Number.isInteger(correctIndex) ? correctIndex : 0);

            // If bracketed word like [since], and no options specified, use that as the correct option
            if (match[1] && (!bOptions || bOptions.length === 0 || bOptions.every(function (o) { return !o; }))) {
                bOptions = [match[1].trim()];
                bCorrect = 0;
            }

            segments.push({
                id: 'b_' + blankIdx,
                type: 'blank',
                options: bOptions,
                correctIndex: bCorrect
            });

            blankIdx++;
            lastIndex = blankPlaceholderRegex.lastIndex;
        }

        if (lastIndex < sentence.length) {
            segments.push({
                id: 't_' + segments.length,
                type: 'text',
                value: sentence.substring(lastIndex)
            });
        }

        // If no placeholders found in string, append one at the end
        if (blankIdx === 0) {
            segments.push({
                id: 't_0',
                type: 'text',
                value: sentence + ' '
            });
            segments.push({
                id: 'b_0',
                type: 'blank',
                options: Array.isArray(options) ? options : ['', ''],
                correctIndex: Number.isInteger(correctIndex) ? correctIndex : 0
            });
        }

        return segments;
    }

    WG.run({
        type: 'grammar-fill-in',
        title: 'Grammar Fill-In',

        buildQuestions: function (settings, content) {
            var questions = [];
            var pointsPerBlank = parseInt(settings.pointsPerBlank, 10) || 10;
            var shuffleOptions = settings.shuffleOptions !== false;

            content.forEach(function (item, index) {
                var segments = [];
                var category = null;
                var ruleLabel = null;
                var ruleTip = null;
                var explanation = null;

                // Support structured grammarExercise object or top-level fields
                var ex = (item.exercise && typeof item.exercise === 'object') ? item.exercise : item;

                if (ex && ex.sentence) {
                    category = ex.category || null;
                    ruleLabel = ex.ruleLabel || null;
                    ruleTip = ex.ruleTip || null;
                    explanation = ex.explanation || null;
                    segments = parseGrammarSentence(ex.sentence, ex.options, ex.correctIndex, ex.blanks);
                } else if (item.passage && item.passage.segments) {
                    // Backwards compatibility with legacy passage segments
                    segments = item.passage.segments;
                    category = item.category || null;
                    ruleLabel = item.ruleLabel || item.grammarRule || null;
                    ruleTip = item.ruleTip || null;
                    explanation = item.explanation || null;
                }

                var blankCount = segments.filter(function (s) { return s.type === 'blank'; }).length;
                if (blankCount === 0) return;

                questions.push({
                    itemId:         item.itemId || ('item_' + index),
                    index:          index,
                    segments:       segments,
                    category:       category,
                    ruleLabel:      ruleLabel,
                    ruleTip:        ruleTip,
                    explanation:    explanation,
                    pointsPerBlank: pointsPerBlank,
                    shuffleOptions: shuffleOptions,
                    maxScore:       blankCount * pointsPerBlank
                });
            });
            return questions;
        },

        render: function (q, ctx) {
            var container = document.createElement('div');
            container.className = 'passage-container grammar-document';

            // Grammar Rule Header Banner
            if (q.ruleLabel || q.category) {
                var ruleBanner = document.createElement('div');
                ruleBanner.className = 'grammar-rule-banner';

                var badgeHtml = '';
                if (q.category) {
                    badgeHtml += '<span class="grammar-cat-tag">' + q.category + '</span>';
                }
                if (q.ruleLabel) {
                    badgeHtml += '<span class="grammar-rule-title">' + q.ruleLabel + '</span>';
                }

                ruleBanner.innerHTML = '<div class="grammar-rule-top">' + badgeHtml + '</div>';

                if (q.ruleTip) {
                    var tipBox = document.createElement('div');
                    tipBox.className = 'grammar-rule-tip';
                    tipBox.innerHTML = '<svg class="tip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg> <span class="tip-text">' + q.ruleTip + '</span>';
                    ruleBanner.appendChild(tipBox);
                }

                container.appendChild(ruleBanner);
            }

            var sentenceDiv = document.createElement('div');
            sentenceDiv.className = 'grammar-sentence-area';

            var selects = [];

            q.segments.forEach(function (seg, segIndex) {
                if (seg.type === 'text') {
                    var span = document.createElement('span');
                    span.style.whiteSpace = 'pre-wrap';
                    span.textContent = seg.value;
                    sentenceDiv.appendChild(span);
                } else if (seg.type === 'blank') {
                    var select = document.createElement('select');
                    select.className = 'blank-select grammar-select';
                    select.dataset.segIndex = segIndex;
                    select.dataset.blankId = seg.id;

                    var defaultOpt = document.createElement('option');
                    defaultOpt.value = '';
                    defaultOpt.textContent = (ctx && ctx.t) ? ctx.t('chooseOption') : '— choose —';
                    defaultOpt.disabled = true;
                    defaultOpt.selected = true;
                    select.appendChild(defaultOpt);

                    var optionsToRender = (seg.options || []).map(function (opt, idx) {
                        return { text: opt, isCorrect: idx === seg.correctIndex };
                    });

                    if (q.shuffleOptions) {
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
                    sentenceDiv.appendChild(select);
                }
            });

            container.appendChild(sentenceDiv);

            // Container for reveal feedback
            var explanationContainer = document.createElement('div');
            explanationContainer.className = 'grammar-explanation-container hidden';
            explanationContainer.id = 'grammarExplanation';
            container.appendChild(explanationContainer);

            var qa = document.getElementById('questionArea');
            if (qa) {
                qa.innerHTML = '';
                qa.appendChild(container);
            }

            function checkComplete() {
                var allAnswered = selects.every(function (sel) { return sel.value !== ''; });
                ctx.setCanConfirm(allAnswered);
            }

            q._selects = selects;
            q._explanationContainer = explanationContainer;
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

            var userAnswerStr = blanksResult.map(function (b) { return b.studentAnswer || '(none)'; }).join(', ');
            var correctAnswerStr = blanksResult.map(function (b) { return b.correctAnswer || ''; }).join(', ');

            return {
                isCorrect: isCorrect,
                score: score,
                userAnswer: userAnswerStr,
                correctAnswer: correctAnswerStr,
                meta: JSON.stringify({
                    blanksResult: blanksResult,
                    segments: q.segments,
                    ruleLabel: q.ruleLabel,
                    category: q.category,
                    explanation: q.explanation
                })
            };
        },

        reveal: function (q, result) {
            var selects = q._selects || [];

            var meta = {};
            try { meta = JSON.parse(result.meta); } catch (e) { }
            var blanksResult = meta.blanksResult || [];

            selects.forEach(function (select) {
                select.disabled = true;
                var blankId = select.dataset.blankId;
                var bResult = blanksResult.find(function (b) { return b.id === blankId; });

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

            if (q.explanation && q._explanationContainer) {
                q._explanationContainer.innerHTML = '<div class="grammar-feedback-card"><strong>Rule Explanation:</strong> ' + q.explanation + '</div>';
                q._explanationContainer.classList.remove('hidden');
            }
        }
    });
})();
