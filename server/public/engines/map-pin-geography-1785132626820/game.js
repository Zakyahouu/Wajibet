(function () {
  'use strict';

  // ---- DOM refs ----
  var els = {
    progress: document.getElementById('progress'),
    score: document.getElementById('scoreDisplay'),
    timerTrack: document.getElementById('timerTrack'),
    timerFill: document.getElementById('timerFill'),
    card: document.getElementById('card'),
    compass: document.getElementById('compass'),
    prompt: document.getElementById('prompt'),
    mapFrame: document.getElementById('mapFrame'),
    mapImage: document.getElementById('mapImage'),
    clickLayer: document.getElementById('clickLayer'),
    markerTarget: document.getElementById('markerTarget'),
    markerClick: document.getElementById('markerClick'),
    feedback: document.getElementById('feedback'),
    feedbackHeadline: document.getElementById('feedbackHeadline'),
    feedbackDetail: document.getElementById('feedbackDetail'),
    nextBtn: document.getElementById('nextBtn'),
    emptyState: document.getElementById('emptyState'),
    endScreen: document.getElementById('endScreen'),
    endScore: document.getElementById('endScore'),
    endDetail: document.getElementById('endDetail'),
  };

  var NEAR_MISS_MULTIPLIER = 2.5; // click within this many tolerance-radii earns half credit

  var settings = {};
  var content = [];
  var currentIndex = 0;
  var scoreBaseline = 0;   // carried over from resumeState, if any
  var elapsedBaseline = 0; // carried over from resumeState, if any
  var sessionEarnedScore = 0;
  var sessionStartedAt = 0;
  var answeredCurrent = false;
  var timerHandle = null;
  var timerDeadline = 0;
  var correctCount = 0;
  var attemptedCount = 0;
  var questionStartedAt = 0;

  function itemId(item, index) {
    return item.id || item._id || ('item-' + index);
  }

  function setAccent(color) {
    if (color) {
      document.documentElement.style.setProperty('--accent', color);
    }
  }

  // Computes the actual on-screen rect of the image inside its frame, given
  // object-fit: contain letterboxing. Every coordinate in this game (click
  // position, target position) is expressed as a percentage OF THE IMAGE
  // ITSELF, never of the surrounding frame — this function is the single
  // place that converts between the two, so it must be used both when
  // reading a click and when placing a marker, or the two will drift apart
  // whenever the image doesn't exactly fill the frame.
  function getRenderedRect(frameEl, imgEl) {
    var frameRect = frameEl.getBoundingClientRect();
    var naturalW = imgEl.naturalWidth || 1;
    var naturalH = imgEl.naturalHeight || 1;
    var containerW = frameRect.width;
    var containerH = frameRect.height;
    var containerRatio = containerW / containerH;
    var naturalRatio = naturalW / naturalH;

    var renderW, renderH, offsetX, offsetY;
    if (naturalRatio > containerRatio) {
      renderW = containerW;
      renderH = containerW / naturalRatio;
      offsetX = 0;
      offsetY = (containerH - renderH) / 2;
    } else {
      renderH = containerH;
      renderW = containerH * naturalRatio;
      offsetY = 0;
      offsetX = (containerW - renderW) / 2;
    }
    return { frameRect: frameRect, renderW: renderW, renderH: renderH, offsetX: offsetX, offsetY: offsetY };
  }

  function getClickPercent(evt) {
    var rect = getRenderedRect(els.mapFrame, els.mapImage);
    var clientX = (evt.touches && evt.touches[0] ? evt.touches[0].clientX : evt.clientX) - rect.frameRect.left;
    var clientY = (evt.touches && evt.touches[0] ? evt.touches[0].clientY : evt.clientY) - rect.frameRect.top;

    var xInImage = clientX - rect.offsetX;
    var yInImage = clientY - rect.offsetY;

    var xPercent = (xInImage / rect.renderW) * 100;
    var yPercent = (yInImage / rect.renderH) * 100;

    return {
      xPercent: Math.max(0, Math.min(100, xPercent)),
      yPercent: Math.max(0, Math.min(100, yPercent)),
      renderW: rect.renderW,
      renderH: rect.renderH,
    };
  }

  // Places a marker given a position expressed as a percentage OF THE IMAGE,
  // converting it to a pixel position within the frame via getRenderedRect.
  function placeMarker(el, xPercent, yPercent) {
    var rect = getRenderedRect(els.mapFrame, els.mapImage);
    el.style.left = (rect.offsetX + (xPercent / 100) * rect.renderW) + 'px';
    el.style.top = (rect.offsetY + (yPercent / 100) * rect.renderH) + 'px';
    el.hidden = false;
    el.dataset.xPercent = xPercent;
    el.dataset.yPercent = yPercent;
  }

  // Re-places any currently visible markers — needed after a window resize,
  // since the rendered image rect (and therefore the pixel position for a
  // given image-percent) changes with the container size.
  function repositionVisibleMarkers() {
    [els.markerTarget, els.markerClick].forEach(function (el) {
      if (!el.hidden && el.dataset.xPercent !== undefined) {
        placeMarker(el, Number(el.dataset.xPercent), Number(el.dataset.yPercent));
      }
    });
  }
  window.addEventListener('resize', repositionVisibleMarkers);

  function updateHud() {
    els.progress.textContent = 'Item ' + (currentIndex + 1) + ' / ' + content.length;
    els.score.textContent = 'Score ' + (scoreBaseline + sessionEarnedScore);
  }

  function stopTimer() {
    if (timerHandle) {
      clearInterval(timerHandle);
      timerHandle = null;
    }
  }

  function startTimer(seconds, onExpire) {
    stopTimer();
    if (!seconds || seconds <= 0) {
      els.timerTrack.hidden = true;
      return;
    }
    els.timerTrack.hidden = false;
    els.timerFill.classList.remove('is-low');
    var totalMs = seconds * 1000;
    timerDeadline = Date.now() + totalMs;
    els.timerFill.style.transform = 'scaleX(1)';

    timerHandle = setInterval(function () {
      var remaining = timerDeadline - Date.now();
      var ratio = Math.max(0, remaining / totalMs);
      els.timerFill.style.transform = 'scaleX(' + ratio + ')';
      if (ratio <= 0.25) els.timerFill.classList.add('is-low');
      if (remaining <= 0) {
        stopTimer();
        onExpire();
      }
    }, 100);
  }

  function renderItem() {
    var item = content[currentIndex];
    answeredCurrent = false;

    els.feedback.hidden = true;
    els.markerTarget.hidden = true;
    els.markerClick.hidden = true;
    els.markerClick.classList.remove('is-correct');
    els.clickLayer.disabled = false;

    els.prompt.textContent = item.prompt || '';
    els.mapImage.src = (item.targetLocation && item.targetLocation.imageUrl) || '';
    els.mapImage.alt = item.locationLabel ? ('Map for: ' + item.locationLabel) : 'Map';

    updateHud();

    // A small, deliberate "settle" moment on the compass mark per question —
    // disabled automatically under prefers-reduced-motion via CSS.
    els.compass.classList.remove('is-settling');
    void els.compass.offsetWidth; // restart animation
    els.compass.classList.add('is-settling');

    questionStartedAt = Date.now();
    startTimer(settings.timeLimitSeconds, function () {
      submitAnswer(item, null, questionStartedAt, true);
    });
  }

  function submitAnswer(item, clickInfo, questionStartedAt, timedOut) {
    if (answeredCurrent) return;
    answeredCurrent = true;
    stopTimer();
    els.clickLayer.disabled = true;

    var maxScore = Number(settings.pointsPerQuestion) || 10;
    var loc = item.targetLocation || {};
    var toleranceRadiusPercent = Number(loc.radiusPercent) || 6;

    var distancePercent = null;
    var isCorrect = false;
    var earned = 0;
    var xPercent = null;
    var yPercent = null;

    if (!timedOut && clickInfo) {
      xPercent = clickInfo.xPercent;
      yPercent = clickInfo.yPercent;

      var dxPct = xPercent - Number(loc.xPercent);
      var dyPct = yPercent - Number(loc.yPercent);
      var dxPx = (dxPct / 100) * clickInfo.renderW;
      var dyPx = (dyPct / 100) * clickInfo.renderH;
      var distPx = Math.sqrt(dxPx * dxPx + dyPx * dyPx);
      var toleranceBasisPx = (toleranceRadiusPercent / 100) * Math.min(clickInfo.renderW, clickInfo.renderH);

      distancePercent = Math.round((distPx / Math.min(clickInfo.renderW, clickInfo.renderH)) * 100 * 10) / 10;

      if (distPx <= toleranceBasisPx) {
        isCorrect = true;
        earned = maxScore;
      } else if (distPx <= toleranceBasisPx * NEAR_MISS_MULTIPLIER) {
        earned = Math.round(maxScore * 0.5);
      } else {
        earned = 0;
      }

      placeMarker(els.markerClick, xPercent, yPercent);
      els.markerClick.classList.toggle('is-correct', isCorrect);
    }

    // Reveal the correct pin when the click was right, or when it was wrong but
    // the teacher hasn't disabled showing the answer (default: show it).
    var revealTarget = isCorrect || settings.showCorrectLocationOnMiss !== false;
    if (revealTarget) {
      placeMarker(els.markerTarget, Number(loc.xPercent), Number(loc.yPercent));
    }

    sessionEarnedScore += earned;
    attemptedCount += 1;
    if (isCorrect) correctCount += 1;
    updateHud();

    var timeMs = Date.now() - questionStartedAt;

    WajibetSDK.recordInteraction({
      itemId: itemId(item, currentIndex),
      itemIndex: currentIndex,
      type: 'map-pin',
      isCorrect: isCorrect,
      userAnswer: timedOut ? 'no-answer' : (xPercent.toFixed(1) + ',' + yPercent.toFixed(1)),
      correctAnswer: item.locationLabel || (loc.xPercent + ',' + loc.yPercent),
      score: earned,
      maxScore: maxScore,
      timeMs: timeMs,
      attempts: 1,
      skipped: !!timedOut,
      meta: {
        mapImage: loc.imageUrl,
        locationLabel: item.locationLabel,
        clickXPercent: xPercent,
        clickYPercent: yPercent,
        targetXPercent: loc.xPercent,
        targetYPercent: loc.yPercent,
        toleranceRadiusPercent: toleranceRadiusPercent,
        distancePercent: distancePercent,
      },
    });

    showFeedback(isCorrect, earned, maxScore, distancePercent, timedOut);
  }

  function showFeedback(isCorrect, earned, maxScore, distancePercent, timedOut) {
    els.feedback.hidden = false;
    els.feedbackHeadline.classList.remove('is-correct', 'is-partial', 'is-incorrect');

    if (timedOut) {
      els.feedbackHeadline.textContent = "Time's up";
      els.feedbackHeadline.classList.add('is-incorrect');
      els.feedbackDetail.textContent = '+0 points';
    } else if (isCorrect) {
      els.feedbackHeadline.textContent = 'Correct';
      els.feedbackHeadline.classList.add('is-correct');
      els.feedbackDetail.textContent = '+' + earned + ' points · off by ' + distancePercent + '%';
    } else if (earned > 0) {
      els.feedbackHeadline.textContent = 'Close';
      els.feedbackHeadline.classList.add('is-partial');
      els.feedbackDetail.textContent = '+' + earned + ' points · off by ' + distancePercent + '%';
    } else {
      els.feedbackHeadline.textContent = 'Not quite';
      els.feedbackHeadline.classList.add('is-incorrect');
      els.feedbackDetail.textContent = '+0 points · off by ' + distancePercent + '%';
    }

    els.nextBtn.focus();
  }

  function goToNext() {
    if (currentIndex >= content.length - 1) {
      finish();
      return;
    }
    currentIndex += 1;
    renderItem();
  }

  function finish() {
    els.card.hidden = true;
    els.endScreen.hidden = false;

    var totalScore = scoreBaseline + sessionEarnedScore;
    var totalTimeMs = elapsedBaseline + (Date.now() - sessionStartedAt);
    var accuracy = attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0;

    els.endScore.textContent = totalScore + ' points';
    els.endDetail.textContent = accuracy + '% exact hits · ' + attemptedCount + ' of ' + content.length + ' locations answered';

    WajibetSDK.finishGame(totalScore, totalTimeMs);
  }

  function shuffleArray(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  WajibetSDK.init(function (resumeState) {
    document.documentElement.dir = WajibetSDK.getDirection();

    var creation = WajibetSDK.getGameCreation() || {};
    settings = creation.config || {};
    content = Array.isArray(creation.content) ? creation.content : [];

    setAccent(settings.themeColor);

    if (settings.shuffle && !resumeState) {
      content = shuffleArray(content);
    }

    if (!content.length) {
      els.card.hidden = true;
      els.emptyState.hidden = false;
      return;
    }

    sessionStartedAt = Date.now();

    if (resumeState) {
      currentIndex = Math.min(Math.max(0, resumeState.currentItemIndex || 0), content.length - 1);
      scoreBaseline = Number(resumeState.currentScore) || 0;
      elapsedBaseline = Number(resumeState.elapsedMs) || 0;
    }

    els.clickLayer.addEventListener('click', function (evt) {
      if (answeredCurrent) return;
      var item = content[currentIndex];
      var clickInfo = getClickPercent(evt);
      submitAnswer(item, clickInfo, questionStartedAt, false);
    });

    els.nextBtn.addEventListener('click', goToNext);

    renderItem();
  });
})();
