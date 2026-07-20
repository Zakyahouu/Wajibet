/**
 * Wajibet Game Engine SDK
 *
 * The single communication bridge between any Wajibet game engine and the host
 * React application. Engines MUST talk to the platform only through this SDK.
 *
 * Handshake:
 *   engine  -> parent : { type: 'GAME_INIT' }
 *   parent  -> engine : { type: 'GAME_INIT_ACK',
 *                         payload: { gameCreation, direction, locale, resumeState, mode } }
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

  let state = {
    direction: 'ltr',
    locale: 'en',
    resumeState: null,
    mode: 'live',          // 'live' | 'preview'
    gameCreation: null,
    initialized: false,
    interactions: []        // buffer of every recorded interaction this session
  };

  const WajibetSDK = {
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
          state.mode = config.mode === 'preview' ? 'preview' : 'live';
          state.initialized = true;

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
     * payload and (in live mode) posts a LIVE_ANSWER for the real-time leaderboard.
     * In preview mode the event is swallowed (console.debug only) so the wizard
     * preview never creates ghost records.
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

      if (state.mode === 'preview') {
        console.debug('[WajibetSDK] preview mode: recordInteraction swallowed', interaction);
        return;
      }

      window.parent.postMessage({
        type: 'LIVE_ANSWER',
        payload: interaction
      }, '*');
    },

    /**
     * Notify the host that the game is complete. Consolidates every buffered
     * interaction into the GAME_COMPLETE payload. Swallowed in preview mode.
     * @param {Number} finalScore   Total score achieved.
     * @param {Number} totalTimeMs  Total time spent, in milliseconds.
     */
    finishGame: function (finalScore, totalTimeMs) {
      if (state.mode === 'preview') {
        console.debug('[WajibetSDK] preview mode: finishGame swallowed',
          { finalScore, totalTimeMs, answers: state.interactions.length });
        return;
      }

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

    /** True when running inside the creation wizard's sandboxed preview. */
    isPreviewMode: function () {
      return state.mode === 'preview';
    },

    /** The full GameCreation configuration ({ settings, content, ... }). */
    getGameCreation: function () {
      return state.gameCreation;
    }
  };

  // Expose to global scope (also works as a CommonJS/ESM-ish attach point).
  global.WajibetSDK = WajibetSDK;

})(typeof window !== 'undefined' ? window : this);
