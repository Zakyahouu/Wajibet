(function () {
  'use strict';

  var current = null, ctxRef = null;
  // placed: maps shuffled display slotIndex (string) → cardId (string)
  var placed = {};
  // selectedCard: the word-card element currently highlighted, waiting for a slot tap
  var selectedCard = null;

  function shuffle(array) {
    var arr = array.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = arr[i]; arr[i] = arr[j]; arr[j] = temp;
    }
    return arr;
  }

  function escHtml(str) {
    var d = document.createElement('div');
    d.textContent = String(str == null ? '' : str);
    return d.innerHTML;
  }

  WG.run({
    type: 'word-match',
    title: 'Word Meaning Match',
    lede: 'Connect the vocabulary words to their correct definitions.',

    buildQuestions: function (settings, content) {
      var maxPairs = Math.max(2, Number(settings.pairsPerRound) || 4);
      var pts = Number(settings.pointsPerPair) || 10;

      // Only pairs where both word and definition are non-empty
      var validPairs = content.filter(function (c) {
        return c && String(c.word || '').trim() && String(c.definition || '').trim();
      });

      if (validPairs.length < 2) return [];

      var rounds = [];

      for (var i = 0; i < validPairs.length; i += maxPairs) {
        var chunk = validPairs.slice(i, i + maxPairs);

        // BUG FIX: Never merge a lone pair into the previous round using the raw
        // content object (it has `definition` not `def` and no `id`). Instead,
        // absorb a lone trailing pair into the previous round by re-normalising it.
        if (chunk.length === 1 && rounds.length > 0) {
          var prevRound = rounds[rounds.length - 1];
          var lone = chunk[0];
          prevRound.pairs.push({
            id: 'pair_' + i + '_0',
            word: String(lone.word).trim(),
            def: String(lone.definition).trim()
          });
          prevRound.maxScore = prevRound.pairs.length * pts;
        } else {
          var roundPairs = chunk.map(function (p, pIdx) {
            return {
              id: 'pair_' + i + '_' + pIdx,
              word: String(p.word).trim(),
              def: String(p.definition).trim()
            };
          });

          rounds.push({
            itemId: 'round-' + (rounds.length + 1),
            maxScore: roundPairs.length * pts,
            pairs: roundPairs
          });
        }
      }
      return rounds;
    },

    render: function (q, ctx) {
      current = q;
      ctxRef = ctx;
      placed = {};
      selectedCard = null;
      ctx.setCanConfirm(false);

      var slotsContainer = document.getElementById('slotsContainer');
      var wordBank = document.getElementById('wordBank');

      slotsContainer.innerHTML = '';
      wordBank.innerHTML = '';

      // Shuffle definitions (the "locks") independently from words (the "keys")
      var defOrder = shuffle(q.pairs.slice());

      defOrder.forEach(function (pair, index) {
        var row = document.createElement('div');
        row.className = 'def-row';

        // BUG FIX: Use escHtml — teacher content must not be injected as raw HTML
        var defDiv = document.createElement('div');
        defDiv.className = 'def-text';
        defDiv.textContent = pair.def;

        var slot = document.createElement('div');
        slot.className = 'def-slot';
        slot.dataset.index = String(index);
        slot.dataset.correctId = pair.id;

        var statusIcon = document.createElement('div');
        statusIcon.className = 'status-icon';
        slot.appendChild(statusIcon);

        row.appendChild(defDiv);
        row.appendChild(slot);
        slotsContainer.appendChild(row);
      });

      // Shuffle words (the "keys") into the bank
      var wordOrder = shuffle(q.pairs.slice());

      function checkComplete() {
        var allFull = true;
        document.querySelectorAll('.def-slot').forEach(function (slot) {
          if (!slot.querySelector('.word-card')) allFull = false;
        });
        ctxRef.setCanConfirm(allFull);
      }

      function clearAllSelections() {
        document.querySelectorAll('.word-card').forEach(function (c) {
          c.classList.remove('is-selected');
        });
        selectedCard = null;
      }

      function moveCardToSlot(cardEl, slotEl) {
        // Displace any existing card in the target slot back to the bank
        var existing = slotEl.querySelector('.word-card');
        if (existing && existing !== cardEl) {
          wordBank.appendChild(existing);
          existing.classList.remove('is-selected');
          delete placed[slotEl.dataset.index];
        }

        // Vacate the card's previous slot if it was already placed
        var oldParent = cardEl.parentElement;
        if (oldParent && oldParent.classList.contains('def-slot')) {
          delete placed[oldParent.dataset.index];
        }

        // Place the card
        slotEl.appendChild(cardEl);
        placed[slotEl.dataset.index] = cardEl.id;
        cardEl.classList.remove('is-selected');
        selectedCard = null;
        checkComplete();
      }

      function handleCardTap(cardEl) {
        // If card is already in a slot: first tap SELECTS it (to move to another slot).
        // The student must then tap either the destination slot or another card.
        // BUG FIX: old code popped the card to bank immediately on first tap.
        if (cardEl === selectedCard) {
          // Second tap on the same card cancels selection
          clearAllSelections();
          return;
        }

        // If there's already a selected card and the tapped card is in a slot,
        // swap them: put the selected card into this card's slot.
        if (selectedCard && cardEl.parentElement.classList.contains('def-slot')) {
          var targetSlot = cardEl.parentElement;
          moveCardToSlot(selectedCard, targetSlot);
          return;
        }

        // Otherwise: select this card
        clearAllSelections();
        cardEl.classList.add('is-selected');
        selectedCard = cardEl;
      }

      function handleSlotTap(slotEl) {
        if (!selectedCard) return;
        moveCardToSlot(selectedCard, slotEl);
      }

      // Render word cards into the bank
      wordOrder.forEach(function (pair) {
        var card = document.createElement('div');
        card.className = 'word-card';
        card.id = pair.id;
        card.textContent = pair.word;
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');

        // --- Pointer-based drag (desktop + touch) ---
        var dragStartX = 0, dragStartY = 0;
        var dragOffsetX = 0, dragOffsetY = 0;
        var isDragging = false;
        var dragMoved = false;
        var originalParent = null;

        card.addEventListener('pointerdown', function (e) {
          if (card.classList.contains('is-locked')) return;
          isDragging = true;
          dragMoved = false;
          dragStartX = e.clientX;
          dragStartY = e.clientY;
          // Offset from card top-left so the card doesn't jump to cursor centre
          var r = card.getBoundingClientRect();
          dragOffsetX = e.clientX - r.left;
          dragOffsetY = e.clientY - r.top;
          originalParent = card.parentElement;
          card.setPointerCapture(e.pointerId);
        });

        card.addEventListener('pointermove', function (e) {
          if (!isDragging) return;
          var dx = e.clientX - dragStartX;
          var dy = e.clientY - dragStartY;
          if (!dragMoved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
            // Crossed threshold — commit to drag mode
            dragMoved = true;
            // Lift card to fixed position overlay for smooth dragging
            var r = card.getBoundingClientRect();
            card.classList.add('is-dragging');
            card.style.position = 'fixed';
            card.style.zIndex = '9999';
            card.style.width = r.width + 'px';
            card.style.left = (r.left) + 'px';
            card.style.top = (r.top) + 'px';
            card.style.margin = '0';
            // Leave a visual placeholder in the original slot
            if (originalParent && originalParent.classList.contains('def-slot')) {
              originalParent.classList.add('drag-placeholder');
            }
          }
          if (dragMoved) {
            card.style.left = (e.clientX - dragOffsetX) + 'px';
            card.style.top  = (e.clientY - dragOffsetY) + 'px';
          }
        });

        card.addEventListener('pointerup', function (e) {
          if (!isDragging) return;
          isDragging = false;

          if (!dragMoved) {
            // Short tap — fall through to click handler
            return;
          }

          // Reset drag styles
          card.classList.remove('is-dragging');
          card.style.position = '';
          card.style.zIndex  = '';
          card.style.width   = '';
          card.style.left    = '';
          card.style.top     = '';
          card.style.margin  = '';
          if (originalParent && originalParent.classList.contains('def-slot')) {
            originalParent.classList.remove('drag-placeholder');
          }

          // Hit-test against def-slots
          var slots = document.querySelectorAll('.def-slot');
          var hit = null;
          for (var s = 0; s < slots.length; s++) {
            if (slots[s].closest('.def-row').classList.contains('is-locked')) continue;
            var sr = slots[s].getBoundingClientRect();
            if (e.clientX >= sr.left && e.clientX <= sr.right &&
                e.clientY >= sr.top  && e.clientY <= sr.bottom) {
              hit = slots[s];
              break;
            }
          }

          clearAllSelections();
          if (hit) {
            moveCardToSlot(card, hit);
          } else if (originalParent && originalParent.classList.contains('def-slot')) {
            // Return to its previous slot if dropped on nothing
            originalParent.appendChild(card);
          } else {
            // Return to word bank
            wordBank.appendChild(card);
          }
          dragMoved = false;
        });

        card.addEventListener('lostpointercapture', function () {
          // Cleanup if capture is lost unexpectedly (e.g., alert dialog)
          if (dragMoved) {
            card.classList.remove('is-dragging');
            card.style.position = card.style.zIndex = card.style.width =
              card.style.left = card.style.top = card.style.margin = '';
            dragMoved = false;
          }
          isDragging = false;
        });

        // --- Tap-to-select (original behaviour, unchanged) ---
        card.addEventListener('click', function (e) {
          if (card.classList.contains('is-locked')) return;
          if (dragMoved) return; // was a drag, not a tap
          e.stopPropagation();
          handleCardTap(card);
        });
        card.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!card.classList.contains('is-locked')) handleCardTap(card);
          }
        });

        wordBank.appendChild(card);
      });

      // Wire slot tap handlers
      document.querySelectorAll('.def-slot').forEach(function (slot) {
        slot.addEventListener('click', function (e) {
          if (slot.closest('.def-row').classList.contains('is-locked')) return;
          // If tapping a slot that contains the already-selected card, deselect
          if (selectedCard && slot.querySelector('.word-card') === selectedCard) {
            clearAllSelections();
            return;
          }
          handleSlotTap(slot);
        });
      });

      // Deselect if the student taps blank area
      document.getElementById('playScreen').addEventListener('click', function () {
        if (selectedCard) clearAllSelections();
      }, { once: false });
    },

    evaluate: function (q, timedOut, ctx) {
      var total = q.pairs.length;
      var hits = 0;
      var report = [];

      // Build report from the `placed` object (not the DOM) so evaluate() is
      // independent of DOM state and can be called before or after reveal().
      document.querySelectorAll('.def-slot').forEach(function (slot) {
        var correctId = slot.dataset.correctId;
        var correctPair = null;
        var cardId = placed[slot.dataset.index] || null;

        // Find the pair for this slot's definition
        for (var i = 0; i < q.pairs.length; i++) {
          if (q.pairs[i].id === correctId) { correctPair = q.pairs[i]; break; }
        }
        if (!correctPair) return; // should never happen

        // Find the pair the student placed
        var studentPair = null;
        if (cardId) {
          for (var j = 0; j < q.pairs.length; j++) {
            if (q.pairs[j].id === cardId) { studentPair = q.pairs[j]; break; }
          }
        }

        var isMatch = (cardId === correctId);
        if (isMatch) hits++;

        report.push({
          definition: correctPair.def,
          correctWord: correctPair.word,
          studentWord: studentPair ? studentPair.word : null, // null = left empty
          isMatch: isMatch,
          isEmpty: !cardId
        });
      });

      var isCorrect = !timedOut && hits === total;
      var score = timedOut ? 0 : Math.round(q.maxScore * (hits / total));
      var headline = isCorrect ? (ctx && ctx.t ? ctx.t('correct') : 'Perfect match!') : (hits > 0 ? (ctx && ctx.t ? ctx.t('close') : 'Close') : (ctx && ctx.t ? ctx.t('notQuite') : 'No correct matches'));
      var detail = hits + ' / ' + total + (ctx && ctx.t ? ' ' + ctx.t('correctMatches') : ' correct matches');

      return {
        isCorrect: isCorrect,
        score: score,
        userAnswer: hits + '/' + total + ' matched',
        correctAnswer: total + ' pairs',
        headline: headline,
        detail: detail,
        meta: {
          report: report,
          hits: hits,
          total: total,
          pairsPerRound: total
        }
      };
    },

    reveal: function (q) {
      // BUG FIX: Use classList instead of style.display so core.js can restore the
      // button correctly for the next round.
      var confirmBtn = document.getElementById('confirmBtn');
      if (confirmBtn) confirmBtn.classList.add('hidden');

      document.querySelectorAll('.def-slot').forEach(function (slot) {
        var row = slot.closest('.def-row');
        var card = slot.querySelector('.word-card');
        row.classList.add('is-locked');
        if (card) card.classList.add('is-locked');

        if (card && card.id === slot.dataset.correctId) {
          row.classList.add('is-correct');
          slot.querySelector('.status-icon').textContent = '✓';
        } else {
          row.classList.add('is-wrong');
          slot.querySelector('.status-icon').textContent = '×';

          // Show the correct word label inside the slot when the student got it wrong
          if (!card) {
            // Empty slot — show what was expected
            var correctPair = null;
            for (var i = 0; i < q.pairs.length; i++) {
              if (q.pairs[i].id === slot.dataset.correctId) { correctPair = q.pairs[i]; break; }
            }
            if (correctPair) {
              var hint = document.createElement('span');
              hint.className = 'slot-hint';
              hint.textContent = correctPair.word;
              slot.appendChild(hint);
            }
          }
        }
      });

      // Lock all cards in the bank too so they can't be moved post-reveal
      document.querySelectorAll('#wordBank .word-card').forEach(function (card) {
        card.classList.add('is-locked');
      });
    }
  });
})();