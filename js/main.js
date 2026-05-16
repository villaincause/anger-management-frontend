/**
 * main.js - The Grand Conductor
 */

// 1. Element Selectors
const homeScreen = document.getElementById('home-screen');
const gameScreen = document.getElementById('game-screen');
const authModal = document.getElementById('auth-modal');
const homeNotif = document.getElementById('home-notification');

const loggedOutView = document.getElementById('logged-out-view');
const loggedInView = document.getElementById('logged-in-view'); 
const displayUsername = document.getElementById('display-username');
const displayRecord = document.getElementById('display-record');

const btnLocal = document.getElementById('btn-local');
const btnOnline = document.getElementById('btn-online');
const btnGiveUp = document.getElementById('btn-give-up');
const btnShowAuth = document.getElementById('btn-show-login');
const btnLogout = document.getElementById('btn-logout');
const closeModal = document.querySelector('.close-modal');

const btnFriendMenu = document.getElementById('btn-friend-menu');
const friendOptions = document.getElementById('friend-room-options');
const btnCreateRoom = document.getElementById('btn-create-room');
const btnJoinRoom = document.getElementById('btn-join-room');
const btnBackMenu = document.getElementById('btn-back-menu');
const inputRoomCode = document.getElementById('input-room-code');
const roomCodeDisplay = document.getElementById('room-code-display');

// Matchmaking Overlay Selectors
const matchmakingOverlay = document.getElementById('matchmaking-overlay');
const btnCancelQueue = document.getElementById('btn-cancel-queue');

const loginForm = document.getElementById('form-login');
const registerForm = document.getElementById('form-register');
const linkToReg = document.getElementById('link-to-register');
const linkToLogin = document.getElementById('link-to-login');

let currentUser = null; 

/**
 * Plays a specific action sound (Punch, Kick, Slap).
 * Background music is fully managed by AudioManager in socket.js.
 */
function playActionSound(action) {
    const soundUrl = GAME_ASSETS.sounds[action.toLowerCase()];
    if (soundUrl) {
        const sfx = new Audio(soundUrl);
        sfx.volume = 0.3;
        sfx.play().catch(() => {});
    }
}

// 2. View Switching Logic
function showView(viewName) {
    if (!homeScreen || !gameScreen) return;
    homeScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');

    if (viewName === 'home') {
        homeScreen.classList.remove('hidden');

        // Reset Friend Menu state
        if (friendOptions) friendOptions.classList.add('hidden');
        if (roomCodeDisplay) roomCodeDisplay.classList.add('hidden');
        
        // Show main buttons
        if (btnLocal) btnLocal.classList.remove('hidden');
        if (btnOnline) btnOnline.classList.remove('hidden');
        if (btnFriendMenu) btnFriendMenu.classList.remove('hidden');
        
        document.querySelector('.game-logo').innerText = "ANGER MANAGEMENT";
    } else if (viewName === 'game') {
        gameScreen.classList.remove('hidden');
    }
}

// 3. Auth UI & Record Updates
function updateAuthUI(user) {
    if (user) {
        currentUser = user;
        localStorage.setItem('rps_user_session', JSON.stringify(user));

        if (loggedOutView) loggedOutView.classList.add('hidden');
        if (loggedInView) loggedInView.classList.remove('hidden');
        if (displayUsername) displayUsername.innerText = user.username;
        
        const w = user.wins || 0;
        const l = user.losses || 0;
        if (displayRecord) displayRecord.innerText = `Record: ${w}W - ${l}L`;
        
        if (authModal) authModal.classList.add('hidden');
    } else {
        currentUser = null;
        localStorage.removeItem('rps_user_session');

        if (loggedOutView) loggedOutView.classList.remove('hidden');
        if (loggedInView) loggedInView.classList.add('hidden');
    }
}

function updateLiveRecord(wins, losses) {
    if (currentUser) {
        currentUser.wins = wins;
        currentUser.losses = losses;
        localStorage.setItem('rps_user_session', JSON.stringify(currentUser));
        if (displayRecord) displayRecord.innerText = `Record: ${wins}W - ${losses}L`;
    }
}

// 4. Event Listeners

// FRIEND ROOM NAVIGATION
if (btnFriendMenu) {
    btnFriendMenu.addEventListener('click', () => {
        if (!currentUser) {
            showNotification("Please Login to play with friends");
            return;
        }
        btnLocal.classList.add('hidden');
        btnOnline.classList.add('hidden');
        btnFriendMenu.classList.add('hidden');
        
        friendOptions.classList.remove('hidden');
        if (btnCreateRoom) btnCreateRoom.classList.remove('hidden');
    });
}

if (btnBackMenu) {
    btnBackMenu.addEventListener('click', () => {
        friendOptions.classList.add('hidden');
        if (roomCodeDisplay) roomCodeDisplay.classList.add('hidden');
        
        btnLocal.classList.remove('hidden');
        btnOnline.classList.remove('hidden');
        btnFriendMenu.classList.remove('hidden');
    });
}

