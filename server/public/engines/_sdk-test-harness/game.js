const logEl = document.getElementById('log');
const controlsEl = document.getElementById('controls');

function log(msg) {
    logEl.textContent += msg + '\n';
}

let itemCounter = 0;
let score = 0;

window.WajibetSDK.init((resumeState) => {
    log(`Initialized! Direction: ${window.WajibetSDK.getDirection()}, Locale: ${window.WajibetSDK.getLocale()}`);
    log(`Resume state: ${JSON.stringify(resumeState)}`);
    controlsEl.style.display = 'block';
});

document.getElementById('btn-correct').addEventListener('click', () => {
    itemCounter++;
    score += 10;
    try {
        window.WajibetSDK.recordInteraction({
            itemId: `q_test_${itemCounter}`,
            itemIndex: itemCounter - 1,
            type: 'multiple-choice',
            isCorrect: true,
            userAnswer: 'A',
            correctAnswer: 'A',
            score: 10,
            maxScore: 10,
            timeMs: 2500,
            attempts: 1,
            skipped: false,
            meta: {
                selectedOptionId: 'opt_1',
                hintsUsed: 0
            }
        });
        log(`Recorded correct answer for item ${itemCounter}`);
    } catch (e) {
        log(`Error recording: ${e.message}`);
    }
});

document.getElementById('btn-wrong').addEventListener('click', () => {
    itemCounter++;
    try {
        window.WajibetSDK.recordInteraction({
            itemId: `q_test_${itemCounter}`,
            itemIndex: itemCounter - 1,
            type: 'multiple-choice',
            isCorrect: false,
            userAnswer: 'B',
            correctAnswer: 'A',
            score: 0,
            maxScore: 10,
            timeMs: 3500,
            attempts: 1,
            skipped: false,
            meta: {
                selectedOptionId: 'opt_2',
                hintsUsed: 1
            }
        });
        log(`Recorded wrong answer for item ${itemCounter}`);
    } catch (e) {
        log(`Error recording: ${e.message}`);
    }
});

document.getElementById('btn-finish').addEventListener('click', () => {
    try {
        window.WajibetSDK.finishGame(score, 15000);
        log(`Sent finish signal. Score: ${score}, Time: 15s`);
    } catch (e) {
        log(`Error finishing: ${e.message}`);
    }
});
