const fs = require('fs');
const path = require('path');

const gamesDir = path.join(__dirname, 'client/public/games');
const games = fs.readdirSync(gamesDir).filter(f => fs.statSync(path.join(gamesDir, f)).isDirectory());

const requiredFiles = ['manifest.json', 'form-schema.json', 'engine/index.html', 'engine/game.js', 'engine/style.css'];

console.log('Auditing Games...');

games.forEach(game => {
    console.log(`\n--- ${game} ---`);
    const gamePath = path.join(gamesDir, game);
    
    // Check required files
    requiredFiles.forEach(file => {
        if (!fs.existsSync(path.join(gamePath, file))) {
            console.log(`MISSING: ${file}`);
        }
    });

    // Check SDK inclusion in index.html
    const indexPath = path.join(gamePath, 'engine/index.html');
    if (fs.existsSync(indexPath)) {
        const indexContent = fs.readFileSync(indexPath, 'utf-8');
        if (!indexContent.includes('wajibet-sdk.js')) {
            console.log('SDK MISSING: wajibet-sdk.js not found in index.html');
        }
    }

    // Check game.js for interactions
    const gameJsPath = path.join(gamePath, 'engine/game.js');
    if (fs.existsSync(gameJsPath)) {
        const gameJs = fs.readFileSync(gameJsPath, 'utf-8');
        if (!gameJs.includes('WajibetSDK.recordInteraction')) {
            console.log('SDK USAGE: WajibetSDK.recordInteraction not found');
        }
        if (gameJs.includes('let confirmBtn = null') && gameJs.includes('let nextBtn = null')) {
             console.log('CLEANUP: Unused confirmBtn/nextBtn detected');
        }
    }
});
