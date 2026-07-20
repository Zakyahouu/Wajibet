# Game-Core v2 Correction Plan

> **Goal:** Make the Wajibet game subsystem 100% consistent with the canonical
> v2 blueprint (`wajibet-game-core-plan_2.md`) by collapsing the codebase onto a
> single game-communication protocol (the WajibetSDK) and removing the legacy
> `INIT_GAME` protocol that the previous implementation left half-wired.

**Branch:** `fix/game-core-v2-consistency` (created from `feature/batch-5-wizard`).

**Status legend:** `[ ]` todo · `[x]` done.

---

## Root Cause

The codebase straddles **two incompatible protocols**:

- **Protocol A — SDK / v2 contract** (the target): engine sends `GAME_INIT`,
  parent replies `GAME_INIT_ACK { gameCreation, direction, locale, resumeState, mode }`;
  engine reports each answer via `recordInteraction` (full Tier 0 object) and
  ends with `finishGame` → `GAME_COMPLETE`.
- **Protocol B — legacy `INIT_GAME`** (must be removed): parent pushes
  `INIT_GAME`; engine sends `LIVE_ANSWER { correct, deltaMs }`, `LIVE_FINISH`,
  and `GAME_COMPLETE { gameCreationId, score, totalPossibleScore, answers[] }`.

`PlayGame.jsx` implements both halves but they don't compose. The SDK's
`finishGame` sends `{ score, timeMs }` with **no `answers` and no
`totalPossibleScore`**, while `gameResultController.submitGameResult` hard-rejects
any body missing `totalPossibleScore` (400). Result: SDK-built games cannot save
results, and no Tier 0 telemetry ever reaches the stats engine.

**Decision:** Protocol A (SDK) is the single source of truth. Protocol B is deleted.

---

## The Canonical Wire Contract (target end-state)

Handshake:
1. Engine → parent: `{ type: 'GAME_INIT' }`
2. Parent → engine: `{ type: 'GAME_INIT_ACK', payload: { gameCreation, direction, locale, resumeState, mode } }`
   - `mode`: `'live'` (real play) or `'preview'` (wizard sandbox).

Per-answer (engine → parent), full **Tier 0** object:
```js
{ itemId, itemIndex, type, isCorrect, userAnswer, correctAnswer,
  score, maxScore, timeMs, attempts, skipped, meta? }
```

Completion (engine → parent):
```js
{ type: 'GAME_COMPLETE',
  payload: { finalScore, totalTimeMs, answers: [<Tier 0>...], statsSchemaVersion: 1 } }
```

Review (teacher dashboard):
1. iframe (`sandbox="allow-scripts"` only) → parent: `{ type: 'REVIEW_READY' }`
2. parent → iframe: `{ type: 'REVIEW_INIT', payload: <full interaction object> }`
3. 5s timeout with no `REVIEW_READY` → parent shows Tier 0 fallback table.

---

## Phase 1 — Fix the SDK (`server/public/sdk/wajibet-sdk.js`)

The linchpin. Everything else depends on this being correct.

- [ ] **1.1** Add an internal `interactions = []` array and a `mode` field to `state`.
- [ ] **1.2** In `init`, read `mode` from the `GAME_INIT_ACK` payload (default `'live'`).
- [ ] **1.3** In `recordInteraction`: keep Tier 0 validation (throw in dev); push a
      copy of the interaction into `interactions[]`. If `mode === 'preview'`,
      `console.debug` and return WITHOUT posting. Otherwise post `LIVE_ANSWER`.
- [ ] **1.4** Rewrite `finishGame(finalScore, totalTimeMs)`: if `mode === 'preview'`,
      `console.debug` and return. Otherwise post
      `GAME_COMPLETE { finalScore, totalTimeMs, answers: interactions, statsSchemaVersion: 1 }`.
- [ ] **1.5** Add `isPreviewMode()` returning `state.mode === 'preview'`.
- [ ] **1.6** Keep `getGameCreation()` as the documented content accessor.
- [ ] **1.7** Manual test via `_sdk-test-harness`: init, record 3 interactions,
      finish → confirm one `GAME_COMPLETE` with a 3-element `answers` array.
      Preview mode → confirm zero postMessages, only `console.debug`.

## Phase 2 — Collapse PlayGame to Protocol A (`client/src/pages/PlayGame.jsx`)

- [ ] **2.1** Delete the `INIT_GAME` send in `handleIframeLoad` and its
      `content.slice(resumeState.currentItemIndex)` hack (the engine handles resume).
- [ ] **2.2** Keep `GAME_INIT` → `GAME_INIT_ACK`; always include `gameCreation`,
      `resumeState`, and `mode: 'live'` in the ACK payload.
- [ ] **2.3** Rewrite the `GAME_COMPLETE` handler to build the `/api/results` body:
      `{ gameCreationId, score: finalScore, totalPossibleScore, answers, totalTimeMs, finalScore, statsSchemaVersion }`
      where `totalPossibleScore = sum(answers[].maxScore)` (fallback to
      `gameCreation.content.length` if answers empty).
- [ ] **2.4** Remove the now-dead `LIVE_FINISH` branch (leaderboard uses `LIVE_ANSWER`).
- [ ] **2.5** Manual test: play a fixed engine start-to-finish → result row appears
      in Mongo with a full `answers[]` and `statsIncomplete: false`.

