# Wajibet v2 — Developer Technical Specification & Integration Guide

This is the definitive technical guide for building game engines on the Wajibet platform. It reflects the platform's actual, verified behavior (checked directly against the codebase on `fix/game-core-v2-consistency`, including the offline-resume, XP, and cleanup fixes agreed alongside this guide) — not an idealized description.

---

## 0. Unified Play-Style Rules (apply to every game, no exceptions)

- **Responsive by default.** Every game must play correctly on phone, tablet, and laptop — no fixed pixel layouts assuming a desktop screen.
- **Never auto-start.** Show a Start screen/button; gameplay begins only on an explicit tap. This applies even if `resumeState` is present — show a "Continue" screen instead of silently resuming.
- **Light theme, well-matched palette.** No black/dark backgrounds as the default look. Pick an intentional, non-generic color system (see Map Pin Geography's atlas/navy/parchment palette as a reference).
- **Two-step confirm for every answer-submitting interaction** (map clicks, drag-drop, tile selection, multiple choice, anything). The student marks/selects their answer first, then taps a separate Confirm/Submit button. Never submit on the first click/tap — this exists specifically to protect against mis-clicks.
- **Consistent HUD layout** — progress ("Item 3/10"), running score, and timer (if any) always occupy the same relative position, so switching between different subject games feels familiar.
- **"Next" after feedback is also an explicit tap**, never automatic — same reasoning as the confirm rule: keep pacing under the student's control.
- **Feedback pairs color with text/icon, never color alone** (colorblind-safe correct/incorrect/partial states).
- **RTL rule of thumb:** interface chrome and text always mirror for Arabic; real-world spatial content (maps, diagrams, anything depicting an actual sequence or position) does not get mirrored automatically. Document explicitly, per game, which of its elements are "language-direction" vs "spatial-truth."
- **No audio-dependent questions.** Sound may supplement, but the game must be fully playable and answerable with sound off.
- **Touch targets sized for fingers, not just cursors** — every tappable control, not only Confirm/Next.
- **Consistent end-screen shape** — score, accuracy %, time spent, in the same structural layout across all games.
- **Keyboard/focus-visible support for every button-based action**, even when the core interaction (a map click, a drag) is inherently pointer/touch-only.

---

## 1. Core Architecture & Strict Principles

Wajibet is a unified hub for **Live Multiplayer Sessions** (real-time, in a classroom, via Socket.io) and **Offline Assignments** (async homework). Your game engine is an isolated frontend application that runs **inside an iframe** hosted by the Wajibet platform page.

**STRICT RULES FOR ENGINES:**

1. **No Backend Code.** Engines are HTML/JS/CSS only. No Node.js, no databases in your bundle.
2. **The SDK is the Only Bridge.** Your engine communicates with the host exclusively via `WajibetSDK`, which itself talks to the host page through `window.postMessage` across the iframe boundary. Never call `fetch()` against Wajibet's own APIs, and never open a WebSocket yourself.
3. **No External CDNs.** All images, sounds, and scripts (except the injected `wajibet-sdk.js`) must be local to your `engine/` folder.
4. **Data Continuity — how it actually works.** The platform gives your engine a `resumeState` payload when a student returns to an in-progress attempt, in **both** modes:
   - **Live sessions:** if a student disconnects and reconnects while a session is running, the server tracks their exact position/score in real time and hands it back on rejoin.
   - **Offline assignments:** the platform periodically checkpoints the student's progress (roughly every few answers, and on tab-close) and restores it the next time they open the assignment. This is checked less aggressively than live sessions (it doesn't need to be — nothing is time-critical in an assignment), so a student who submits an answer and closes the tab within the same few seconds could, in rare cases, lose that last unsaved answer. This is an accepted tradeoff, not a bug.
   - In both cases, `resumeState` arrives in the exact same shape: `{ currentItemIndex, currentScore, elapsedMs }`. Your engine handles both identically — you never need to know or care which mode produced it.
5. **Nothing is persisted to the platform's database until `finishGame()` is called.** Per-answer calls to `recordInteraction()` update the live leaderboard in real time (live sessions only) and are buffered in the engine's own session memory, but the authoritative save happens once, at the end, when you call `finishGame()`. Call it as soon as the student's final answer is in — don't leave the game "technically still running" longer than necessary.

---

## 2. The Game Bundle Structure

Admins install your game as a `.zip` file with this structure at the root (no enclosing folder):

```text
manifest.json        (MANDATORY)
form-schema.json     (MANDATORY)
engine/              (MANDATORY)
  ├── index.html     (MANDATORY: Main game entry)
  ├── game.js        (MANDATORY: Your core logic)
  ├── style.css      (MANDATORY: Stylesheet)
  ├── review.html    (MANDATORY: Past-session review UI)
  └── assets/        (Optional: images, sounds)
```

