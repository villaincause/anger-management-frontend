/**
 * assets.js - Centralized Cloudinary URLs
 */
const GAME_ASSETS = {
    // The clashing hands for the RPS phase
    hands: {
        rock: "https://res.cloudinary.com/dorpdfe8d/image/upload/v1775983081/Rock-hand.png",
        paper: "https://res.cloudinary.com/dorpdfe8d/image/upload/v1775983078/Paper-hand.png",
        scissors: "https://res.cloudinary.com/dorpdfe8d/image/upload/v1775983082/Scissors-hand.png"
    },
    // The clickable buttons for choosing a move
    moves: {
        rock: "https://res.cloudinary.com/dorpdfe8d/image/upload/v1775983081/Rock-img.png",
        paper: "https://res.cloudinary.com/dorpdfe8d/image/upload/v1775983078/Paper-img.png",
        scissors: "https://res.cloudinary.com/dorpdfe8d/image/upload/v1775983083/Scissors-img.png"
    },
    // The Action Phase (Punch/Kick/Slap) icons
    actions: {
        punch: "https://res.cloudinary.com/dorpdfe8d/image/upload/v1775983079/Punch-img.png",
        kick: "https://res.cloudinary.com/dorpdfe8d/image/upload/v1775983076/Kick-img.png",
        slap: "https://res.cloudinary.com/dorpdfe8d/image/upload/v1775983083/Slap-img.png"
    },
    // The visual representations of the result
    visuals: {
        punch: "https://res.cloudinary.com/dorpdfe8d/image/upload/v1775983080/Punch-person.png",
        kick: "https://res.cloudinary.com/dorpdfe8d/image/upload/v1775983077/Kick-person.png",
        slap: "https://res.cloudinary.com/dorpdfe8d/image/upload/v1777148676/Slap-person.png"
    },
    // Audio assets for music and combat
    sounds: {
        bgMusic: "https://res.cloudinary.com/dorpdfe8d/video/upload/v1778617089/BackgroundMusic.mp3",
        bgMusicGame: "https://res.cloudinary.com/dorpdfe8d/video/upload/v1778701719/BackgroundMusicInGame.mp3",
        kick: "https://res.cloudinary.com/dorpdfe8d/video/upload/v1778617112/Kick.mp3",
        punch: "https://res.cloudinary.com/dorpdfe8d/video/upload/v1778617113/Punch.mp3",
        slap: "https://res.cloudinary.com/dorpdfe8d/video/upload/v1778617114/Slap.mp3",
        victory: "https://res.cloudinary.com/dorpdfe8d/video/upload/v1778700327/Victory.mp3",
        loss: "https://res.cloudinary.com/dorpdfe8d/video/upload/v1778700325/Loss.mp3"
    }
};

/**
 * Preloads all images and audio to avoid delay during gameplay
 */
function preloadAssets() {
    const imageUrls = [
        ...Object.values(GAME_ASSETS.hands),
        ...Object.values(GAME_ASSETS.moves),
        ...Object.values(GAME_ASSETS.actions),
        ...Object.values(GAME_ASSETS.visuals)
    ];
    
    imageUrls.forEach(url => {
        const img = new Image();
        img.src = url;
    });

    const audioUrls = Object.values(GAME_ASSETS.sounds);
    audioUrls.forEach(url => {
        const audio = new Audio();
        audio.src = url;
        audio.preload = "auto";
    });

    console.log("Image and Audio assets preloading initiated...");
}

if (typeof window !== 'undefined') {
    window.GAME_ASSETS = GAME_ASSETS;
    window.preloadAssets = preloadAssets;
} else if (typeof module !== 'undefined') {
    module.exports = GAME_ASSETS;
}