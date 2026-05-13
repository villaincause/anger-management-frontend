/**
 * socket.js - The Frontend Communicator
 */

let socket;
let currentGameId = null;
let myRole = 'p1'; 
let uiTransitionTimeout = null; // Track timeouts to prevent overlapping UI resets

// ─────────────────────────────────────────────
//  AUDIO MANAGER
// ─────────────────────────────────────────────

const AudioManager = (() => {
    let bgTrack = null;       // Currently playing background track
    let activeSrc = null;     // URL of the current background track

    /**
     * Internal: starts looping a background track.
     * No-ops if the same URL is already playing.
     */
    function _playBg(url) {
        if (activeSrc === url && bgTrack && !bgTrack.paused) return; // already playing

        // Stop whatever is currently playing
        _stopBg();

        bgTrack  = new Audio(url);
        activeSrc = url;
        bgTrack.loop   = true;
        bgTrack.volume = 0.3;

        // Browsers block autoplay without a prior user gesture.
        // We queue a retry on the first user interaction if needed.
        const playPromise = bgTrack.play();
        if (playPromise !== undefined) {
            playPromise.catch(() => {
                const retry = () => {
                    bgTrack && bgTrack.play().catch(() => {});
                    document.removeEventListener('click',      retry);
                    document.removeEventListener('keydown',    retry);
                    document.removeEventListener('touchstart', retry);
                };
                document.addEventListener('click',      retry, { once: true });
                document.addEventListener('keydown',    retry, { once: true });
                document.addEventListener('touchstart', retry, { once: true });
            });
        }
    }

    function _stopBg() {
        if (bgTrack) {
            bgTrack.pause();
            bgTrack.currentTime = 0;
            bgTrack  = null;
            activeSrc = null;
        }
    }

    /**
     * Play a one-shot sound effect (does not interrupt background music).
     */
    function _playSfx(url) {
        if (!url) return;
        const sfx = new Audio(url);
        sfx.volume = 0.5;
        sfx.play().catch(() => {});
    }

    // ── Public API ──────────────────────────────

    /** Call once the home screen is shown. */
    function playHomeMusic() {
        const url = window.GAME_ASSETS?.sounds?.bgMusic;
        if (url) _playBg(url);
    }

    /** Call when a game match starts. */
    function playGameMusic() {
        const url = window.GAME_ASSETS?.sounds?.bgMusicGame;
        if (url) _playBg(url);
    }

    /**
     * Call at the end of a game.
     * Plays the victory or loss one-shot, stops the game loop,
     * then (after a short delay) restarts home music.
     * @param {boolean} didWin
     */
    function playEndSequence(didWin) {
        _stopBg();

        const sfxUrl = didWin
            ? window.GAME_ASSETS?.sounds?.victory
            : window.GAME_ASSETS?.sounds?.loss;

        _playSfx(sfxUrl);

        // Return to home music after the SFX has had time to play (~3 s)
        setTimeout(() => {
            playHomeMusic();
        }, 3000);
    }

    /** Hard-stop everything (e.g. session invalid / user navigates away). */
    function stopAll() {
        _stopBg();
    }

    return { playHomeMusic, playGameMusic, playEndSequence, stopAll };
})();

// Expose globally so ui.js / other scripts can call it
window.AudioManager = AudioManager;

// Keep the legacy function name working if anything else calls it
function stopBackgroundMusic() { AudioManager.stopAll(); }


// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

/**
 * FAILSAFE: Retrieves the Game ID from memory or storage
 */
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

function sendAuthRequest(mode, data) {
    sendToServer(mode, data);
}

function requestStartGame(mode, username, userId = null, roomCode = null, action = null) {
    sendToServer('START_GAME', { mode, username, userId, roomCode, action });
}

function submitMove(move) {
    const id = getActiveGameId();
    if (!id) return;
    if (typeof updateAnnouncer === 'function') updateAnnouncer("WAITING FOR OPPONENT...");
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

function showMatchmaking() {
    const overlay = document.getElementById('matchmaking-overlay');
    if (overlay) overlay.classList.remove('hidden');
}

function hideMatchmaking() {
    const overlay = document.getElementById('matchmaking-overlay');
    if (overlay) overlay.classList.add('hidden');
}

function getUserId() {
    const user = localStorage.getItem('rps_user_session');
    if (!user) return null;
    try {
        return JSON.parse(user).id;
    } catch(e) {
        return null;
    }
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
//  SOCKET
// ─────────────────────────────────────────────

function initSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const serverUrl = `${protocol}//${window.location.host}`;

    socket = new WebSocket(serverUrl);

    socket.onopen = () => {
        console.log('Connected to Anger Management Server');

        // Start home music as soon as the connection is live
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
        handleServerMessage(data);
    };
    
    socket.onclose = () => console.warn('Disconnected from server.');
    socket.onerror = (error) => console.error('WebSocket Error:', error);
}

function handleServerMessage(data) {
    const { type, payload } = data;

    // Clear any pending UI resets when a new major message arrives
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
            // Session is still in a live game — keep game music
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
            if (typeof updateAnnouncer === 'function') {
                updateAnnouncer("WAITING FOR OPPONENT...");
            }
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

            // Switch from home music → in-game music
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
                    // Switch to action phase manually for the winner
                    if (typeof toggleActionPhase === 'function') {
                        toggleActionPhase(true);
                        updateAnnouncer("PICK YOUR ATTACK!");
                    }
                } else {
                    // Loser waits for the opponent's action message from the server
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
            
            // Wait for action animation to play out before returning to RPS
            uiTransitionTimeout = setTimeout(() => {
                const actionControls = document.getElementById('action-controls');
                const isActionPhaseActive = actionControls && !actionControls.classList.contains('hidden');
                
                if (currentGameId && !isActionPhaseActive) {
                    resetRPSUI();
                }
            }, 2500);
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