/**
 * Wajibet Game Engine SDK
 * 
 * Provides a unified communication bridge between any Wajibet game engine
 * and the host React application.
 */

(function (global) {
  const REQUIRED_TIER_0_FIELDS = [
    'itemId', 'itemIndex', 'type', 'isCorrect', 'userAnswer', 
    'correctAnswer', 'score', 'maxScore', 'timeMs', 'attempts', 'skipped'
  ];

  let state = {
    direction: 'ltr',
    locale: 'en',
    resumeState: null,
    initialized: false
  };

  const WajibetSDK = {
    /**
     * Initialize the game engine. Sends a ready signal to the host and waits for config.
     * @param {Function} onReady Callback invoked when host configuration is received, passed `resumeState`.
     */
    init: function(onReady) {
      if (state.initialized) {
        console.warn('[WajibetSDK] Already initialized.');
        return;
      }

      const messageListener = (event) => {
        // In production, we could verify event.origin here.
        if (event.data && event.data.type === 'GAME_INIT_ACK') {
          const config = event.data.payload || {};
          state.gameCreation = config.gameCreation || null;
          state.direction = config.direction || 'ltr';
          state.locale = config.locale || 'en';
          state.resumeState = config.resumeState || null;
          state.initialized = true;

          window.removeEventListener('message', messageListener);
          if (typeof onReady === 'function') {
            onReady(state.resumeState);
          }
        }
      };

      window.addEventListener('message', messageListener);

      // Announce to the host that the engine is ready to receive configuration
      window.parent.postMessage({ type: 'GAME_INIT' }, '*');
    },

    /**
     * Subscribe to Delegated Review data injection.
     * Use this in `review.html` to receive the student's `meta` object.
     * @param {Function} callback Invoked with the `meta` JSON object.
     */
    onReviewData: function(callback) {
      window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'REVIEW_INIT') {
          const meta = event.data.payload || {};
          if (typeof callback === 'function') {
            callback(meta);
          }
        }
      });
      // Optionally notify host we are ready for review data
      window.parent.postMessage({ type: 'REVIEW_READY' }, '*');
    },

    /**
     * Record a single interaction/answer.
     * @param {Object} interactionObject Must contain all required Tier 0 fields.
     */
    recordInteraction: function(interactionObject) {
      if (!interactionObject || typeof interactionObject !== 'object') {
        throw new Error('[WajibetSDK] Interaction payload must be an object.');
      }

      // Fail loud in dev if contract is violated
      for (const field of REQUIRED_TIER_0_FIELDS) {
        if (interactionObject[field] === undefined || interactionObject[field] === null) {
          throw new Error(`[WajibetSDK] Interaction missing required Tier 0 field: '${field}'`);
        }
      }

      window.parent.postMessage({
        type: 'LIVE_ANSWER',
        payload: interactionObject
      }, '*');
    },

    /**
     * Notify the host that the game is complete.
     * @param {Number} finalScore The total score achieved.
     * @param {Number} totalTimeMs The total time spent in milliseconds.
     */
    finishGame: function(finalScore, totalTimeMs) {
      window.parent.postMessage({
        type: 'GAME_COMPLETE',
        payload: {
          score: finalScore,
          timeMs: totalTimeMs
        }
      }, '*');
    },

    /**
     * Get the configured document direction ('rtl' or 'ltr').
     */
    getDirection: function() {
      return state.direction;
    },

    /**
     * Get the configured locale (e.g. 'en', 'ar').
     */
    getLocale: function() {
      return state.locale;
    },

    /**
     * Get the complete GameCreation configuration.
     */
    getGameCreation: function() {
      return state.gameCreation;
    }
  };

  // Expose to global scope
  global.WajibetSDK = WajibetSDK;

})(typeof window !== 'undefined' ? window : this);
