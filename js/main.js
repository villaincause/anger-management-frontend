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

const loginForm = document.getElementById('form-login');
const registerForm = document.getElementById('form-register');
const linkToReg = document.getElementById('link-to-register');
const linkToLogin = document.getElementById('link-to-login');

let currentUser = null; 

// 2. View Switching Logic
function showView(viewName) {
    if (!homeScreen || !gameScreen) return;
    homeScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');

    if (viewName === 'home') {
        homeScreen.classList.remove('hidden');
    } else if (viewName === 'game') {
        gameScreen.classList.remove('hidden');
    }
}

// 3. Auth UI Updates
function updateAuthUI(user) {
    if (user) {
        currentUser = user;
        localStorage.setItem('rps_user_session', JSON.stringify(user));

        if (loggedOutView) loggedOutView.classList.add('hidden');
        if (loggedInView) loggedInView.classList.remove('hidden');
        if (displayUsername) displayUsername.innerText = user.username;
        if (displayRecord) displayRecord.innerText = `Record: ${user.wins}W - ${user.losses}L`;
        if (authModal) authModal.classList.add('hidden');
    } else {
        currentUser = null;
        localStorage.removeItem('rps_user_session');

        if (loggedOutView) loggedOutView.classList.remove('hidden');
        if (loggedInView) loggedInView.classList.add('hidden');
    }
}

// 4. Event Listeners
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

if (btnLocal) {
    btnLocal.addEventListener('click', () => {
        const name = currentUser ? currentUser.username : "Guest";
        initGame('local', name);
    });
}

if (btnOnline) {
    btnOnline.addEventListener('click', () => {
        if (!currentUser) {
            homeNotif?.classList.remove('hidden');
            setTimeout(() => homeNotif?.classList.add('hidden'), 3000);
        } else {
            initGame('online', currentUser.username);
        }
    });
}

if (btnGiveUp) {
    btnGiveUp.addEventListener('click', () => {
        if (confirm("Are you sure you want to give up?")) {
            localStorage.removeItem('fightingGameState');
            showView('home');
        }
    });
}

function initGame(mode, username) {
    if (typeof resetUI === "function") resetUI();
    if (typeof requestStartGame === "function") requestStartGame(mode, username);
    showView('game');
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

// 5. Global App Start
document.addEventListener('DOMContentLoaded', () => {
    // A. Map HTML elements to code first
    if (typeof initSelectors === "function") initSelectors();

    // B. Initialize system level components
    if (typeof initSocket === "function") initSocket();
    initControls();

    // C. Handle User Session
    const savedUser = localStorage.getItem('rps_user_session');
    if (savedUser) {
        updateAuthUI(JSON.parse(savedUser));
    }

    // D. Attempt to Restore Game State
    let gameRestored = false;
    if (typeof loadGameState === "function") {
        gameRestored = loadGameState();
    }

    // E. Set the images
    if (typeof initUIAssets === "function") initUIAssets();

    // F. Navigate to correct view
    if (gameRestored) {
        showView('game');
        // Ensure phase is restored
        const saved = localStorage.getItem('fightingGameState');
        if (saved) {
            const state = JSON.parse(saved);
            toggleActionPhase(state.phase === 'action');
        }
    } else {
        showView('home');
    }
});