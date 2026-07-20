# Game Creation Workflow (Canonical)

> The single correct way to author, publish, and run a Wajibet game once the
> `2026-07-20-game-core-correction-plan.md` fixes are in place. One bundle
> format, one protocol (WajibetSDK / Protocol A), one telemetry contract (Tier 0).

---

## 1. Bundle Format (zip root — no wrapper folder)

```
manifest.json      Metadata + backend policy
form-schema.json   The teacher-facing Create-Game form
engine/
  index.html       Entry point; loads /sdk/wajibet-sdk.js then game.js
  game.js          Game logic; talks ONLY through WajibetSDK
  style.css        CSS logical properties only (RTL-safe)
  review.html      Optional; delegated review replay
  assets/          Local assets only (no external CDNs)
```

### manifest.json (canonical shape)
```json
{
  "name": "Reference Quiz",
  "description": "A minimal reference multiple-choice game.",
  "attemptPolicy": "multiple",
  "xp": {
    "assignment": { "enabled": true, "amount": 50, "firstAttemptOnly": true },
    "online": { "enabled": true, "amount": 25 }
  },
  "limits": { "maxCreationsPerTeacher": 100 },
  "assets": { "maxImagesPerCreation": 0 }
}
```
> The server derives `enginePath` from the name slug on upload; `gameType` /
> `engineEntry` are not required. Keep the manifest to the fields above so all
> games share one shape.

### form-schema.json
```json
{
  "settings": {
    "shuffle":          { "label": "Shuffle Questions", "type": "boolean", "default": true },
    "pointsPerQuestion":{ "label": "Points per Question", "type": "number", "default": 10, "min": 1, "max": 100, "required": true }
  },
  "content": {
    "label": "Questions",
    "minItems": 3,
    "itemSchema": {
      "prompt":  { "label": "Question", "type": "textarea", "required": true },
      "optionA": { "label": "Option A", "type": "text", "required": true },
      "optionB": { "label": "Option B", "type": "text", "required": true },
      "optionC": { "label": "Option C", "type": "text", "required": false },
      "optionD": { "label": "Option D", "type": "text", "required": false },
      "correct": { "label": "Correct Option", "type": "enum", "options": ["A","B","C","D"], "required": true }
    }
  }
}
```
Supported field `type`s: `text`, `textarea`, `number`, `boolean`, `enum` (alias
`select`). The CreateGame form renders these automatically.

---

## 2. Engine Contract (game.js)

```js
window.onload = () => {
  WajibetSDK.init((resumeState) => {
    document.documentElement.dir = WajibetSDK.getDirection();
    const creation = WajibetSDK.getGameCreation();
    const settings = creation.config;   // teacher settings are stored under `config`
    const items = creation.content;     // each item has a permanent itemId

    if (resumeState) { /* jump to resumeState.currentItemIndex, restore currentScore;
                          remaining = itemBudgetMs - resumeState.elapsedMs */ }

    // On each answer, emit the FULL Tier 0 object:
    WajibetSDK.recordInteraction({
      itemId: item.itemId, itemIndex: i, type: 'multiple-choice',
      isCorrect, userAnswer, correctAnswer,
      score, maxScore, timeMs, attempts: 1, skipped: false,
      meta: { selectedOptionId }          // engine-specific → declared in metaStatsSchema
    });

    // At the end:
    WajibetSDK.finishGame(totalScore, totalTimeMs);  // SDK bundles answers + posts GAME_COMPLETE
  });
};
```

**The one unbreakable rule:** every `recordInteraction` call includes all 11 Tier 0
fields. Anything engine-specific goes under `meta{}` and must be declared in the
template's `metaStatsSchema` to surface in reports.

### review.html (optional)
```html
<script src="/sdk/wajibet-sdk.js"></script>
<script>
  WajibetSDK.onReviewData((interaction) => {
    // interaction is the FULL Tier 0 object (not just meta)
    // Render the student's userAnswer vs correctAnswer visually.
  });
</script>
```
Runs under `sandbox="allow-scripts"`; emits `REVIEW_READY` automatically via the SDK.

---

## 3. Lifecycle (who does what)

1. **Admin uploads** the zip → `gameTemplateController.uploadTemplate` extracts
   `engine/` to `/engines/<slug>`, stores `manifest` + `formSchema`, and (optionally)
   a `metaStatsSchema` for meta aggregation.
2. **Teacher creates a game** → `CreateGame.jsx` renders fields from
   `form-schema.json`. On save, `gameCreationController` stamps a permanent
   `itemId` (`q_` + 6 chars) on every content item.
3. **Teacher assigns** the game to a class → creates an `Assignment`.
4. **Student plays** → `PlayGame.jsx` mounts the engine iframe → SDK handshake
   delivers `gameCreation` + direction/locale/resume → engine emits Tier 0
   interactions → `finishGame` bundles them → PlayGame POSTs `/api/results`.
5. **Stats** → `gameStatsService` computes student + global + meta stats from Tier 0.
6. **Teacher reviews** → `ResultDetail.jsx` mounts each engine's sandboxed
   `review.html` and replays each interaction (with 5s fallback to a Tier 0 table).

---

## 4. Do / Don't

**Do:** load `/sdk/wajibet-sdk.js`; read content via `getGameCreation()`; emit full
Tier 0; use CSS logical properties; keep all assets local.

**Don't:** listen for `INIT_GAME`; send `LIVE_ANSWER { correct, deltaMs }`; call
`finishGame` without recording interactions first; invent SDK methods (e.g.
`playSound` does not exist); read top-level Tier 0 fields out of `meta`.