> **Note:** The upload step currently validates that `manifest.json`, `form-schema.json`, and an `engine/` folder are present, but does **not** verify that `index.html`, `game.js`, `style.css`, or `review.html` individually exist inside `engine/`. They are still required by contract — a missing `review.html`, for instance, will simply produce a broken/blank review screen later rather than a rejected upload. Build to the full spec regardless of what the uploader currently checks.

---

## 3. The `manifest.json` Specification

```json
{
  "name": "Wajibet Reference Quiz",
  "description": "Detailed description of the game's mechanics.",
  "version": "1.0.0",

  "attemptPolicy": "first_only",

  "xp": {
    "assignment": {
      "enabled": true,
      "amount": 50,
      "firstAttemptOnly": true
    },
    "online": {
      "enabled": true,
      "amount": 25
    }
  },

  "limits": {
    "maxCreationsPerTeacher": 100
  },

  "assets": {
    "maxImagesPerCreation": 50
  },

  "platformIntegration": {},
  "gamification": {}
}
```

### Field Breakdown

- **`name`** *(String, Required)*: Title shown to teachers.
- **`description`** *(String, Required)*: How the game works.
- **`version`** *(String, Optional)*: Engine version.
- **`attemptPolicy`** *(Enum, exactly two valid values — this is a hard server-side enum, anything else is rejected)*:
  - `"first_only"` (default) — Only the student's first attempt for a given assignment counts toward the grade/completion; later replays don't overwrite it.
  - `"all"` — Every submitted attempt counts. (How many attempts a student is *allowed* to make at all is a separate, teacher-configured setting on the assignment itself — `attemptLimit` — not something your engine or template controls.)
- **`xp` — how XP is actually calculated:**
  - XP is **performance-scaled**, not flat: a student earns `amount × max(20%, score%)`, i.e. a genuine attempt always earns at least a fifth of the base amount, and a perfect score earns the full amount.
  - **`xp.assignment.enabled`** *(Boolean)*: turns assignment XP on/off for this template.
  - **`xp.assignment.amount`** *(Number)*: base XP for a perfect score.
  - **`xp.assignment.firstAttemptOnly`** *(Boolean)*: controls **which** anti-farming rule applies, independently of `attemptPolicy` above:
    - `true` — XP is only ever awarded for the student's very first attempt at this assignment+game, full stop, regardless of later replays or scores.
    - `false` — "best attempt" mode: each new attempt only earns the *improvement* over the student's best score so far on this assignment+game. A student who scores 40%, then 80%, then 80% again earns XP for the 40% and for the jump to 80%, but nothing for the repeat. Total lifetime XP for one assignment+game is capped at the base `amount` either way — there's no way to farm XP by repeating the same score.
  - **`xp.online`**: same shape, applied at the end of a live session instead. Live XP includes a small rank bonus (1st/2nd/3rd place earn a bonus on top of the base amount) since live sessions are competitive by nature.
