const fs = require('fs');
const path = require('path');
console.log('--- Test Batch 2: SDK & Delegated Review ---');

const sdkCode = fs.readFileSync(path.join(__dirname, 'public', 'sdk', 'wajibet-sdk.js'), 'utf-8');

// Test 1: SDK Methods and Contract Validation
console.log('\n--- Test 1: SDK Contract Validation ---');
let hostMessages = [];

// Mock global environment
global.window = {
    addEventListener: (event, cb) => {
        if (!global.window.listeners) global.window.listeners = {};
        if (!global.window.listeners[event]) global.window.listeners[event] = [];
        global.window.listeners[event].push(cb);
    },
    removeEventListener: (event, cb) => {
        if (global.window.listeners && global.window.listeners[event]) {
            global.window.listeners[event] = global.window.listeners[event].filter(l => l !== cb);
        }
    },
    postMessage: (msg, target) => {
        if (global.window.listeners && global.window.listeners['message']) {
            global.window.listeners['message'].forEach(cb => cb({ data: msg }));
        }
    },
    parent: {
        postMessage: (msg, target) => {
            hostMessages.push(msg);
        }
    }
};

// Evaluate SDK in the global scope
eval(sdkCode);
const sdk = global.window.WajibetSDK;

// Test Init
sdk.init((resumeState) => {
    console.log('Init callback fired with state:', resumeState);
});

if (hostMessages.length > 0 && hostMessages[0].type === 'GAME_INIT') {
    console.log('Init GAME_INIT signal sent: PASS');
} else {
    console.log('Init GAME_INIT signal sent: FAIL', hostMessages);
}
hostMessages = [];

// Simulate Host Reply
window.postMessage({ type: 'GAME_INIT_ACK', payload: { direction: 'rtl', locale: 'ar' } }, '*');
// JSDOM postMessage is async-ish, wait a tick
setTimeout(() => {
    if (sdk.getDirection() === 'rtl' && sdk.getLocale() === 'ar') {
        console.log('SDK received host config (RTL/ar): PASS');
    } else {
        console.log('SDK received host config: FAIL');
    }

    // Test recordInteraction Validation (Missing fields)
    let caughtError = false;
    try {
        sdk.recordInteraction({ score: 10 });
    } catch (e) {
        caughtError = true;
    }
    console.log('SDK catches missing Tier 0 fields (fail loud):', caughtError ? 'PASS' : 'FAIL');

    // Test recordInteraction Success
    sdk.recordInteraction({
        itemId: 'q1', itemIndex: 0, type: 'mc', isCorrect: true,
        userAnswer: 'A', correctAnswer: 'A', score: 1, maxScore: 1,
        timeMs: 1000, attempts: 1, skipped: false
    });

    if (hostMessages.length > 0 && hostMessages[0].type === 'LIVE_ANSWER') {
        console.log('Valid interaction triggers LIVE_ANSWER: PASS');
    } else {
        console.log('Valid interaction triggers LIVE_ANSWER: FAIL', hostMessages);
    }
    hostMessages = [];

    // Test finishGame
    sdk.finishGame(10, 5000);
    if (hostMessages.length > 0 && hostMessages[0].type === 'GAME_COMPLETE') {
        console.log('finishGame triggers GAME_COMPLETE: PASS');
    } else {
        console.log('finishGame triggers GAME_COMPLETE: FAIL', hostMessages);
    }

    // Test Delegated Review
    console.log('\n--- Test 2: Delegated Review (REVIEW_INIT) ---');
    let reviewMeta = null;
    sdk.onReviewData((meta) => {
        reviewMeta = meta;
    });

    window.postMessage({ type: 'REVIEW_INIT', payload: { mistake: 'syntax error' } }, '*');
    
    setTimeout(() => {
        if (reviewMeta && reviewMeta.mistake === 'syntax error') {
            console.log('SDK receives REVIEW_INIT data: PASS');
        } else {
            console.log('SDK receives REVIEW_INIT data: FAIL');
        }
        console.log('\nAll Batch 2 SDK tests completed.');
    }, 50);

}, 50);
