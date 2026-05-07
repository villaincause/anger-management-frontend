/**
 * socket.js - The Frontend Communicator
 */

let socket;
let currentGameId = null;
let myRole = 'p1'; // Default to p1; updated by server on GAME_STARTED or SESSION_VALID

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

function initSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const serverUrl = `${protocol}//${window.location.host}`;

    socket = new WebSocket(serverUrl);

    socket.onopen = () => {
        console.log('Connected to Anger Management Server');
        
        const storedId = getActiveGameId();
        if (storedId) {
            sendToServer('VERIFY_SESSION', { gameId: storedId });
        }

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

    switch (type) {
        case 'SESSION_INVALID':
            localStorage.removeItem('fightingGameState');
            currentGameId = null;
            if (typeof resetUI === 'function') resetUI();
            if (typeof showView === 'function') showView('home');
            break;

        case 'SESSION_VALID':
            if (typeof showView === 'function') showView('game');
            if (payload.yourRole) myRole = payload.yourRole;
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
            // Show the matchmaking overlay when server acknowledges queue entry
            showMatchmaking();
            if (typeof updateAnnouncer === 'function') {
                updateAnnouncer("SEARCHING FOR OPPONENT...");
            }
            if (typeof toggleActionPhase === 'function') toggleActionPhase(false);
            break;

        case 'GAME_STARTED':
            // Hide the matchmaking overlay as the match is ready
            hideMatchmaking();
            
            currentGameId = payload.id;
            myRole = payload.yourRole || 'p1'; 
            saveGameIdToStorage(payload.id);
            
            document.getElementById('room-code-display')?.classList.add('hidden');
            document.getElementById('friend-room-options')?.classList.add('hidden');

            if (typeof showView === 'function') showView('game');

            const pSelf = myRole === 'p1' ? payload.p1 : payload.p2;
            const pOpp = myRole === 'p1' ? payload.p2 : payload.p1;

            if (typeof updateScores === 'function') updateScores(pSelf.score, pOpp.score);
            if (typeof updateAllBars === 'function') updateAllBars(pSelf.stats, pOpp.stats);
            if (typeof updateAnnouncer === 'function') updateAnnouncer("MATCH STARTED!");
            break;

        case 'ROUND_RESULT':
            const myMove = myRole === 'p1' ? payload.p1Move : payload.p2Move;
            const oppMove = myRole === 'p1' ? payload.p2Move : payload.p1Move;

            if (typeof animateClash === 'function') animateClash(myMove, oppMove);
            
            const isDraw = payload.result === 'draw';
            const amIWinner = payload.result === myRole;

            let resultMsg = isDraw ? "DRAW!" : (amIWinner ? "YOU WON THE CLASH!" : "OPPONENT WON THE CLASH!");
            if (typeof updateAnnouncer === 'function') updateAnnouncer(resultMsg);

            setTimeout(() => {
                if (isDraw) {
                    resetRPSUI();
                } else if (amIWinner) {
                    if (typeof toggleActionPhase === 'function') toggleActionPhase(true);
                } else {
                    if (typeof toggleActionPhase === 'function') {
                        toggleActionPhase(false); 
                        updateAnnouncer("OPPONENT IS ATTACKING...");
                    }
                }
            }, 1200);
            break;

        case 'UPDATE_UI':
            const statsSelf = myRole === 'p1' ? payload.p1Stats : payload.p2Stats;
            const statsOpp = myRole === 'p1' ? payload.p2Stats : payload.p1Stats;
            const scoreSelf = myRole === 'p1' ? payload.p1Score : payload.p2Score;
            const scoreOpp = myRole === 'p1' ? payload.p2Score : payload.p1Score;

            if (typeof updateScores === 'function') updateScores(scoreSelf, scoreOpp);
            if (statsSelf) updatePlayerBars('p1', statsSelf);
            if (statsOpp) updatePlayerBars('p2', statsOpp);
            
            if (payload.cpuAction && typeof showActionEffect === 'function') {
                showActionEffect('p2', payload.cpuAction);
            } 
            else if (payload.onlineAction && typeof showActionEffect === 'function') {
                const actorSide = (payload.actorRole === myRole) ? 'p1' : 'p2';
                showActionEffect(actorSide, payload.onlineAction);
            }
            
            setTimeout(() => resetRPSUI(), 1500);
            break;

        case 'GAME_OVER':
            if (typeof updateAnnouncer === 'function') updateAnnouncer("GAME OVER!");
            
            const myUserId = getUserId();
            let winText = "OPPONENT WINS!";

            if (payload.winnerId && myUserId && payload.winnerId === myUserId) {
                winText = "YOU WIN!";
            } 
            else if (payload.reason && payload.reason.includes(myRole) && !payload.reason.includes('giveup')) {
                winText = "YOU WIN!";
            }
            else if (payload.reason === 'opponent_giveup') {
                winText = "YOU WIN!";
            }

            setTimeout(() => {
                alert(winText);
                localStorage.removeItem('fightingGameState'); 
                currentGameId = null;
                if (payload.updatedUser && typeof updateAuthUI === 'function') updateAuthUI(payload.updatedUser);
                if (typeof showView === 'function') showView('home');
            }, 500);
            break;
            
        case 'ERROR':
            hideMatchmaking(); // Close overlay if an error occurs
            if (typeof showNotification === 'function') showNotification(payload.message);
            break;
    }
}

/**
 * DATA SENDERS
 */

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
    if (id) {
        sendToServer('GIVE_UP', { gameId: id, userId: getUserId() });
    }
    localStorage.removeItem('fightingGameState');
    currentGameId = null;
    if (typeof showView === 'function') showView('home');
}

/**
 * NEW: Handle leaving the matchmaking queue
 */
function leaveQueue() {
    sendToServer('LEAVE_QUEUE', { userId: getUserId() });
    hideMatchmaking();
    if (typeof showView === 'function') showView('home');
}

/**
 * HELPERS & UI TOGGLES
 */

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