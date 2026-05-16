/**
 * socket.js - The Frontend Communicator with Pacing Protection
 */

let socket;
let currentGameId = null;
let myRole = 'p1'; 
let uiTransitionTimeout = null; // Track timeouts to prevent overlapping UI resets

// ── PACING & TIMING ENGINES ─────────────────
let messageQueue = [];
let isProcessingQueue = false;
let lastMoveSubmitTime = 0;

// ─────────────────────────────────────────────
//  AUDIO MANAGER
// ─────────────────────────────────────────────

const AudioManager = (() => {
    const tracks = {
        home: null,
        game: null,
    };
    let unlocked    = false;   
    let pendingPlay = null;    
    let activeKey   = null;    

    function _buildTracks() {
        const s = window.GAME_ASSETS?.sounds;
        if (!s) return false;
        if (!tracks.home) {
            tracks.home = new Audio(s.bgMusic);
            tracks.home.loop   = true;
            tracks.home.volume = 0.3;
        }
        if (!tracks.game) {
            tracks.game = new Audio(s.bgMusicGame);
            tracks.game.loop   = true;
            tracks.game.volume = 0.3;
        }
        return true;
    }

    function _kill(key) {
        const node = tracks[key];
        if (!node) return;
        const savedSrc = node.src;   
        node.volume       = 0;
        node.pause();
        node.src          = '';      
        node.load();               
        node.src          = savedSrc; 
        node.volume       = 0.3;
        node.currentTime  = 0;
    }

    function _switchTo(key) {
        if (!_buildTracks()) {
            pendingPlay = key;
            return;
        }

        activeKey = key;
        const wanted    = tracks[key];
        const otherKey  = key === 'home' ? 'game' : 'home';

        _kill(otherKey);

        if (unlocked) {
            wanted.play().catch(() => {});
        } else {
            pendingPlay = key;
        }
    }

    function _unlock() {
        if (unlocked) return;
        unlocked = true;

        const key = pendingPlay ?? activeKey ?? 'home';
        pendingPlay = null;

        const other = key === 'home' ? 'game' : 'home';
        _kill(other);

        if (tracks[key]) {
            tracks[key].play().catch(() => {});
        }
    }

    document.addEventListener('click',      _unlock, { capture: true, once: true });
    document.addEventListener('keydown',    _unlock, { capture: true, once: true });
    document.addEventListener('touchstart', _unlock, { capture: true, once: true });

    return {
        playHomeMusic: () => _switchTo('home'),
        playGameMusic: () => _switchTo('game'),
        playEndSequence: (didWin) => {
            _kill('game');
            _kill('home');
            activeKey = null;

            const sfxUrl = didWin
                ? window.GAME_ASSETS?.sounds?.victory
                : window.GAME_ASSETS?.sounds?.loss;

            if (sfxUrl) {
                const sfx = new Audio(sfxUrl);
                sfx.volume = 0.5;
                sfx.play().catch(() => {});
            }

            setTimeout(() => _switchTo('home'), 3000);
        },
        stopAll: () => _kill('home') || _kill('game') || (activeKey = null)
    };
})();

window.AudioManager = AudioManager;
function stopBackgroundMusic() { AudioManager.stopAll(); }

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

function getActiveGameId() {
    if (currentGameId) return currentGameId;
    const saved = localStorage.getItem('fightingGameState');
    if (saved) {
        try {
            const state = JSON.parse(saved);
            if (state.gameId) {
                currentGameId = state.gameId;
                return currentGameId;
            }
        } catch (e) {
            console.error("Error parsing game state from storage", e);
        }
    }
    return null;
}

function saveGameIdToStorage(id) {
    const saved = localStorage.getItem('fightingGameState');
    let state = saved ? JSON.parse(saved) : {};
    state.gameId = id;
    localStorage.setItem('fightingGameState', JSON.stringify(state));
}

function sendToServer(type, payload) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type, payload }));
    }
}

function sendAuthRequest(mode, data) { sendToServer(mode, data); }
function requestStartGame(mode, username, userId = null, roomCode = null, action = null) {
    sendToServer('START_GAME', { mode, username, userId, roomCode, action });
}

