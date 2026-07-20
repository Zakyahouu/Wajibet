/**
 * Wajibet Reference Quiz — canonical v2 engine.
 *
 * Demonstrates the entire contract:
 *  - SDK handshake (init -> getGameCreation -> resumeState)
 *  - Full Tier 0 telemetry via recordInteraction
 *  - finishGame (the SDK bundles the answers)
 *  - RTL via getDirection + CSS logical properties
 *  - Reconnect resume (currentItemIndex, currentScore, elapsedMs)
 *
 * Everything the engine talks to the platform with goes through WajibetSDK.
 */
(function () {
  'use strict';

  var byId = function (id) { return document.getElementById(id); };
  var OPTION_KEYS = ['A', 'B', 'C', 'D'];

  var items = [];
  var settings = {};
  var pointsPerQuestion = 10;

  var index = 0;
  var score = 0;
  var questionStartMs = 0;

  function showScreen(id) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) screens[i].classList.remove('is-active');
    byId(id).classList.add('is-active');
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  // Build the [{ key, label }] option list for the current item, skipping blanks.
  function optionsFor(item) {
    var out = [];
    for (var i = 0; i < OPTION_KEYS.length; i++) {
      var key = OPTION_KEYS[i];
      var label = item['option' + key];
      if (label !== undefined && label !== null && String(label).trim() !== '') {
        out.push({ key: key, label: String(label) });
      }
    }
    return out;
  }

  function renderQuestion() {
    var item = items[index];
    if (!item) { finish(); return; }

    byId('progress').textContent = (index + 1) + ' / ' + items.length;
    byId('score').textContent = String(score);
    byId('prompt').textContent = item.prompt || '';
    byId('feedback').textContent = '';
    byId('feedback').className = 'feedback';
    byId('next-btn').hidden = true;

    var optionsEl = byId('options');
    optionsEl.innerHTML = '';
    var opts = optionsFor(item);
    opts.forEach(function (opt) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option';
      btn.textContent = opt.label;
      btn.setAttribute('data-key', opt.key);
      btn.addEventListener('click', function () { answer(opt.key); });
      optionsEl.appendChild(btn);
    });

    questionStartMs = Date.now();
  }

  function answer(selectedKey) {
    var item = items[index];
    if (!item) return;

    var correctKey = String(item.correct || 'A').toUpperCase();
    var isCorrect = selectedKey === correctKey;
    var timeMs = Math.max(0, Date.now() - questionStartMs);
    var earned = isCorrect ? pointsPerQuestion : 0;
    if (isCorrect) { score += earned; byId('score').textContent = String(score); }

    // Reveal correct/wrong and lock the buttons.
    var buttons = document.querySelectorAll('.option');
    for (var i = 0; i < buttons.length; i++) {
      var key = buttons[i].getAttribute('data-key');
      if (key === correctKey) buttons[i].classList.add('is-correct');
      else if (key === selectedKey) buttons[i].classList.add('is-wrong');
      buttons[i].disabled = true;
    }
    var fb = byId('feedback');
    fb.textContent = isCorrect ? 'Correct!' : 'Not quite.';
    fb.classList.add(isCorrect ? 'feedback--ok' : 'feedback--bad');

    // --- The Tier 0 telemetry contract (all 11 fields) ---
    WajibetSDK.recordInteraction({
      itemId: item.itemId || ('item_' + index),
      itemIndex: index,
      type: 'multiple-choice',
      isCorrect: isCorrect,
      userAnswer: selectedKey,
      correctAnswer: correctKey,
      score: earned,
      maxScore: pointsPerQuestion,
      timeMs: timeMs,
      attempts: 1,
      skipped: false,
      meta: { selectedOptionId: selectedKey }
    });

    var nextBtn = byId('next-btn');
    nextBtn.hidden = false;
    nextBtn.textContent = (index + 1 >= items.length) ? 'Finish' : 'Next →';
    nextBtn.onclick = function () { index++; renderQuestion(); };
  }

  function finish() {
    showScreen('screen-done');
    var totalMax = items.length * pointsPerQuestion;
    byId('final-score').textContent = String(score);
    byId('final-max').textContent = String(totalMax);

    var totalTimeMs = 0; // best-effort; per-item times are the source of truth
    WajibetSDK.finishGame(score, totalTimeMs);
  }

  // --- Boot ---
  window.onload = function () {
    if (typeof WajibetSDK === 'undefined') {
      byId('screen-loading').innerHTML = '<p class="muted">SDK not loaded.</p>';
      return;
    }

    WajibetSDK.init(function (resumeState) {
      document.documentElement.dir = WajibetSDK.getDirection();

      var creation = WajibetSDK.getGameCreation() || {};
      // The teacher's settings are stored under `config` on the GameCreation
      // (with `settings` kept as a fallback for forward-compatibility).
      settings = creation.config || creation.settings || {};
      items = Array.isArray(creation.content) ? creation.content : [];
      pointsPerQuestion = Number(settings.pointsPerQuestion) || 10;

      // Shuffle only when not resuming, so saved indexes stay valid.
      if (settings.shuffle && !resumeState) items = shuffle(items);

      if (items.length === 0) {
        byId('screen-loading').innerHTML = '<p class="muted">No questions provided.</p>';
        return;
      }

      if (resumeState) {
        index = resumeState.currentItemIndex || 0;
        score = resumeState.currentScore || 0;
        // remaining time (if this engine used a per-item timer) would be:
        //   itemBudgetMs - resumeState.elapsedMs
      }

      showScreen('screen-play');
      renderQuestion();
    });
  };
})();
