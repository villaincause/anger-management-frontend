/**
 * ui.js - The Visual Engine (Perspective-Aware)
 */

let p1Stats = { anger: 50, satisfaction: 25, confidence: 0, score: 0 }; // Always "Self" (Left)
let p2Stats = { anger: 50, satisfaction: 25, confidence: 0, score: 0 }; // Always "Opponent" (Right)

let bars = null;
let hands = null;
let scores = null;
let announcer = null;

/**
 * SAVING STATE
 */
function saveGameState() {
    const existing = localStorage.getItem('fightingGameState');
    const oldState = existing ? JSON.parse(existing) : {};

    const gameState = {
        ...oldState, 
        p1Stats,
        p2Stats,
        phase: document.getElementById('rps-controls')?.classList.contains('hidden') ? 'action' : 'rps',
        timestamp: new Date().getTime()
    };
    localStorage.setItem('fightingGameState', JSON.stringify(gameState));
}

/**
 * LOADING STATE
 */
function loadGameState() {
    const saved = localStorage.getItem('fightingGameState');
    if (!saved) return false;

    const state = JSON.parse(saved);
    
    if (state.p1Stats) p1Stats = state.p1Stats;
    if (state.p2Stats) p2Stats = state.p2Stats;

    initSelectors();
    
    // Render current visual state
    ['p1', 'p2'].forEach(p => {
        const stats = p === 'p1' ? p1Stats : p2Stats;
        updateBar(p, 'anger', stats.anger);
        updateBar(p, 'satisfaction', stats.satisfaction);
        updateBar(p, 'confidence', stats.confidence);
    });
    updateScores(p1Stats.score, p2Stats.score);
    
    toggleActionPhase(state.phase === 'action');
    
    return true;
}

function initSelectors() {
    bars = {
        p1: {
            anger: document.getElementById('p1-anger'),
            satisfaction: document.getElementById('p1-satisfaction'),
            confidence: document.getElementById('p1-confidence')
        },
        p2: {
            anger: document.getElementById('p2-anger'),
            satisfaction: document.getElementById('p2-satisfaction'),
            confidence: document.getElementById('p2-confidence')
        }
    };

    hands = {
        p1: document.getElementById('p1-hand-visual'),
        p2: document.getElementById('p2-hand-visual')
    };

    scores = {
        p1: document.getElementById('p1-score'), 
        p2: document.getElementById('p2-score')
    };

    announcer = document.getElementById('announcer-text');
}

function initUIAssets() {
    if (typeof GAME_ASSETS === 'undefined') return;

    const moveButtons = document.querySelectorAll('.move-btn img');
    if (moveButtons.length >= 3) {
        moveButtons[0].src = GAME_ASSETS.moves.rock;
        moveButtons[1].src = GAME_ASSETS.moves.paper;
        moveButtons[2].src = GAME_ASSETS.moves.scissors;
    }

    const actionButtons = document.querySelectorAll('.action-btn img');
    if (actionButtons.length >= 3) {
        actionButtons[0].src = GAME_ASSETS.actions.punch;
        actionButtons[1].src = GAME_ASSETS.actions.kick;
        actionButtons[2].src = GAME_ASSETS.actions.slap;
    }

    if (!hands) initSelectors();
    if (hands.p1) hands.p1.src = GAME_ASSETS.hands.rock;
    if (hands.p2) hands.p2.src = GAME_ASSETS.hands.rock;
}

/**
 * Updates the text above the controls
 */
function updateAnnouncer(message) {
    if (!announcer) initSelectors();
    if (announcer) {
        announcer.innerText = message;
    }
}

/**
 * Triggers the hit animation and visual swap.
 * @param {string} victim - 'p1' (left/self) or 'p2' (right/opponent)
 * @param {string} action - the action name (punch, kick, etc)
 */
