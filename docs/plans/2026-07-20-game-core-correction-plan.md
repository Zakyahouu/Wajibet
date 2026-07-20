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

- [ ] **6.1** Rewrite `client/src/components/admin/TemplateGuide.jsx` to describe
      Protocol A: SDK handshake, Tier 0 contract, `finishGame`, `review.html`,
      `metaStatsSchema`, preview mode. Remove all `INIT_GAME` / `{ index, correct, deltaMs }` content.
- [ ] **6.2** Write a fresh, correct `docs/Wajibet-Engine-Developer-Guide.md`
      (replaces the deleted wrong one) matching the fixed SDK exactly.
- [ ] **6.3** Delete duplicate timestamped engine folders under `server/public/engines/`;
      keep one clean copy per engine.

## Phase 7 — Wizard live preview (Batch 5 Task 3)

- [ ] **7.1** Re-add a sandboxed live-preview pane in the creation wizard that mounts
      the engine iframe and replies to `GAME_INIT` with `mode: 'preview'`, so the
      SDK's preview guard prevents ghost `GameResult` records.
- [ ] **7.2** Manual test: play through the preview → zero rows in the `GameResult`
      collection; `console.debug` logs present.

---

## Verification (run after Phases 1–4)

Build the reference test game (see `2026-07-20-reference-test-game.md`) and run its
acceptance checklist end-to-end. That single game exercises the whole corrected
pipeline: upload → create → play → save → stats → review.
