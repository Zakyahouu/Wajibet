/**
 * Wajibet Game Engine SDK
 *
 * The single communication bridge between any Wajibet game engine and the host
 * React application. Engines MUST talk to the platform only through this SDK.
 *
 * Handshake:
 *   engine  -> parent : { type: 'GAME_INIT' }
 *   parent  -> engine : { type: 'GAME_INIT_ACK',
 *                         payload: { gameCreation, direction, locale, resumeState } }
 *
 * Per-answer (engine -> parent), full Tier 0 object via recordInteraction().
 *
 * Completion (engine -> parent):
 *   { type: 'GAME_COMPLETE',
 *     payload: { finalScore, totalTimeMs, answers: [<Tier 0>...], statsSchemaVersion } }
 */

(function (global) {
  const REQUIRED_TIER_0_FIELDS = [
    'itemId', 'itemIndex', 'type', 'isCorrect', 'userAnswer',
    'correctAnswer', 'score', 'maxScore', 'timeMs', 'attempts', 'skipped'
  ];

  const STATS_SCHEMA_VERSION = 1;

  const STRINGS = {
    en: {
      score: 'Score',
      correct: 'Correct',
      wrong: 'Wrong',
      next: 'Next',
      finish: 'Finish',
      finishGame: 'Finish Game',
      nextQuestion: 'Next Question',
      continueLabel: 'Continue',
      start: 'Start',
      itemProgress: 'Item {current} / {total}',
      timeSpent: 'Time Spent',
      timeTaken: 'Time taken',
      scoreEarned: 'Score Earned',
      reviewing: 'Reviewing',
      resumeMessage: 'You have an attempt in progress. Pick up where you left off.',
      timesUp: "Time's up",
      close: 'Close',
      notQuite: 'Not quite',
      points: 'points',
      scoreLabel: 'score',
      exactLabel: 'exact',
      answeredProgress: '{count} of {total} answered',
      confirm: 'Confirm',
      blanksCorrect: 'Blanks Correct',
      blanksWrong: 'Blanks Wrong',
      yourAnswer: 'Your answer',
      correctAnswer: 'Correct answer',
      correctMatches: 'Correct matches',
      accuracy: 'Accuracy',
      time: 'Time',
      explanation: 'Explanation',
      question: 'Question',
      enter: 'Enter',
      chooseBlankOption: '— choose —',
      chooseOption: 'Choose...',
      answerChoices: 'Answer choices',
      attempts: 'Attempts',
      targetWord: 'Target word',
      hint: 'Hint',
      options: 'Options',
      hintWasShown: 'Hint was shown',
      letterComparison: 'Letter comparison',
      studentPlaced: 'Student placed',
      correctWord: 'Correct word',
      correctEvent: 'Correct event',
      timelineSequence: 'Timeline Sequence',
      reviewingTimeline: 'Reviewing Timeline',
      youScored: 'You scored {score}'
    },
    ar: {
      score: 'النتيجة',
      correct: 'صحيح',
      wrong: 'خطأ',
      next: 'التالي',
      finish: 'إنهاء',
      finishGame: 'إنهاء اللعبة',
      nextQuestion: 'السؤال التالي',
      continueLabel: 'متابعة',
      start: 'ابدأ',
      itemProgress: 'عنصر {current} / {total}',
      timeSpent: 'الوقت المستغرق',
      timeTaken: 'الوقت المستغرق',
      scoreEarned: 'النقاط المكتسبة',
      reviewing: 'مراجعة',
      resumeMessage: 'لديك محاولة قيد التقدم. تابع من حيث توقفت.',
      timesUp: 'انتهى الوقت',
      close: 'قريب',
      notQuite: 'ليس تماماً',
      points: 'نقاط',
      scoreLabel: 'النتيجة',
      exactLabel: 'دقيق',
      answeredProgress: 'تمت الإجابة على {count} من {total}',
      confirm: 'تأكيد',
      blanksCorrect: 'الفراغات الصحيحة',
      blanksWrong: 'الفراغات الخاطئة',
      yourAnswer: 'إجابتك',
      correctAnswer: 'الإجابة الصحيحة',
      correctMatches: 'التطابقات الصحيحة',
      accuracy: 'الدقة',
      time: 'الوقت',
      explanation: 'الشرح',
      question: 'السؤال',
      enter: 'أدخل',
      chooseBlankOption: '— اختر —',
      chooseOption: 'اختر...',
      answerChoices: 'خيارات الإجابة',
      attempts: 'المحاولات',
      targetWord: 'الكلمة المطلوبة',
      hint: 'تلميح',
      options: 'الخيارات',
      hintWasShown: 'تم عرض تلميح',
      letterComparison: 'مقارنة الحروف',
      studentPlaced: 'إجابة الطالب',
      correctWord: 'الكلمة الصحيحة',
      correctEvent: 'الحدث الصحيح',
      timelineSequence: 'تسلسل الخط الزمني',
      reviewingTimeline: 'مراجعة الخط الزمني',
      youScored: 'حصلت على {score}'
    },
    fr: {
      score: 'Score',
      correct: 'Correct',
      wrong: 'Faux',
      next: 'Suivant',
      finish: 'Terminer',
      finishGame: 'Terminer le jeu',
      nextQuestion: 'Question suivante',
      continueLabel: 'Continuer',
      start: 'Commencer',
      itemProgress: 'Élément {current} / {total}',
      timeSpent: 'Temps passé',
      timeTaken: 'Temps écoulé',
      scoreEarned: 'Score obtenu',
      reviewing: 'Révision',
      resumeMessage: 'Vous avez une tentative en cours. Reprenez là où vous vous êtes arrêté.',
      timesUp: 'Temps écoulé',
      close: 'Presque',
      notQuite: 'Pas tout à fait',
      points: 'points',
      scoreLabel: 'score',
      exactLabel: 'exact',
      answeredProgress: '{count} sur {total} répondus',
      confirm: 'Confirmer',
      blanksCorrect: 'Espaces corrects',
      blanksWrong: 'Espaces faux',
      yourAnswer: 'Votre réponse',
      correctAnswer: 'Bonne réponse',
      correctMatches: 'Correspondances correctes',
      accuracy: 'Précision',
      time: 'Temps',
      explanation: 'Explication',
      question: 'Question',
      enter: 'Entrer',
      chooseBlankOption: '— choisir —',
      chooseOption: 'Choisir...',
      answerChoices: 'Choix de réponse',
      attempts: 'Tentatives',
      targetWord: 'Mot cible',
      hint: 'Indice',
      options: 'Options',
      hintWasShown: 'Indice affiché',
      letterComparison: 'Comparaison des lettres',
      studentPlaced: 'Placé par l’élève',
      correctWord: 'Mot correct',
      correctEvent: 'Événement correct',
      timelineSequence: 'Ordre chronologique',
      reviewingTimeline: 'Révision de la chronologie',
      youScored: 'Vous avez obtenu {score}'
    }
  };

  let state = {
    direction: 'ltr',
    locale: 'en',
    resumeState: null,
    gameCreation: null,
    initialized: false,
    interactions: []        // buffer of every recorded interaction this session
  };

  function t(key, vars) {
    const table = STRINGS[state.locale] || STRINGS.en;
    let str = table[key] || (STRINGS.en && STRINGS.en[key]) || key;
    if (vars && typeof vars === 'object') {
      Object.keys(vars).forEach(function (k) {
        str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
      });
    }
    return str;
  }

  const WajibetSDK = {
    t: t,

    /**
     * Initialize the engine. Announces readiness to the host and waits for config.
     * @param {Function} onReady Invoked with `resumeState` once config arrives.
     */
    init: function (onReady) {
      if (state.initialized) {
        console.warn('[WajibetSDK] Already initialized.');
        return;
      }

      const messageListener = (event) => {
        if (event.data && event.data.type === 'GAME_INIT_ACK') {
          const config = event.data.payload || {};
          state.gameCreation = config.gameCreation || null;
          state.direction = config.direction || 'ltr';
          state.locale = config.locale || 'en';
          state.resumeState = config.resumeState || null;
          state.initialized = true;

          if (state.resumeState && Array.isArray(state.resumeState.answers)) {
            state.interactions = state.resumeState.answers.slice();
          }

          window.removeEventListener('message', messageListener);
          if (typeof onReady === 'function') {
            onReady(state.resumeState);
          }
        }
      };

      window.addEventListener('message', messageListener);

      // Announce to the host that the engine is ready to receive configuration.
      window.parent.postMessage({ type: 'GAME_INIT' }, '*');
    },

    /**
     * Subscribe to Delegated Review data. Use inside `review.html`.
     * The SDK announces REVIEW_READY to the parent, then delivers the full
     * interaction object (Tier 0) when the parent replies with REVIEW_INIT.
     * @param {Function} callback Invoked with the interaction object.
     */
    onReviewData: function (callback) {
      window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'REVIEW_INIT') {
          state.direction = event.data.direction || 'ltr';
          state.locale = event.data.locale || 'en';
          const interaction = event.data.payload || {};
          if (typeof callback === 'function') {
            callback(interaction);
          }
        }
      });
      // Tell the host we are mounted and ready to receive review data.
      window.parent.postMessage({ type: 'REVIEW_READY' }, '*');
    },

    /**
     * Record a single interaction/answer. Buffers it for the final GAME_COMPLETE
     * payload and posts a LIVE_ANSWER for the real-time leaderboard.
     * @param {Object} interaction Must contain all Tier 0 fields.
     */
    recordInteraction: function (interaction) {
      if (!interaction || typeof interaction !== 'object') {
        throw new Error('[WajibetSDK] Interaction payload must be an object.');
      }

      // Fail loud in dev if the contract is violated.
      for (const field of REQUIRED_TIER_0_FIELDS) {
        if (interaction[field] === undefined || interaction[field] === null) {
          throw new Error(`[WajibetSDK] Interaction missing required Tier 0 field: '${field}'`);
        }
      }

      // Always buffer, so finishGame can transmit the full answers array.
      state.interactions.push(Object.assign({}, interaction));

      window.parent.postMessage({
        type: 'LIVE_ANSWER',
        payload: interaction
      }, '*');
    },

    /**
     * Notify the host that the game is complete. Consolidates every buffered
     * interaction into the GAME_COMPLETE payload.
     * @param {Number} finalScore   Total score achieved.
     * @param {Number} totalTimeMs  Total time spent, in milliseconds.
     */
    finishGame: function (finalScore, totalTimeMs) {

      window.parent.postMessage({
        type: 'GAME_COMPLETE',
        payload: {
          finalScore: finalScore,
          totalTimeMs: totalTimeMs,
          answers: state.interactions.slice(),
          statsSchemaVersion: STATS_SCHEMA_VERSION
        }
      }, '*');
    },

    /** Direction configured by the host ('rtl' | 'ltr'). */
    getDirection: function () {
      return state.direction;
    },

    /** Locale configured by the host (e.g. 'en', 'ar'). */
    getLocale: function () {
      return state.locale;
    },

    /** The full GameCreation configuration ({ settings, content, ... }). */
    getGameCreation: function () {
      return state.gameCreation;
    }
  };

  // Expose to global scope (also works as a CommonJS/ESM-ish attach point).
  global.WajibetSDK = WajibetSDK;

})(typeof window !== 'undefined' ? window : this);
