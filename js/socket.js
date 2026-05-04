/**
 * socket.js - The Frontend Communicator
 */

let socket;
let currentGameId = null;
let myRole = 'p1'; // Default to p1 for Local play

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
        getActiveGameId();

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
        case 'AUTH_SUCCESS':
            if (typeof updateAuthUI === 'function') updateAuthUI(payload.user);
            break;

        case 'AUTH_ERROR':
            if (!payload.isReauth) alert(`Error: ${payload.message}`);
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
            if (typeof showNotification === 'function') {
                showNotification("Waiting for an opponent to join...");
            }
            if (typeof updateAnnouncer === 'function') updateAnnouncer("WAITING FOR PLAYER...");
            break;

        case 'GAME_STARTED':
            currentGameId = payload.id;
            myRole = payload.yourRole || 'p1'; // Store perspective role
            saveGameIdToStorage(payload.id);
            
            const codeArea = document.getElementById('room-code-display');
            const friendOptions = document.getElementById('friend-room-options');
            
            if (codeArea) codeArea.classList.add('hidden');
            if (friendOptions) friendOptions.classList.add('hidden');

            if (typeof showView === 'function') showView('game');

            // PERSPECTIVE FIX: Map Server Data to UI Sides
            const pSelf = myRole === 'p1' ? payload.p1 : payload.p2;
            const pOpp = myRole === 'p1' ? payload.p2 : payload.p1;

            if (typeof updateScores === 'function') updateScores(pSelf.score, pOpp.score);
            if (typeof updateAllBars === 'function') updateAllBars(pSelf.stats, pOpp.stats);
            if (typeof updateAnnouncer === 'function') updateAnnouncer("MATCH STARTED!");
            break;

        case 'ROUND_RESULT':
            // PERSPECTIVE FIX: Ensure 'p1Move' on UI is always YOUR move
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
                } else {
                    if (amIWinner) {
                        if (typeof toggleActionPhase === 'function') toggleActionPhase(true);
                    } else {
                        if (typeof toggleActionPhase === 'function') {
                            toggleActionPhase(false); 
                            updateAnnouncer("OPPONENT IS ATTACKING...");
                        }
                    }
                }
            }, 1200);
            break;

        case 'UPDATE_UI':
            // PERSPECTIVE FIX: Sync Bars and Scores based on role
            const scoreSelf = myRole === 'p1' ? payload.p1Score : payload.p2Score;
            const scoreOpp = myRole === 'p1' ? payload.p2Score : payload.p1Score;
            const statsSelf = myRole === 'p1' ? payload.p1Stats : payload.p2Stats;
            const statsOpp = myRole === 'p1' ? payload.p2Stats : payload.p1Stats;

            if (typeof updateScores === 'function') updateScores(scoreSelf, scoreOpp);
            if (statsSelf) updatePlayerBars('p1', statsSelf);
            if (statsOpp) updatePlayerBars('p2', statsOpp);
            
            // ANIMATION PERSPECTIVE FIX:
            // The person performing the action (Actor) should show the animation on their side.
            if (payload.cpuAction) {
                // CPU is always p2 in local mode
                if (typeof showActionEffect === 'function') showActionEffect('p2', payload.cpuAction);
            } else if (payload.onlineAction) {
                if (typeof showActionEffect === 'function') {
                    // If the Actor is ME, show the effect on 'p1' (Left/Self side).
                    // Otherwise, show it on 'p2' (Right/Opponent side).
                    const actorSide = (payload.actorRole === myRole) ? 'p1' : 'p2';
                    showActionEffect(actorSide, payload.onlineAction);
                }
            }
            
            setTimeout(() => resetRPSUI(), 1500);
            break;

        case 'RESET_ROUND':
            resetRPSUI();
            break;

        case 'GAME_OVER':
            // Logic to determine winner based on perspective
            const serverWinner = payload.reason.replace('_win', ''); // 'p1' or 'p2'
            const didIWin = serverWinner === myRole;
            const winText = didIWin ? "YOU WIN!" : "OPPONENT WINS!";
            
            if (typeof updateAnnouncer === 'function') updateAnnouncer("GAME OVER!");
            
            setTimeout(() => {
                alert(winText);
                localStorage.removeItem('fightingGameState'); 
                if (payload.updatedUser && typeof updateAuthUI === 'function') updateAuthUI(payload.updatedUser);
                if (typeof showView === 'function') showView('home');
            }, 500);
            break;
            
        case 'ERROR':
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
    } else if (socket && socket.readyState === WebSocket.CONNECTING) {
        socket.addEventListener('open', () => {
            socket.send(JSON.stringify({ type, payload }));
        }, { once: true });
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
    const user = JSON.parse(localStorage.getItem('rps_user_session'));
    if (!id) return;
    
    if (typeof updateAnnouncer === 'function') updateAnnouncer("WAITING FOR OPPONENT...");

    sendToServer('SUBMIT_MOVE', { 
        gameId: id, 
        move, 
        userId: user ? user.id : null 
    });
}

function submitAction(action) {
    const id = getActiveGameId();
    const user = JSON.parse(localStorage.getItem('rps_user_session'));
    if (!id) return;

    sendToServer('SUBMIT_ACTION', { 
        gameId: id, 
        action, 
        userId: user ? user.id : null 
    });

    if (typeof toggleActionPhase === 'function') toggleActionPhase(false);
}

function resetRPSUI() {
    if (typeof toggleActionPhase === 'function') toggleActionPhase(false);
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