function submitMove(move) {
    const id = getActiveGameId();
    if (!id) return;
    if (typeof updateAnnouncer === 'function') updateAnnouncer("WAITING FOR OPPONENT...");
    
    lastMoveSubmitTime = Date.now(); 
    sendToServer('SUBMIT_MOVE', { gameId: id, move, userId: getUserId() });
}

function submitAction(action) {
    const id = getActiveGameId();
    if (!id) return;
    sendToServer('SUBMIT_ACTION', { gameId: id, action, userId: getUserId() });
    if (typeof toggleActionPhase === 'function') toggleActionPhase(false);
}

function giveUp() {
    const id = getActiveGameId();
    if (id) sendToServer('GIVE_UP', { gameId: id, userId: getUserId() });
}

function leaveQueue() {
    sendToServer('LEAVE_QUEUE', { userId: getUserId() });
    hideMatchmaking();
    AudioManager.stopAll();
    if (typeof showView === 'function') showView('home');
    AudioManager.playHomeMusic();
}

function showMatchmaking() { document.getElementById('matchmaking-overlay')?.classList.remove('hidden'); }
function hideMatchmaking() { document.getElementById('matchmaking-overlay')?.classList.add('hidden'); }

function getUserId() {
    const user = localStorage.getItem('rps_user_session');
    if (!user) return null;
    try { return JSON.parse(user).id; } catch(e) { return null; }
}

function resetRPSUI() {
    if (!currentGameId) return;
    if (typeof toggleActionPhase === 'function') toggleActionPhase(false);
    if (typeof updateAnnouncer === 'function') updateAnnouncer("CHOOSE YOUR MOVE");
}

function updatePlayerBars(playerPrefix, stats) {
    if (!stats || typeof updateBar !== 'function') return;
    updateBar(playerPrefix, 'anger', stats.anger);
    updateBar(playerPrefix, 'satisfaction', stats.satisfaction);
    updateBar(playerPrefix, 'confidence', stats.confidence);
}

function updateAllBars(p1Stats, p2Stats) {
    updatePlayerBars('p1', p1Stats);
    updatePlayerBars('p2', p2Stats);
}

// ─────────────────────────────────────────────
//  SOCKET ENGINE WITH INTEGRATED PACKET PACING
// ─────────────────────────────────────────────

function initSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const serverUrl = `${protocol}//${window.location.host}`;

    socket = new WebSocket(serverUrl);

    socket.onopen = () => {
        console.log('Connected to Anger Management Server');
        AudioManager.playHomeMusic();

        const storedId = getActiveGameId();
        if (storedId) sendToServer('VERIFY_SESSION', { gameId: storedId });

        const savedUser = localStorage.getItem('rps_user_session');
        if (savedUser) {
            const user = JSON.parse(savedUser);
            sendToServer('LOGIN', { username: user.username, isReauth: true });
        }
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        messageQueue.push(data);
        processNextMessage();
    };
    
    socket.onclose = () => console.warn('Disconnected from server.');
    socket.onerror = (error) => console.error('WebSocket Error:', error);
}

/**
 * Sequential Pacing Queue Coordinator
 */
function processNextMessage() {
    if (isProcessingQueue || messageQueue.length === 0) return;

    isProcessingQueue = true;
    const data = messageQueue.shift();
    
    if (data.type === 'SESSION_INVALID' || data.type === 'GAME_OVER') {
        messageQueue = [];
    }

    let executionDelay = 0;

    if (data.type === 'ROUND_RESULT') {
        const timeElapsed = Date.now() - lastMoveSubmitTime;
        const targetWaitingDuration = 800; // Snappier threshold (reduced from 1000)
        if (timeElapsed < targetWaitingDuration) {
            executionDelay = targetWaitingDuration - timeElapsed;
        }
    }

    setTimeout(() => {
        handleServerMessage(data);

        let displayDuration = 0;
        if (data.type === 'ROUND_RESULT') {
            const amIOpponent = data.payload.result !== myRole && data.payload.result !== 'draw';
            
            if (amIOpponent) {
                // Opponent won! Clash takes 1200ms + give "OPPONENT IS ATTACKING..." 800ms reading window
                displayDuration = 2000; 
            } else {
                // Draw or Player won! Proceed quickly to selections
                displayDuration = 1300; 
            }
        } else if (data.type === 'UPDATE_UI' && (data.payload.cpuAction || data.payload.onlineAction)) {
            // Snappier action visibility window (Reduced from 1500ms to 1100ms)
            displayDuration = 1100;
        }

        setTimeout(() => {
            isProcessingQueue = false;
            processNextMessage(); 
        }, displayDuration);

    }, executionDelay);
}