function showActionEffect(victim, action) {
    if (!hands) initSelectors();
    const handElement = hands[victim];
    if (!handElement) return;

    const wrapper = handElement.parentElement;
    wrapper.classList.remove('action-hit');
    void wrapper.offsetWidth; // Force reflow

    // Temporarily change the hand image to the action visual (the "hit" state)
    if (GAME_ASSETS.visuals && GAME_ASSETS.visuals[action]) {
        handElement.src = GAME_ASSETS.visuals[action];
    }
    
    wrapper.classList.add('action-hit');

    // Reset back to idle state after animation
    setTimeout(() => {
        wrapper.classList.remove('action-hit');
        handElement.src = GAME_ASSETS.hands.rock;
    }, 800);
}

/**
 * Standard bar updater
 * @param {string} playerPrefix - 'p1' or 'p2'
 */
function updateBar(playerPrefix, type, value) {
    if (!bars) initSelectors();
    const clampedValue = Math.max(0, Math.min(100, value));
    
    if (bars[playerPrefix] && bars[playerPrefix][type]) {
        bars[playerPrefix][type].style.width = `${clampedValue}%`;
    }
    
    if(playerPrefix === 'p1') p1Stats[type] = clampedValue;
    else p2Stats[type] = clampedValue;

    saveGameState(); 
}

/**
 * Perspective-aware score updater
 */
function updateScores(s1, s2) {
    if (!scores) initSelectors();
    
    if (scores.p1) scores.p1.innerText = s1 || 0;
    if (scores.p2) scores.p2.innerText = s2 || 0;
    
    p1Stats.score = s1 || 0;
    p2Stats.score = s2 || 0;
    
    saveGameState();
}

/**
 * Handles the RPS animation clash
 */
function animateClash(p1Move, p2Move) {
    if (!hands) initSelectors();
    
    // In multiplayer, p1Move is YOUR move, p2Move is OPPONENT'S move
    hands.p1.src = GAME_ASSETS.hands[p1Move];
    hands.p2.src = GAME_ASSETS.hands[p2Move];

    hands.p1.classList.remove('clash-p1');
    hands.p2.classList.remove('clash-p2');

    void hands.p1.offsetWidth; 
    void hands.p2.offsetWidth; 

    hands.p1.classList.add('clash-p1');
    hands.p2.classList.add('clash-p2');
}

/**
 * Global UI Reset
 */
function resetUI() {
    localStorage.removeItem('fightingGameState'); 
    initSelectors();
    
    document.getElementById('room-code-display')?.classList.add('hidden');
    
    p1Stats = { anger: 50, satisfaction: 25, confidence: 0, score: 0 };
    p2Stats = { anger: 50, satisfaction: 25, confidence: 0, score: 0 };
    
    ['p1', 'p2'].forEach(p => {
        updateBar(p, 'anger', 50);
        updateBar(p, 'satisfaction', 25);
        updateBar(p, 'confidence', 0);
    });
    
    updateScores(0, 0);
    updateAnnouncer("CHOOSE YOUR MOVE");
    initUIAssets();
}

/**
 * Switches between RPS buttons and Action buttons
 */
function toggleActionPhase(show) {
    const rpsControls = document.getElementById('rps-controls');
    const actionControls = document.getElementById('action-controls');
    
    if (!rpsControls || !actionControls) return;

    if (show) {
        rpsControls.classList.add('hidden');
        actionControls.classList.remove('hidden');
        updateAnnouncer("YOU WON! ATTACK!"); 
    } else {
        rpsControls.classList.remove('hidden');
        actionControls.classList.add('hidden');
        // Note: handleServerMessage in socket.js will override this text 
        // if the player is actually waiting for an opponent's turn.
        updateAnnouncer("CHOOSE YOUR MOVE"); 
    }
    
    saveGameState(); 
}

/**
 * Updates all bars for a player at once
 * @param {string} playerPrefix - 'p1' or 'p2'
 * @param {object} stats - {anger, satisfaction, confidence}
 */
function updateAllBars(p1StatsIn, p2StatsIn) {
    if (!p1StatsIn || !p2StatsIn) return;
    
    ['anger', 'satisfaction', 'confidence'].forEach(type => {
        updateBar('p1', type, p1StatsIn[type]);
        updateBar('p2', type, p2StatsIn[type]);
    });
}