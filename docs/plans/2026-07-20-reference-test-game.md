# Reference Test Game — "Wajibet Reference Quiz"

> A deliberately minimal, 100%-correct multiple-choice game that exercises the
> ENTIRE corrected pipeline. It is both the validation harness for the correction
> plan and the canonical example the guides point to.

**Build location:** `client/public/games/reference-quiz/` (source), zipped for upload.

**Prerequisite:** Phases 1–4 of `2026-07-20-game-core-correction-plan.md` must be done
first — on the current broken code this game fails at save (400).

---

## Files

```
reference-quiz/
  manifest.json
  form-schema.json
  engine/
    index.html
    game.js
    style.css
    review.html
```

### manifest.json
```json
{
  "name": "Wajibet Reference Quiz",
  "description": "Canonical reference multiple-choice game for the v2 contract.",
  "attemptPolicy": "multiple",
  "xp": {
    "assignment": { "enabled": true, "amount": 50, "firstAttemptOnly": true },
    "online": { "enabled": true, "amount": 25 }
  },
  "limits": { "maxCreationsPerTeacher": 100 },
  "assets": { "maxImagesPerCreation": 0 }
}
```

### form-schema.json
`settings`: `shuffle` (boolean), `pointsPerQuestion` (number, default 10).
`content.itemSchema`: `prompt` (textarea), `optionA..D` (text; C/D optional),
`correct` (enum A–D). `minItems: 3`.

### engine/game.js (behaviour)
- `WajibetSDK.init` → apply direction, read `getGameCreation()`, honor `resumeState`.
- Per question: on answer or timeout, call `recordInteraction` with **all 11 Tier 0
  fields** + `meta: { selectedOptionId }`. `score` = `pointsPerQuestion` if correct
  else 0; `maxScore` = `pointsPerQuestion`.
- After the last question: `finishGame(totalScore, totalTimeMs)`.

### engine/review.html
- Loads SDK, `onReviewData((interaction) => …)`.
- Renders the four options; student's `userAnswer` red if wrong, `correctAnswer` green.
- Reads Tier 0 fields at top level (NOT from `meta`).

### style.css
- CSS logical properties only (`margin-inline-*`, `inset-inline-*`) so RTL mirrors.
- Background via CSS gradient (no raster assets).

---

## Template metaStatsSchema (set on the template after upload)
```json
[{ "key": "selectedOptionId", "label": "Chosen option", "aggregation": "frequency" }]
```
Proves the generic meta-aggregation path end-to-end.

---

## Acceptance Checklist (this is the proof Plan 1 worked)

1. **Upload** the zip → template appears in the admin list; `enginePath` set.
2. **Create** a game with 3 questions → GameCreation in Mongo has 3 items, each with
   a unique `itemId`.
3. **Play** as a student → POST `/api/results` succeeds; the saved `GameResult` has a
   full `answers[]` (Tier 0) and `statsIncomplete: false`.
4. **computeStudentStats** returns correct per-item accuracy/time by hand-check.
5. **computeGameGlobalStats** flags the intended hardest item as `stumblingBlock`.
6. **computeMetaStats** returns a correct `frequency` map for `selectedOptionId`.
7. **Review**: teacher expands a student row → `review.html` loads under
   `sandbox="allow-scripts"`; `parent.document` throws SecurityError; replay is correct.
8. **Fallback**: sabotage `review.html` (throw before `REVIEW_READY`) → after 5s the
   Tier 0 fallback table renders.
9. **Live**: 3 students; disconnect one mid-item → reconnect lands on the same item
   with correct `remainingMs`; others unaffected; no double-skip.
10. **i18n**: renders correctly in Arabic (RTL) and French (LTR).
11. **Preview** (after Phase 7): play through the wizard preview → ZERO `GameResult`
    rows created; `console.debug` logs present.

Passing 1–11 means the platform matches the canonical v2 blueprint.
