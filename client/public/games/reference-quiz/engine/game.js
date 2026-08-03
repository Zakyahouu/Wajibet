/**
 * Wajibet Reference Quiz — canonical v2 engine.
 *
 * Fixed:
 *  - Two-step confirm: select option → enable Confirm button → score
 *  - Start/Continue screen shown before gameplay
 *  - Rich meta in recordInteraction (question text + full option list)
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
  var selectedKey = null;

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

    selectedKey = null;

    byId('progress').textContent = (index + 1) + ' / ' + items.length;
    byId('score').textContent = String(score);
    byId('prompt').textContent = item.prompt || '';
    byId('feedback').textContent = '';
    byId('feedback').className = 'feedback';
    byId('next-btn').hidden = true;

    var confirmBtn = byId('confirm-btn');
    confirmBtn.hidden = false;
    confirmBtn.disabled = true;

    var optionsEl = byId('options');
    optionsEl.innerHTML = '';
    var opts = optionsFor(item);
    opts.forEach(function (opt) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option';
      btn.textContent = opt.label;
      btn.setAttribute('data-key', opt.key);
      btn.addEventListener('click', function () { selectOption(opt.key); });
      optionsEl.appendChild(btn);
    });

    questionStartMs = Date.now();
  }

  function selectOption(key) {
    // Deselect all, select clicked
    var buttons = document.querySelectorAll('.option');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.remove('is-selected');
    }
    for (var j = 0; j < buttons.length; j++) {
      if (buttons[j].getAttribute('data-key') === key) {
        buttons[j].classList.add('is-selected');
      }
    }
    selectedKey = key;
    byId('confirm-btn').disabled = false;
  }

  function confirmAnswer() {
    if (!selectedKey) return;

    var item = items[index];
    if (!item) return;

    var correctKey = String(item.correct || 'A').toUpperCase();
    var isCorrect = selectedKey === correctKey;
    var timeMs = Math.max(0, Date.now() - questionStartMs);
    var earned = isCorrect ? pointsPerQuestion : 0;
    if (isCorrect) { score += earned; byId('score').textContent = String(score); }

    // Build full options list for review meta
    var opts = optionsFor(item);
    var optionsList = opts.map(function (o) { return { key: o.key, label: o.label }; });
    var correctLabel = '';
    var selectedLabel = '';
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].key === correctKey) correctLabel = opts[i].label;
      if (opts[i].key === selectedKey) selectedLabel = opts[i].label;
    }

    // Reveal correct/wrong and lock the buttons.
    var buttons = document.querySelectorAll('.option');
    for (var b = 0; b < buttons.length; b++) {
      var key = buttons[b].getAttribute('data-key');
      buttons[b].classList.remove('is-selected');
      if (key === correctKey) buttons[b].classList.add('is-correct');
      else if (key === selectedKey) buttons[b].classList.add('is-wrong');
      buttons[b].disabled = true;
    }

    var fb = byId('feedback');
    fb.textContent = isCorrect ? 'Correct!' : 'Not quite.';
    fb.classList.add(isCorrect ? 'feedback--ok' : 'feedback--bad');

    byId('confirm-btn').hidden = true;

    // --- Full Tier 0 telemetry with rich meta ---
    WajibetSDK.recordInteraction({
      itemId: item.itemId || ('item_' + index),
      itemIndex: index,
      type: 'multiple-choice',
      isCorrect: isCorrect,
      userAnswer: selectedLabel,          // actual text, not just key
      correctAnswer: correctLabel,        // actual text
      score: earned,
      maxScore: pointsPerQuestion,
      timeMs: timeMs,
      attempts: 1,
      skipped: false,
      meta: {
        question: item.prompt || '',
        options: optionsList,             // full list of { key, label }
        selectedKey: selectedKey,
        correctKey: correctKey,
        selectedLabel: selectedLabel,
        correctLabel: correctLabel
      }
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

    var totalTimeMs = 0;
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
      settings = creation.config || creation.settings || {};
      items = Array.isArray(creation.content) ? creation.content : [];
      pointsPerQuestion = Number(settings.pointsPerQuestion) || 10;

      if (settings.shuffle && !resumeState) items = shuffle(items);

      if (items.length === 0) {
        byId('screen-loading').innerHTML = '<p class="muted">No questions provided.</p>';
        return;
      }

      if (resumeState) {
        index = resumeState.currentItemIndex || 0;
        score = resumeState.currentScore || 0;
        // Show Continue screen
        byId('start-title').textContent = 'Continue where you left off?';
        byId('start-lede').textContent =
          'You have answered ' + index + ' of ' + items.length + ' questions. ' +
          'Your current score is ' + score + ' points.';
        byId('start-btn').textContent = 'Continue';
      }

      showScreen('screen-start');

      byId('start-btn').onclick = function () {
        showScreen('screen-play');
        renderQuestion();
      };

      byId('confirm-btn').onclick = confirmAnswer;
    });
  };
})();
