/* ==========================================================
   Wajibet shared game core.
   Implements the platform play-style rules once, so every
   game inherits them identically:
     - never auto-starts (Start / Continue screen)
     - two-step confirm on every answer
     - explicit Next after feedback
     - consistent HUD + end screen
     - colour + text feedback
     - resume handling (live and offline are identical here)
   Games supply buildQuestions/render/evaluate and nothing else.
   ========================================================== */
window.WG = (function () {
  var $ = function (id) { return document.getElementById(id); };

  var els = {};
  var cfg = null;
  var settings = {};
  var questions = [];
  var idx = 0;
  var earned = 0;
  var scoreBaseline = 0;
  var elapsedBaseline = 0;
  var sessionStart = 0;
  var qStart = 0;
  var answered = false;
  var canConfirm = false;
  var correctCount = 0;
  var attemptedCount = 0;
  var timerId = null;
  var gameFinished = false;

  function cacheEls() {
    ['startScreen', 'playScreen', 'endScreen', 'emptyScreen', 'startBtn', 'gameTitle',
     'lede', 'progress', 'scoreDisplay', 'timerTrack', 'timerFill', 'questionArea',
     'prompt', 'feedback', 'feedbackHeadline', 'feedbackDetail', 'confirmBtn',
     'nextBtn', 'endScore', 'endStats', 'hud'].forEach(function (id) { els[id] = $(id); });
  }

  function show(screen) {
    ['startScreen', 'playScreen', 'endScreen', 'emptyScreen'].forEach(function (s) {
      if (els[s]) els[s].classList.add('hidden');
    });
    if (els[screen]) els[screen].classList.remove('hidden');
    if (els.hud) els.hud.classList.toggle('hidden', screen !== 'playScreen');
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }

  function startTimer(seconds) {
    stopTimer();
    if (!seconds || seconds <= 0) { if (els.timerTrack) els.timerTrack.classList.add('hidden'); return; }
    els.timerTrack.classList.remove('hidden');
    els.timerFill.classList.remove('is-low');
    var total = seconds * 1000, deadline = Date.now() + total;
    els.timerFill.style.transform = 'scaleX(1)';
    timerId = setInterval(function () {
      var ratio = Math.max(0, (deadline - Date.now()) / total);
      els.timerFill.style.transform = 'scaleX(' + ratio + ')';
      if (ratio <= .25) els.timerFill.classList.add('is-low');
      if (ratio <= 0) { stopTimer(); submit(true); }
    }, 100);
  }

  function makeCtx() {
    return {
      setCanConfirm: setCanConfirm,
      shuffle: shuffle,
      locale: WajibetSDK.getLocale(),
      isRTL: WajibetSDK.getDirection() === 'rtl',
      t: WajibetSDK.t
    };
  }

  function updateHud() {
    if (els.progress) els.progress.textContent = WajibetSDK.t('itemProgress', { current: idx + 1, total: questions.length });
    if (els.scoreDisplay) els.scoreDisplay.textContent = WajibetSDK.t('score') + ' ' + (scoreBaseline + earned);
  }

  function setCanConfirm(v) {
    canConfirm = !!v;
    if (els.confirmBtn) els.confirmBtn.disabled = !canConfirm || answered;
  }

  function renderQuestion() {
    answered = false;
    setCanConfirm(false);
    if (els.feedback) els.feedback.classList.add('hidden');
    if (els.confirmBtn) els.confirmBtn.classList.remove('hidden');
    if (els.nextBtn) els.nextBtn.classList.add('hidden');
    updateHud();
    cfg.render(questions[idx], makeCtx());
    qStart = Date.now();
    startTimer(Number(settings.timeLimitSeconds));
  }

  function submit(timedOut) {
    if (answered) return;
    if (!timedOut && !canConfirm) return;
    answered = true;
    stopTimer();
    setCanConfirm(false);

    var q = questions[idx];
    var ctx = makeCtx();
    var r = cfg.evaluate(q, !!timedOut, ctx) || {};
    var score = Math.max(0, Number(r.score) || 0);
    var maxScore = Number(q.maxScore) || 0;

    earned += score;
    attemptedCount += 1;
    if (r.isCorrect) correctCount += 1;
    updateHud();

    WajibetSDK.recordInteraction({
      itemId: q.itemId || ('item_' + idx),
      itemIndex: idx,
      type: cfg.type || 'unknown',
      isCorrect: !!r.isCorrect,
      userAnswer: String(r.userAnswer === undefined || r.userAnswer === null ? '' : r.userAnswer),
      correctAnswer: String(r.correctAnswer === undefined || r.correctAnswer === null ? '' : r.correctAnswer),
      score: score,
      maxScore: maxScore,
      timeMs: Date.now() - qStart,
      attempts: 1,
      skipped: !!timedOut,
      meta: r.meta || {}
    });

    if (cfg.reveal) cfg.reveal(q, r, !!timedOut, ctx);

    // Feedback always pairs colour with text.
    var h = els.feedbackHeadline, cls = 'feedback-headline ';
    if (timedOut) { h.textContent = WajibetSDK.t('timesUp'); cls += 'is-incorrect'; }
    else if (r.isCorrect) { h.textContent = WajibetSDK.t('correct'); cls += 'is-correct'; }
    else if (score > 0) { h.textContent = r.headline || WajibetSDK.t('close'); cls += 'is-partial'; }
    else { h.textContent = r.headline || WajibetSDK.t('notQuite'); cls += 'is-incorrect'; }
    h.className = cls;
    els.feedbackDetail.textContent = (score > 0 ? '+' + score + ' ' + WajibetSDK.t('points') : '+0 ' + WajibetSDK.t('points')) + (r.detail ? ' · ' + r.detail : '');

    els.feedback.classList.remove('hidden');
    els.confirmBtn.classList.add('hidden');
    els.nextBtn.classList.remove('hidden');
    els.nextBtn.textContent = (idx >= questions.length - 1) ? WajibetSDK.t('finish') : WajibetSDK.t('next');
    els.nextBtn.focus();
  }

  function next() {
    if (idx >= questions.length - 1) return finish();
    idx += 1;
    renderQuestion();
  }

  function finish() {
    if (gameFinished) return;
    gameFinished = true;
    stopTimer();
    var total = scoreBaseline + earned;
    var timeMs = elapsedBaseline + (Date.now() - sessionStart);
    var maxTotal = questions.reduce(function (s, q) { return s + (Number(q.maxScore) || 0); }, 0);
    var pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
    var acc = attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0;

    els.endScore.textContent = total + ' / ' + maxTotal + ' ' + WajibetSDK.t('points');
    els.endStats.textContent = pct + '% ' + WajibetSDK.t('scoreLabel') + ' · ' + acc + '% ' + WajibetSDK.t('exactLabel') + ' · ' +
      WajibetSDK.t('answeredProgress', { count: attemptedCount, total: questions.length }) + ' · ' +
      Math.round(timeMs / 1000) + 's';
    show('endScreen');
    WajibetSDK.finishGame(total, timeMs);
  }

  return {
    shuffle: shuffle,
    /* opts: { type, title, lede, buildQuestions(settings, content), render(q, ctx),
               evaluate(q, timedOut), reveal(q, result, timedOut) } */
    run: function (opts) {
      cfg = opts;
      cacheEls();

      WajibetSDK.init(function (resumeState) {
        document.documentElement.dir = WajibetSDK.getDirection();

        var creation = WajibetSDK.getGameCreation() || {};
        settings = creation.config || {};
        var content = Array.isArray(creation.content) ? creation.content : [];

        if (settings.themeColor) document.documentElement.style.setProperty('--accent', settings.themeColor);
        if (els.gameTitle) els.gameTitle.textContent = opts.title;
        if (els.lede) els.lede.textContent = opts.lede;
        if (els.confirmBtn) els.confirmBtn.textContent = WajibetSDK.t('confirm');
        if (els.startBtn) els.startBtn.textContent = WajibetSDK.t('start');

        questions = opts.buildQuestions(settings, content) || [];
        if (!questions.length) { show('emptyScreen'); return; }

        if (resumeState) {
          idx = Math.min(Math.max(0, Number(resumeState.currentItemIndex) || 0), questions.length - 1);
          scoreBaseline = Number(resumeState.currentScore) || 0;
          elapsedBaseline = Number(resumeState.elapsedMs) || 0;
          els.startBtn.textContent = WajibetSDK.t('continueLabel');
          els.lede.textContent = WajibetSDK.t('resumeMessage');
        }

        // Never auto-start: gameplay begins only on an explicit tap.
        show('startScreen');
        els.startBtn.onclick = function () {
          sessionStart = Date.now();
          show('playScreen');
          renderQuestion();
        };
        els.confirmBtn.onclick = function () { submit(false); };
        els.nextBtn.onclick = next;
      });
    }
  };
})();
