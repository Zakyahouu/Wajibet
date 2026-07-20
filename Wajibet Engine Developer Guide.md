# Wajibet Engine Developer Guide

This document is the absolute source of truth for developing custom game engines for the Wajibet Platform (V2 Architecture). 

A Wajibet Game is a completely decoupled HTML/JS/CSS application that communicates with the Wajibet host platform via a strict `WajibetSDK` contract.

---

## 1. Bundle Structure
When you upload a game to the Wajibet platform, you must upload a `.zip` file containing exactly this structure at its root:

```text
/manifest.json       (Required)
/form-schema.json    (Required)
/engine/             (Required)
  /index.html        (Entry point)
  /style.css         (Styles)
  /game.js           (Logic)
  /review.html       (Optional, for Delegated Review)
```

### 1.1 `manifest.json`
Defines the metadata and backend constraints of the game.
```json
{
  "name": "My Custom Game",
  "description": "A description of the game mechanics.",
  "attemptPolicy": "multiple",
  "xp": {
    "assignment": { "enabled": true, "amount": 100, "firstAttemptOnly": true },
    "online": { "enabled": true, "amount": 50 }
  },
  "limits": {
    "maxCreationsPerTeacher": 100
  },
  "assets": {
    "maxImagesPerCreation": 5
  }
}
```

### 1.2 `form-schema.json`
Defines the dynamic settings and content fields that the Teacher can configure in the Game Wizard.

```json
{
  "settings": {
    "difficulty": {
      "label": "Starting Difficulty",
      "type": "select",
      "options": ["easy", "normal", "hard"],
      "default": "normal",
      "required": true
    }
  },
  "content": {
    "label": "Memory Cards",
    "itemSchema": {
      "term": {
        "label": "Front of Card",
        "type": "text",
        "required": true
      },
      "definition": {
        "label": "Back of Card",
        "type": "text",
        "required": true
      }
    }
  }
}
```

---

## 2. Engine Requirements

All logic, visuals, and HTML must be placed inside the `engine/` folder.

### 2.1 The Entry Point (`index.html`)
Your `index.html` must load the SDK provided by the platform:
```html
<script src="/sdk/wajibet-sdk.js"></script>
```

### 2.2 UI & RTL Requirements (`style.css`)
Wajibet supports both Arabic (RTL) and English (LTR). 
- **CRITICAL:** Do NOT use `margin-left`, `padding-right`, `left`, `right`.
- **INSTEAD:** Use CSS Logical Properties (`margin-inline-start`, `padding-inline-end`, `inset-inline-start`).
The platform will automatically flip the layout perfectly if you use logical properties.

### 2.3 Initialization (`game.js`)
You must NOT start the game immediately. You must wait for the host platform to inject the settings (and potential resume state).

```javascript
window.onload = () => {
  WajibetSDK.init((resumeState) => {
    // 1. Apply Document Direction
    document.documentElement.dir = WajibetSDK.getDirection();
    
    // 2. Handle State Recovery
    if (resumeState) {
      // resumeState contains: { currentItemIndex, currentScore, elapsedMs }
      // Example: Skip ahead to the level the student was on
      currentLevel = resumeState.currentItemIndex;
      score = resumeState.currentScore;
    }

    // 3. Start your game loop
    startGame();
  });
};
```

### 2.4 Telemetry Contract (Tier 0)
Every time a student answers a question, clears a level, or performs an action, you MUST report it using the exact Tier 0 Contract.

```javascript
WajibetSDK.recordInteraction({
  itemId: "q_123",            // String: Unique identifier for the question/level
  itemIndex: 0,               // Number: Sequential index (0, 1, 2...)
  type: "multiple-choice",    // String: Type of interaction
  isCorrect: true,            // Boolean: Did they get it right?
  userAnswer: "Paris",        // String: What the user selected/inputted
  correctAnswer: "Paris",     // String: The expected correct answer
  score: 10,                  // Number: Points awarded for this interaction
  maxScore: 10,               // Number: Maximum possible points for this interaction
  timeMs: 4500,               // Number: Milliseconds taken to answer
  attempts: 1,                // Number: How many tries it took
  skipped: false              // Boolean: Did they skip it?
});
```

### 2.5 Game Completion
When the game is fully complete, you must notify the platform:
```javascript
WajibetSDK.finishGame(totalScore, totalTimeMs);
```

---

## 3. Delegated Review (Optional but Recommended)
To allow teachers to replay exactly what the student did:
1. Create `engine/review.html`.
2. Load the SDK: `<script src="/sdk/wajibet-sdk.js"></script>`.
3. Catch the replay data and render it:
```javascript
WajibetSDK.onReviewData((meta) => {
  // meta is the EXACT object you sent in recordInteraction()
  // Reconstruct the UI visually for the teacher to see!
  if (meta.isCorrect) {
     document.body.innerHTML = `Student answered correctly: ${meta.userAnswer}`;
  }
});
```
