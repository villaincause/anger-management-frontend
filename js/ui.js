/**
 * ui.js - The Visual Engine (Strictly for Rendering & State)
 */

let p1Stats = { anger: 50, satisfaction: 25, confidence: 0, score: 0 };
let p2Stats = { anger: 50, satisfaction: 25, confidence: 0, score: 0 };

let bars = null;
let hands = null;
let scores = null;
let announcer = null; // Added announcer variable

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

    announcer = document.getElementById('announcer-text'); // Selector for the new text element
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

function showActionEffect(victim, action) {
    if (!hands) initSelectors();
    const handElement = hands[victim];
    if (!handElement) return;

    const wrapper = handElement.parentElement;
    wrapper.classList.remove('action-hit');
    void wrapper.offsetWidth; 

    if (GAME_ASSETS.visuals && GAME_ASSETS.visuals[action]) {
        handElement.src = GAME_ASSETS.visuals[action];
    }
    
    wrapper.classList.add('action-hit');

    setTimeout(() => {
        wrapper.classList.remove('action-hit');
        handElement.src = GAME_ASSETS.hands.rock;
    }, 800);
}

function updateBar(player, type, value) {
    if (!bars) initSelectors();
    const clampedValue = Math.max(0, Math.min(100, value));
    
    if (bars[player] && bars[player][type]) {
        bars[player][type].style.width = `${clampedValue}%`;
    }
    
    if(player === 'p1') p1Stats[type] = clampedValue;
    else p2Stats[type] = clampedValue;

    saveGameState(); 
}

function updateScores(p1Score, p2Score) {
    if (!scores) initSelectors();
    const s1 = (p1Score != null) ? p1Score : 0;
    const s2 = (p2Score != null) ? p2Score : 0;
    
    if (scores.p1) scores.p1.innerText = s1;
    if (scores.p2) scores.p2.innerText = s2;
    
    p1Stats.score = s1;
    p2Stats.score = s2;
    
    saveGameState();
}

function animateClash(p1Move, p2Move) {
    if (!hands) initSelectors();
    
    hands.p1.src = GAME_ASSETS.hands[p1Move];
    hands.p2.src = GAME_ASSETS.hands[p2Move];

    hands.p1.classList.remove('clash-p1');
    hands.p2.classList.remove('clash-p2');

    void hands.p1.offsetWidth; 
    void hands.p2.offsetWidth; 

    hands.p1.classList.add('clash-p1');
    hands.p2.classList.add('clash-p2');
}

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
    updateAnnouncer("CHOOSE YOUR MOVE"); // Reset text on game reset
    initUIAssets();
}

function toggleActionPhase(show) {
    const rpsControls = document.getElementById('rps-controls');
    const actionControls = document.getElementById('action-controls');
    
    if (!rpsControls || !actionControls) return;

    if (show) {
        rpsControls.classList.add('hidden');
        actionControls.classList.remove('hidden');
        updateAnnouncer("YOU WON! ATTACK!"); // UI feedback for win
    } else {
        rpsControls.classList.remove('hidden');
        actionControls.classList.add('hidden');
        updateAnnouncer("CHOOSE YOUR MOVE"); // UI feedback for RPS
    }
    
    saveGameState(); 
}