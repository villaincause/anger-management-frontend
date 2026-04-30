/**
 * socket.js - The Frontend Communicator
 */

let socket;
let currentGameId = null;

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
            // Logic for the Host of a Friend Room
            const display = document.getElementById('room-code-display');
            const codeText = document.getElementById('display-generated-code');
            const createBtn = document.getElementById('btn-create-room');
            
            if (display && codeText) {
                display.classList.remove('hidden');
                codeText.innerText = payload.roomCode;
            }

            // Hide the create button so they don't host multiple rooms
            if (createBtn) createBtn.classList.add('hidden');

            if (typeof showNotification === 'function') {
                showNotification(`Room Created! Share code: ${payload.roomCode}`);
            }
            break;

        case 'WAITING_FOR_OPPONENT':
            if (typeof showNotification === 'function') {
                showNotification("Waiting for an opponent to join...");
            }
            break;

        case 'GAME_STARTED':
            currentGameId = payload.id;
            saveGameIdToStorage(payload.id);
            
            // Clean up Home UI for Friend Rooms
            const codeArea = document.getElementById('room-code-display');
            const friendOptions = document.getElementById('friend-room-options');
            
            if (codeArea) codeArea.classList.add('hidden');
            if (friendOptions) friendOptions.classList.add('hidden');

            // UI Transition to Game
            if (typeof showView === 'function') showView('game');
            if (typeof updateScores === 'function') updateScores(payload.p1.score, payload.p2.score);
            if (typeof updateAllBars === 'function') updateAllBars(payload.p1.stats, payload.p2.stats);
            if (typeof showNotification === 'function') showNotification("Match Started!");
            break;

        case 'ROUND_RESULT':
            if (typeof updateScores === 'function') updateScores(payload.p1Score || 0, payload.p2Score || 0);
            if (typeof animateClash === 'function') animateClash(payload.p1Move, payload.p2Move);
            
            setTimeout(() => {
                if (payload.result === 'p1') {
                    if (typeof toggleActionPhase === 'function') toggleActionPhase(true);
                } else if (payload.result === 'p2') {
                    if (typeof toggleActionPhase === 'function') toggleActionPhase(false);
                } else {
                    resetRPSUI();
                }
            }, 1200);
            break;

        case 'UPDATE_UI':
            if (typeof updateScores === 'function') updateScores(payload.p1Score, payload.p2Score);
            if (payload.p1Stats) updatePlayerBars('p1', payload.p1Stats);
            if (payload.p2Stats) updatePlayerBars('p2', payload.p2Stats);
            
            if (payload.cpuAction) {
                if (typeof showActionEffect === 'function') showActionEffect('p2', payload.cpuAction);
            } else if (payload.onlineAction) {
                if (typeof showActionEffect === 'function') {
                    showActionEffect(payload.actorRole, payload.onlineAction);
                }
            }
            
            setTimeout(() => resetRPSUI(), 1500);
            break;

        case 'RESET_ROUND':
            resetRPSUI();
            break;

        case 'GAME_OVER':
            const winText = payload.reason === 'p1_win' ? "Player 1 Wins!" : "Player 2 Wins!";
            alert(`Game Over! ${winText}`);
            
            localStorage.removeItem('fightingGameState'); 
            if (payload.updatedUser && typeof updateAuthUI === 'function') updateAuthUI(payload.updatedUser);
            if (typeof showView === 'function') showView('home');
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

    if (typeof showActionEffect === 'function') {
        showActionEffect('p1', action); 
    }

    sendToServer('SUBMIT_ACTION', { 
        gameId: id, 
        action, 
        userId: user ? user.id : null 
    });

    if (typeof toggleActionPhase === 'function') toggleActionPhase(false);
    setTimeout(() => resetRPSUI(), 1000);
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