function handleServerMessage(data) {
    const { type, payload } = data;

    if (uiTransitionTimeout) {
        clearTimeout(uiTransitionTimeout);
        uiTransitionTimeout = null;
    }

    switch (type) {
        case 'SESSION_INVALID':
            localStorage.removeItem('fightingGameState');
            currentGameId = null;
            AudioManager.stopAll();
            if (typeof resetUI === 'function') resetUI();
            if (typeof showView === 'function') showView('home');
            AudioManager.playHomeMusic();
            break;

        case 'SESSION_VALID':
            if (typeof showView === 'function') showView('game');
            if (payload.yourRole) myRole = payload.yourRole;
            AudioManager.playGameMusic();
            break;

        case 'AUTH_SUCCESS':
            if (typeof updateAuthUI === 'function') updateAuthUI(payload.user);
            break;

        case 'ROOM_CREATED':
            const display = document.getElementById('room-code-display');
            const codeText = document.getElementById('display-generated-code');
            const createBtn = document.getElementById('btn-create-room');
            if (display && codeText) {
                display.classList.remove('hidden');
                codeText.innerText = payload.roomCode;
            }
            if (createBtn) createBtn.classList.add('hidden');
            if (typeof showNotification === 'function') {
                showNotification(`Room Created! Share code: ${payload.roomCode}`);
            }
            break;

        case 'WAITING_FOR_OPPONENT':
            showMatchmaking();
            if (typeof updateAnnouncer === 'function') updateAnnouncer("WAITING FOR OPPONENT...");
            if (typeof toggleActionPhase === 'function') toggleActionPhase(false);
            break;

        case 'GAME_STARTED':
            hideMatchmaking();
            currentGameId = payload.id;
            myRole = payload.yourRole || 'p1'; 
            saveGameIdToStorage(payload.id);
            
            document.getElementById('room-code-display')?.classList.add('hidden');
            document.getElementById('friend-room-options')?.classList.add('hidden');

            if (typeof showView === 'function') showView('game');
            AudioManager.playGameMusic();

            const pSelf = myRole === 'p1' ? payload.p1 : payload.p2;
            const pOpp = myRole === 'p1' ? payload.p2 : payload.p1;

            if (typeof updateScores === 'function') updateScores(pSelf.score, pOpp.score);
            if (typeof updateAllBars === 'function') updateAllBars(pSelf.stats, pOpp.stats);
            if (typeof updateAnnouncer === 'function') updateAnnouncer("MATCH STARTED! CHOOSE YOUR MOVE");
            break;

        case 'ROUND_RESULT':
            const myMove = myRole === 'p1' ? payload.p1Move : payload.p2Move;
            const oppMove = myRole === 'p1' ? payload.p2Move : payload.p1Move;

            if (typeof animateClash === 'function') animateClash(myMove, oppMove);
            
            const isDraw = payload.result === 'draw';
            const amIWinner = payload.result === myRole;

            let resultMsg = isDraw ? "DRAW!" : (amIWinner ? "YOU WON THE CLASH!" : "OPPONENT WON THE CLASH!");
            if (typeof updateAnnouncer === 'function') updateAnnouncer(resultMsg);

            uiTransitionTimeout = setTimeout(() => {
                if (!currentGameId) return;

                if (isDraw) {
                    resetRPSUI(); 
                } else if (amIWinner) {
                    if (typeof toggleActionPhase === 'function') {
                        toggleActionPhase(true);
                        updateAnnouncer("PICK YOUR ATTACK!");
                    }
                } else {
                    if (typeof toggleActionPhase === 'function') {
                        toggleActionPhase(false); 
                        updateAnnouncer("OPPONENT IS ATTACKING...");
                    }
                }
            }, 1200); 
            break;

        case 'UPDATE_UI':
            const statsS = myRole === 'p1' ? payload.p1Stats : payload.p2Stats;
            const statsO = myRole === 'p1' ? payload.p2Stats : payload.p1Stats;
            const scoreS = myRole === 'p1' ? payload.p1Score : payload.p2Score;
            const scoreO = myRole === 'p1' ? payload.p2Score : payload.p1Score;

            if (typeof updateScores === 'function') updateScores(scoreS, scoreO);
            if (statsS) updatePlayerBars('p1', statsS);
            if (statsO) updatePlayerBars('p2', statsO);
            
            let actionText = "";
            if (payload.cpuAction && typeof showActionEffect === 'function') {
                showActionEffect('p2', payload.cpuAction);
                if (typeof playActionSound === 'function') playActionSound(payload.cpuAction);
                actionText = `OPPONENT USED ${payload.cpuAction.toUpperCase()}!`;
            } 
            else if (payload.onlineAction && typeof showActionEffect === 'function') {
                const actorSide = (payload.actorRole === myRole) ? 'p1' : 'p2';
                showActionEffect(actorSide, payload.onlineAction);
                if (typeof playActionSound === 'function') playActionSound(payload.onlineAction);
                const actorName = (payload.actorRole === myRole) ? "YOU" : "OPPONENT";
                actionText = `${actorName} USED ${payload.onlineAction.toUpperCase()}!`;
            }

            if (actionText && typeof updateAnnouncer === 'function') {
                updateAnnouncer(actionText);
            }
            
            uiTransitionTimeout = setTimeout(() => {
                const actionControls = document.getElementById('action-controls');
                const isActionPhaseActive = actionControls && !actionControls.classList.contains('hidden');
                
                if (currentGameId && !isActionPhaseActive) {
                    resetRPSUI();
                }
            }, 1700); // Faster turnaround to return back to RPS choices (Reduced from 2500ms)
            break;

        case 'UPDATE_STATS':
            const storedSession = localStorage.getItem('rps_user_session');
            if (storedSession && typeof updateAuthUI === 'function') {
                const user = JSON.parse(storedSession);
                const updatedUser = { ...user, ...payload };
                updateAuthUI(updatedUser); 
            }
            break;

        case 'GAME_OVER':
            let winText = "GAME OVER";
            const reason = payload.reason;
            const winner = payload.winner;
            let didIWin = false;

            if (reason.includes('forfeit')) {
                const forfeiter = reason.split('_')[0];
                didIWin  = myRole !== forfeiter;
                winText  = didIWin ? "OPPONENT GAVE UP! YOU WIN!" : "YOU GAVE UP! OPPONENT WINS!";
            } 
            else if (winner) {
                didIWin = myRole === winner;
                winText = didIWin ? "VICTORY! YOU WIN!" : "DEFEAT! OPPONENT WINS!";
            }
            else if (reason === 'p1_win') {
                didIWin = myRole === 'p1';
                winText = didIWin ? "VICTORY! YOU WIN!" : "DEFEAT! OPPONENT WINS!";
            } else if (reason === 'p2_win') {
                didIWin = myRole === 'p2';
                winText = didIWin ? "VICTORY! YOU WIN!" : "DEFEAT! OPPONENT WINS!";
            }

            currentGameId = null; 
            if (typeof updateAnnouncer === 'function') updateAnnouncer(winText);
            AudioManager.playEndSequence(didIWin);

            setTimeout(() => {
                alert(winText);
                localStorage.removeItem('fightingGameState'); 
                if (typeof showView === 'function') showView('home');
                AudioManager.playHomeMusic();
            }, 1200);
            break;
            
        case 'ERROR':
            hideMatchmaking();
            if (typeof showNotification === 'function') showNotification(payload.message);
            break;
    }
}