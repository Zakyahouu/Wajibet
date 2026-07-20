import React from 'react';
import { useLanguage } from '../../context/LanguageContext';

/**
 * In-app author guide for the Wajibet v2 game contract.
 * Mirrors docs/plans/2026-07-20-game-creation-workflow.md — keep them in sync.
 */
const TemplateGuide = () => {
  const { t } = useLanguage();
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-2 h-8 bg-gradient-to-b from-emerald-500 to-teal-600 rounded-full"></div>
        <h3 className="text-2xl font-bold text-gray-800">Template Author Guide (v2)</h3>
      </div>

      <p className="text-sm text-gray-600">
        Every game is a decoupled HTML/JS/CSS app that talks to the platform
        <strong> only </strong> through <code>WajibetSDK</code>. Never use raw
        <code> postMessage</code>, and never listen for <code>INIT_GAME</code> —
        that legacy protocol has been removed.
      </p>

      <section>
        <h4 className="font-semibold text-gray-900 mb-2">Bundle layout (ZIP root)</h4>
        <ul className="list-disc pl-6 text-gray-700 text-sm space-y-1">
          <li><code>manifest.json</code></li>
          <li><code>form-schema.json</code></li>
          <li><code>engine/</code> — <code>index.html</code>, <code>game.js</code>, <code>style.css</code>, optional <code>review.html</code>, <code>assets/</code></li>
        </ul>
        <p className="text-gray-500 text-sm mt-2">No extra parent folder. All engine assets must be local (no external CDNs).</p>
      </section>

      <section>
        <h4 className="font-semibold text-gray-900 mb-2">manifest.json</h4>
        <pre className="bg-gray-50 text-xs p-3 rounded-md border border-gray-200 whitespace-pre-wrap break-words">{`{
  "name": "Reference Quiz",
  "description": "A minimal reference multiple-choice game.",
  "attemptPolicy": "multiple",
  "xp": {
    "assignment": { "enabled": true, "amount": 50, "firstAttemptOnly": true },
    "online": { "enabled": true, "amount": 25 }
  },
  "limits": { "maxCreationsPerTeacher": 100 },
  "assets": { "maxImagesPerCreation": 0 }
}`}</pre>
      </section>

      <section>
        <h4 className="font-semibold text-gray-900 mb-2">form-schema.json</h4>
        <ul className="list-disc pl-6 text-gray-700 text-sm space-y-1">
          <li><strong>settings</strong>: fields of type <code>text</code>, <code>textarea</code>, <code>number</code>, <code>boolean</code>, <code>enum</code></li>
          <li><strong>content.itemSchema</strong>: the per-item fields the teacher fills in (question, options, correct, …)</li>
        </ul>
      </section>

      <section>
        <h4 className="font-semibold text-gray-900 mb-2">Engine — SDK handshake</h4>
        <pre className="bg-gray-50 text-xs p-3 rounded-md border border-gray-200 whitespace-pre-wrap break-words">{`<script src="/sdk/wajibet-sdk.js"></script>

WajibetSDK.init((resumeState) => {
  document.documentElement.dir = WajibetSDK.getDirection();  // 'rtl' | 'ltr'
  const { settings, content } = WajibetSDK.getGameCreation();
  // resumeState (if not null): { currentItemIndex, currentScore, elapsedMs }
  // remaining = itemBudgetMs - resumeState.elapsedMs
  startGame(content, settings, resumeState);
});`}</pre>
      </section>

      <section>
        <h4 className="font-semibold text-gray-900 mb-2">Telemetry — the Tier 0 contract</h4>
        <p className="text-gray-700 text-sm mb-2">
          Call <code>recordInteraction</code> on <strong>every</strong> answer with all 11 fields.
          Anything engine-specific goes under <code>meta</code> (declared in the template's
          <code> metaStatsSchema</code> to appear in reports).
        </p>
        <pre className="bg-gray-50 text-xs p-3 rounded-md border border-gray-200 whitespace-pre-wrap break-words">{`WajibetSDK.recordInteraction({
  itemId, itemIndex, type,
  isCorrect, userAnswer, correctAnswer,
  score, maxScore, timeMs, attempts, skipped,
  meta: { selectedOptionId }        // optional, engine-specific
});

// When the game ends — the SDK bundles all recorded answers automatically:
WajibetSDK.finishGame(totalScore, totalTimeMs);`}</pre>
      </section>

      <section>
        <h4 className="font-semibold text-gray-900 mb-2">review.html (optional, recommended)</h4>
        <pre className="bg-gray-50 text-xs p-3 rounded-md border border-gray-200 whitespace-pre-wrap break-words">{`<script src="/sdk/wajibet-sdk.js"></script>

WajibetSDK.onReviewData((interaction) => {
  // interaction is the FULL Tier 0 object (userAnswer, correctAnswer, isCorrect, ...)
  // Render the student's answer vs the correct one.
});`}</pre>
        <p className="text-gray-500 text-sm mt-2">
          Runs sandboxed (<code>allow-scripts</code> only). The SDK emits
          <code> REVIEW_READY</code> for you; the platform then sends the interaction.
          If no engine review renders within 5s, a standard Tier 0 table is shown instead.
        </p>
      </section>

      <section>
        <h4 className="font-semibold text-gray-900 mb-2">RTL & rules</h4>
        <ul className="list-disc pl-6 text-gray-700 text-sm space-y-1">
          <li>Use CSS logical properties (<code>margin-inline-start</code>, <code>inset-inline-start</code>) — never <code>left</code>/<code>right</code>. The platform mirrors RTL automatically.</li>
          <li>Students never play drafts. Admin/Teacher test runs never grant XP or record results.</li>
          <li>Assignments: the first attempt is counted by default; replays don't change the report.</li>
          <li>Never invent SDK methods — the full API is <code>init</code>, <code>getGameCreation</code>, <code>getDirection</code>, <code>getLocale</code>, <code>isPreviewMode</code>, <code>recordInteraction</code>, <code>finishGame</code>, <code>onReviewData</code>.</li>
        </ul>
      </section>
    </div>
  );
};

export default TemplateGuide;