// GAME INITIATION
// Note: no audio calls here — AudioManager in socket.js handles all music
// transitions via GAME_STARTED / GAME_OVER / SESSION_VALID server messages.
if (btnLocal) {
    btnLocal.addEventListener('click', () => {
        const name = currentUser ? currentUser.username : "Guest";
        initGame('local', name);
    });
}

if (btnOnline) {
    btnOnline.addEventListener('click', () => {
        if (!currentUser) {
            showNotification("Please Login to play Online");
        } else {
            initGame('online', currentUser.username);
        }
    });
}

if (btnCreateRoom) {
    btnCreateRoom.addEventListener('click', () => {
        if (typeof requestStartGame === "function") {
            btnCreateRoom.classList.add('hidden');
            requestStartGame('friend', currentUser.username, currentUser.id, null, 'create');
        }
    });
}

if (btnJoinRoom) {
    btnJoinRoom.addEventListener('click', () => {
        const code = inputRoomCode.value.trim();
        if (code.length === 4) {
            if (typeof requestStartGame === "function") {
                requestStartGame('friend', currentUser.username, currentUser.id, code, 'join');
            }
        } else {
            showNotification("Enter a valid 4-digit code");
        }
    });
}

// Matchmaking Cancel Listener
if (btnCancelQueue) {
    btnCancelQueue.addEventListener('click', () => {
        if (typeof leaveQueue === 'function') {
            leaveQueue();
        }
    });
}

// AUTH HANDLERS
if (btnShowAuth) btnShowAuth.addEventListener('click', () => authModal.classList.remove('hidden'));
if (closeModal) closeModal.addEventListener('click', () => authModal.classList.add('hidden'));

if (linkToReg) {
    linkToReg.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('login-form-container')?.classList.add('hidden');
        document.getElementById('register-form-container')?.classList.remove('hidden');
    });
}

if (linkToLogin) {
    linkToLogin.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('register-form-container')?.classList.add('hidden');
        document.getElementById('login-form-container')?.classList.remove('hidden');
    });
}

if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('login-user').value;
        const pass = document.getElementById('login-pass').value;
        if (typeof sendAuthRequest === "function") sendAuthRequest('LOGIN', { username, pass });
    });
}

if (registerForm) {
    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const data = {
            username: document.getElementById('reg-user').value,
            pass: document.getElementById('reg-pass').value,
            gender: document.getElementById('reg-gender').value,
            dob: document.getElementById('reg-dob').value
        };
        if (typeof sendAuthRequest === "function") sendAuthRequest('REGISTER', data);
    });
}

if (btnLogout) btnLogout.addEventListener('click', () => updateAuthUI(null));

if (btnGiveUp) {
    btnGiveUp.addEventListener('click', () => {
        if (confirm("Are you sure you want to give up?")) {
            if (typeof giveUp === 'function') {
                giveUp(); 
            } else {
                localStorage.removeItem('fightingGameState');
                showView('home');
            }
        }
    });
}

// HELPERS
function showNotification(text) {
    if (!homeNotif) return;
    homeNotif.innerText = text;
    homeNotif.classList.remove('hidden');
    setTimeout(() => homeNotif.classList.add('hidden'), 3000);
}

function initGame(mode, username) {
    if (typeof resetUI === "function") resetUI();
    const userId = currentUser ? currentUser.id : null;
    
    if (typeof requestStartGame === "function") {
        requestStartGame(mode, username, userId);
    }

    showView('game');

    if (mode === 'online') {
        if (typeof showMatchmaking === 'function') {
            showMatchmaking();
        }
    }
}

function initControls() {
    const rpsButtons = ['btn-rock', 'btn-paper', 'btn-scissors'];
    rpsButtons.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('click', () => {
                const move = id.replace('btn-', '');
                if (typeof submitMove === "function") submitMove(move);
            });
        }
    });

    const actionButtons = ['btn-punch', 'btn-kick', 'btn-slap'];
    actionButtons.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('click', () => {
                const action = id.replace('btn-', '');
                if (typeof submitAction === "function") submitAction(action);
            });
        }
    });
}

// BOOTSTRAP LOGIC
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initiate Asset Preloading
    if (typeof preloadAssets === "function") preloadAssets();
    
    if (typeof initSelectors === "function") initSelectors();
    if (typeof initSocket === "function") initSocket(); // AudioManager.playHomeMusic() fires inside here on socket open
    initControls();

    const savedUser = localStorage.getItem('rps_user_session');
    if (savedUser) updateAuthUI(JSON.parse(savedUser));

    if (typeof initUIAssets === "function") initUIAssets();

    const savedState = localStorage.getItem('fightingGameState');
    let hasActiveGame = false;

    if (savedState) {
        try {
            const state = JSON.parse(savedState);
            if (state.gameId) {
                hasActiveGame = true;
                if (typeof loadGameState === "function") loadGameState();
            }
        } catch (e) {
            console.error("Error checking saved state", e);
        }
    }

    // showView just toggles DOM visibility.
    // Music is handled entirely by AudioManager via socket events.
    if (hasActiveGame) {
        showView('game');
    } else {
        showView('home'); 
    }
});

// Global export for ui.js / socket.js
window.playActionSound = playActionSound;