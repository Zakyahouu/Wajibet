# Wajibet Engine Developer Guide (v2)

The source of truth for building game engines for the Wajibet platform. A Wajibet
game is a fully decoupled HTML/JS/CSS app that communicates with the host **only**
through the `WajibetSDK`. There is one protocol and one telemetry contract.

> Companion docs: `docs/plans/2026-07-20-game-creation-workflow.md` (lifecycle)
> and `docs/plans/2026-07-20-reference-test-game.md` (a complete worked example).

---

## 1. Bundle structure (zip root — no wrapper folder)

```
manifest.json
form-schema.json
engine/
  index.html      Entry point; loads /sdk/wajibet-sdk.js then game.js
  game.js         Logic
  style.css       CSS logical properties only (RTL-safe)
  review.html     Optional — delegated review replay
  assets/         Local assets only (no external CDNs)
```

### manifest.json
```json
{
  "name": "My Game",
  "description": "What the game does.",
  "attemptPolicy": "multiple",
  "xp": {
    "assignment": { "enabled": true, "amount": 50, "firstAttemptOnly": true },
    "online": { "enabled": true, "amount": 25 }
  },
  "limits": { "maxCreationsPerTeacher": 100 },
  "assets": { "maxImagesPerCreation": 0 }
}
```
The server derives the engine URL (`enginePath`) from the name on upload.

### form-schema.json
`settings` (types: `text`, `textarea`, `number`, `boolean`, `enum`) and
`content.itemSchema` (the per-item fields a teacher fills in). Set `minItems` to
enforce a minimum item count.

---

## 2. The SDK API (complete)

`window.WajibetSDK` exposes exactly:

| Method | Purpose |
|---|---|
| `init(onReady)` | Handshake. Calls `onReady(resumeState)` once the host sends config. |
| `getGameCreation()` | The saved game: teacher settings under `config`, items under `content`. |
| `getDirection()` | `'rtl'` or `'ltr'`. |
| `getLocale()` | e.g. `'en'`, `'ar'`. |
| `isPreviewMode()` | `true` inside the wizard's sandboxed preview. |
| `recordInteraction(obj)` | Report one answer (full Tier 0 object). Buffered by the SDK. |
| `finishGame(finalScore, totalTimeMs)` | End the game; the SDK bundles all buffered answers into `GAME_COMPLETE`. |
| `onReviewData(cb)` | In `review.html`: receive the full interaction to replay. |

**Do not invent methods.** (There is no `playSound`, etc.)

---

## 3. Lifecycle in code (game.js)

```js
window.onload = () => {
  WajibetSDK.init((resumeState) => {
    document.documentElement.dir = WajibetSDK.getDirection();
    const creation = WajibetSDK.getGameCreation();
    const settings = creation.config;   // teacher settings live under `config`
    const content  = creation.content;

    // Reconnect support (live sessions). resumeState may be null.
    // { currentItemIndex, currentScore, elapsedMs }.
    // remaining = itemBudgetMs - resumeState.elapsedMs
    let index = resumeState ? resumeState.currentItemIndex : 0;
    let score = resumeState ? resumeState.currentScore : 0;

    // ... run the game, and per answer:
    WajibetSDK.recordInteraction({
      itemId:        item.itemId,   // permanent, assigned by the platform at creation
      itemIndex:     index,
      type:          'multiple-choice',
      isCorrect:     correct,
      userAnswer:    chosen,
      correctAnswer: item.correct,
      score:         correct ? pts : 0,
      maxScore:      pts,
      timeMs:        elapsed,
      attempts:      1,
      skipped:       false,
      meta:          { selectedOptionId }   // optional, engine-specific
    });

    // ... when finished:
    WajibetSDK.finishGame(totalScore, totalTimeMs);
  });
};
```

### The Tier 0 contract (every field required)
`itemId, itemIndex, type, isCorrect, userAnswer, correctAnswer, score, maxScore,
timeMs, attempts, skipped`. Everything else goes under `meta`. The SDK throws in
development if a field is missing — fix the call, don't work around it.

### Meta stats
To surface a `meta` field in global reports, declare it on the template's
`metaStatsSchema`, e.g. `{ key: 'selectedOptionId', label: 'Chosen option',
aggregation: 'frequency' }`. Aggregations: `average`, `sum`, `frequency`,
`top_n`, `min_max`, `boolean_rate`.

---

## 4. Delegated review (review.html)

```html
<script src="/sdk/wajibet-sdk.js"></script>
<script>
  WajibetSDK.onReviewData((interaction) => {
    // interaction is the FULL Tier 0 object you recorded — top-level fields,
    // e.g. interaction.userAnswer, interaction.correctAnswer, interaction.isCorrect.
    // Draw the student's answer vs the correct one.
  });
</script>
```

The platform mounts this under `sandbox="allow-scripts"` (opaque origin — it
cannot read the parent's cookies/DOM). The SDK emits `REVIEW_READY` for you; the
platform replies with the interaction. If nothing renders within 5s, the platform
shows a built-in Tier 0 table instead.

---

## 5. RTL & preview

- Use CSS logical properties (`margin-inline-start`, `padding-inline-end`,
  `inset-inline-start`). Never `margin-left`/`right`/`left`. RTL mirrors for free.
- In the creation wizard's live preview, `isPreviewMode()` is `true` and the SDK
  silently swallows `recordInteraction`/`finishGame` (no ghost records). You don't
  need to special-case it, but you can read `isPreviewMode()` if useful.