## Phase 3 — Align the backend (`server/controllers/gameResultController.js`)

- [ ] **3.1** Accept `finalScore` / `totalTimeMs` as first-class fields.
- [ ] **3.2** When `totalPossibleScore` is absent but `answers` is present, derive it
      server-side from `sum(answers[].maxScore)`; only 400 when neither is available.
- [ ] **3.3** Confirm existing jest suite still passes (`npm test` in `server/`).

## Phase 4 — Fix Delegated Review (`client/src/components/teacher/ResultDetail.jsx`)

- [ ] **4.1** Change `sandbox` to `"allow-scripts"` **only** (remove `allow-same-origin`).
- [ ] **4.2** Wait for a `REVIEW_READY` message from the iframe before posting review data.
- [ ] **4.3** Post `REVIEW_INIT` with the **full interaction object** (not just `.meta`).
- [ ] **4.4** Add a 5-second handshake timeout → unmount iframe, render a styled Tier 0
      fallback table (`userAnswer`, `correctAnswer`, `isCorrect`, `timeMs`, `score`).
- [ ] **4.5** Manual test: review renders; sabotaged `review.html` → fallback after 5s;
      `parent.document` from the iframe throws SecurityError.

## Phase 5 — Fix live resume (`server/socket/socketHandler.js`)

Resolved contract: `{ currentItemIndex, currentScore, elapsedMs }`. The server
cannot compute *remaining* time (per-item budget is engine-specific), so it emits
`elapsedMs` = time already spent on the current item; the engine subtracts it from
its own budget. The code already emits `elapsedMs` consistently at both rejoin
paths — verified by `server/test-batch-3.js`.

- [x] **5.1** Both `live:resume-state` emit sites use the identical
      `{ currentItemIndex, currentScore, elapsedMs }` shape; comments clarify semantics.
- [x] **5.2** Double-resume removed in Phase 2 (PlayGame no longer slices content).
- [x] **5.3** `test-batch-3.js` green: disconnect → paused; reconnect → same item with
      elapsed restored; pause-cap auto-skip; host disconnect keeps room alive.

## Phase 6 — Fix the guides & clean up

- [x] **6.1** Rewrote `client/src/components/admin/TemplateGuide.jsx` to Protocol A:
      SDK handshake, Tier 0 contract, `finishGame`, `review.html`, `metaStatsSchema`,
      preview mode. All `INIT_GAME` / `{ index, correct, deltaMs }` content removed.
- [x] **6.2** Wrote a fresh `docs/Wajibet-Engine-Developer-Guide.md` matching the fixed SDK.
- [ ] **6.3** DEFERRED (manual, needs DB verification). `server/public/engines/`
      holds both clean-named retrofit copies and timestamped upload dirs. Uploaded
      `GameTemplate` records store `enginePath` pointing at a timestamped dir, so a
      folder can only be safely removed after confirming no template references it:
      ```
      // in mongosh against the madrassaplay DB
      db.gametemplates.find({}, { name: 1, enginePath: 1 })
      ```
      Delete only folders that appear in NO `enginePath`. (All engine folders are in
      git, so any deletion is recoverable.)

## Phase 7 — Wizard live preview (Batch 5 Task 3) — OPTIONAL, DEFERRED

The safety-critical half is DONE: the SDK's preview guard (Phase 1) silently
swallows `recordInteraction`/`finishGame` when the host answers `GAME_INIT` with
`mode: 'preview'`. Verified in Node (0 postMessages in preview mode).

The remaining half is a UI feature the previous AI deliberately removed
(commit `5ec33e3` "drop live preview logic"). `CreateGame.jsx` is a 2-step wizard
with no preview pane. Re-adding it is a feature addition, not a bug fix.

- [ ] **7.1** Add a preview pane (Step 3 or split view) that mounts the target
      engine iframe, builds a draft `gameCreation` from the current form state, and
      replies to `GAME_INIT` with `{ ..., mode: 'preview' }`.
- [ ] **7.2** Manual test: play the preview → zero `GameResult` rows; `console.debug`
      logs present.

---

## Engine reality (recorded during Phase 7)

Per the canonical plan, legacy engines are **retired and recreated from scratch**
under the new contract — not piecemeal-patched.

- `multiple-choice-quiz`: shipped by the previous AI **syntactically broken**
  (unbalanced braces; `node --check` fails at EOF). A partial init fix was reverted
  to avoid a misleading half-fixed non-compiling file. Recreate using
  `reference-quiz` as the template.
- `arithmetic-sprint`, `word-builder`: not wired to the SDK (no `wajibet-sdk.js`
  load, no `WajibetSDK.init`). Recreate under the v2 contract.
- The previous AI's broken sample bundles remain for reference and are superseded by
  `reference-quiz`: `client/public/games/quiz-game` (Quiz Master — calls a
  non-existent `WajibetSDK.playSound`), `client/public/games/test-game` (Memory
  Matrix), and the `server/public/engines/quiz-master-*` upload. Remove after DB
  verification (same caveat as 6.3).

---

## Verification (run after Phases 1–4)

Build the reference test game (see `2026-07-20-reference-test-game.md`) and run its
acceptance checklist end-to-end. That single game exercises the whole corrected
pipeline: upload → create → play → save → stats → review.