- **`limits.maxCreationsPerTeacher`** *(Number)*: caps unique quizzes per teacher for this template. Enforced server-side.
- **`assets.maxImagesPerCreation`** *(Number)*: caps images per creation (`0` if your game doesn't use images). Enforced server-side.

---

## 4. The `form-schema.json` Specification

Unchanged from prior guidance — generates the teacher-facing creation UI. Two root keys: `settings` (global config) and `content` (repeating items).

```json
{
  "settings": {
    "pointsPerQuestion": {
      "label": "Points per Question",
      "type": "number",
      "default": 10,
      "min": 1,
      "max": 100,
      "required": true
    },
    "shuffle": {
      "label": "Shuffle Questions",
      "type": "boolean",
      "default": true
    },
    "themeColor": {
      "label": "Theme Color",
      "type": "color",
      "default": "#3B82F6"
    }
  },
  "content": {
    "label": "Questions",
    "minItems": 1,
    "itemSchema": {
      "prompt": {
        "label": "Question",
        "type": "textarea",
        "rows": 3,
        "required": true
      },
      "backgroundImage": {
        "label": "Background Image",
        "type": "image",
        "accept": ["image/png", "image/jpeg"]
      },
      "correctOption": {
        "label": "Correct Option",
        "type": "enum",
        "options": ["A", "B", "C", "D"],
        "default": "A",
        "required": true
      }
    }
  }
}
```

**Important naming note:** whatever you name a field under `settings` in `form-schema.json`, the *stored* data on the created game instance always lives under a top-level key called **`config`** (not `settings`) — see section 5A below. `settings` is only the schema-definition key; `config` is the runtime data key.

### Supported `type` values

1. **`text`** — standard text input.
2. **`number`** — supports `min`/`max`.
3. **`textarea`** — supports `rows`.
4. **`boolean`** — toggle/checkbox.
5. **`enum`** (or `select`) — dropdown; requires an `options` array.
6. **`color`** — hex color picker.
7. **`image`** — single-image uploader; returns a URL string. Supports `accept`; max 10MB/file.
8. **`imageArray`** — multi-image uploader; returns an array of URL strings.
9. **`mapPoint`** — combined image upload + click-to-place picker: teacher uploads an image, clicks directly on it to set the correct location, and drags a radius slider for acceptable tolerance. Stores one object: `{ imageUrl, xPercent, yPercent, radiusPercent }`, where `xPercent`/`yPercent`/`radiusPercent` are always relative to the image itself, never the surrounding frame. Supports `accept`, `radiusMin`, `radiusMax`, `radiusDefault`.

*(Every field supports `label`, `required`, `default`, and `placeholder`.)*

---

## 5. Client Integration: `engine/game.js`

### A. Initialization

```html
<script src="/sdk/wajibet-sdk.js"></script>
```

```javascript
WajibetSDK.init(function (resumeState) {
  // 1. Mandatory: set text direction for Arabic/RTL support.
  document.documentElement.dir = WajibetSDK.getDirection();

  // 2. Extract data. Note: use `config`, not `settings`, for the settings payload —
  //    `settings` is only the form-schema definition key, the runtime field is `config`.
  const creation = WajibetSDK.getGameCreation();
  const settings = creation.config;   // Everything defined in form-schema 'settings'
  const content  = creation.content;  // Everything defined in form-schema 'content'

  // 3. Handle resume — works identically whether this came from a live session
  //    reconnect or an offline-assignment checkpoint. Contains:
  //    { currentItemIndex, currentScore, elapsedMs }.
  if (resumeState) {
    jumpToQuestion(resumeState.currentItemIndex);
  } else {
    startGame(content, settings);
  }
});
```

There is no "preview mode" to account for — the SDK always behaves the same way regardless of context. You do not need to check for or handle any kind of preview/sandbox state; if a teacher wants to see how the game plays, they play it the same way a student would.

### B. Recording Telemetry — the Tier 0 Contract

Call this at the moment a student answers each question. The SDK **enforces** the following fields and will throw a hard error if any are missing — this is intentional fail-loud behavior so contract violations are caught during development, not silently dropped in production:

```
itemId, itemIndex, type, isCorrect, userAnswer, correctAnswer,
score, maxScore, timeMs, attempts, skipped
```

```javascript
WajibetSDK.recordInteraction({
  itemId: content[currentIndex].id,   // Unique ID from the platform
  itemIndex: currentIndex,            // 0-based
  type: "multiple-choice",            // Interaction type
  isCorrect: true,
  userAnswer: "Option A",
  correctAnswer: "Option A",
  score: 10,
  maxScore: 10,
  timeMs: 4500,
  attempts: 1,
  skipped: false,
  meta: {                             // Optional, engine-specific
    clickedCoordinates: { x: 10, y: 20 }
  }
});
```

**What this call actually does, precisely:**
- Always buffers the interaction in the engine's in-memory session (used later by `finishGame()`).
- **In a live session only**, also immediately forwards a copy to the platform for the real-time leaderboard.
- **Does not, by itself, persist anything to the database.** The database write happens once, when `finishGame()` runs. In an offline assignment, the platform separately checkpoints your progress in the background (see section 1, point 4) — but that's a platform-level safety net, not something `recordInteraction()` triggers directly. Don't design your engine assuming every single answer is immediately durable; make sure `finishGame()` is reliably reached when the student completes the game.

### C. Finishing

```javascript
WajibetSDK.finishGame(totalScore, totalTimeMs);
```

This is the point where the full answers array is sent to the host and persisted. Call it exactly once, right when the game genuinely ends.

---

## 6. The `engine/review.html` UI (MANDATORY)

Required so teachers/students can review a past attempt. The platform loads this file in an iframe and feeds it the exact telemetry object saved earlier via `recordInteraction()`.

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="style.css" />
  <script src="/sdk/wajibet-sdk.js"></script>
</head>
<body>
  <div id="review-card" class="card">
    <h2 id="result-status"></h2>
    <p>Student answered: <strong id="student-ans"></strong></p>
    <p>Correct answer: <strong id="correct-ans"></strong></p>
    <p>Time spent: <span id="time-spent"></span>s</p>
  </div>

  <script>
    WajibetSDK.onReviewData(function (interaction) {
      document.documentElement.dir = WajibetSDK.getDirection();

      document.getElementById('result-status').innerText = interaction.isCorrect ? "Correct" : "Wrong";
      document.getElementById('student-ans').innerText = interaction.userAnswer;
      document.getElementById('correct-ans').innerText = interaction.correctAnswer;
      document.getElementById('time-spent').innerText = (interaction.timeMs / 1000).toFixed(1);

      // Use interaction.meta here to reconstruct engine-specific visual states,
      // e.g. showing exactly where the student clicked.
    });
  </script>
</body>
</html>
```

If the platform never receives a `REVIEW_READY` announcement from your `review.html` within a few seconds, it falls back to a generic review UI — so make sure `WajibetSDK.onReviewData(...)` is wired up as early as possible in your page load.

---

By following this specification, your games will work correctly in live classrooms and offline assignments alike, with resume support and fair XP in both, and without writing a single line of backend code.
