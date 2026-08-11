(function () {
  'use strict';

  var selected = null, ctxRef = null, current = null;
  var SESSION_KEY = 'WG_ORBS_classify_buckets';

  // Math function to calculate maximum ball size to pack them into the bucket area
  function calculateOrbSize(container, count) {
    if (count === 0) return 32;

    var width = container.clientWidth || 100;
    var height = container.clientHeight || 80;
    var area = width * height;

    var optimalSize = Math.floor(Math.sqrt(area / count) * 0.85);
    return Math.max(8, Math.min(32, optimalSize));
  }

  function loadOrbs() {
    var saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]');

    var zones = document.querySelectorAll('.drop-zone');
    zones.forEach(function (zone) {
      var k = zone.dataset.key;
      var container = zone.querySelector('.bucket-marbles');
      if (!container) return;

      container.innerHTML = '';
      var bucketOrbs = saved.filter(function (o) { return o.key === k; });
      var size = calculateOrbSize(container, bucketOrbs.length);
      container.style.setProperty('--orb-size', size + 'px');

      bucketOrbs.forEach(function (orb) {
        var el = document.createElement('div');
        el.className = 'bucket-orb ' + (orb.correct ? 'orb-correct' : 'orb-wrong');
        container.appendChild(el);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    // Always clear orb history at the start of a session — never carry over
    // from a previous completed attempt. The button-text check was fragile
    // and failed for resumed sessions that shared the same key.
    sessionStorage.removeItem(SESSION_KEY);

    var startBtn = document.getElementById('startBtn');
    if (startBtn) {
      startBtn.addEventListener('click', function () {
        // Orbs are already cleared above on DOMContentLoaded; just sync UI.
        setTimeout(loadOrbs, 50);
      });
    }
  });


  WG.run({
    type: 'classify',
    title: 'Classify It',
    lede: 'Sort the item into the correct category tray.',

    buildQuestions: function (settings, content) {
      var pts = Number(settings.pointsPerQuestion) || 10;
      var cats = {};
      ['A', 'B', 'C', 'D'].forEach(function (k) {
        var name = String(settings['category' + k] || '').trim();
        if (name) cats[k] = name;
      });
      var keys = Object.keys(cats);
      if (keys.length < 2) return [];

      var qs = content.map(function (item, i) {
        var text = String(item && item.itemText || '').trim();
        var key = String(item && item.category || '').trim().toUpperCase();
        if (!text || !cats[key]) return null;
        return {
          itemId: item.itemId || ('item-' + i),
          maxScore: pts,
          text: text,
          correctKey: key,
          correctName: cats[key],
          explanation: String(item.explanation || '').trim(),
          keys: keys,
          cats: cats
        };
      });
      return qs.filter(Boolean);
    },

    render: function (q, ctx) {
      current = q;
      ctxRef = ctx;
      selected = null;
      ctx.setCanConfirm(false);

      var area = document.getElementById('questionArea');

      // We inject the new Central Action Dock here below the drop zones
      area.innerHTML = `
        <div class="card-dispenser" id="cardOrigin">
          <div id="dragCard" class="drag-card" touch-action="none">
            <span id="dragText">${q.text}</span>
          </div>
        </div>
        <div id="dropZones" class="drop-zones"></div>
        <div class="central-action-dock">
           <button type="button" id="masterLockBtn" class="master-lock-btn">✓ Lock In Answer</button>
        </div>
      `;

      var zonesContainer = document.getElementById('dropZones');
      var card = document.getElementById('dragCard');
      var origin = document.getElementById('cardOrigin');
      var masterBtn = document.getElementById('masterLockBtn');

      // Hook up the new central button
      masterBtn.onclick = function (e) {
        e.stopPropagation();
        document.getElementById('confirmBtn').click();
      };

      q.keys.forEach(function (k) {
        var z = document.createElement('div');
        z.className = 'drop-zone';
        z.setAttribute('data-key', k);
        // The local button is gone!
        z.innerHTML = `
          <div class="slot-container"></div>
          <div class="bucket-marbles"></div> 
          <div class="drop-zone-title">${q.cats[k]}</div>
        `;
        zonesContainer.appendChild(z);

        z.addEventListener('click', function () {
          if (card.classList.contains('is-locked')) return;
          snapToZone(z, k);
        });
      });

      loadOrbs();

      var isDragging = false;
      var startX = 0, startY = 0;
      var currentX = 0, currentY = 0;

      card.addEventListener('pointerdown', function (e) {
        if (card.classList.contains('is-locked')) return;
        isDragging = true;
        startX = e.clientX - currentX;
        startY = e.clientY - currentY;
        card.style.transition = 'none';
        card.classList.add('is-dragging');
        card.setPointerCapture(e.pointerId);
      });

      card.addEventListener('pointermove', function (e) {
        if (!isDragging) return;
        currentX = e.clientX - startX;
        currentY = e.clientY - startY;
        card.style.transform = 'translate(' + currentX + 'px, ' + currentY + 'px) rotate(2deg)';
      });

      card.addEventListener('pointerup', function (e) {
        if (!isDragging) return;
        isDragging = false;
        card.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease, border-color 0.3s ease';
        card.classList.remove('is-dragging');

        var rect = card.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;

        var zones = document.querySelectorAll('.drop-zone');
        var hit = null;
        for (var i = 0; i < zones.length; i++) {
          var zr = zones[i].getBoundingClientRect();
          if (cx > zr.left && cx < zr.right && cy > zr.top && cy < zr.bottom) {
            hit = zones[i];
            break;
          }
        }

        if (hit) snapToZone(hit, hit.dataset.key);
        else resetCard();
      });

      function snapToZone(zone, key) {
        currentX = 0; currentY = 0;
        card.style.transform = 'translate(0px, 0px)';
        zone.querySelector('.slot-container').appendChild(card);

        document.querySelectorAll('.drop-zone').forEach(function (z) { z.classList.remove('has-card'); });
        zone.classList.add('has-card');
        selected = key;
        ctx.setCanConfirm(true);
        masterBtn.classList.add('is-visible'); // Slide the button up!
      }

      function resetCard() {
        currentX = 0; currentY = 0;
        card.style.transform = 'translate(0px, 0px)';
        origin.appendChild(card);
        document.querySelectorAll('.drop-zone').forEach(function (z) { z.classList.remove('has-card'); });
        selected = null;
        ctx.setCanConfirm(false);
        masterBtn.classList.remove('is-visible'); // Hide the button
      }
    },

    evaluate: function (q, timedOut) {
      var isCorrect = !timedOut && selected === q.correctKey;
      return {
        isCorrect: isCorrect,
        score: isCorrect ? q.maxScore : 0,
        userAnswer: timedOut || !selected ? 'no-answer' : q.cats[selected],
        correctAnswer: q.correctName,
        detail: q.explanation || '',
        meta: {
          itemText: q.text,
          correctCategory: q.correctName,
          chosenCategory: selected ? q.cats[selected] : null,
          allCategories: q.keys.map(function (k) { return q.cats[k]; }),
          explanation: q.explanation,
          category: q.correctName
        }
      };
    },

    reveal: function (q) {
      var isCorrect = (selected === q.correctKey);

      var card = document.getElementById('dragCard');
      if (card) {
        card.classList.add('is-locked');
        card.style.pointerEvents = 'none';
      }

      // Hide the master button immediately once locked in
      var masterBtn = document.getElementById('masterLockBtn');
      if (masterBtn) masterBtn.style.display = 'none';

      var activeZone = null;
      var zones = document.querySelectorAll('.drop-zone');
      zones.forEach(function (z) {
        var k = z.dataset.key;
        if (k === q.correctKey) {
          z.classList.add('is-correct');
          if (selected === q.correctKey) {
            z.classList.add('zone-correct-pop');
            activeZone = z;
          }
        } else if (selected && k === selected) {
          z.classList.add('is-wrong');
          z.classList.add('zone-wrong-shake');
          activeZone = z;
        }
      });

      if (activeZone) {
        var targetContainer = activeZone.querySelector('.bucket-marbles');
        var targetRect = targetContainer.getBoundingClientRect();
        var cardRect = card.getBoundingClientRect();

        var flyingOrb = document.createElement('div');
        flyingOrb.className = 'flying-orb ' + (isCorrect ? 'orb-correct' : 'orb-wrong');

        flyingOrb.style.left = (cardRect.left + cardRect.width / 2 - 16) + 'px';
        flyingOrb.style.top = (cardRect.top + cardRect.height / 2 - 16) + 'px';
        document.body.appendChild(flyingOrb);

        flyingOrb.getBoundingClientRect();

        flyingOrb.style.left = (targetRect.left + targetRect.width / 2 - 16) + 'px';
        flyingOrb.style.top = (targetRect.top + targetRect.height / 2 - 16) + 'px';
        flyingOrb.style.transform = 'scale(0.5)';
        flyingOrb.style.opacity = '0';

        setTimeout(function () {
          flyingOrb.remove();
          // Only persist orb when a real zone was selected (selected may be null on timeout)
          if (selected) {
            var saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]');
            saved.push({ key: selected, correct: isCorrect });
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(saved));
          }
          loadOrbs();
        }, 500);
      }
    }
  });
})();