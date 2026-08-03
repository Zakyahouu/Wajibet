(function () {
    'use strict';

    var current = null, ctxRef = null;
    var placed = [];

    function shuffle(array) {
        var currentIndex = array.length, randomIndex;
        while (currentIndex !== 0) {
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;
            var temp = array[currentIndex];
            array[currentIndex] = array[randomIndex];
            array[randomIndex] = temp;
        }
        return array;
    }

    WG.run({
        type: 'timeline',
        title: 'Timeline Sequencer',
        lede: 'Reconstruct the chronological map.',

        buildQuestions: function (settings, content) {
            var pts = Number(settings.pointsPerTimeline) || 50;

            var qs = content.map(function (timeline, i) {
                if (!timeline.events || timeline.events.length < 2) return null;

                var evs = timeline.events.map(function (ev, evIdx) {
                    return {
                        id: 'ev_' + i + '_' + evIdx,
                        text: ev.eventText,
                        detail: ev.detail || '',
                        correctIndex: evIdx
                    };
                });

                return {
                    itemId: timeline.itemId || ('timeline-' + i),
                    maxScore: pts,
                    title: timeline.timelineTitle || 'Timeline',
                    events: evs
                };
            });
            return qs.filter(Boolean);
        },

        render: function (q, ctx) {
            current = q;
            ctxRef = ctx;
            placed = new Array(q.events.length).fill(null);
            ctx.setCanConfirm(false);

            document.getElementById('prompt').textContent = q.title;

            var deckArea = document.getElementById('deckArea');
            var pathArea = document.getElementById('pathArea');

            var masterBtn = document.getElementById('masterLockBtn');
            masterBtn.style.display = '';
            masterBtn.classList.remove('is-visible');

            deckArea.innerHTML = '';
            pathArea.innerHTML = '';

            masterBtn.onclick = function (e) {
                e.stopPropagation();
                document.getElementById('confirmBtn').click();
            };

            // 1. Build Nodes
            for (var i = 0; i < q.events.length; i++) {
                var node = document.createElement('div');
                node.className = 'path-node';
                node.dataset.index = i;
                node.innerHTML = '<div class="node-dot">' + (i + 1) + '</div>';
                pathArea.appendChild(node);
            }

            // 2. Core Control Functions
            function checkFull() {
                document.querySelectorAll('.path-node').forEach(function (n) {
                    if (!n.querySelector('.event-card')) n.classList.remove('has-card');
                    else n.classList.add('has-card');
                });

                var isFull = placed.indexOf(null) === -1;
                ctxRef.setCanConfirm(isFull);

                if (isFull) {
                    masterBtn.classList.add('is-visible');
                } else {
                    masterBtn.classList.remove('is-visible');
                }
            }

            function snapToNode(card, node, index) {
                var oldIdx = placed.indexOf(card.id);
                if (oldIdx !== -1) placed[oldIdx] = null;

                var existingCard = node.querySelector('.event-card');
                if (existingCard && existingCard !== card) {
                    deckArea.appendChild(existingCard);
                    existingCard.style.transform = 'translate(0px,0px)';
                    var existingIdx = placed.indexOf(existingCard.id);
                    if (existingIdx !== -1) placed[existingIdx] = null;
                }

                card.style.transform = 'translate(0px,0px)';
                node.appendChild(card);
                placed[index] = card.id;

                checkFull();
            }

            function returnToDeck(card) {
                var oldIdx = placed.indexOf(card.id);
                if (oldIdx !== -1) placed[oldIdx] = null;

                card.style.transform = 'translate(0px,0px)';
                deckArea.appendChild(card);
                checkFull();
            }

            // Helper for Tap/Click mechanics
            function placeInNextEmpty(cardToPlace) {
                if (cardToPlace.parentElement.id === 'deckArea') {
                    var firstEmpty = placed.indexOf(null);
                    if (firstEmpty !== -1) {
                        var targetNode = document.querySelector('.path-node[data-index="' + firstEmpty + '"]');
                        snapToNode(cardToPlace, targetNode, firstEmpty);
                    }
                } else {
                    returnToDeck(cardToPlace);
                }
            }

            // 3. Build the Cards
            var shuffled = shuffle(q.events.slice());
            shuffled.forEach(function (ev) {
                var card = document.createElement('div');
                card.className = 'event-card';
                card.id = ev.id;
                card.textContent = ev.text;
                deckArea.appendChild(card);

                var isDragging = false, didMove = false;
                var startX, startY, currentX, currentY;

                card.addEventListener('pointerdown', function (e) {
                    if (card.classList.contains('is-locked')) return;
                    isDragging = true;
                    didMove = false;
                    startX = e.clientX;
                    startY = e.clientY;
                    card.setPointerCapture(e.pointerId);
                });

                card.addEventListener('pointermove', function (e) {
                    if (!isDragging) return;
                    var dx = e.clientX - startX;
                    var dy = e.clientY - startY;

                    // Only trigger visual drag if mouse moves > 8px (protects taps)
                    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
                        didMove = true;
                        card.style.transition = 'none';
                        card.classList.add('is-dragging');
                        card.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) rotate(-1deg)';
                    }
                });

                card.addEventListener('pointerup', function (e) {
                    if (!isDragging) return;
                    isDragging = false;
                    card.style.transition = 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease';
                    card.classList.remove('is-dragging');
                    card.releasePointerCapture(e.pointerId);

                    // If they just clicked/tapped without dragging, auto-place it!
                    if (!didMove) {
                        placeInNextEmpty(card);
                        return;
                    }

                    // Normal Drag & Drop Collision
                    var rect = card.getBoundingClientRect();
                    var cx = rect.left + rect.width / 2;
                    var cy = rect.top + rect.height / 2;

                    var nodes = document.querySelectorAll('.path-node');
                    var hit = null;
                    for (var n = 0; n < nodes.length; n++) {
                        var nr = nodes[n].getBoundingClientRect();
                        if (cx > nr.left && cx < nr.right && cy > nr.top && cy < nr.bottom) {
                            hit = nodes[n];
                            break;
                        }
                    }

                    if (hit) {
                        snapToNode(card, hit, parseInt(hit.dataset.index, 10));
                    } else {
                        returnToDeck(card);
                    }
                });

                card.addEventListener('dblclick', function (e) {
                    if (card.classList.contains('is-locked')) return;
                    e.preventDefault();
                    if (!didMove) {
                        placeInNextEmpty(card);
                    }
                });
            });
        },

        evaluate: function (q, timedOut) {
            var total = q.events.length;
            var hits = 0;
            var studentOrder = [];

            for (var i = 0; i < total; i++) {
                var cardId = placed[i];
                if (!cardId) {
                    studentOrder.push("Empty");
                    continue;
                }
                var ev = q.events.find(function (e) { return e.id === cardId; });
                studentOrder.push(ev.text);
                if (ev.correctIndex === i) hits++;
            }

            var isCorrect = !timedOut && hits === total;
            var score = timedOut ? 0 : Math.round(q.maxScore * (hits / total));

            return {
                isCorrect: isCorrect,
                score: score,
                userAnswer: studentOrder.join(' → '),
                correctAnswer: q.events.map(function (e) { return e.text; }).join(' → '),
                detail: hits + ' of ' + total + ' mapped correctly',
                meta: {
                    studentOrder: studentOrder,
                    correctOrder: q.events.map(function (e) { return { text: e.text, detail: e.detail }; }),
                    correctlyPlaced: hits,
                    totalEvents: total
                }
            };
        },

        reveal: function (q) {
            var masterBtn = document.getElementById('masterLockBtn');
            if (masterBtn) masterBtn.style.display = 'none';

            var nodes = document.querySelectorAll('.path-node');

            nodes.forEach(function (node, i) {
                var card = node.querySelector('.event-card');
                if (card) {
                    card.classList.add('is-locked');
                    // Validate against the original correct index encoded in the ID
                    var isCorrectSlot = card.id === 'ev_' + q.events[0].id.split('_')[1] + '_' + i;

                    if (isCorrectSlot) {
                        node.classList.add('is-correct');
                        node.insertAdjacentHTML('beforeend', '<span class="tag">Right Spot</span>');
                    } else {
                        node.classList.add('is-wrong');
                        node.insertAdjacentHTML('beforeend', '<span class="tag">Wrong Spot</span>');
                    }
                } else {
                    node.classList.add('is-wrong');
                }
            });
        }
    });
})();